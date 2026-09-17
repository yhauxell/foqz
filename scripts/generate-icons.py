#!/usr/bin/env python3
"""
Generate macOS .icns, electron-assets/icon.png, and public/ web icons for Foqz.
Usage:
    python3 scripts/generate-icons.py [optional_path_to_source_image]
"""

import sys
import os
import shutil
import subprocess
from PIL import Image, ImageFilter

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ELECTRON_ASSETS = os.path.join(REPO_ROOT, "electron-assets")
PUBLIC_DIR = os.path.join(REPO_ROOT, "public")
if len(sys.argv) < 2:
    print("Usage: python3 scripts/generate-icons.py <path_to_source_image>")
    sys.exit(1)

source_path = sys.argv[1]
if not os.path.exists(source_path):
    print(f"Error: Source image not found at {source_path}")
    sys.exit(1)

print(f"Processing app icon from: {source_path}")
orig = Image.open(source_path).convert("RGBA")

W, H = 1024, 1024
# If image is already an anti-aliased RGBA icon with transparent corners, use directly
corner_alpha = max(orig.getpixel((0, 0))[3], orig.getpixel((10, 10))[3])
if corner_alpha == 0:
    final_icon = orig.resize((W, H), Image.Resampling.LANCZOS)
else:
    # Apple macOS standard squircle: 840x840 (82% of canvas, matching system icons)
    cx, cy = 512.0, 512.0
    rx, ry = 420.0, 420.0
    n = 4.75

    mask = Image.new("L", (W, H), 0)
    mask_pixels = mask.load()

    for y in range(H):
        dy = abs(y - cy) / ry
        dyn = dy ** n
        for x in range(W):
            dx = abs(x - cx) / rx
            val = dx ** n + dyn
            if val <= 0.99:
                mask_pixels[x, y] = 255
            elif val < 1.015:
                t = (1.015 - val) / (1.015 - 0.99)
                mask_pixels[x, y] = int(255 * t)
            else:
                mask_pixels[x, y] = 0

    icon_base = orig.resize((W, H), Image.Resampling.LANCZOS)
    icon_base.putalpha(mask)

    shadow_mask = mask.filter(ImageFilter.GaussianBlur(16))
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    shadow_pixels = shadow.load()
    shadow_mask_pixels = shadow_mask.load()

    for y in range(H):
        for x in range(W):
            src_y = y - 14
            if 0 <= src_y < H:
                a = int(shadow_mask_pixels[x, src_y] * 0.42)
                if a > 0:
                    shadow_pixels[x, y] = (0, 0, 0, a)

    final_icon = Image.alpha_composite(shadow, icon_base)

os.makedirs(ELECTRON_ASSETS, exist_ok=True)
os.makedirs(PUBLIC_DIR, exist_ok=True)

icon_png_path = os.path.join(ELECTRON_ASSETS, "icon.png")
final_icon.save(icon_png_path, "PNG")
print(f"Saved: {icon_png_path}")

iconset_dir = os.path.join(ELECTRON_ASSETS, "icon.iconset")
os.makedirs(iconset_dir, exist_ok=True)

sizes = [
    ("icon_16x16.png", 16),
    ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32),
    ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128),
    ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256),
    ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512),
    ("icon_512x512@2x.png", 1024),
]

for filename, size in sizes:
    resized = final_icon.resize((size, size), Image.Resampling.LANCZOS)
    resized.save(os.path.join(iconset_dir, filename), "PNG")

icns_path = os.path.join(ELECTRON_ASSETS, "icon.icns")
subprocess.run(["iconutil", "-c", "icns", iconset_dir, "-o", icns_path], check=True)
shutil.rmtree(iconset_dir)
print(f"Saved: {icns_path} ({os.path.getsize(icns_path):,} bytes)")

final_icon.resize((32, 32), Image.Resampling.LANCZOS).save(os.path.join(PUBLIC_DIR, "favicon.png"), "PNG")
final_icon.resize((192, 192), Image.Resampling.LANCZOS).save(os.path.join(PUBLIC_DIR, "icon-192.png"), "PNG")
final_icon.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(PUBLIC_DIR, "icon-512.png"), "PNG")
final_icon.save(os.path.join(PUBLIC_DIR, "icon.png"), "PNG")
print("Saved web icons in public/ (favicon.png, icon-192.png, icon-512.png, icon.png)")

# 4. Build macOS 2-tone solid menu bar tray template icons (18x18 and 36x36 @2x)
import math
def generate_tray_template(target_size):
    scale_factor = 4
    canvas_size = target_size * scale_factor
    cx, cy = canvas_size / 2.0, canvas_size / 2.0
    scale = canvas_size / 144.0
    r_outer, w_outer = 60.0 * scale, 3.8 * scale
    r_band_out, r_band_in = 53.5 * scale, 37.0 * scale
    r_inner, w_inner = 27.5 * scale, 3.6 * scale
    r_dot = 11.5 * scale

    high_res = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    pixels = high_res.load()
    for y in range(canvas_size):
        for x in range(canvas_size):
            d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
            if d <= r_dot:
                pixels[x, y] = (0, 0, 0, 255)
            elif abs(d - r_inner) <= w_inner:
                pixels[x, y] = (0, 0, 0, 255)
            elif r_band_in <= d <= r_band_out:
                pixels[x, y] = (0, 0, 0, 115)
            elif abs(d - r_outer) <= w_outer:
                pixels[x, y] = (0, 0, 0, 255)
    return high_res.resize((target_size, target_size), Image.Resampling.LANCZOS)

generate_tray_template(18).save(os.path.join(ELECTRON_ASSETS, "trayTemplate.png"), "PNG")
generate_tray_template(36).save(os.path.join(ELECTRON_ASSETS, "trayTemplate@2x.png"), "PNG")
print("Saved 2-tone trayTemplate.png & trayTemplate@2x.png in electron-assets/")
print("Done!")
