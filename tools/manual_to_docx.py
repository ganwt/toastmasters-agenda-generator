"""docs/manual/MANUAL.md から Word 版の操作手順書を作る（開発者用、python-docx が必要）。
公開用の Markdown はぼかした画像（docs/manual/img/）を使う。Word 版はクラブ内で配るので、ぼかしていない画像を使える。

実行：python tools/manual_to_docx.py [画像フォルダ] [出力先]
  既定：画像 cache/manual/img（無ければ docs/manual/img）、出力 output/例会プログラム作成ツール_操作手順書.docx
"""
import re
import sys
from pathlib import Path

from docx import Document
from docx.enum.text import WD_BREAK
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

ROOT = Path(__file__).resolve().parent.parent
MD = ROOT / "docs" / "manual" / "MANUAL.md"
img_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "cache" / "manual" / "img"
if not img_dir.exists():
    img_dir = ROOT / "docs" / "manual" / "img"
out = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "output" / "例会プログラム作成ツール_操作手順書.docx"
FONT = "Meiryo UI"


def set_font(run, size=None, bold=None, color=None, mono=False):
    name = "Consolas" if mono else FONT
    run.font.name = name
    run._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:eastAsia"), FONT)
    if size:
        run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    if color:
        run.font.color.rgb = RGBColor(*color)


def add_inline(p, text, size=10.5, color=None):
    # **太字**、`コード`、[文字](リンク) だけを扱う
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    for part in re.split(r"(\*\*[^*]+\*\*|`[^`]+`)", text):
        if not part:
            continue
        if part.startswith("**"):
            set_font(p.add_run(part[2:-2]), size, True, color)
        elif part.startswith("`"):
            set_font(p.add_run(part[1:-1]), size, None, color, mono=True)
        else:
            set_font(p.add_run(part), size, None, color)


doc = Document()
sec = doc.sections[0]
sec.left_margin = sec.right_margin = Cm(2)
sec.top_margin = sec.bottom_margin = Cm(1.8)
width = sec.page_width - sec.left_margin - sec.right_margin

lines = MD.read_text(encoding="utf-8").splitlines()
i = 0
first_h2 = True
while i < len(lines):
    line = lines[i]
    if line.startswith("# "):
        p = doc.add_paragraph()
        add_inline(p, line[2:], size=20)
        p.runs[0].bold = True
    elif line.startswith("## "):
        if not first_h2:
            doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)
        first_h2 = False
        p = doc.add_paragraph()
        add_inline(p, line[3:], size=15, color=(0x1F, 0x4E, 0x79))
        p.runs[0].bold = True
    elif line.startswith("### "):
        p = doc.add_paragraph()
        add_inline(p, line[4:], size=12)
        p.runs[0].bold = True
    elif line.startswith("!["):
        m = re.match(r"!\[[^\]]*\]\(img/([^)]+)\)", line)
        doc.add_picture(str(img_dir / m.group(1)), width=width)
    elif line.startswith(">"):
        # 注意書き：続く「>」行をまとめて、網掛けの枠にする
        block = []
        while i < len(lines) and lines[i].startswith(">"):
            block.append(lines[i].lstrip("> ").rstrip())
            i += 1
        i -= 1
        table = doc.add_table(rows=1, cols=1)
        cell = table.rows[0].cells[0]
        shd = cell._element.get_or_add_tcPr()
        shd_el = shd.makeelement(qn("w:shd"), {qn("w:val"): "clear", qn("w:color"): "auto", qn("w:fill"): "EEF3F8"})
        shd.append(shd_el)
        cell.paragraphs[0].text = ""
        for k, b in enumerate(block):
            p = cell.paragraphs[0] if k == 0 else cell.add_paragraph()
            add_inline(p, b, size=10)
        doc.add_paragraph()
    elif line.startswith("|"):
        rows = []
        while i < len(lines) and lines[i].startswith("|"):
            cells = [c.strip() for c in lines[i].strip("|").split("|")]
            if not set("".join(cells)) <= set("-: "):
                rows.append(cells)
            i += 1
        i -= 1
        table = doc.add_table(rows=len(rows), cols=len(rows[0]))
        table.style = "Table Grid"
        for r, cells in enumerate(rows):
            for c, text in enumerate(cells):
                p = table.rows[r].cells[c].paragraphs[0]
                add_inline(p, text, size=9.5)
                if r == 0:
                    for run in p.runs:
                        run.bold = True
        doc.add_paragraph()
    elif re.match(r"^\d+\. ", line) or line.startswith("- "):
        style = "List Number" if line[0].isdigit() else "List Bullet"
        p = doc.add_paragraph(style=style)
        add_inline(p, re.sub(r"^(\d+\. |- )", "", line))
    elif line.strip() in ("", "---"):
        pass
    else:
        add_inline(doc.add_paragraph(), line)
    i += 1

out.parent.mkdir(parents=True, exist_ok=True)
doc.save(out)
print(out)
