"""Generate the combined reference page from Markdown sheets.

Usage:
    python scripts/build_reference.py [system]

Sources live in reference_sheets/<system>/*.md; the generated page is written
to static/<system>-reference.html. Requires the `markdown` package.
"""

from __future__ import annotations

import argparse
import html
import re
import sys
from pathlib import Path

import markdown

ROOT = Path(__file__).resolve().parent.parent

SYSTEMS = {
    "cyberpunk": {
        "src": ROOT / "reference_sheets" / "cyberpunk",
        "out": ROOT / "static" / "cyberpunk-reference.html",
        "page_title": "Cyberpunk RED — Справочник",
        "css": ["/css/cyberpunk.css", "/css/reference.css"],
        "body_class": "theme-cyberpunk",
        "top_left": "NC",
        "top_title": "NIGHT CITY GOVERNMENT",
        "top_right": "DataTerm Inc.&nbsp;&#9658;&nbsp;REFERENCE DATA",
        "topic": "REFERENCE",
        "doc_title": "СПРАВОЧНИК ИГРОКА",
        "system_label": "Cyberpunk RED",
        "back_url": "/cyberpunk",
        "back_title": "К листам",
        "toc_title": "Содержание",
        "footer": "NCPD:DATATERM-REFERENCE-DATA",
    },
}

PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{page_title}</title>
  {css_links}
</head>
<body class="{body_class}">
  <div class="ref-page">
    <header class="ref-header">
      <div class="dt-bar dt-bar-top">
        <span class="dt-nc">{top_left}</span>
        <span class="dt-title">{top_title}</span>
        <span class="dt-right">{top_right}</span>
      </div>
      <div class="ref-subbar">
        <div class="row gap center">
          <a class="btn ghost" href="{back_url}" title="{back_title}">&larr;</a>
          <div>
            <div class="muted small">Topic: {topic}</div>
            <div class="campaign-id">{doc_title}</div>
          </div>
        </div>
        <span class="muted small">{system_label}</span>
      </div>
    </header>

    <div class="ref-body">
    <!-- ===== Оглавление ===== -->
    <nav class="ref-toc">
      <div class="ref-toc-inner">
        <h2>{toc_title}</h2>
{toc}
      </div>
    </nav>

    <main class="ref-main">
{articles}
    </main>
    </div>

    <footer class="dt-bar dt-bar-bottom dt-footer">
      <span class="barcode" aria-hidden="true"></span>
      <span class="dt-rec">{footer}</span>
    </footer>
  </div>
