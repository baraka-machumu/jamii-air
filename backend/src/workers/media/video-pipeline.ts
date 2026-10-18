// Video processing for uploads (BR-CT-07/08, TRD §9.1). One upload becomes exactly three objects:
//   VIDEO_720  one H.264 / AAC MP4, long edge ≤ 1280 and short edge ≤ 720, ≤ 60 s, faststart
//   POSTER     a WebP still from the first second: what the card shows before playback
//   THUMB      a 320 × 320 WebP for the profile grid
//
// There is deliberately no adaptive ladder: R1 trades the bandwidth saving for a tenth of the
// CPU and a third of the objects, and the Reels surface that would want HLS is still R2 (BRS §6.1).
//
// Everything that shells out to ffmpeg lives behind `run`; the decisions — what to reject, what
// size to produce, how to read ffprobe — are pure functions, which is what the unit tests cover,
// because ffmpeg is not installed on every development machine.
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { encode } from 'blurhash';
import sharp from 'sharp';

const exec = promisify(execFile);

/** BR-CT-07. The container is trusted to a second; the transcode hard-trims to MAX_SECONDS. */
export const MAX_SECONDS = 60;
/** What a file has to exceed before it is rejected rather than trimmed (container rounding). */
export const REJECT_OVER_SECONDS = 61;
export const MAX_LONG_EDGE = 1280;
export const MAX_SHORT_EDGE = 720;
/** ffmpeg and ffprobe are expected on PATH; the Docker image installs them (Dockerfile). */
const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH ?? 'ffprobe';
/** A 60 s transcode on a shared host must not hang the queue forever. */
const TRANSCODE_TIMEOUT_MS = 10 * 60_000;
const PROBE_TIMEOUT_MS = 60_000;

/** A file that will never process: the asset and its post become FAILED, no retry (MD-03). */
export class InvalidVideoError extends Error {
  override name = 'InvalidVideoError';
}

export interface VideoVariant {
  variant: 'VIDEO_720' | 'POSTER' | 'THUMB';
  body: Buffer;
  width: number;
  height: number;
  mimeType: string;
  byteSize: number;
}

export interface ProcessedVideo {
  width: number;
  height: number;
  durationMs: number;
  blurhash: string;
  variants: VideoVariant[];
}

/** The parts of `ffprobe -show_streams -show_format` this pipeline uses. */
export interface Probe {
  width: number;
  height: number;
  durationSeconds: number;
  hasAudio: boolean;
}

interface ProbeJson {
  streams?: {
    codec_type?: string;
    width?: number;
    height?: number;
    duration?: string;
    side_data_list?: { rotation?: number }[];
    tags?: { rotate?: string };
  }[];
  format?: { duration?: string };
}

/**
 * Reads ffprobe's JSON. Rejects anything without a usable video stream, and applies the rotation
 * ffprobe reports so width and height describe the picture as it will be seen — a phone portrait
 * recording is usually stored landscape with a -90° rotation.
 */
export function parseProbe(json: string): Probe {
  let parsed: ProbeJson;
  try {
    parsed = JSON.parse(json) as ProbeJson;
  } catch {
    throw new InvalidVideoError('ffprobe returned no usable output');
  }

  const video = parsed.streams?.find((s) => s.codec_type === 'video');
  if (!video) throw new InvalidVideoError('the file has no video track');
  if (!video.width || !video.height) throw new InvalidVideoError('the video track has no dimensions');

  const rotation = video.side_data_list?.find((d) => typeof d.rotation === 'number')?.rotation
    ?? Number(video.tags?.rotate ?? 0);
  const quarterTurn = Math.abs(Math.round(rotation / 90)) % 2 === 1;

  const seconds = Number(parsed.format?.duration ?? video.duration ?? Number.NaN);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new InvalidVideoError('the video has no duration');
  if (seconds > REJECT_OVER_SECONDS) {
    throw new InvalidVideoError(`longer than ${MAX_SECONDS} seconds`);
  }

  return {
    width: quarterTurn ? video.height : video.width,
    height: quarterTurn ? video.width : video.height,
    durationSeconds: seconds,
    hasAudio: parsed.streams?.some((s) => s.codec_type === 'audio') ?? false,
  };
}

/**
 * The size to encode at: never upscaled, long edge ≤ 1280, short edge ≤ 720, and both even,
 * because H.264 with 4:2:0 chroma cannot encode an odd dimension.
 */
export function renditionSize(width: number, height: number): { width: number; height: number } {
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  const scale = Math.min(1, MAX_LONG_EDGE / long, MAX_SHORT_EDGE / short);
  const even = (value: number) => Math.max(2, Math.round((value * scale) / 2) * 2);
  return { width: even(width), height: even(height) };
}

