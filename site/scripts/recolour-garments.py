#!/usr/bin/env python3
"""Colour variants of the four garment cut-outs, for the floating rail.

    python3 scripts/recolour-garments.py

Run once; the outputs are committed. There are four cut-outs and the rail
needs a dozen cards that don't obviously repeat, so each garment is dyed into
two more colours. The dye is a hue replacement with the value channel left
alone, which is the difference between a coloured garment and a coloured
rectangle: every fold, shadow and highlight in the photograph survives, only
the colour of the cloth changes.

Saturation is derived from the original rather than set flat, so a garment
that was nearly grey comes out muted and one that was already coloured comes
out strong - and highlights are held back from taking the dye, or a white
sleeve turns into a neon one.
"""

import numpy as np
from PIL import Image

SRC = "public/garments-sm"

# Hue in turns, the name it goes out under, and how much of the top of the
# frame the hanger occupies. The hanger is not cloth and must not be dyed - a
# lilac hanger reads as a mistake in a way a lilac jacket does not - and it is
# the one part of these photographs whose position is predictable, so a
# protected band is enough without segmenting anything.
VARIANTS = {
    "garment-shirt": [("rust", 0.035), ("cobalt", 0.60), ("sand", 0.12), ("forest", 0.36)],
    "garment-jacket": [("plum", 0.86), ("teal", 0.47), ("navy", 0.63), ("ochre", 0.10)],
    "garment-knit": [("amber", 0.09), ("moss", 0.28), ("rose", 0.95), ("slate", 0.57)],
    "garment-pants": [("clay", 0.05), ("indigo", 0.68), ("olive", 0.20), ("burgundy", 0.92)],
}

# Trousers hang from a bar in full view; the others show only a hook.
PROTECT_TOP = {"garment-shirt": 0.05, "garment-jacket": 0.05, "garment-knit": 0.09, "garment-pants": 0.25}


def dye(path: str, hue: float, protect_top: float = 0.0) -> Image.Image:
    im = Image.open(path).convert("RGBA")
    arr = np.asarray(im).astype(np.float32) / 255.0
    rgb, alpha = arr[..., :3], arr[..., 3:]

    mx = rgb.max(axis=-1)
    mn = rgb.min(axis=-1)
    v = mx
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0.0)

    # Muted where the original was, strong where it was. The ceiling keeps the
    # brightest cloth from reading as plastic.
    new_s = np.clip(0.20 + 0.60 * s, 0.0, 0.82)
    # Highlights keep more of their brightness and less of the dye, so a lit
    # fold still reads as light rather than as a saturated patch.
    new_s *= np.clip(1.0 - (v - 0.82) / 0.18 * 0.75, 0.25, 1.0)

    h6 = (hue % 1.0) * 6.0
    i = np.floor(h6).astype(np.int32)
    f = h6 - i
    p = v * (1.0 - new_s)
    q = v * (1.0 - new_s * f)
    t = v * (1.0 - new_s * (1.0 - f))
    order = [(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)]
    out = np.zeros_like(rgb)
    for k, (r_, g_, b_) in enumerate(order):
        m = i % 6 == k
        out[..., 0] = np.where(m, r_, out[..., 0])
        out[..., 1] = np.where(m, g_, out[..., 1])
        out[..., 2] = np.where(m, b_, out[..., 2])

    # Fade the dye in over the protected band rather than switching it on at a
    # line, or the hanger's shadow ends in a visible seam.
    if protect_top > 0:
        rows = np.arange(rgb.shape[0], dtype=np.float32) / rgb.shape[0]
        mix = np.clip((rows - protect_top) / 0.05, 0.0, 1.0)[:, None, None]
        out = rgb * (1.0 - mix) + out * mix

    done = np.concatenate([out, alpha], axis=-1)
    return Image.fromarray((np.clip(done, 0, 1) * 255).astype(np.uint8), "RGBA")


for name, variants in VARIANTS.items():
    for label, hue in variants:
        out = f"{SRC}/{name}-{label}.webp"
        dye(f"{SRC}/{name}.webp", hue, PROTECT_TOP.get(name, 0.0)).save(out, "WEBP", quality=82, method=6)
        print("wrote", out)
