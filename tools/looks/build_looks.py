#!/usr/bin/env python3
"""Measure each player's look from their ESPN headshot into src/espn/looks.json.

Each entry is [skin, hairColor, hairStyle, beard, headband?]: hex colors, with ''
for a hair color hidden by a headband or cap, and the style names the avatar
draws (src/model/types.ts Hair and Beard).

Usage: python3 tools/looks/build_looks.py ROSTER.json [CACHE_DIR]

ROSTER.json is the nfl_player_rgb.json roster export (players[].espn_id). Only its
roster is used: its k-means clusters mix jersey, hair and skin and are brightness-
normalised per photo, so they can't separate skin tones. Instead each headshot is
fetched and sampled directly: OpenCV finds the face, skin comes from the brow-to-lip
band inside it and hair from a patch at the crown of the silhouette above it. Hair
style and beard come from the silhouette's shape and the colors around the face;
see hair_style and beard_style.

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
    hair = band = None
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
        else:
            band = c
    style, hanging = hair_style(arr, mask, (x, y, fw, fh), band is not None)
    # Long hair and locs show their real color hanging beside the face; the crown can be a dark part.
    if hanging is not None:
        hair = hanging
    return skin, hair, style, beard_style(arr, mask, (x, y, fw, fh)), band


LUM = np.array([.2126, .7152, .0722])


def hair_style(arr, mask, box, banded=False):
    """One of the avatar's hair styles, from the silhouette and colors around the face box,
    and for hair hanging beside the face, its color.

    Checked against 72 hand-labelled headshots: right or a look-alike neighbour
    (short/fade/buzz, curly/afro) for 63. Tied-back locs read as a buzz.
    """
    x, y, fw, fh = box
    top = np.where(mask[:, int(x + .3 * fw):int(x + .7 * fw)].any(1))[0][0]
    cheeks = np.concatenate([pixels(arr, mask, x + .2 * fw, y + .45 * fh, x + .34 * fw, y + .6 * fh),
                             pixels(arr, mask, x + .66 * fw, y + .45 * fh, x + .8 * fw, y + .6 * fh)])
    skin_l = np.median(cheeks @ LUM) if len(cheeks) else 128
    crown = pixels(arr, mask, x + .3 * fw, top, x + .7 * fw, top + .15 * fh)
    hair_l = np.percentile(crown @ LUM, 30) if len(crown) else skin_l
    widths = mask.sum(1)

    # Locs and long hair hang beside the jaw, outside the face box: darker than the
    # skin, or for light and red hair, a clearly different color from it.
    beside = [(x - .18 * fw, y + .7 * fh, x + .04 * fw, y + 1.2 * fh), (x + .96 * fw, y + .7 * fh, x + 1.18 * fw, y + 1.2 * fh)]
    side = np.concatenate([pixels(arr, mask, *b) for b in beside])
    skin_rgb = np.median(cheeks, 0) if len(cheeks) else np.full(3, 128.0)
    side_l = side @ LUM
    is_hair = (side_l < (skin_l + hair_l) / 2) | ((np.linalg.norm(side - skin_rgb, axis=1) > 45) & (side_l < .95 * skin_l))
    side_hair = is_hair.sum() / (.22 * fw * .5 * fh * 2)
    if side_hair > .45:
        # Judge by the hanging hair itself: near-black ropes are locs, brown or lighter is long hair.
        return ('long' if np.median(side_l[is_hair]) > 60 else 'locs'), np.median(side[is_hair], 0)
    # A crown as bright as the cheeks is scalp, unless a headband is what's up there.
    crown_rel = 0 if banded else np.median(crown @ LUM) / skin_l if len(crown) else 0
    if crown_rel > .55:
        return 'bald', None
    # Volume: how far the head rises above the face box, and how wide it gets up there.
    above = (y - top) / fh
    wide = widths[top:int(y)].max() / fw if y > top else 0
    if above >= .33 and wide >= 1.05:
        return ('afro' if wide >= 1.3 and above >= .38 else 'curly'), None
    # Tight curls make a busy crown even without much volume.
    g = arr[..., :3] @ LUM
    sub = g[top + 1:int(top + .15 * fh), int(x + .3 * fw):int(x + .7 * fw)]
    texture = (np.abs(np.diff(sub, axis=1)).mean() + np.abs(np.diff(sub, axis=0)).mean()) / max(skin_l, 1) * 100 if sub.size > 4 else 0
    if texture > 20:
        return 'curly', None
    if crown_rel > .3:
        return 'buzz', None
    if hair_l > 40:
        return 'short', None
    # A buzz barely rises off the head. With some height on top, brown hair is a short
    # cut and near-black hair a fade.
    if above < .24:
        return 'buzz', None
    return ('short' if hair_l > 25 else 'fade'), None


def beard_style(arr, mask, box):
    """'full', 'stubble' or 'none' from how much of the chin and jaw is hair.

    Beard hair is much less saturated than skin, which holds up under shadow where
    brightness alone doesn't. Goatees and mustaches are too small to call at this
    size and come out as stubble or none. Checked against the same 72 headshots:
    right or a look-alike neighbour for 61.
    """
    x, y, fw, fh = box
    cheeks = np.concatenate([pixels(arr, mask, x + .2 * fw, y + .45 * fh, x + .34 * fw, y + .6 * fh),
                             pixels(arr, mask, x + .66 * fw, y + .45 * fh, x + .8 * fw, y + .6 * fh)])
    if not len(cheeks):
        return 'none'
    chroma = lambda p: (p[:, 0] - p[:, 2]) / (p.sum(1) + 30)
    cheek_c = np.median(chroma(cheeks))
    cheek_l = np.median(cheeks @ LUM)

    def hairy(p):
        if not len(p):
            return 0
        return (((chroma(p) < .55 * cheek_c) & (p @ LUM < .9 * cheek_l)) | (p @ LUM < .35 * cheek_l)).mean()

    def red(p):
        # Red and auburn beards go the other way: darker and more saturated than the skin.
        # Only on the jaw, where lips can't pass for one, and only on light skin: on darker
        # skin, warm shadow along the jaw is just as saturated.
        if not len(p) or cheek_l < 160:
            return 0
        return ((chroma(p) > 1.7 * cheek_c) & (p @ LUM < .65 * cheek_l)).mean()

    chin = hairy(pixels(arr, mask, x + .36 * fw, y + .9 * fh, x + .64 * fw, y + 1.08 * fh))
    jaw_px = np.concatenate([pixels(arr, mask, x + .1 * fw, y + .68 * fh, x + .26 * fw, y + .9 * fh),
                             pixels(arr, mask, x + .74 * fw, y + .68 * fh, x + .9 * fw, y + .9 * fh)])
    jaw = max(hairy(jaw_px), red(jaw_px))
    score = chin + jaw
    return 'full' if score >= .6 else 'stubble' if score >= .15 else 'none'


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
        skin, hair, style, beard, band = m
        looks[p['espn_id']] = [hexof(skin), hexof(hair) if hair is not None else '', style, beard] + ([hexof(band)] if band is not None else [])
    looks = dict(sorted(looks.items(), key=lambda kv: int(kv[0])))
    with open(OUT, 'w') as f:
        f.write('{\n' + ',\n'.join(f'  "{k}": {json.dumps(v)}' for k, v in looks.items()) + '\n}\n')
    print(f'{len(looks)} of {len(roster)} players -> {os.path.normpath(OUT)}')


if __name__ == '__main__':
    main()
