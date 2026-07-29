import { useState } from 'react'
import { ToolLayout } from '@/components/ToolLayout'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { copyAndToast, downloadText } from '@/lib/helpers'
import { toast } from 'sonner'

export default function JsonFormatter() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')

  function format() {
    try {
      const obj = JSON.parse(input)
      setOutput(JSON.stringify(obj, null, 2))
      setError('')
      toast.success('格式化成功')
    } catch (e) {
      setError((e as Error).message)
      toast.error('JSON 解析失败')
    }
  }

  function minify() {
    try {
      const obj = JSON.parse(input)
      setOutput(JSON.stringify(obj))
      setError('')
      toast.success('已压缩')
    } catch (e) {
      setError((e as Error).message)
      toast.error('JSON 解析失败')
    }
  }

  return (
    <ToolLayout
      title="JSON 格式化"
      description="格式化、压缩并校验 JSON，出现错误会给出具体提示。"
    >
      <Card>
        <CardContent className="space-y-4 p-5">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='在此粘贴 JSON，例如 {"name": "ToolKit"}'
            className="min-h-40 font-mono text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={format}>格式化</Button>
            <Button variant="outline" onClick={minify}>
              压缩
            </Button>
            <Button
              variant="ghost"
              onClick={() => copyAndToast(output)}
              disabled={!output}
            >
              复制结果
            </Button>
            <Button
              variant="ghost"
              onClick={() => downloadText(output, 'data.json', 'application/json')}
              disabled={!output}
            >
              下载
            </Button>
          </div>
          {error && (
            <p className="text-sm text-destructive">错误：{error}</p>
          )}
          <Textarea
            value={output}
            readOnly
            placeholder="结果将显示在这里"
            className="min-h-40 bg-muted/40 font-mono text-sm"
          />
        </CardContent>
      </Card>
    </ToolLayout>
  )
}
