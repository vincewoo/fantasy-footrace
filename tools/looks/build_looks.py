#!/usr/bin/env python3
"""Measure skin and hair colors from ESPN headshots into src/espn/looks.json.

Usage: python3 tools/looks/build_looks.py ROSTER.json [CACHE_DIR]

ROSTER.json is the nfl_player_rgb.json roster export (players[].espn_id). Only its
roster is used: its k-means clusters mix jersey, hair and skin and are brightness-
normalised per photo, so they can't separate skin tones. Instead each headshot is
fetched and sampled directly: OpenCV finds the face, skin comes from the brow-to-lip
band inside it and hair from a patch at the crown of the silhouette above it.

Needs pillow, numpy and OpenCV (pip install pillow numpy "opencv-python-headless<5"; OpenCV 5 dropped the Haar cascades).
"""
import colorsys
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

import cv2
import numpy as np
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'espn', 'looks.json')
URL = 'https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/{}.png&w=300&h=218'


def fetch(espn_id, cache):
    path = os.path.join(cache, espn_id + '.png')
    for _ in range(3):
        if os.path.exists(path):
            return path
        subprocess.run(['curl', '-sSf', '-o', path, URL.format(espn_id)], capture_output=True)
    return None


def pixels(arr, mask, x0, y0, x1, y1):
    x0, y0, x1, y1 = (int(v) for v in (x0, y0, x1, y1))
    return arr[y0:y1, x0:x1, :3][mask[y0:y1, x0:x1]]


_FACES = None


def find_face(rgb):
    """The face box as (x, y, w, h), nearest the usual ESPN framing.

    Faces sit centred at about 42% of the height and 30% of the width across,
    shifting a little with hair. Beards and jersey logos sometimes register as
    faces lower down, so detections centred below 52% are dropped, and a photo
    with no plausible detection falls back to the usual box.
    """
    global _FACES
    if _FACES is None:
        _FACES = [cv2.CascadeClassifier(cv2.data.haarcascades + name) for name in ('haarcascade_frontalface_default.xml', 'haarcascade_frontalface_alt2.xml')]
    img_h, img_w = rgb.shape[:2]
    gray = cv2.cvtColor(rgb.astype(np.uint8), cv2.COLOR_RGB2GRAY)
    # Strictest first; the looser passes pick up very dark or partly covered faces.
    passes = ((_FACES[0], gray, 1.05, 5), (_FACES[0], gray, 1.05, 3), (_FACES[1], cv2.equalizeHist(gray), 1.03, 2))
    for cascade, img, scale, neighbours in passes:
        found = [
            f for f in cascade.detectMultiScale(img, scaleFactor=scale, minNeighbors=neighbours, minSize=(40, 40))
            if (f[1] + f[3] / 2) / img_h < .52 and abs((f[0] + f[2] / 2) / img_w - .5) < .08
        ]
        if found:
            return min(found, key=lambda f: abs((f[1] + f[3] / 2) / img_h - .42))
    size = int(.3 * img_w)
    return int(img_w / 2 - size / 2), int(.42 * img_h - size / 2), size, size


def measure(path):
    arr = np.asarray(Image.open(path).convert('RGBA')).astype(float)
    mask = arr[..., 3] > 200
    rgb = arr[..., :3] * mask[..., None] + 200 * ~mask[..., None]
    x, y, fw, fh = find_face(rgb)
    top = np.where(mask[:, x:x + fw].any(1))[0][0]

    # Brow to upper lip, inside the cheeks. Hair size moves the face around the
    # frame, so the band is placed on the detected face box.
    face = pixels(arr, mask, x + .2 * fw, y + .25 * fh, x + .8 * fw, y + .62 * fh)
    # Skin is always redder than it is blue; neutral pixels are headbands, visors and hair.
    face = face[face[:, 0] - face[:, 2] >= 12]
    if len(face) < 50:
        return None
    # Above the mouth misses most beards. Studio lighting leaves bright
    # highlights across the cheekbones and forehead that read far lighter than the
    # face as a whole, and the darkest pixels are eyes, brows and stubble, so take
    # the median of the 15th-50th brightness percentiles.
    lum = face @ [.2126, .7152, .0722]
    lo, hi = np.percentile(lum, [15, 50])
    skin = np.median(face[(lum >= lo) & (lum <= hi)], 0)

    crown = pixels(arr, mask, x + .3 * fw, top + .03 * fh, x + .7 * fw, top + .15 * fh)
    hair = None
    if len(crown) >= 20:
        c = np.median(crown, 0)
        hue, s, v = colorsys.rgb_to_hsv(*(c / 255))
        hue *= 360
        # Headbands and caps: near-white, off-hue (blue, green, purple) or vivid.
        # Very dark crowns are hair whatever their noisy hue says.
        white = v > .75 and s < .12
        off_hue = 50 < hue < 340 and s > .15
        if v < .25 or not (white or off_hue or s > .75):
            hair = c
    return skin, hair


def hexof(c):
    return '#' + ''.join(f'{int(round(v)):02x}' for v in c)


def main():
    roster = json.load(open(sys.argv[1]))['players']
    cache = sys.argv[2] if len(sys.argv) > 2 else '/tmp/headshots'
    os.makedirs(cache, exist_ok=True)
    with ThreadPoolExecutor(8) as ex:
        paths = list(ex.map(lambda p: fetch(p['espn_id'], cache), roster))
    looks = {}
    for p, path in zip(roster, paths):
        m = path and measure(path)
        if not m:
            print('skipped', p['name'], p['espn_id'], file=sys.stderr)
            continue
        skin, hair = m
        looks[p['espn_id']] = [hexof(skin)] + ([hexof(hair)] if hair is not None else [])
    looks = dict(sorted(looks.items(), key=lambda kv: int(kv[0])))
    with open(OUT, 'w') as f:
        f.write('{\n' + ',\n'.join(f'  "{k}": {json.dumps(v)}' for k, v in looks.items()) + '\n}\n')
    print(f'{len(looks)} of {len(roster)} players -> {os.path.normpath(OUT)}')


if __name__ == '__main__':
    main()