</body>
</html>
"""

MD = markdown.Markdown(extensions=["tables", "sane_lists", "nl2br"])

# Cyrillic -> Latin, so section ids/anchors stay ASCII.
TRANSLIT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "kh", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "shch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}

# A cell that looks numeric (DV13, 2d6, 25 HP, ranges, dashes) — used to decide
# whether a table should be centered like the DV/HP tables in the manual page.
NUMERIC_CELL = re.compile(r"^(?:[-–—]+|DV\d+|\d+d\d+|\d+\s*HP|\d+|\d+\s*[–-]\s*\d+)$", re.I)


def slugify(text: str) -> str:
    chars = []
    for ch in text.lower():
        if ch in TRANSLIT:
            chars.append(TRANSLIT[ch])
        elif ch.isascii() and ch.isalnum():
            chars.append(ch)
        elif ch in " -_/":
            chars.append("-")
        else:
            chars.append("-")
    slug = re.sub(r"-+", "-", "".join(chars)).strip("-")
    return slug or "section"


def unique_slug(base: str, used: set[str]) -> str:
    slug = base
    n = 2
    while slug in used:
        slug = f"{base}-{n}"
        n += 1
    used.add(slug)
    return slug


def normalize_markdown(lines: list[str]) -> list[str]:
    # Section separators are layout, not content: drop them instead of <hr>.
    lines = [line for line in lines if line.strip() != "---"]

    # The sheets indent nested list items by 1 space (2 for a third level), but
    # Python-Markdown expects 4 spaces per level. Detect the unit and scale it.
    indents = []
    for line in lines:
        match = re.match(r"^( +)(?:[-*+]|\d+\.) ", line)
        if match:
            indents.append(len(match.group(1)))
    scale = 4 if any(i % 4 for i in indents) else 1
    if scale == 1:
        return lines

    out = []
    for line in lines:
        match = re.match(r"^( +)((?:[-*+]|\d+\.) )", line)
        if match:
            line = " " * (len(match.group(1)) * scale) + line[len(match.group(1)):]
        out.append(line)
    return out


def split_sections(lines: list[str]) -> list[dict]:
    sections: list[dict] = []
    title: str | None = None
    body: list[str] = []

    def flush() -> None:
        if title is not None:
            sections.append({"title": title, "body": "\n".join(body)})

    for line in lines:
        match = re.match(r"^###\s+(.+?)\s*$", line)
        if match:
            flush()
            title = match.group(1).strip()
            body = [line]
        elif title is not None:
            body.append(line)
    flush()
    return sections


def strip_tags(value: str) -> str:
    return re.sub(r"<[^>]+>", "", value).strip()


def style_tables(html_text: str) -> str:
    def replace(match: re.Match) -> str:
        table = match.group(1)
        center = True
        seen = False
        for row in re.findall(r"<tr[^>]*>(.*?)</tr>", table, re.S):
            cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
            if not cells:
                continue
            for cell in cells[1:]:
                text = strip_tags(cell)
                if not text:
                    continue
                seen = True
                if not NUMERIC_CELL.match(text):
                    center = False
        classes = "ref-table" + (" ref-center" if center and seen else "")
        return (
            f'<div class="ref-table-wrap"><table class="{classes}">'
            f"{table}</table></div>"
        )

    return re.sub(r"<table>(.*?)</table>", replace, html_text, flags=re.S)


def render_markdown(text: str) -> str:
    MD.reset()
    return MD.convert(text)


def parse_sheet(path: Path) -> dict:
    lines = normalize_markdown(path.read_text(encoding="utf-8").splitlines())
    return {"title": path.stem, "sections": split_sections(lines)}


def build_page(sheets: list[dict], cfg: dict) -> str:
    used: set[str] = set()
    toc_groups = []
    articles = []

    for sheet in sheets:
        sheet_title = html.escape(sheet["title"])
        toc_items = []
        section_blocks = []

        for section in sheet["sections"]:
            slug = unique_slug(slugify(section["title"]), used)
            body = style_tables(render_markdown(section["body"]))
            section_blocks.append(
                f'        <section class="ref-section" id="{slug}">\n{body}\n        </section>'
            )
            toc_items.append(
                f'            <li><a href="#{slug}">{html.escape(section["title"])}</a></li>'
            )

        articles.append(
            '      <article class="ref-sheet">\n'
            f'        <h1 class="ref-sheet-title">{sheet_title}</h1>\n'
            + "\n".join(section_blocks)
            + "\n      </article>"
        )
        toc_groups.append(
            '        <div class="ref-toc-group">\n'
            f"          <h3>{sheet_title}</h3>\n"
            "          <ul>\n"
            + "\n".join(toc_items)
            + "\n          </ul>\n        </div>"
        )

    css_links = "\n  ".join(
        f'<link rel="stylesheet" href="{href}" />' for href in cfg["css"]
    )
    return PAGE_TEMPLATE.format(
        page_title=html.escape(cfg["page_title"]),
        css_links=css_links,
        body_class=cfg["body_class"],
        top_left=cfg["top_left"],
        top_title=cfg["top_title"],
        top_right=cfg["top_right"],
        back_url=cfg["back_url"],
        back_title=html.escape(cfg["back_title"]),
        topic=cfg["topic"],
        doc_title=cfg["doc_title"],
        system_label=cfg["system_label"],
        toc_title=cfg["toc_title"],
        toc="\n".join(toc_groups),
        articles="\n".join(articles),
        footer=cfg["footer"],
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Build reference HTML from Markdown.")
    parser.add_argument(
        "system",
        nargs="?",
        default="cyberpunk",
        choices=sorted(SYSTEMS),
        help="which reference set to build (default: cyberpunk)",
    )
    args = parser.parse_args()
    cfg = SYSTEMS[args.system]

    paths = sorted(cfg["src"].glob("*.md"))
    if not paths:
        print(f"No .md files found in {cfg['src']}", file=sys.stderr)
        return 1

    page = build_page([parse_sheet(p) for p in paths], cfg)
    cfg["out"].write_text(page, encoding="utf-8")
    print(f"Wrote {cfg['out']} from {len(paths)} sheet(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
