import { useMemo, useState } from 'react'
import { ToolLayout } from '@/components/ToolLayout'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;',
  )
}

function highlight(text: string, re: RegExp): string {
  if (!text) return ''
  if (re.global) {
    let out = ''
    let last = 0
    let m: RegExpExecArray | null
    re.lastIndex = 0
    while ((m = re.exec(text)) !== null) {
      out += escapeHtml(text.slice(last, m.index))
      out += '<mark>' + escapeHtml(m[0]) + '</mark>'
      last = m.index + m[0].length
      if (m.index === re.lastIndex) re.lastIndex++
    }
    out += escapeHtml(text.slice(last))
    return out
  }
  const m = re.exec(text)
  if (!m || m.index === undefined) return escapeHtml(text)
  return (
    escapeHtml(text.slice(0, m.index)) +
    '<mark>' +
    escapeHtml(m[0]) +
    '</mark>' +
    escapeHtml(text.slice(m.index + m[0].length))
  )
}

export default function RegexTester() {
  const [pattern, setPattern] = useState('\\b\\w+\\b')
  const [flags, setFlags] = useState('g')
  const [text, setText] = useState(
    'Hello ToolKit, welcome to 2026! 正则表达式很好用。',
  )

  const { rendered, count, error } = useMemo(() => {
    if (!pattern) return { rendered: escapeHtml(text), count: 0, error: '' }
    try {
      const re = new RegExp(pattern, flags)
      const matches = text.match(re) || []
      return {
        rendered: highlight(text, re),
        count: matches.length,
        error: '',
      }
    } catch (e) {
      return { rendered: escapeHtml(text), count: 0, error: (e as Error).message }
    }
  }, [pattern, flags, text])

  return (
    <ToolLayout
      title="正则测试"
      description="测试正则表达式并高亮所有匹配结果，支持常用标志位。"
    >
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-60 flex-1">
              <Label>正则表达式</Label>
              <div className="mt-2 flex items-center rounded-md border border-input focus-within:ring-1 focus-within:ring-ring">
                <span className="px-2 text-muted-foreground">/</span>
                <input
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value)}
                  className="w-full bg-transparent py-2 font-mono text-sm outline-none"
                  placeholder="pattern"
                />
                <span className="px-2 text-muted-foreground">/</span>
                <input
                  value={flags}
                  onChange={(e) => setFlags(e.target.value)}
                  className="w-16 bg-transparent py-2 font-mono text-sm outline-none"
                  placeholder="g"
                />
              </div>
            </div>
            <Badge variant={error ? 'destructive' : 'secondary'}>
              {error ? '无效' : `匹配 ${count} 处`}
            </Badge>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div>
            <Label>测试文本</Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="mt-2 min-h-32 font-mono text-sm"
            />
          </div>
          <div>
            <Label>匹配高亮</Label>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 font-mono text-sm">
              <span dangerouslySetInnerHTML={{ __html: rendered }} />
            </pre>
          </div>
        </CardContent>
      </Card>
    </ToolLayout>
  )
}
