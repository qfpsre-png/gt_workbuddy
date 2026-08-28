#!/usr/bin/env python3
"""生成 WorkBuddy 工作台 PWA 图标：柔和蓝渐变 + 白色工作台符号"""
from PIL import Image, ImageDraw
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "icons")
os.makedirs(OUT, exist_ok=True)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(size, c_top, c_bottom):
    img = Image.new("RGB", (size, size), c_top)
    px = img.load()
    for y in range(size):
        c = lerp(c_top, c_bottom, y / (size - 1))
        for x in range(size):
            px[x, y] = c
    return img


def draw_icon(size, maskable=False):
    # 柔和蓝渐变
    img = gradient(size, (147, 197, 253), (59, 130, 246))  # #93c5fd -> #3b82f6
    d = ImageDraw.Draw(img)
    s = size
    # 安全区：maskable 图标内容缩小到 80%
    pad = 0.20 * s if maskable else 0.14 * s
    cx = s / 2

    # 白色圆角卡片（代表工作台）
    card_w = s - 2 * pad
    card_h = card_w * 0.62
    card_top = cx - card_h * 0.1
    r = card_w * 0.10
    d.rounded_rectangle(
        [pad, card_top, pad + card_w, card_top + card_h],
        radius=r, fill=(255, 255, 255),
    )
    # 卡片上的蓝色线条（待办清单感）
    line_x1 = pad + card_w * 0.20
    line_x2 = pad + card_w * 0.80
    for i, dy in enumerate((0.28, 0.50, 0.72)):
        y = card_top + card_h * dy
        # 圆点
        cr = card_w * 0.035
        d.ellipse([line_x1 - cr * 2.2, y - cr, line_x1 - cr * 0.2, y + cr],
                  fill=(59, 130, 246))
        # 线
        d.rounded_rectangle(
            [line_x1, y - card_w * 0.018, line_x2, y + card_w * 0.018],
            radius=card_w * 0.018, fill=(191, 219, 254),
        )
    # 卡片下方的勾（打卡完成）
    chk_cy = card_top + card_h + pad * 0.9
    chk = s * 0.11
    lw = max(3, int(s * 0.035))
    d.line([(cx - chk, chk_cy), (cx - chk * 0.25, chk_cy + chk * 0.7),
            (cx + chk, chk_cy - chk * 0.7)],
           fill=(255, 255, 255), width=lw, joint="curve")
    return img


for sz in (192, 512):
    draw_icon(sz).save(os.path.join(OUT, f"icon-{sz}.png"))
    draw_icon(sz, maskable=True).save(os.path.join(OUT, f"icon-{sz}-maskable.png"))

# Apple touch icon（180）
draw_icon(180).save(os.path.join(OUT, "apple-touch-icon.png"))

print("icons generated:", sorted(os.listdir(OUT)))
