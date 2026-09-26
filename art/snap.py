"""Snap AI-generated pixel art to its true pixel grid.

Usage: python3 art/snap.py
Detects the grid on art/raw/rain-day.png and applies it to every art/raw/*.png so all scenes stay aligned.
The room scenes share one grid of their own.
Each detected cell is split into DETAIL x DETAIL art pixels, keeping the finer strokes the generator drew.
Colours are the true per-cell medians: a reduced palette shifted sky hues and ringed the bulbs.
"""
from pathlib import Path
import numpy as np
from PIL import Image

DETAIL = 2


def grid(edges):
    """Return (period, offset) of the strongest periodic comb in a 1D edge-energy signal."""
    k = np.arange(len(edges))
    best = None
    for p in np.arange(3.0, 14.0, 0.005):
        z = (edges * np.exp(-2j * np.pi * k / p)).sum() / edges.sum()
        if best is None or abs(z) > best[0] * 1.02:
            best = (abs(z), p, (-np.angle(z) / (2 * np.pi) * p) % p)
    return best[1], best[2]


def snap(src, dst, forced=None, detail=1):
    a = np.asarray(Image.open(src).convert('RGB'), np.float32)
    h, w, _ = a.shape
    if forced:
        p, ox, oy, cols, rows = forced
    else:
        px, ox = grid(np.abs(np.diff(a, axis=1)).sum((0, 2)))
        py, oy = grid(np.abs(np.diff(a, axis=0)).sum((1, 2)))
        p = (px + py) / 2
        # Edge index k sits between pixels k and k+1, so the cell boundary is at k + 1.
        ox, oy = (ox + 1) % p, (oy + 1) % p
        # Same origin, finer cells: art pixel coordinates stay an exact multiple of the coarse grid.
        p /= detail
        cols, rows = int((w - ox) // p), int((h - oy) // p)
    cells = np.zeros((rows, cols, 3), np.uint8)
    r = max(1, int(p * 0.3))
    for j in range(rows):
        cy = int(oy + (j + 0.5) * p)
        for i in range(cols):
            cx = int(ox + (i + 0.5) * p)
            cells[j, i] = np.median(a[cy - r:cy + r + 1, cx - r:cx + r + 1].reshape(-1, 3), axis=0)
    Image.fromarray(cells).save(dst, optimize=True)
    print(f'{src}: period {p:.3f} offset ({ox:.2f}, {oy:.2f}) -> {cols}x{rows}')
    return p, ox, oy, cols, rows


def dry_face(wet_path, dry_path, top):
    """Remove light reflections the generator painted on the ledge's front lip and vertical face (rows >= top).

    Puddles on the top surface may reflect the bulbs; a vertical stone face facing the viewer should not.
    Reflection pixels are replaced by the dry variant's pixels, tone-matched to the wet wall.
    """
    wet = np.asarray(Image.open(wet_path).convert('RGB'), np.float32)
    dry = np.asarray(Image.open(dry_path).convert('RGB'), np.float32)
    w, d = wet[top:], dry[top:]
    excess = (w[..., 0] - w[..., 2]) - (d[..., 0] - d[..., 2]) + (w.mean(2) - d.mean(2))
    mask = excess > 30
    mask[:, 1:] |= mask[:, :-1]
    mask[:, :-1] |= mask[:, 1:]
    keep = ~mask
    tone = w[keep].mean(0) / np.maximum(d[keep].mean(0), 1)
    w[mask] = np.clip(d[mask] * tone, 0, 255)
    wet[top:] = w
    Image.fromarray(wet.astype(np.uint8)).save(wet_path)
    print(f'{wet_path}: dried {int(mask.sum())} front-face pixels')


def cool_face(warm_path, cool_path, top):
    """Give the shaded front of the ledge the cool hue of another scene, keeping its own brightness.

    The face points away from the bulbs, so it should not glow amber. Ivy (green) is left alone.
    """
    warm = np.asarray(Image.open(warm_path).convert('RGB'), np.float32)
    cool = np.asarray(Image.open(cool_path).convert('RGB'), np.float32)
    w, c = warm[top:], cool[top:]
    green = lambda a: a[..., 1] > np.maximum(a[..., 0], a[..., 2]) + 4
    stone = ~(green(w) | green(c))
    ratio = (w.mean(2) / np.maximum(c.mean(2), 1))[..., None]
    w[stone] = np.clip(c * ratio, 0, 255)[stone]
    warm[top:] = w
    Image.fromarray(warm.astype(np.uint8)).save(warm_path)
    print(f'{warm_path}: cooled {int(stone.sum())} face pixels')


def wire_path(base_path, k=1):
    """Fit the bulb wire's sag as a parabola from its darkest pixels in the base scene."""
    a = np.asarray(Image.open(base_path).convert('RGB'), np.float32).mean(2)
    x0, x1 = 58 * k, 187 * k
    xs, ys = [], []
    for x in range(x0, x1 + 1):
        col = a[10 * k:50 * k, x]
        dark = np.nonzero(col < np.median(col) - 45)[0]
        if len(dark):
            xs.append(x), ys.append(dark[0] + 10 * k)
    xs, ys = np.array(xs), np.array(ys)
    keep = np.ones(len(xs), bool)
    for _ in range(3):
        fit = np.polyfit(xs[keep], ys[keep], 2)
        keep = np.abs(np.polyval(fit, xs) - ys) <= 2 * k
    return [(x, int(round(np.polyval(fit, x)))) for x in range(x0, x1 + 1)]


def mend_wire(path, wire):
    """Fill cells where snapping lost the thin wire and the sky shows through, keeping existing wire shading."""
    a = np.asarray(Image.open(path).convert('RGB'), np.float32)
    cells = [(x, y) for i, (x, y) in enumerate(wire) for y in range(min(y, wire[i - 1][1] + 1) if i else y, y + 1)]
    lum = np.array([a[y, x].mean() for x, y in cells])
    dark = lum < np.median(lum)
    color = np.median(np.array([a[y, x] for x, y in cells])[dark], axis=0)
    gaps = [(x, y) for (x, y), l in zip(cells, lum) if l > color.mean() + 30]
    for x, y in gaps:
        a[y, x] = color * 0.8 + a[y, x] * 0.2
    Image.fromarray(a.astype(np.uint8)).save(path)
    print(f'{path}: filled {len(gaps)} wire gaps')


def repaint_moon(path, k=1, lit=0.36, tilt=40):
    """Replace the generated crescent with a round, opaque waxing crescent moon: the lit limb fades across an
    elliptical terminator into a faint dark side, placed wholly inside the dark upper sky band.

    The lit limb always faces the Sun. After sunset the Sun is below the western horizon (lower right, where it
    sets in the evening scene), so the limb points `tilt` degrees below horizontal and the horns tip up-left.
    """
    a = np.asarray(Image.open(path).convert('RGB'), np.float32)
    x0, y0, x1, y1 = (v * k for v in (203, 2, 220, 17))
    cx, cy, radius = 211.5 * k, 6.5 * k, 4.7 * k
    lum = a.mean(2)
    for y in range(y0, y1):
        row = lum[y, x0 - 6 * k:x1 + 6 * k]
        sky = np.median(row)
        for x in range(x0, x1):
            if lum[y, x] > sky + 8:
                near = [a[y, i] for i in range(x - 5 * k, x + 5 * k + 1) if abs(lum[y, i] - sky) <= 8]
                a[y, x] = np.median(near, axis=0) if near else a[y, x]
    ramp = [(-0.8 * k, '#232c4c'), (0.0, '#4c5170'), (0.8 * k, '#8d8a90'), (1.6 * k, '#cfc3a9'), (9e9, '#f4e9cc')]
    sub = (np.arange(8) + 0.5) / 8 - 0.5
    bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
    # Faint lunar seas on the lit side, in moon-radius units from the centre.
    seas = [(0.55, -0.38, 0.15), (0.5, 0.22, 0.17), (0.22, -0.02, 0.14)]
    rgb = lambda h: np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32)
    for y in range(int(cy - radius) - 1, int(cy + radius) + 2):
        for x in range(int(cx - radius) - 1, int(cx + radius) + 2):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            d = np.hypot(dx, dy)
            # Supersampled edge coverage blends the limb into the sky so the small disc reads round, not squared.
            cover = np.mean(np.hypot(dx + sub[:, None], dy + sub[None, :]) <= radius)
            if cover == 0:
                continue
            # u runs toward the lit limb (the Sun), v along the horns.
            u = dx * np.cos(np.radians(tilt)) + dy * np.sin(np.radians(tilt))
            v = -dx * np.sin(np.radians(tilt)) + dy * np.cos(np.radians(tilt))
            # The terminator is half an ellipse: at this row it sits (1 - 2 * lit) of the way to the right limb.
            # Ordered dither across the steps keeps the terminator soft instead of striped.
            e = u - (1 - 2 * lit) * np.sqrt(max(radius ** 2 - v ** 2, 0)) + (bayer[y % 4][x % 4] / 16 - 0.47) * 1.2 * k
            color = next(c for limit, c in ramp if e <= limit)
            if color == '#232c4c' and d > radius - k:
                color = '#2b3556'
            sea = any(np.hypot(u / radius - sx, v / radius - sy) < sr for sx, sy, sr in seas)
            if sea and color in ('#f4e9cc', '#cfc3a9'):
                color = '#d3c6aa' if color == '#f4e9cc' else '#b5a993'
            a[y, x] = a[y, x] * (1 - cover) + rgb(color) * cover
    Image.fromarray(a.astype(np.uint8)).save(path)
    print(f'{path}: repainted waxing crescent at ({cx}, {cy}) r {radius:.1f}, {lit:.0%} lit, tilted {tilt} deg')


