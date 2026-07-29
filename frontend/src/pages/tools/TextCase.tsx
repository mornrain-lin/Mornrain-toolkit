import { useState } from 'react'
import { ToolLayout } from '@/components/ToolLayout'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { copyAndToast } from '@/lib/helpers'

function words(s: string): string[] {
  return s.split(/[^a-zA-Z0-9]+/).filter(Boolean)
}

function toCamel(s: string): string {
  const w = words(s)
  if (!w.length) return ''
  return (
    w[0].toLowerCase() +
    w
      .slice(1)
      .map((c) => c.charAt(0).toUpperCase() + c.slice(1).toLowerCase())
      .join('')
  )
}
function toSnake(s: string): string {
  return words(s).map((w) => w.toLowerCase()).join('_')
}
function toKebab(s: string): string {
  return words(s).map((w) => w.toLowerCase()).join('-')
}
function toTitle(s: string): string {
  return words(s)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}
function toSentence(s: string): string {
  return s
    .replace(/([.?!]\s*)([a-z])/g, (_, p, c) => p + c.toUpperCase())
    .replace(/^[a-z]/, (c) => c.toUpperCase())
}

const modes: Record<string, (s: string) => string> = {
  upper: (s) => s.toUpperCase(),
  lower: (s) => s.toLowerCase(),
  title: toTitle,
  sentence: toSentence,
  camel: toCamel,
  snake: toSnake,
  kebab: toKebab,
}

export default function TextCase() {
  const [text, setText] = useState('')
  const [mode, setMode] = useState('camel')
  const result = text ? modes[mode](text) : ''

  return (
    <ToolLayout
      title="大小写转换"
      description="在多种命名风格之间一键转换，支持中英文混合文本。"
    >
      <Card>
        <CardContent className="space-y-4 p-5">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="输入要转换的文本"
            className="min-h-32 text-sm"
          />
          <div className="max-w-xs">
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="upper">大写 UPPERCASE</SelectItem>
                <SelectItem value="lower">小写 lowercase</SelectItem>
                <SelectItem value="title">标题 Title Case</SelectItem>
                <SelectItem value="sentence">句子 Sentence case</SelectItem>
                <SelectItem value="camel">驼峰 camelCase</SelectItem>
                <SelectItem value="snake">下划线 snake_case</SelectItem>
                <SelectItem value="kebab">中划线 kebab-case</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="ghost"
            onClick={() => copyAndToast(result)}
            disabled={!result}
          >
            复制结果
          </Button>
          <Textarea
            value={result}
            readOnly
            placeholder="转换结果将显示在这里"
            className="min-h-32 bg-muted/40 font-mono text-sm"
          />
        </CardContent>
      </Card>
    </ToolLayout>
  )
}
