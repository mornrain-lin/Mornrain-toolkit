import { useState } from 'react'
import { ToolLayout } from '@/components/ToolLayout'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { copyAndToast } from '@/lib/helpers'

export default function UrlEncoder() {
  const [text, setText] = useState('')
  const [result, setResult] = useState('')
  const [error, setError] = useState('')

  function encode() {
    try {
      setResult(encodeURIComponent(text))
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function decode() {
    try {
      setResult(decodeURIComponent(text.trim()))
      setError('')
    } catch {
      setError('URL 编码格式无效，无法解码')
    }
  }

  return (
    <ToolLayout
      title="URL 编解码"
      description="对网址或参数进行 URL 编码与解码，常用于接口调试。"
    >
      <Card>
        <CardContent className="space-y-4 p-5">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="输入要编码或解码的网址 / 文本"
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
