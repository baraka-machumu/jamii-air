// The decisions the video pipeline makes, without ffmpeg: what it rejects, what size it encodes
// at, and the transcode flags whose loss would be silent (BR-CT-06/07/08).
import {
  InvalidVideoError, MAX_SECONDS, parseProbe, renditionSize, transcodeArgs,
} from './video-pipeline.js';

const probeJson = (over: Record<string, unknown> = {}) => JSON.stringify({
  streams: [{ codec_type: 'video', width: 1920, height: 1080, ...over }, { codec_type: 'audio' }],
  format: { duration: '12.5' },
});

describe('parseProbe', () => {
  it('reads the picture size, duration and whether there is sound', () => {
    expect(parseProbe(probeJson())).toEqual({ width: 1920, height: 1080, durationSeconds: 12.5, hasAudio: true });
  });

  it('swaps width and height for a quarter-turn rotation, as phones record portrait', () => {
    // A portrait recording is stored landscape with a -90° rotation in side data.
    expect(parseProbe(probeJson({ side_data_list: [{ rotation: -90 }] })))
      .toMatchObject({ width: 1080, height: 1920 });
    // The older container tag says the same thing.
    expect(parseProbe(probeJson({ tags: { rotate: '270' } }))).toMatchObject({ width: 1080, height: 1920 });
    // A half turn is still landscape.
    expect(parseProbe(probeJson({ side_data_list: [{ rotation: 180 }] }))).toMatchObject({ width: 1920, height: 1080 });
  });

  it('falls back to the stream duration when the container has none', () => {
    const json = JSON.stringify({ streams: [{ codec_type: 'video', width: 720, height: 720, duration: '8' }], format: {} });
    expect(parseProbe(json)).toEqual({ width: 720, height: 720, durationSeconds: 8, hasAudio: false });
  });

  it('rejects a file with no video track, no dimensions, no duration, or over the limit', () => {
    const audioOnly = JSON.stringify({ streams: [{ codec_type: 'audio' }], format: { duration: '5' } });
    expect(() => parseProbe(audioOnly)).toThrow(InvalidVideoError);
    expect(() => parseProbe(JSON.stringify({ streams: [{ codec_type: 'video' }], format: { duration: '5' } }))).toThrow(InvalidVideoError);
    expect(() => parseProbe(JSON.stringify({ streams: [{ codec_type: 'video', width: 10, height: 10 }], format: {} }))).toThrow(InvalidVideoError);
    expect(() => parseProbe('not json')).toThrow(InvalidVideoError);
    // 61 s is tolerated and trimmed; 62 s is refused with a reason the app can show.
    expect(parseProbe(probeJson()).durationSeconds).toBe(12.5);
    expect(() => parseProbe(JSON.stringify({ streams: [{ codec_type: 'video', width: 10, height: 10 }], format: { duration: '62' } })))
      .toThrow(`longer than ${MAX_SECONDS} seconds`);
  });
});

describe('renditionSize', () => {
  it('fits landscape inside 1280 and portrait inside 720 wide', () => {
    expect(renditionSize(1920, 1080)).toEqual({ width: 1280, height: 720 });
    expect(renditionSize(1080, 1920)).toEqual({ width: 720, height: 1280 });
    expect(renditionSize(1080, 1080)).toEqual({ width: 720, height: 720 });
  });

  it('never upscales', () => {
    expect(renditionSize(480, 270)).toEqual({ width: 480, height: 270 });
    expect(renditionSize(320, 240)).toEqual({ width: 320, height: 240 });
  });

  it('always returns even dimensions, which H.264 4:2:0 requires', () => {
    for (const [w, h] of [[1921, 1081], [999, 333], [641, 361], [1, 1]] as const) {
      const size = renditionSize(w, h);
      expect(size.width % 2).toBe(0);
      expect(size.height % 2).toBe(0);
      expect(size.width).toBeGreaterThan(0);
      expect(size.height).toBeGreaterThan(0);
    }
  });
});

describe('transcodeArgs', () => {
  const args = transcodeArgs('in.mov', 'out.mp4', { width: 720, height: 1280 }, true);

  it('caps the length, strips metadata and makes the file playable and streamable', () => {
    expect(args).toContain('-t');
    expect(args[args.indexOf('-t') + 1]).toBe(String(MAX_SECONDS));
    // BR-CT-06: no GPS or camera tags survive into what other people download.
    expect(args[args.indexOf('-map_metadata') + 1]).toBe('-1');
    expect(args[args.indexOf('-vf') + 1]).toBe('scale=720:1280,format=yuv420p');
    expect(args[args.indexOf('-movflags') + 1]).toBe('+faststart');
    expect(args[args.indexOf('-c:v') + 1]).toBe('libx264');
    expect(args.at(-1)).toBe('out.mp4');
  });

  it('encodes sound when there is any, and drops the audio track when there is none', () => {
    expect(args).toContain('aac');
    expect(args).not.toContain('-an');
    expect(transcodeArgs('in.mov', 'out.mp4', { width: 720, height: 720 }, false)).toContain('-an');
  });
});
