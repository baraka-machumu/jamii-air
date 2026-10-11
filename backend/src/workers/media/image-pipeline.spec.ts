import sharp from 'sharp';
import { feedSize, InvalidImageError, processImage } from './image-pipeline.js';

/** A JPEG with EXIF orientation and GPS position, like a phone photo. */
async function phonePhoto(width: number, height: number, orientation = 1): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } } })
    .jpeg()
    .withMetadata({
      orientation,
      exif: { IFD0: { Make: 'TestPhone', Model: 'X1' }, IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '6/1 48/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '39/1 17/1 0/1' } },
    })
    .toBuffer();
}

describe('processImage', () => {
  it('makes WebP feed and thumb variants with no EXIF or GPS left (BR-CT-06)', async () => {
    const input = await phonePhoto(2000, 1500);
    expect((await sharp(input).metadata()).exif).toBeDefined(); // the input does carry GPS

    const out = await processImage(input, 'POST');
    expect(out).toMatchObject({ width: 2000, height: 1500, blurhash: expect.any(String) });
    expect(out.variants.map((v) => [v.variant, v.width, v.height])).toEqual([['THUMB', 320, 320], ['FEED', 1080, 810]]);
    for (const v of out.variants) {
      const meta = await sharp(v.body).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.icc).toBeUndefined();
      expect(v.byteSize).toBe(v.body.length);
    }
  });

  it('applies the EXIF orientation (a portrait shot stored sideways comes out upright)', async () => {
    const out = await processImage(await phonePhoto(1600, 1200, 6), 'POST');
    expect(out).toMatchObject({ width: 1200, height: 1600 });
    expect(out.variants.find((v) => v.variant === 'FEED')).toMatchObject({ width: 1080, height: 1350 }); // clamped to 4:5
  });

  it('makes square avatar sizes', async () => {
    const out = await processImage(await phonePhoto(800, 600), 'AVATAR');
    expect(out.variants.map((v) => [v.variant, v.width, v.height])).toEqual([['AVATAR_S', 150, 150], ['AVATAR_M', 320, 320]]);
  });

  it('rejects what is not a valid image, whatever the declared type (MD-03)', async () => {
    await expect(processImage(Buffer.from('<?php echo "hi"; ?>'), 'POST')).rejects.toBeInstanceOf(InvalidImageError);
    const gif = await sharp({ create: { width: 400, height: 400, channels: 3, background: '#fff' } }).gif().toBuffer();
    await expect(processImage(gif, 'POST')).rejects.toThrow(/unsupported format: gif/);
    await expect(processImage(await phonePhoto(1000, 200), 'POST')).rejects.toThrow(/shorter side/);
    const truncated = (await phonePhoto(1200, 1200)).subarray(0, 2000);
    await expect(processImage(truncated, 'POST')).rejects.toBeInstanceOf(InvalidImageError);
  });
});

describe('feedSize', () => {
  it('keeps ratios between 4:5 and 1.91:1 and clamps the rest', () => {
    expect(feedSize(1080, 1080)).toEqual({ width: 1080, height: 1080 });
    expect(feedSize(3000, 6000)).toEqual({ width: 1080, height: 1350 }); // too tall → 4:5
    expect(feedSize(4000, 1000)).toEqual({ width: 1080, height: 565 }); // too wide → 1.91:1
    expect(feedSize(640, 480)).toEqual({ width: 640, height: 480 }); // never upscaled
  });
});
