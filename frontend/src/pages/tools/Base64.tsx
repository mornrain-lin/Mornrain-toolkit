import { useState } from 'react'
import { ToolLayout } from '@/components/ToolLayout'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { utf8ToBase64, base64ToUtf8, copyAndToast } from '@/lib/helpers'

export default function Base64Tool() {
  const [text, setText] = useState('')
  const [result, setResult] = useState('')
  const [error, setError] = useState('')

  function encode() {
    try {
      setResult(utf8ToBase64(text))
      setError('')
    } catch {
      setError('编码失败')
    }
  }

  function decode() {
    try {
      setResult(base64ToUtf8(text.trim()))
      setError('')
    } catch {
      setError('Base64 格式无效，无法解码')
    }
  }

  return (
    <ToolLayout
      title="Base64 编解码"
      description="文本与 Base64 互转，支持中文、emoji 等任意字符。"
    >
      <Card>
        <CardContent className="space-y-4 p-5">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="输入要编码或解码的文本"
            className="min-h-32 font-mono text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={encode}>编码 →</Button>
            <Button variant="outline" onClick={decode}>
              ← 解码
            </Button>
            <Button
              variant="ghost"
              onClick={() => copyAndToast(result)}
              disabled={!result}
            >
              复制结果
            </Button>
            <Button variant="ghost" onClick={() => { setText(''); setResult('') }}>
              清空
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Textarea
            value={result}
            readOnly
            placeholder="结果将显示在这里"
            className="min-h-32 bg-muted/40 font-mono text-sm"
          />
        </CardContent>
      </Card>
    </ToolLayout>
  )
}
