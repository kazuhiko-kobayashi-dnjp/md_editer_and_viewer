#!/usr/bin/env python3
"""
word2md.py - Word(.docx) → Markdown 高精度変換ツール
依存: pandoc (~/.local/bin/pandoc または PATH上)
推奨: LibreOffice (EMF→PNG変換に使用)

使い方:
    python word2md.py input.docx
    python word2md.py input.docx -o output.md
    python word2md.py input.docx -o output.md --image-dir ./images
    python word2md.py input.docx --embed-images   # 画像をbase64で埋め込み
"""
import argparse
import base64
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# ── pandoc の場所を特定 ────────────────────────────────────
def find_pandoc() -> Path:
    for candidate in [
        Path.home() / ".local" / "bin" / "pandoc",
        Path("/usr/local/bin/pandoc"),
        Path("/usr/bin/pandoc"),
    ]:
        if candidate.exists():
            return candidate
    if shutil.which("pandoc"):
        return Path(shutil.which("pandoc"))
    raise SystemExit(
        "pandoc が見つかりません。\n"
        "インストール: wget https://github.com/jgm/pandoc/releases/latest で取得してください。"
    )

# ── EMF → PNG 変換（LibreOffice使用） ────────────────────
def convert_emf(emf_path: Path) -> Path | None:
    for cmd in ("libreoffice", "soffice"):
        if shutil.which(cmd):
            try:
                subprocess.run(
                    [cmd, "--headless", "--convert-to", "png",
                     "--outdir", str(emf_path.parent), str(emf_path)],
                    capture_output=True, timeout=60
                )
                png = emf_path.with_suffix(".png")
                return png if png.exists() else None
            except Exception as e:
                print(f"  [warn] EMF変換失敗: {e}", file=sys.stderr)
    return None

# ── Markdown後処理 ────────────────────────────────────────
def postprocess(md: str, media_dir: Path, output_md: Path, embed: bool) -> str:
    lines = md.splitlines()
    result = []
    img_re = re.compile(r'(<img\s[^>]*src="([^"]+)"[^>]*>|!\[[^\]]*\]\(([^)]+)\))')

    for line in lines:
        m = img_re.search(line)
        if m:
            # src または Markdown画像パスを取得
            raw_path = m.group(2) or m.group(3)
            if raw_path:
                img_path = Path(raw_path) if Path(raw_path).is_absolute() else media_dir / Path(raw_path).name

                # EMF → PNG 変換
                if img_path.suffix.lower() == ".emf":
                    png_path = convert_emf(img_path)
                    if png_path:
                        line = line.replace(raw_path, str(png_path) if embed else
                                            str(png_path.relative_to(output_md.parent)))
                        img_path = png_path
                    else:
                        result.append(f"<!-- [変換不可: {img_path.name} - LibreOffice未インストール] -->")
                        continue

                if embed and img_path.exists():
                    # base64埋め込み
                    ext = img_path.suffix.lower().lstrip(".")
                    mime = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
                            "gif": "image/gif", "bmp": "image/bmp", "svg": "image/svg+xml"}.get(ext, "image/png")
                    b64 = base64.b64encode(img_path.read_bytes()).decode()
                    data_url = f"data:{mime};base64,{b64}"
                    # <img> タグか Markdown記法かで置換
                    if m.group(2):
                        line = line.replace(f'src="{raw_path}"', f'src="{data_url}"')
                    else:
                        line = line.replace(f"({raw_path})", f"({data_url})")
                elif img_path.exists():
                    # 相対パスに変換
                    try:
                        rel = img_path.relative_to(output_md.parent)
                        if m.group(2):
                            line = line.replace(f'src="{raw_path}"', f'src="{rel}"')
                        else:
                            line = line.replace(f"({raw_path})", f"({rel})")
                    except ValueError:
                        pass  # 同じドライブでない場合はそのまま

        result.append(line)

    # 連続空行を2行以内に圧縮
    text = "\n".join(result)
    text = re.sub(r'\n{4,}', '\n\n\n', text)
    return text.strip() + "\n"

# ── メイン変換 ────────────────────────────────────────────
def convert(docx_path: Path, output_md: Path, image_dir: Path, embed: bool) -> list[str]:
    pandoc = find_pandoc()
    image_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        tmp_md = tmp_path / "output.md"
        tmp_media = tmp_path / "media"

        cmd = [
            str(pandoc), str(docx_path),
            "-f", "docx",
            "-t", "gfm",
            "--extract-media", str(tmp_media),
            "--wrap=none",
            "-o", str(tmp_md),
        ]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        warnings = [l for l in r.stderr.splitlines() if l.strip()]
        if r.returncode != 0:
            raise RuntimeError(f"pandoc失敗:\n{r.stderr}")

        md_text = tmp_md.read_text(encoding="utf-8")

        # メディアファイルを image_dir にコピー
        media_src = tmp_media / "media"
        copied_media = image_dir
        if media_src.exists():
            for f in media_src.iterdir():
                dst = copied_media / f.name
                shutil.copy2(f, dst)

    md_text = postprocess(md_text, image_dir, output_md, embed)
    output_md.write_text(md_text, encoding="utf-8")
    return warnings

# ── エントリポイント ──────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description="Word(.docx) → Markdown 変換 (pandocベース)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
例:
  python word2md.py 仕様書.docx
  python word2md.py 仕様書.docx -o output/仕様書.md --image-dir output/images
  python word2md.py 仕様書.docx --embed-images        # 画像をbase64埋め込み
        """,
    )
    parser.add_argument("docx", help="入力 .docx ファイルパス")
    parser.add_argument("-o", "--output", help="出力 .md ファイルパス（省略時: 入力と同名.md）")
    parser.add_argument("-I", "--image-dir", help="画像出力ディレクトリ（省略時: <mdファイル名>_images）")
    parser.add_argument("--embed-images", action="store_true", help="画像をbase64でMDに埋め込む（ファイル単体で完結）")
    args = parser.parse_args()

    docx_path = Path(args.docx).resolve()
    if not docx_path.exists():
        sys.exit(f"ファイルが見つかりません: {docx_path}")
    if docx_path.suffix.lower() != ".docx":
        sys.exit("入力は .docx ファイルを指定してください")

    output_md = Path(args.output).resolve() if args.output else docx_path.with_suffix(".md")
    output_md.parent.mkdir(parents=True, exist_ok=True)

    image_dir = Path(args.image_dir).resolve() if args.image_dir else \
        output_md.parent / (output_md.stem + "_images")

    print(f"変換中: {docx_path.name} → {output_md.name}")
    try:
        warnings = convert(docx_path, output_md, image_dir, embed=args.embed_images)
    except Exception as e:
        sys.exit(f"エラー: {e}")

    if warnings:
        print(f"  警告 {len(warnings)} 件:")
        for w in warnings:
            print(f"    {w}")

    img_count = len(list(image_dir.glob("*"))) if image_dir.exists() else 0
    print(f"完了: {output_md}  (画像: {img_count} 件{'、埋め込み' if args.embed_images else f' → {image_dir.name}/'})")

if __name__ == "__main__":
    main()
