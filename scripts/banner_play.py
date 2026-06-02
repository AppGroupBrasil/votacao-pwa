from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

W, H = 1024, 500
NAVY_DARK = (10, 25, 49)
NAVY_MID = (15, 40, 80)
BLUE = (37, 99, 235)
BLUE_LIGHT = (96, 165, 250)
GREEN = (34, 197, 94)
WHITE = (255, 255, 255)
GRAY = (180, 200, 220)

img = Image.new("RGB", (W, H), NAVY_DARK)
draw = ImageDraw.Draw(img)

for y in range(H):
    t = y / H
    r = int(NAVY_DARK[0] + (NAVY_MID[0] - NAVY_DARK[0]) * t)
    g = int(NAVY_DARK[1] + (NAVY_MID[1] - NAVY_DARK[1]) * t)
    b = int(NAVY_DARK[2] + (NAVY_MID[2] - NAVY_DARK[2]) * t)
    draw.line([(0, y), (W, y)], fill=(r, g, b))

draw.ellipse([W - 280, -180, W + 100, 200], outline=(25, 55, 100), width=3)
draw.ellipse([W - 220, -120, W + 60, 160], outline=(30, 65, 115), width=2)

ICON_X, ICON_Y, ICON_S = 70, 110, 220
icon = Image.new("RGBA", (ICON_S, ICON_S), (0, 0, 0, 0))
ic = ImageDraw.Draw(icon)
ic.rounded_rectangle([0, 0, ICON_S, ICON_S], radius=44, fill=BLUE)

phone_w, phone_h = 110, 160
px = (ICON_S - phone_w) // 2
py = (ICON_S - phone_h) // 2 - 10
ic.rounded_rectangle([px, py, px + phone_w, py + phone_h], radius=14, fill=(220, 235, 255))
ic.rounded_rectangle([px + 8, py + 14, px + phone_w - 8, py + phone_h - 14], radius=4, fill=(60, 110, 200))

cx, cy = ICON_S // 2, ICON_S // 2 - 6
ic.ellipse([cx - 22, cy - 28, cx + 22, cy + 16], outline=BLUE_LIGHT, width=2)
for ang in [(-18, -10), (18, -10), (-12, 6), (12, 6), (0, 14)]:
    ic.ellipse([cx + ang[0] - 2, cy + ang[1] - 2, cx + ang[0] + 2, cy + ang[1] + 2], fill=BLUE_LIGHT)

ck_cx, ck_cy = ICON_S // 2 + 6, ICON_S // 2 + 38
ic.ellipse([ck_cx - 26, ck_cy - 26, ck_cx + 26, ck_cy + 26], fill=GREEN)
ic.line([(ck_cx - 12, ck_cy + 2), (ck_cx - 3, ck_cy + 11), (ck_cx + 13, ck_cy - 8)], fill=WHITE, width=5)

img.paste(icon, (ICON_X, ICON_Y), icon)

draw.line([(ICON_X, ICON_Y + ICON_S + 8), (ICON_X + ICON_S + 240, ICON_Y + ICON_S + 8)], fill=GREEN, width=4)

def load(size, bold=False):
    candidates = [
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
    ]
    for c in candidates:
        if Path(c).exists():
            return ImageFont.truetype(c, size)
    return ImageFont.load_default()

f_brand = load(82, bold=True)
f_tag = load(34, bold=True)
f_feat = load(26)
f_url = load(24)

tx = ICON_X + ICON_S + 40
ty = ICON_Y + 30
draw.text((tx, ty), "Votação", font=f_brand, fill=WHITE)
bbox = draw.textbbox((0, 0), "Votação", font=f_brand)
draw.text((tx + bbox[2] - bbox[0] + 18, ty), "Online", font=f_brand, fill=GREEN)

draw.text((tx, ty + 100), "Assembleias digitais seguras", font=f_tag, fill=WHITE)
draw.text((tx, ty + 150), "Biometria  •  WebAuthn  •  Voto auditável", font=f_feat, fill=GRAY)

draw.text((tx, H - 70), "appvotacao.com.br", font=f_url, fill=GREEN)

out = Path(__file__).parent.parent / "AppVotacao-feature-graphic-1024x500.png"
img.save(out, "PNG", optimize=True)
print(f"OK: {out}")