if __name__ == '__main__':
    k = DETAIL
    root = Path(__file__).parent
    assets = root.parent / 'public/assets'
    base = snap(root / 'raw/rain-day.png', assets / 'rain-day.png', detail=k)
    # The room art came out with squashed rows, so its grid is the one its columns show, at the rooftop's size.
    room = (3.36, -0.33, 0.27) + base[3:]
    for src in sorted((root / 'raw').glob('*.png')):
        if src.stem != 'rain-day':
            snap(src, assets / src.name, room if src.stem.startswith('room-') else base)
    for wet, dry in (('rain-evening', 'cloud-evening'), ('rain-night', 'cloud-night')):
        dry_face(assets / f'{wet}.png', assets / f'{dry}.png', 108 * k)
    cool_face(assets / 'rain-evening.png', assets / 'rain-night.png', 108 * k)
    repaint_moon(assets / 'sun-night.png', k)
    wire = wire_path(assets / 'rain-day.png', k)
    for png in sorted(assets.glob('*.png')):
        if not png.stem.startswith('room-'):
            mend_wire(png, wire)
    # Link preview card, enlarged without smoothing so the pixels stay crisp when sites scale it down.
    card = Image.open(assets / 'sun-night.png')
    card.resize((card.width * 3, card.height * 3), Image.NEAREST).save(assets.parent / 'og.png', optimize=True)
