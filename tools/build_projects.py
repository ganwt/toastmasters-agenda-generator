"""Pathways プロジェクト一覧（公開スプレッドシート）と説明資料から、プロジェクト説明データを作る（開発者用）。

実行：.venv の Python（pymupdf が必要）
    python tools/build_projects.py

入力：
    日本語：プロジェクト一覧の「説明資料(日)」の PDF（Base Camp の Resources で公開されているもの）を自動で取得
    英語：cache/pathways/eval/{番号}.pdf に置いた Evaluation Resource（会員が Base Camp から各自ダウンロード）の Purpose

出力（cache/pathways/。会員向け資料を含むので、リポジトリには入れない）：
    project_descriptions.csv  クラブ用スプレッドシートの「プロジェクト説明」シートに取り込む CSV
    projects.json             取得結果の詳細（status_en / status_ja を含む）
    review.md                 確認用の一覧（名前 / 説明の先頭 100 字 / 結果）
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
COL = {"code": 0, "level": 1, "name_en": 2, "name_ja": 3}  # A〜D 列（固定）
HEADER_ROW = 4  # 「リンク先」の各列の見出しがある行


def find_url_columns(rows):
    """説明資料の列は、列の追加で位置が変わるので見出しの文字で探す。見つからなければ None"""
    header = [h.replace("（", "(").replace("）", ")") for h in rows[HEADER_ROW - 1]]
    find = lambda key: next((i for i, h in enumerate(header) if h.startswith(key)), None)
    return {"url_en": find("説明資料(英)"), "url_ja": find("説明資料(日)")}
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
        text = re.sub(r"\s+", " ", " ".join(lines)).strip()
        # 行末のハイフンで折り返された語（well-\nresearched）をつなぎ直す。数字の後（5- to 7-minute）はそのまま
        return re.sub(r"(?<=[A-Za-z])- (?=[a-z])", "-", text)
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
    starts = set(found.values())

    def whole(i):
        # PDF の文字ブロックが文の途中で分かれることがあるので、文末まで次の段落をつなげる
        text = paras[i]
        while not re.search(r"[。．.!?」）)]$", text) and i + 1 < len(paras) and i + 1 not in starts:
            i += 1
            text += ("" if lang == "ja" else " ") + paras[i]
        return text

    parts = []
    for key in ("summary", "purpose", "overview"):
        if key in found:
            parts.append(whole(found[key]))
    if "includes" in found:
        i = found["includes"]
        head = paras[i]
        items = [BULLET.sub("", x) for x in paras[i + 1 : i + 9] if BULLET.match(x)]
        parts.append("\n".join([head] + ["■ " + x for x in items]) if items else head)
    ok = "purpose" in found and "overview" in found
    return "\n\n".join(parts), ok


EVAL_DIR = OUT / "eval"  # 会員向けの Evaluation Resource（英）。Base Camp から各自ダウンロードして {番号}.pdf で置く


def extract_eval_purpose(pdf_path):
    """Evaluation Resource の「Purpose Statement」の文。複数スピーチ分あるときは最初のもの"""
    text = "\n".join(page.get_text() for page in pymupdf.open(pdf_path))
    m = re.search(r"Purpose Statements?\s*\n(.+?)\n\s*(Notes for the Evaluator|General Comments|Speech Length)", text, re.S)
    if not m:
        return ""
    # 「プロジェクトの目的」と「スピーチの目的」が箇条書き（\x07・\x17・■ など）で並ぶことがあるので 1 行ずつにする
    text = join_lines(m.group(1), "en")
    text = re.sub(r"^Project Purpose\s*", "", text)
    parts = [s.strip() for s in re.split(r"[\x07\x17■•▪]+", text)]
    return "\n".join(s for s in parts if s)


def main():
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    text = fetch(SHEET_CSV).decode("utf-8")
    (OUT / "projects.csv").write_text(text, encoding="utf-8", newline="")
    rows = list(csv.reader(io.StringIO(text)))
    projects = []
    COL.update(find_url_columns(rows))
    print("説明資料の列：", {k: v for k, v in COL.items() if k.startswith("url_")})
    for n, r in enumerate(rows, start=1):
        if not re.fullmatch(r"\d{4}", (r[COL["code"]] if r else "").strip()):
            continue
        p = {"row": n, "code": r[COL["code"]].strip(), "level": r[COL["level"]].strip(),
             "name_en": r[COL["name_en"]].strip(), "name_ja": r[COL["name_ja"]].strip()}
        for lang in ("en", "ja"):
            path = PDF_DIR / f"{p['code']}_{lang}.pdf"
            col = COL["url_" + lang]
            status = download_pdf(r[col].strip() if col is not None and col < len(r) else "", path)
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

    # 英語：Evaluation Resource の Purpose があればそれを使い、無ければ英語版マニュアルから取れたもの
    for p in projects:
        pdf = EVAL_DIR / f"{p['code']}.pdf"
        purpose = extract_eval_purpose(pdf) if pdf.exists() else ""
        if purpose:
            p["desc_en"], p["status_en"] = purpose, "ok（Evaluation Resource）"

    # 一覧のリンク誤りで別プロジェクトと同じ PDF を指していることがある。後に出てくる方を空にする
    for lang in ("en", "ja"):
        seen = {}
        for p in projects:
            d = p["desc_" + lang]
            if d and d in seen:
                p["desc_" + lang] = ""
                p["status_" + lang] = f"{seen[d]} と同じ説明（一覧のリンク誤りの可能性）"
            elif d:
                seen[d] = p["code"]

    (OUT / "projects.json").write_text(json.dumps(projects, ensure_ascii=False, indent=1), encoding="utf-8")
    keys = ("row", "code", "level", "name_en", "name_ja", "desc_ja", "desc_en")
    with (OUT / "project_descriptions.csv").open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(keys)
        w.writerows([p[k] for k in keys] for p in projects)

    lines = ["| 行 | 番号 | 名前（英 / 日） | 英：結果 | 英：説明の先頭 100 字 | 日：結果 | 日：説明の先頭 100 字 |", "|---|---|---|---|---|---|---|"]
    cell = lambda s: s.replace("\n", " ").replace("|", "／")[:100]
    for p in projects:
        lines.append(f"| {p['row']} | {p['code']} | {p['name_en']} / {p['name_ja']} | {p['status_en']} | {cell(p['desc_en'])} | {p['status_ja']} | {cell(p['desc_ja'])} |")
    (OUT / "review.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    count = lambda lang: sum(1 for p in projects if p["desc_" + lang])
    print(f"{len(projects)} プロジェクト：日本語の説明 {count('ja')} 件、英語の説明 {count('en')} 件 → {OUT / 'project_descriptions.csv'}")


if __name__ == "__main__":
    main()
