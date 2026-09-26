from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets" / "portfolio"
FRAMES = [
    ("01-analysis-100.png", "Análise: lances, variantes e defesas"),
    ("02-overview-100.png", "Panorama: desenvolvimento, rei e estrutura"),
    ("03-tactics-100.png", "Tática: lances forçantes e temas"),
    ("04-strategy-100.png", "Estratégia: casas, colunas e planos"),
    ("05-endgame-100.png", "Final: material e padrões teóricos"),
]

# Pillow's tiny built-in fallback font does not contain Portuguese accents.
# DejaVu Sans ships with Pillow and keeps the demo reproducible across Windows,
# Linux and macOS development hosts.
TITLE_FONT = ImageFont.truetype("DejaVuSans.ttf", 24)


def frame(path: Path, title: str) -> Image.Image:
    image = Image.open(path).convert("RGB")
    image.thumbnail((1280, 890), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (1280, 960), "#10140e")
    x = (canvas.width - image.width) // 2
    canvas.paste(image, (x, 58))
    draw = ImageDraw.Draw(canvas)
    draw.text((42, 20), title, fill="#d9efb9", font=TITLE_FONT)
    return canvas


images = [frame(ASSETS / filename, title) for filename, title in FRAMES]
output = ASSETS / "chess-assistant-demo.gif"
images[0].save(
    output,
    save_all=True,
    append_images=images[1:],
    duration=[2400, 2200, 2200, 2200, 2600],
    loop=0,
    optimize=True,
)
print(output)
