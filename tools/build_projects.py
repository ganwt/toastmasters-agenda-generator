"""Pathways プロジェクト一覧（公開スプレッドシート）と説明 PDF から、プロジェクト説明データを作る（開発者用・一度だけ実行）。

実行：.venv の Python（pymupdf が必要）
    python tools/build_projects.py

出力：
    src/projects.js               スクリプトに同梱するデータ（PROJECTS）
    cache/pathways/projects.json  取得結果の詳細（status_en / status_ja を含む。リポジトリには含めない）
    cache/pathways/review.md      確認用の一覧（名前 / 説明の先頭 100 字 / 結果）
"""
import csv
import io
import json
import re
import time
import urllib.request
from pathlib import Path

import pymupdf

SHEET_CSV = "https://docs.google.com/spreadsheets/d/1ku8Aspg64CnHnyuFV3JD-d_3APnX56VxT_Z2pM3OEMw/export?format=csv&gid=827204203"
OUT = Path("cache/pathways")
PDF_DIR = OUT / "pdf"
COL = {"code": 0, "level": 1, "name_en": 2, "name_ja": 3, "url_en": 13, "url_ja": 14}
MAX_PAGES = 8  # 説明は冒頭数ページにある

# 説明の部品：段落の書き出しで見分ける
MARKERS = {
    "en": {
        "summary": re.compile(r"^(In this project|This project (?!includes))"),
        "purpose": re.compile(r"^Purpose\s*:"),
        "overview": re.compile(r"^Overview\s*:"),
        "includes": re.compile(r"^This project includes"),
    },
    "ja": {
        "summary": re.compile(r"^このプロジェクトでは"),
        "purpose": re.compile(r"^目的\s*[:：]"),
        "overview": re.compile(r"^概要\s*[:：]"),
        "includes": re.compile(r"^このプロジェクトには"),
    },
}
BULLET = re.compile(r"^[■•▪●・\u0017-]\s*")


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120) as res:
        return res.read()


def download_pdf(url, path):
    """戻り値：状態（'ok' / 理由）"""
    if path.exists() and path.read_bytes()[:5] == b"%PDF-":
        return "ok"
    if not url:
        return "リンクなし"
    m = re.search(r"/file/d/([A-Za-z0-9_-]+)", url)
    if m:
        url = f"https://drive.usercontent.google.com/download?id={m.group(1)}&export=download&confirm=t"
    elif "drive.google.com/drive/folders" in url or "docs.google.com/document" in url:
        return "PDF へのリンクではない"
    try:
        data = fetch(url)
    except Exception as e:  # noqa: BLE001  取得できない理由をそのまま一覧に出す
        return f"取得失敗（{e}）"
    finally:
        time.sleep(0.3)
    if data[:5] != b"%PDF-":
        return "ログインが必要（非公開）" if b"accounts.google.com" in data or b"Sign in" in data else "PDF ではない"
    path.write_bytes(data)
    return "ok"


def join_lines(text, lang):
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    if lang == "en":
        return re.sub(r"\s+", " ", " ".join(lines)).strip()
    out = ""
    for l in lines:
        # 日本語の行どうしはそのまま、英単語どうしの境目だけ空白を入れる
        if out and re.match(r"[A-Za-z0-9]", l[0]) and re.match(r"[A-Za-z0-9.,]", out[-1]):
            out += " "
        out += l
    return out


def paragraphs(pdf_path, lang):
    doc = pymupdf.open(pdf_path)
    paras = []
    for page in list(doc)[:MAX_PAGES]:
        for b in page.get_text("blocks"):
            t = join_lines(b[4], lang)
            if t:
                paras.append(t)
    return paras


def extract_description(pdf_path, lang):
    m = MARKERS[lang]
    paras = paragraphs(pdf_path, lang)
    found = {}
    for i, p in enumerate(paras):
        for key in ("summary", "purpose", "overview", "includes"):
            if key not in found and m[key].match(p):
                found[key] = i
    parts = []
    for key in ("summary", "purpose", "overview"):
        if key in found:
            parts.append(paras[found[key]])
    if "includes" in found:
        i = found["includes"]
        head = paras[i]
        items = [BULLET.sub("", x) for x in paras[i + 1 : i + 9] if BULLET.match(x)]
        parts.append("\n".join([head] + ["■ " + x for x in items]) if items else head)
    ok = "purpose" in found and "overview" in found
    return "\n\n".join(parts), ok


def main():
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    text = fetch(SHEET_CSV).decode("utf-8")
    (OUT / "projects.csv").write_text(text, encoding="utf-8", newline="")
    rows = list(csv.reader(io.StringIO(text)))
    projects = []
    for n, r in enumerate(rows, start=1):
        if not re.fullmatch(r"\d{4}", (r[COL["code"]] if r else "").strip()):
            continue
        p = {"row": n, "code": r[COL["code"]].strip(), "level": r[COL["level"]].strip(),
             "name_en": r[COL["name_en"]].strip(), "name_ja": r[COL["name_ja"]].strip()}
        for lang in ("en", "ja"):
            path = PDF_DIR / f"{p['code']}_{lang}.pdf"
            status = download_pdf(r[COL["url_" + lang]].strip(), path)
            desc = ""
            if status == "ok":
                try:
                    desc, ok = extract_description(path, lang)
                    status = "ok" if ok else ("一部のみ" if desc else "説明が見つからない")
                except Exception as e:  # noqa: BLE001
                    status = f"読み取り失敗（{e}）"
            p["desc_" + lang] = desc
            p["status_" + lang] = status
        projects.append(p)
        print(p["row"], p["code"], p["status_en"], p["status_ja"], flush=True)

    (OUT / "projects.json").write_text(json.dumps(projects, ensure_ascii=False, indent=1), encoding="utf-8")
    keys = ("row", "code", "level", "name_en", "name_ja", "desc_en", "desc_ja")
    body = ",\n".join("  " + json.dumps({k: p[k] for k in keys}, ensure_ascii=False) for p in projects)
    Path("src/projects.js").write_text(
        "// Pathways プロジェクトの説明（tools/build_projects.py で生成。直接編集しない）\n"
        "// row はプロジェクト一覧シートの行番号（例会ページのリンクの range=A{row} と同じ）\n"
        "var PROJECTS = [\n" + body + "\n];\n",
        encoding="utf-8",
    )
    lines = ["| 行 | 番号 | 名前（英 / 日） | 英：結果 | 英：説明の先頭 100 字 | 日：結果 | 日：説明の先頭 100 字 |", "|---|---|---|---|---|---|---|"]
    cell = lambda s: s.replace("\n", " ").replace("|", "／")[:100]
    for p in projects:
        lines.append(f"| {p['row']} | {p['code']} | {p['name_en']} / {p['name_ja']} | {p['status_en']} | {cell(p['desc_en'])} | {p['status_ja']} | {cell(p['desc_ja'])} |")
    (OUT / "review.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    ok = sum(1 for p in projects for l in ("en", "ja") if p["status_" + l] == "ok")
    print(f"{len(projects)} プロジェクト、説明の取得成功 {ok} / {len(projects) * 2}")


if __name__ == "__main__":
    main()
