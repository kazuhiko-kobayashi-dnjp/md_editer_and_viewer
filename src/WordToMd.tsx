import { useState, useCallback, useRef, useEffect } from 'react'
import mammoth from 'mammoth'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import CodeMirror from '@uiw/react-codemirror'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { EditorView } from '@codemirror/view'
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror'
import MermaidBlock from './MermaidBlock'
import './WordToMd.css'

// ── Turndown ──────────────────────────────────────────────
function makeTurndown() {
  const td = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    hr: '---',
  })
  td.use(gfm)
  td.addRule('images', {
    filter: 'img',
    replacement: (_content, node) => {
      const src = (node as HTMLImageElement).getAttribute('src') ?? ''
      const alt = (node as HTMLImageElement).alt || ''
      return src ? `\n![${alt}](${src})\n` : ''
    },
  })
  td.addRule('unsupported', {
    filter: ['canvas', 'object', 'embed'],
    replacement: () => '\n<!-- [変換不可: 図形/グラフ] -->\n',
  })
  return td
}

// ── HTMLブロックに改行を挿入してエディタ表示を改善 ────────
function formatHtmlBlocks(md: string): string {
  return md
    .replace(/(<(table|thead|tbody|tfoot)[^>]*>)/gi, '\n$1\n')
    .replace(/(<\/(table|thead|tbody|tfoot)>)/gi, '\n$1\n')
    .replace(/(<tr[^>]*>)/gi, '\n  $1\n')
    .replace(/(<\/tr>)/gi, '  </tr>\n')
    .replace(/(<(th|td)[^>]*>)/gi, '    $1')
    .replace(/(<\/(th|td)>)/gi, '$1\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── base64をHTMLの段階でプレースホルダーに差し替え ────────
function extractImagesFromHtml(div: HTMLElement): Map<string, string> {
  const map = new Map<string, string>()
  let idx = 0
  div.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') ?? ''
    if (src.startsWith('data:')) {
      const key = `img::${idx++}`
      map.set(key, src)
      img.setAttribute('src', key)
    }
  })
  return map
}

function restoreImages(md: string, map: Map<string, string>): string {
  return md.replace(/!\[([^\]]*)\]\((img::\d+)\)/g, (_, alt, key) => {
    const dataUrl = map.get(key)
    return dataUrl ? `![${alt}](${dataUrl})` : `![${alt}](${key})`
  })
}

// ── docx 変換 ─────────────────────────────────────────────
async function convertDocx(file: File): Promise<{
  wordHtml: string
  markdown: string
  imageMap: Map<string, string>
  warnings: string[]
}> {
  const buf = await file.arrayBuffer()
  const result = await mammoth.convertToHtml({ arrayBuffer: buf }, {
    styleMap: [
      "p[style-name='Heading 1'] => h1:fresh",
      "p[style-name='Heading 2'] => h2:fresh",
      "p[style-name='Heading 3'] => h3:fresh",
      "p[style-name='Heading 4'] => h4:fresh",
      "p[style-name='見出し 1']  => h1:fresh",
      "p[style-name='見出し 2']  => h2:fresh",
      "p[style-name='見出し 3']  => h3:fresh",
      "p[style-name='見出し 4']  => h4:fresh",
      "p[style-name='List Paragraph'] => ul > li:fresh",
    ],
    convertImage: mammoth.images.imgElement((img) =>
      img.read('base64').then((data: string) => ({
        src: `data:${img.contentType};base64,${data}`,
      }))
    ),
  })

  // Word表示用（base64そのまま）
  const wordDiv = document.createElement('div')
  wordDiv.innerHTML = result.value
  wordDiv.querySelectorAll('p').forEach((p) => {
    if (!p.textContent?.trim() && !p.querySelector('img')) p.remove()
  })
  const wordHtml = wordDiv.innerHTML

  // MD変換用（base64をプレースホルダー化）
  const mdDiv = document.createElement('div')
  mdDiv.innerHTML = result.value
  mdDiv.querySelectorAll('p').forEach((p) => {
    if (!p.textContent?.trim() && !p.querySelector('img')) p.remove()
  })
  const map = extractImagesFromHtml(mdDiv)
  const td = makeTurndown()
  const md = formatHtmlBlocks(td.turndown(mdDiv.innerHTML))

  const warnings = result.messages
    .filter((m) => m.type === 'warning' || m.type === 'error')
    .map((m) => m.message)

  return { wordHtml, markdown: md, imageMap: map, warnings }
}

// ── コンテンツリンク スクロール同期 ─────────────────────
// 見出し要素の scrollTop 上のアンカー位置を収集
function collectHtmlAnchors(container: HTMLElement): number[] {
  const tops: number[] = [0]
  container.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((el) => {
    tops.push((el as HTMLElement).offsetTop)
  })
  tops.push(Math.max(0, container.scrollHeight - container.clientHeight))
  // 単調増加に整理
  return tops.filter((v, i, a) => i === 0 || v > a[i - 1])
}

