# Markdown Editor & Viewer

## 使い方

**ブラウザで開くだけで使えます（インストール不要）:**

👉 **https://kazuhiko-kobayashi-dnjp.github.io/md_editer_and_viewer/**

---

## 機能

- **左ペイン**: Markdownを編集（シンタックスハイライト付き）
- **右ペイン**: リアルタイムプレビュー
- **スクロール連動**: 左右が行単位で同期してスクロール
- **仕切りのドラッグ**: 左右の幅を自由に調整可能
- **ファイルを開く**: ローカルの `.md` ファイルを読み込める（Chrome / Edge のみ）
- **保存 / 名前を付けて保存**: ローカルファイルに直接書き出し（Chrome / Edge のみ）、`Ctrl+S` で上書き保存
- **Mermaid対応**: フローチャート・シーケンス図をコードブロックで描画

### Mermaid の書き方例

~~~markdown
```mermaid
flowchart TD
    A[開始] --> B{条件}
    B -->|Yes| C[処理A]
    B -->|No| D[処理B]
```
~~~

---

## ブラウザ対応

| 機能 | Chrome / Edge | Firefox / Safari |
|------|:---:|:---:|
| 編集・プレビュー | ✅ | ✅ |
| ファイルを開く / 保存 | ✅ | ❌ |

ファイルの開く・保存は [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API) を使用しているため Chrome / Edge 限定です。

---

## Word → Markdown 変換 CLI

`tools/word2md.py` を使うとローカルで高精度変換できます（pandocベース）。

```bash
# pandoc のインストール（初回のみ）
wget https://github.com/jgm/pandoc/releases/download/3.6.4/pandoc-3.6.4-linux-amd64.tar.gz -O /tmp/pandoc.tar.gz
tar -xzf /tmp/pandoc.tar.gz -C /tmp
mkdir -p ~/.local/bin && cp /tmp/pandoc-3.6.4/bin/pandoc ~/.local/bin/

# 変換
python3 tools/word2md.py 仕様書.docx
python3 tools/word2md.py 仕様書.docx -o output.md --image-dir images/
python3 tools/word2md.py 仕様書.docx --embed-images   # 画像をbase64で埋め込む
```

- 画像（PNG/JPEG/GIF）はファイルとして抽出
- EMF（Windowsベクター図）はLibreOffice があれば PNG に自動変換
- `--embed-images` で Markdown 単体ファイルとして完結

---

## 開発者向け

```bash
git clone https://github.com/kazuhiko-kobayashi-dnjp/md_editer_and_viewer.git
cd md_editer_and_viewer
npm install
npm run dev        # 開発サーバー起動 → http://localhost:5173/
npm run build      # 本番ビルド
npm run deploy     # GitHub Pages へデプロイ
```
