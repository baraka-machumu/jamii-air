"""Draws the Kidili app icons into mobile/assets (Design Brief §15.2, task K1.2).

The mark is the one on the design canvas and in src/components/Logo.tsx: a purple speech bubble
with a white K in three strokes, on a 40-unit grid. Run it again after changing the mark:

    python mobile/scripts/make-icons.py

Needs Python 3 with Pillow. Shapes are drawn 4x larger and scaled down, for smooth edges.
"""
from pathlib import Path

from PIL import Image, ImageDraw

ASSETS = Path(__file__).resolve().parent.parent / 'assets'
PURPLE = (0x5B, 0x2E, 0xBF, 255)
CREAM = (0xFA, 0xF7, 0xF2, 255)
WHITE = (255, 255, 255, 255)
CLEAR = (0, 0, 0, 0)
SS = 4  # supersampling

# The mark on its 40-unit grid (Logo.tsx uses the same numbers).
BUBBLE = (2, 3, 38, 32)  # rounded rectangle, radius 6
TAIL = [(19, 31), (11, 38), (11, 31)]
K_STROKES = [((15, 10.5), (15, 25.5)), ((15, 19), (24, 10.5)), ((18.2, 16), (25, 25.5))]
K_WIDTH = 3.2


def stroke(d, a, b, width, fill):
    """A line with round caps."""
    d.line([a, b], fill=fill, width=round(width))
    r = width / 2
    for x, y in (a, b):
        d.ellipse([x - r, y - r, x + r, y + r], fill=fill)


def mark(size, bubble=PURPLE, k=WHITE, k_cut=False):
    """The mark alone on a transparent square of `size` px, centred (the grid's art is 36 x 35)."""
    big = size * SS
    img = Image.new('RGBA', (big, big), CLEAR)
    d = ImageDraw.Draw(img)
    u = big / 40
    dy = 0.5 * u  # the art spans y 3..38: nudge it to the vertical centre
    sc = lambda p: (p[0] * u, p[1] * u - dy)
    x0, y0, x1, y1 = BUBBLE
    d.rounded_rectangle([x0 * u, y0 * u - dy, x1 * u, y1 * u - dy], radius=6 * u, fill=bubble)
    d.polygon([sc(p) for p in TAIL], fill=bubble)
    k_fill = CLEAR if k_cut else k
    if k_cut:
        # Knock the K out of the bubble (a monochrome icon is only its alpha).
        layer = Image.new('L', (big, big), 0)
        ld = ImageDraw.Draw(layer)
        for a, b in K_STROKES:
            stroke(ld, sc(a), sc(b), K_WIDTH * u, 255)
        img.paste(Image.new('RGBA', (big, big), CLEAR), mask=layer)
    else:
        for a, b in K_STROKES:
            stroke(d, sc(a), sc(b), K_WIDTH * u, k_fill)
    return img.resize((size, size), Image.LANCZOS)


def on_ground(size, ground, mark_share):
    """The mark at `mark_share` of the width, centred on a square of colour `ground`."""
    img = Image.new('RGBA', (size, size), ground)
    m = mark(round(size * mark_share))
    off = (size - m.width) // 2
    img.alpha_composite(m, (off, off))
    return img


def main():
    # iOS and store icon: full bleed, no transparency.
    on_ground(1024, CREAM, 0.72).convert('RGB').save(ASSETS / 'icon.png')
    # Android adaptive icon: the launcher masks a 108-unit square to the middle 72 units, and
    # keeps the inner 66 always visible, so the mark stays within ~60 % of the layer.
    Image.new('RGBA', (1024, 1024), CREAM).save(ASSETS / 'android-icon-background.png')
    fg = Image.new('RGBA', (1024, 1024), CLEAR)
    m = mark(600)
    fg.alpha_composite(m, ((1024 - 600) // 2, (1024 - 600) // 2))
    fg.save(ASSETS / 'android-icon-foreground.png')
    # Themed icon and the notification icon: white, with the K cut out.
    mono = Image.new('RGBA', (1024, 1024), CLEAR)
    mono.alpha_composite(mark(600, bubble=WHITE, k_cut=True), (212, 212))
    mono.save(ASSETS / 'android-icon-monochrome.png')
    # Splash: the mark alone; app.json sets the background (cream, or the dark ground).
    mark(1024).save(ASSETS / 'splash-icon.png')
    on_ground(48, CREAM, 0.8).save(ASSETS / 'favicon.png')


if __name__ == '__main__':
    main()