/**
 * The transcode arguments. Kept pure so the tests can assert the things that matter and would be
 * silent if lost: the duration cap, `-map_metadata -1` (BR-CT-06: no GPS, no camera tags),
 * faststart so playback can begin before the file is fully downloaded, and yuv420p, without
 * which the file will not play on some Android decoders.
 */
export function transcodeArgs(input: string, output: string, size: { width: number; height: number }, hasAudio: boolean): string[] {
  return [
    '-nostdin', '-y',
    '-i', input,
    '-t', String(MAX_SECONDS),
    '-map_metadata', '-1',
    '-map_chapters', '-1',
    '-vf', `scale=${size.width}:${size.height},format=yuv420p`,
    '-c:v', 'libx264',
    '-profile:v', 'main',
    '-preset', 'veryfast',
    '-crf', '26',
    '-g', '60',
    '-movflags', '+faststart',
    ...(hasAudio ? ['-c:a', 'aac', '-b:a', '96k', '-ac', '2', '-ar', '44100'] : ['-an']),
    output,
  ];
}

/** `ffprobe` on one file, as JSON. */
async function probe(path: string): Promise<Probe> {
  const { stdout } = await exec(FFPROBE, [
    '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path,
  ], { timeout: PROBE_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 });
  return parseProbe(stdout);
}

/** Whether ffmpeg and ffprobe can actually be run. Used by the worker's start-up check. */
export async function videoToolsAvailable(): Promise<boolean> {
  try {
    await Promise.all([
      exec(FFMPEG, ['-version'], { timeout: PROBE_TIMEOUT_MS }),
      exec(FFPROBE, ['-version'], { timeout: PROBE_TIMEOUT_MS }),
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * One upload → the three objects above. `workDir` must be a directory the caller owns and
 * deletes; this function writes the intermediate files into it.
 *
 * A file ffmpeg cannot read, or one that is too long, raises InvalidVideoError and is never
 * retried. Anything else (a timeout, no space left) is thrown as-is, so BullMQ retries it.
 */
export async function processVideo(inputPath: string, workDir: string): Promise<ProcessedVideo> {
  let source: Probe;
  try {
    source = await probe(inputPath);
  } catch (error) {
    if (error instanceof InvalidVideoError) throw error;
    throw new InvalidVideoError(`not a readable video: ${(error as Error).message}`);
  }

  const outputPath = join(workDir, 'video_720.mp4');
  const size = renditionSize(source.width, source.height);
  try {
    await exec(FFMPEG, transcodeArgs(inputPath, outputPath, size, source.hasAudio),
      { timeout: TRANSCODE_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 });
  } catch (error) {
    // ffmpeg read the header (ffprobe succeeded) but could not decode the stream: a broken file,
    // not a broken server, so it is not worth retrying.
    throw new InvalidVideoError(`the video could not be re-encoded: ${(error as Error).message}`);
  }

  // Measure what was actually produced rather than what was asked for.
  const rendition = await probe(outputPath);
  const body = await readFile(outputPath);

  const still = await posterFrame(outputPath, workDir);
  const poster = await sharp(still).resize(size.width, size.height, { fit: 'inside' }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
  const thumb = await sharp(still).resize(320, 320, { fit: 'cover', position: 'centre' }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });

  return {
    width: rendition.width,
    height: rendition.height,
    durationMs: Math.min(Math.round(rendition.durationSeconds * 1000), MAX_SECONDS * 1000),
    blurhash: await blurhashOf(still),
    variants: [
      { variant: 'VIDEO_720', body, width: rendition.width, height: rendition.height, mimeType: 'video/mp4', byteSize: body.byteLength },
      { variant: 'POSTER', body: poster.data, width: poster.info.width, height: poster.info.height, mimeType: 'image/webp', byteSize: poster.info.size },
      { variant: 'THUMB', body: thumb.data, width: thumb.info.width, height: thumb.info.height, mimeType: 'image/webp', byteSize: thumb.info.size },
    ],
  };
}

/** One frame as PNG, taken from the transcoded file so it always matches what plays. */
async function posterFrame(videoPath: string, workDir: string): Promise<Buffer> {
  const framePath = join(workDir, 'poster.png');
  await exec(FFMPEG, [
    '-nostdin', '-y', '-i', videoPath, '-frames:v', '1', '-map_metadata', '-1', framePath,
  ], { timeout: PROBE_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 });
  return readFile(framePath);
}

async function blurhashOf(image: Buffer): Promise<string> {
  const { data, info } = await sharp(image)
    .resize(32, 32, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return encode(new Uint8ClampedArray(data), info.width, info.height, 4, 3);
}
