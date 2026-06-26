import { useState, useCallback, useRef, useEffect } from 'react'
import mammoth from 'mammoth'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import CodeMirror from '@uiw/react-codemirror'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { EditorView } from '@codemirror/view'
import MermaidBlock from './MermaidBlock'
import './WordToMd.css'

function makeTurndown() {
  const td = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    hr: '---',
  })
  td.use(gfm)
  // 画像: base64 data URL をそのまま維持
  td.addRule('images', {
    filter: 'img',
    replacement: (_content, node) => {
      const src = (node as HTMLImageElement).src || ''
      const alt = (node as HTMLImageElement).alt || ''
      return src ? `\n![${alt}](${src})\n` : ''
    },
  })
  // 変換不可の要素
  td.addRule('unsupported', {
    filter: ['canvas', 'object', 'embed'],
    replacement: () => '\n<!-- [変換不可: 図形/グラフ] -->\n',
  })
  return td
}

async function convertDocx(file: File): Promise<{ html: string; markdown: string; warnings: string[] }> {
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

  // 空 p を除去
  const div = document.createElement('div')
  div.innerHTML = result.value
  div.querySelectorAll('p').forEach((p) => {
    if (!p.textContent?.trim() && !p.querySelector('img')) p.remove()
  })
  const html = div.innerHTML

  const td = makeTurndown()
  const mdRaw = td.turndown(html)

  const warnings = result.messages
    .filter((m) => m.type === 'warning' || m.type === 'error')
    .map((m) => m.message)

  return { html, markdown: mdRaw, warnings }
}

export default function WordToMd() {
  const [wordHtml, setWordHtml]     = useState<string | null>(null)
  const [mdContent, setMdContent]   = useState('')
  const [fileName, setFileName]     = useState<string | null>(null)
  const [warnings, setWarnings]     = useState<string[]>([])
  const [loading, setLoading]       = useState(false)
  const [wordWidth, setWordWidth]   = useState(33)
  const [editorWidth, setEditorWidth] = useState(34)
  // preview は 100 - wordWidth - editorWidth
  const draggingDivider = useRef<'left' | 'right' | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragStartX = useRef(0)
  const dragStartWidths = useRef({ w: 33, e: 34 })
  const fileHandleRef = useRef<FileSystemFileHandle | null>(null)

  const previewWidth = 100 - wordWidth - editorWidth

  // ── ファイル読み込み（input fallback） ──
  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setLoading(true)
    try {
      const res = await convertDocx(f)
      setWordHtml(res.html)
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

  // ── 保存 ──
  const save = useCallback(async () => {
    if (fileHandleRef.current) {
      const w = await fileHandleRef.current.createWritable()
      await w.write(mdContent); await w.close()
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
      await w.write(mdContent); await w.close()
    } catch { /* cancel */ }
  }, [mdContent, fileName])

  const downloadFallback = useCallback(() => {
    const blob = new Blob([mdContent], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = fileName ?? 'document.md'; a.click()
    URL.revokeObjectURL(url)
  }, [mdContent, fileName])

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
      const nw = Math.max(15, Math.min(60, w + dx))
      setWordWidth(nw)
    } else {
      const ne = Math.max(15, Math.min(60, ed + dx))
      setEditorWidth(ne)
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
      {/* ── ツールバー ── */}
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

      {/* ── 3列ペイン ── */}
      {!wordHtml ? (
        <div className="wtm-empty">
          <div className="wtm-empty-icon">📄</div>
          <p>.docx ファイルを「Wordを開く」で選択してください</p>
        </div>
      ) : (
        <div className="wtm-panes">
          {/* 左: Word表示 */}
          <div className="wtm-pane" style={{ width: `${wordWidth}%` }}>
            <div className="wtm-pane-header word-header">Word 表示</div>
            <div
              className="wtm-word-body"
              dangerouslySetInnerHTML={{ __html: wordHtml }}
            />
          </div>

          <div className="wtm-divider" onMouseDown={onDividerMouseDown('left')} />

          {/* 中: Markdownエディタ */}
          <div className="wtm-pane wtm-editor-pane" style={{ width: `${editorWidth}%` }}>
            <div className="wtm-pane-header editor-header">Markdown エディタ</div>
            <CodeMirror
              value={mdContent}
              height="100%"
              extensions={extensions}
              onChange={setMdContent}
              className="wtm-codemirror"
            />
          </div>

          <div className="wtm-divider" onMouseDown={onDividerMouseDown('right')} />

          {/* 右: プレビュー */}
          <div className="wtm-pane" style={{ width: `${previewWidth}%` }}>
            <div className="wtm-pane-header preview-header">プレビュー</div>
            <div className="wtm-preview markdown-body">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ className, children }) {
                    const lang = /language-(\w+)/.exec(className ?? '')?.[1]
                    const code = String(children).replace(/\n$/, '')
                    if (lang === 'mermaid') return <MermaidBlock code={code} />
                    return <code className={className}>{children}</code>
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
