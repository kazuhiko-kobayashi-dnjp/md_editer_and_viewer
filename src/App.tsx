import { useState, useCallback, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import CodeMirror from '@uiw/react-codemirror'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { EditorView } from '@codemirror/view'
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror'
import MermaidBlock from './MermaidBlock'
import 'highlight.js/styles/github.css'
import './App.css'

const INITIAL_CONTENT = `# Markdown Editor

## 見出し

**太字**、*斜体*、~~取り消し線~~

## コードブロック

\`\`\`typescript
const greet = (name: string) => \`Hello, \${name}!\`
console.log(greet('World'))
\`\`\`

## リスト

- アイテム1
- アイテム2
  - ネスト

1. 番号付き1
2. 番号付き2

## テーブル

| 名前 | 値 |
|------|-----|
| foo  | 123 |
| bar  | 456 |

## リンクと画像

[GitHub](https://github.com)

> 引用テキストはこのように表示されます。

## フローチャート

\`\`\`mermaid
flowchart TD
    A[開始] --> B{条件分岐}
    B -->|Yes| C[処理A]
    B -->|No| D[処理B]
    C --> E[終了]
    D --> E
\`\`\`

## シーケンス図

\`\`\`mermaid
sequenceDiagram
    participant ユーザー
    participant サーバー
    participant DB

    ユーザー->>サーバー: ログインリクエスト
    サーバー->>DB: ユーザー検索
    DB-->>サーバー: ユーザー情報
    サーバー-->>ユーザー: 認証トークン
\`\`\`
`

// ブロック要素に data-line を付与する remark プラグイン
const BLOCK_TYPES = new Set([
  'heading', 'paragraph', 'code', 'list', 'blockquote',
  'table', 'thematicBreak', 'html',
])
function remarkAddLineNumbers() {
  return (tree: any) => {
    function walk(node: any) {
      if (node.position && BLOCK_TYPES.has(node.type)) {
        node.data = node.data ?? {}
        node.data.hProperties = node.data.hProperties ?? {}
        node.data.hProperties['data-line'] = node.position.start.line
      }
      if (node.children) node.children.forEach(walk)
    }
    walk(tree)
  }
}

type LineElement = { line: number; top: number }

function getLineElements(container: HTMLElement): LineElement[] {
  const containerRect = container.getBoundingClientRect()
  return Array.from(container.querySelectorAll('[data-line]'))
    .map(el => ({
      line: parseInt(el.getAttribute('data-line')!, 10),
      top: (el as HTMLElement).getBoundingClientRect().top - containerRect.top + container.scrollTop,
    }))
    .sort((a, b) => a.line - b.line)
}

function lineToScrollTop(line: number, elements: LineElement[]): number {
  const above = elements.filter(e => e.line <= line)
  const below = elements.filter(e => e.line > line)
  if (above.length === 0) return 0
  if (below.length === 0) return above[above.length - 1].top
  const before = above[above.length - 1]
  const after = below[0]
  const ratio = (line - before.line) / (after.line - before.line)
  return before.top + ratio * (after.top - before.top)
}

function scrollTopToLine(scrollTop: number, elements: LineElement[]): number {
  const above = elements.filter(e => e.top <= scrollTop)
  const below = elements.filter(e => e.top > scrollTop)
  if (above.length === 0) return 1
  if (below.length === 0) return above[above.length - 1].line
  const before = above[above.length - 1]
  const after = below[0]
  const ratio = (scrollTop - before.top) / (after.top - before.top || 1)
  return Math.round(before.line + ratio * (after.line - before.line))
}

export default function App() {
  const [content, setContent] = useState(INITIAL_CONTENT)
  const [dividerPos, setDividerPos] = useState(50)
  const [fileName, setFileName] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const dragging = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<ReactCodeMirrorRef>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const syncingFrom = useRef<'editor' | 'preview' | null>(null)
  const fileHandleRef = useRef<FileSystemFileHandle | null>(null)

  const handleChange = useCallback((val: string) => {
    setContent(val)
    setDirty(true)
  }, [])

  const onEditorScroll = useCallback(() => {
    if (syncingFrom.current === 'preview') return
    const view = editorRef.current?.view
    const preview = previewRef.current
    if (!view || !preview) return
    const scrollTop = view.scrollDOM.scrollTop
    const lineBlock = view.lineBlockAtHeight(scrollTop)
    const currentLine = view.state.doc.lineAt(lineBlock.from).number
    const elements = getLineElements(preview)
    if (elements.length === 0) return
    syncingFrom.current = 'editor'
    preview.scrollTop = lineToScrollTop(currentLine, elements)
    requestAnimationFrame(() => { syncingFrom.current = null })
  }, [])

  const onPreviewScroll = useCallback(() => {
    if (syncingFrom.current === 'editor') return
    const view = editorRef.current?.view
    const preview = previewRef.current
    if (!view || !preview) return
    const elements = getLineElements(preview)
    if (elements.length === 0) return
    const targetLine = scrollTopToLine(preview.scrollTop, elements)
    const safeLineNum = Math.min(Math.max(targetLine, 1), view.state.doc.lines)
    const lineObj = view.state.doc.line(safeLineNum)
    const lineBlock = view.lineBlockAt(lineObj.from)
    syncingFrom.current = 'preview'
    view.scrollDOM.scrollTop = lineBlock.top
    requestAnimationFrame(() => { syncingFrom.current = null })
  }, [])

  const openFile = useCallback(async () => {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown'] } }],
      })
      const file = await handle.getFile()
      const text = await file.text()
      fileHandleRef.current = handle
      setContent(text)
      setFileName(file.name)
      setDirty(false)
    } catch { /* キャンセル */ }
  }, [])

  const save = useCallback(async () => {
    if (!fileHandleRef.current) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: fileName ?? 'untitled.md',
          types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown'] } }],
        })
        fileHandleRef.current = handle
        setFileName(handle.name)
      } catch { return }
    }
    const writable = await fileHandleRef.current.createWritable()
    await writable.write(content)
    await writable.close()
    setDirty(false)
  }, [content, fileName])

  const saveAs = useCallback(async () => {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName ?? 'untitled.md',
        types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown'] } }],
      })
      fileHandleRef.current = handle
      setFileName(handle.name)
      const writable = await handle.createWritable()
      await writable.write(content)
      await writable.close()
      setDirty(false)
    } catch { /* キャンセル */ }
  }, [content, fileName])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault()
        save()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [save])

  const onMouseDown = useCallback(() => {
    dragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const pos = ((e.clientX - rect.left) / rect.width) * 100
    setDividerPos(Math.max(20, Math.min(80, pos)))
  }, [])

  const onMouseUp = useCallback(() => {
    dragging.current = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [])

  const extensions = [
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    EditorView.lineWrapping,
  ]

  const titleLabel = fileName
    ? `${dirty ? '● ' : ''}${fileName}`
    : `${dirty ? '● ' : ''}untitled.md`

  return (
    <div
      className="app"
      ref={containerRef}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <header className="toolbar">
        <div className="toolbar-left">
          <button className="toolbar-btn" onClick={openFile}>開く</button>
          <button className="toolbar-btn" onClick={save}>保存</button>
          <button className="toolbar-btn" onClick={saveAs}>名前を付けて保存</button>
        </div>
        <span className="title">{titleLabel}</span>
        <span className="char-count">{content.length} 文字</span>
      </header>
      <div className="editor-area">
        <div className="pane editor-pane" style={{ width: `${dividerPos}%` }}>
          <div className="pane-header">編集</div>
          <CodeMirror
            ref={editorRef}
            value={content}
            height="100%"
            extensions={extensions}
            onChange={handleChange}
            onScrollCapture={onEditorScroll}
            className="codemirror-wrapper"
          />
        </div>
        <div className="divider" onMouseDown={onMouseDown} />
        <div className="pane preview-pane" style={{ width: `${100 - dividerPos}%` }}>
          <div className="pane-header">プレビュー</div>
          <div className="markdown-body" ref={previewRef} onScroll={onPreviewScroll}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkAddLineNumbers]}
              components={{
                code({ className, children }) {
                  const lang = /language-(\w+)/.exec(className ?? '')?.[1]
                  const code = String(children).replace(/\n$/, '')
                  if (lang === 'mermaid') return <MermaidBlock code={code} />
                  return <code className={className}>{children}</code>
                },
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  )
}