function collectEditorAnchors(view: EditorView): number[] {
  const tops: number[] = [0]
  const doc = view.state.doc
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i)
    if (/^#{1,6} /.test(line.text)) {
      tops.push(view.lineBlockAt(line.from).top)
    }
  }
  tops.push(Math.max(0, view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight))
  return tops.filter((v, i, a) => i === 0 || v > a[i - 1])
}

// srcの位置をdstのアンカー空間に写像（セクション間補間）
function mapPosition(srcPos: number, srcA: number[], dstA: number[]): number {
  const n = Math.min(srcA.length, dstA.length)
  if (n < 2) return 0
  let idx = 0
  for (let i = 0; i < n - 1; i++) {
    if (srcPos >= srcA[i]) idx = i
  }
  const s0 = srcA[idx], s1 = srcA[Math.min(idx + 1, n - 1)]
  const d0 = dstA[idx], d1 = dstA[Math.min(idx + 1, n - 1)]
  if (s1 <= s0) return d0
  const t = Math.min(1, Math.max(0, (srcPos - s0) / (s1 - s0)))
  return d0 + t * (d1 - d0)
}

// ── コンポーネント ────────────────────────────────────────
export default function WordToMd() {
  const [wordHtml, setWordHtml]       = useState<string | null>(null)
  const [mdContent, setMdContent]     = useState('')
  const [fileName, setFileName]       = useState<string | null>(null)
  const [warnings, setWarnings]       = useState<string[]>([])
  const [loading, setLoading]         = useState(false)
  const [wordWidth, setWordWidth]     = useState(33)
  const [editorWidth, setEditorWidth] = useState(34)

  const imageMapRef     = useRef<Map<string, string>>(new Map())
  const draggingDivider = useRef<'left' | 'right' | null>(null)
  const containerRef    = useRef<HTMLDivElement>(null)
  const dragStartX      = useRef(0)
  const dragStartWidths = useRef({ w: 33, e: 34 })
  const fileHandleRef   = useRef<FileSystemFileHandle | null>(null)

  const wordPaneRef  = useRef<HTMLDivElement>(null)
  const editorRef    = useRef<ReactCodeMirrorRef>(null)
  const previewRef   = useRef<HTMLDivElement>(null)
  const syncing      = useRef(false)

  const previewWidth = 100 - wordWidth - editorWidth

  // ── コンテンツリンク スクロール同期 ──
  useEffect(() => {
    if (!wordHtml) return
    const timer = setTimeout(() => {
      const word     = wordPaneRef.current
      const view     = editorRef.current?.view ?? null
      const scroller = view?.scrollDOM ?? null
      const preview  = previewRef.current
      if (!word || !scroller || !preview || !view) return

      const onWord = () => {
        if (syncing.current) return
        syncing.current = true
        const wA = collectHtmlAnchors(word)
        const eA = collectEditorAnchors(view)
        const pA = collectHtmlAnchors(preview)
        scroller.scrollTop = mapPosition(word.scrollTop, wA, eA)
        preview.scrollTop  = mapPosition(word.scrollTop, wA, pA)
        requestAnimationFrame(() => { syncing.current = false })
      }

      const onEditor = () => {
        if (syncing.current) return
        syncing.current = true
        const wA = collectHtmlAnchors(word)
        const eA = collectEditorAnchors(view)
        const pA = collectHtmlAnchors(preview)
        word.scrollTop    = mapPosition(scroller.scrollTop, eA, wA)
        preview.scrollTop = mapPosition(scroller.scrollTop, eA, pA)
        requestAnimationFrame(() => { syncing.current = false })
      }

      const onPreview = () => {
        if (syncing.current) return
        syncing.current = true
        const wA = collectHtmlAnchors(word)
        const eA = collectEditorAnchors(view)
        const pA = collectHtmlAnchors(preview)
        word.scrollTop     = mapPosition(preview.scrollTop, pA, wA)
        scroller.scrollTop = mapPosition(preview.scrollTop, pA, eA)
        requestAnimationFrame(() => { syncing.current = false })
      }

      word.addEventListener('scroll', onWord)
      scroller.addEventListener('scroll', onEditor)
      preview.addEventListener('scroll', onPreview)

      return () => {
        word.removeEventListener('scroll', onWord)
        scroller.removeEventListener('scroll', onEditor)
        preview.removeEventListener('scroll', onPreview)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [wordHtml])

  // ── ファイル読み込み ──
  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setLoading(true)
    try {
      const res = await convertDocx(f)
      imageMapRef.current = res.imageMap
      setWordHtml(res.wordHtml)
      setMdContent(res.markdown)
      setFileName(f.name.replace(/\.docx$/i, '.md'))
      setWarnings(res.warnings)
      fileHandleRef.current = null
    } catch (err) {
      alert('変換エラー: ' + (err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  const getExportMd = useCallback(() =>
    restoreImages(mdContent, imageMapRef.current)
  , [mdContent])

  const save = useCallback(async () => {
    const exportMd = getExportMd()
    if (fileHandleRef.current) {
      const w = await fileHandleRef.current.createWritable()
      await w.write(exportMd); await w.close()
      return
    }
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName ?? 'document.md',
        types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }],
      })
      fileHandleRef.current = handle
      setFileName(handle.name)
      const w = await handle.createWritable()
      await w.write(exportMd); await w.close()
    } catch { /* cancel */ }
  }, [getExportMd, fileName])

  const downloadFallback = useCallback(() => {
    const blob = new Blob([getExportMd()], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = fileName ?? 'document.md'; a.click()
    URL.revokeObjectURL(url)
  }, [getExportMd, fileName])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.ctrlKey && e.key === 's') { e.preventDefault(); save() } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [save])

  // ── ドラッグリサイズ ──
  const onDividerMouseDown = useCallback((which: 'left' | 'right') => (e: React.MouseEvent) => {
    draggingDivider.current = which
    dragStartX.current = e.clientX
    dragStartWidths.current = { w: wordWidth, e: editorWidth }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [wordWidth, editorWidth])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingDivider.current || !containerRef.current) return
    const totalW = containerRef.current.getBoundingClientRect().width
    const dx = ((e.clientX - dragStartX.current) / totalW) * 100
    const { w, e: ed } = dragStartWidths.current
    if (draggingDivider.current === 'left') {
      setWordWidth(Math.max(15, Math.min(60, w + dx)))
    } else {
      setEditorWidth(Math.max(15, Math.min(60, ed + dx)))
    }
  }, [])

  const onMouseUp = useCallback(() => {
    draggingDivider.current = null
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [])

  const extensions = [
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    EditorView.lineWrapping,
  ]

  return (
    <div
      className="wtm-container"
      ref={containerRef}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <div className="wtm-toolbar">
        <label className={`toolbar-btn ${loading ? 'disabled' : ''}`}>
          {loading ? '変換中…' : '📂 Wordを開く'}
          <input type="file" accept=".docx" onChange={handleFileInput} disabled={loading} style={{ display: 'none' }} />
        </label>
        {wordHtml && (
          <>
            <button className="toolbar-btn" onClick={save}>保存</button>
            <button className="toolbar-btn" onClick={downloadFallback}>ダウンロード</button>
          </>
        )}
        {fileName && <span className="wtm-filename">{fileName}</span>}
        {warnings.length > 0 && (
          <span className="wtm-warn-badge" title={warnings.join('\n')}>
            ⚠ {warnings.length} 件の変換警告
          </span>
        )}
        <span className="wtm-hint">テキストボックス・SmartArt・図形内文字は変換対象外</span>
      </div>

      {!wordHtml ? (
        <div className="wtm-empty">
          <div className="wtm-empty-icon">📄</div>
          <p>.docx ファイルを「Wordを開く」で選択してください</p>
        </div>
      ) : (
        <div className="wtm-panes">
          <div className="wtm-pane" style={{ width: `${wordWidth}%` }}>
            <div className="wtm-pane-header word-header">Word 表示</div>
            <div
              ref={wordPaneRef}
              className="wtm-word-body"
              dangerouslySetInnerHTML={{ __html: wordHtml }}
            />
          </div>

          <div className="wtm-divider" onMouseDown={onDividerMouseDown('left')} />

          <div className="wtm-pane wtm-editor-pane" style={{ width: `${editorWidth}%` }}>
            <div className="wtm-pane-header editor-header">Markdown エディタ</div>
            <CodeMirror
              ref={editorRef}
              value={mdContent}
              height="100%"
              extensions={extensions}
              onChange={setMdContent}
              className="wtm-codemirror"
            />
          </div>

          <div className="wtm-divider" onMouseDown={onDividerMouseDown('right')} />

          <div className="wtm-pane" style={{ width: `${previewWidth}%` }}>
            <div className="wtm-pane-header preview-header">プレビュー</div>
            <div className="wtm-preview markdown-body" ref={previewRef}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                components={{
                  code({ className, children }) {
                    const lang = /language-(\w+)/.exec(className ?? '')?.[1]
                    const code = String(children).replace(/\n$/, '')
                    if (lang === 'mermaid') return <MermaidBlock code={code} />
                    return <code className={className}>{children}</code>
                  },
                  img({ src, alt }) {
                    const resolved = src?.startsWith('img::')
                      ? imageMapRef.current.get(src) ?? src
                      : src
                    return <img src={resolved} alt={alt ?? ''} style={{ maxWidth: '100%' }} />
                  },
                }}
              >
                {mdContent}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
