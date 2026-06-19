import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'

mermaid.initialize({ startOnLoad: false, theme: 'default' })

let idCounter = 0

export default function MermaidBlock({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!ref.current) return
    const id = `mermaid-${++idCounter}`
    setError(null)

    mermaid.render(id, code)
      .then(({ svg }) => {
        if (ref.current) ref.current.innerHTML = svg
      })
      .catch((e) => {
        setError(e.message ?? 'Mermaid parse error')
        if (ref.current) ref.current.innerHTML = ''
      })
  }, [code])

  if (error) {
    return <pre className="mermaid-error">{error}</pre>
  }
  return <div ref={ref} className="mermaid-block" />
}
