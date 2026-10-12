import { aspectOf, centredOffset, clampOffset, coverScale, cropRect, frameOf } from './crop';

const landscape = { width: 2048, height: 1536 }; // 4:3
const tall = { width: 1000, height: 3000 }; // 1:3

describe('crop geometry (App Flow §6)', () => {
  it('offers square, 4:5 and original, clamped to 4:5 … 1.91:1', () => {
    expect(aspectOf('square', landscape)).toBe(1);
    expect(aspectOf('portrait', landscape)).toBe(0.8);
    expect(aspectOf('original', landscape)).toBeCloseTo(4 / 3);
    expect(aspectOf('original', tall)).toBe(0.8);
    expect(aspectOf('original', { width: 3000, height: 1000 })).toBe(1.91);
  });

  it('covers the frame and crops the centre by default', () => {
    const frame = frameOf(360, 1);
    const scale = coverScale(landscape, frame);
    expect(scale).toBeCloseTo(360 / 1536);
    const rect = cropRect(centredOffset(landscape, frame, scale), landscape, frame, scale);
    expect(rect).toEqual({ originX: 256, originY: 0, width: 1536, height: 1536 });
  });

  it('never lets the photo leave a gap in the frame', () => {
    const frame = frameOf(360, 1);
    const scale = coverScale(landscape, frame);
    expect(clampOffset({ x: 50, y: 20 }, landscape, frame, scale)).toEqual({ x: 0, y: 0 });
    const far = clampOffset({ x: -9999, y: -9999 }, landscape, frame, scale);
    expect(cropRect(far, landscape, frame, scale)).toEqual({ originX: 512, originY: 0, width: 1536, height: 1536 });
  });

  it('crops a tall photo to 4:5 inside its bounds', () => {
    const frame = frameOf(360, 0.8);
    const scale = coverScale(tall, frame);
    const rect = cropRect(centredOffset(tall, frame, scale), tall, frame, scale);
    expect(rect.width).toBe(1000);
    expect(rect.height).toBe(1250);
    expect(rect.originY).toBe(875);
  });
});
