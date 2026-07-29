import { useState } from 'react'
import { ToolLayout } from '@/components/ToolLayout'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'

export default function WordCounter() {
  const [text, setText] = useState('')

  const chars = text.length
  const charsNoSpace = text.replace(/\s/g, '').length
  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  const lines = text ? text.split(/\n/).length : 0
  const paragraphs = text.trim()
    ? text.trim().split(/\n\s*\n/).filter(Boolean).length
    : 0
  const readMin = chars ? Math.max(1, Math.round(chars / 400)) : 0

  const stats = [
    { label: '字符数（含空格）', value: chars },
    { label: '字符数（不含空格）', value: charsNoSpace },
    { label: '单词数', value: words },
    { label: '行数', value: lines },
    { label: '段落数', value: paragraphs },
    { label: '预计阅读', value: `${readMin} 分钟` },
  ]

  return (
    <ToolLayout
      title="字数统计"
      description="实时统计字符、单词、行数与段落，并估算阅读时间。"
    >
      <Card>
        <CardContent className="space-y-4 p-5">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="在此输入或粘贴文本…"
            className="min-h-48 text-sm"
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-lg border border-border bg-muted/30 p-3"
              >
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </ToolLayout>
  )
}
