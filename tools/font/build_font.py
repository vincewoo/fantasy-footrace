"""Patch Silkscreen's `4` and write self-hosted woff2 files.

Silkscreen's stock 4 is an open-top shape that reads as a `ч` in the
regular weight and fills in to a solid block in bold, which is what the
scoreboard uses. This redraws it as a closed, diagonal 4 on the font's
own 125-unit pixel grid.

  pip install fonttools brotli
  python tools/font/build_font.py path/to/Silkscreen-{Regular,Bold}.ttf

Sources: https://github.com/google/fonts/tree/main/ofl/silkscreen (OFL 1.1).
"""
import os
import sys

from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

PX = 125  # Silkscreen's pixel size in font units
LEFT = 125  # left side bearing, one pixel, as on the other digits
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'assets', 'fonts')

# Rows top to bottom; five rows tall like every Silkscreen digit.
FOUR = {
    'Regular': [
        '..#.',
        '.##.',
        '#.#.',
        '####',
        '..#.',
    ],
    'Bold': [
        '...##',
        '..###',
        '.#.##',
        '#####',
        '...##',
    ],
}


def outline(rows):
    """Trace a pixel grid into clockwise (TrueType outer) contours."""
    h = len(rows)
    edges = {}
    for r, line in enumerate(rows):
        y = h - 1 - r
        for c, ch in enumerate(line):
            if ch != '#':
                continue
            # clockwise in y-up space: up the left, across the top, down the right, back along the bottom
            for a, b in (((c, y), (c, y + 1)), ((c, y + 1), (c + 1, y + 1)),
                         ((c + 1, y + 1), (c + 1, y)), ((c + 1, y), (c, y))):
                if (b, a) in edges:
                    del edges[(b, a)]  # shared with a neighbour: interior
                else:
                    edges[(a, b)] = True
    nxt = {}
    for a, b in edges:
        nxt.setdefault(a, []).append(b)
    contours = []
    while nxt:
        start = next(iter(nxt))
        pts, p = [], start
        while True:
            pts.append(p)
            q = nxt[p].pop()
            if not nxt[p]:
                del nxt[p]
            p = q
            if p == start:
                break
        # drop collinear points
        keep = []
        n = len(pts)
        for i, (x, y) in enumerate(pts):
            (px, py), (qx, qy) = pts[i - 1], pts[(i + 1) % n]
            if (x - px) * (qy - y) != (y - py) * (qx - x):
                keep.append((x, y))
        contours.append(keep)
    return contours


def patch(path):
    font = TTFont(path)
    style = 'Bold' if 'Bold' in os.path.basename(path) else 'Regular'
    rows = FOUR[style]
    glyph = font.getBestCmap()[ord('4')]
    pen = TTGlyphPen(None)
    for pts in outline(rows):
        pen.moveTo((LEFT + pts[0][0] * PX, pts[0][1] * PX))
        for x, y in pts[1:]:
            pen.lineTo((LEFT + x * PX, y * PX))
        pen.closePath()
    font['glyf'][glyph] = pen.glyph()
    width = LEFT + len(rows[0]) * PX + PX
    font['hmtx'][glyph] = (width, LEFT)
    if 'hdmx' in font:
        del font['hdmx']  # cached per-size advances would be stale
    font.flavor = 'woff2'
    os.makedirs(OUT, exist_ok=True)
    dest = os.path.join(OUT, f'silkscreen-{style.lower()}.woff2')
    font.save(dest)
    print('wrote', os.path.normpath(dest))


if __name__ == '__main__':
    for p in sys.argv[1:]:
        patch(p)
