import { useEffect, useState } from 'react'
import { ToolLayout } from '@/components/ToolLayout'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { copyAndToast, downloadText } from '@/lib/helpers'

const ALGOS = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']

export default function HashGenerator() {
  const [text, setText] = useState('ToolKit')
  const [algo, setAlgo] = useState('SHA-256')
  const [hash, setHash] = useState('')

  useEffect(() => {
    if (!text) {
      setHash('')
      return
    }
    let cancelled = false
    ;(async () => {
      const data = new TextEncoder().encode(text)
      const buf = await crypto.subtle.digest(algo, data)
      if (cancelled) return
      const hex = Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
      setHash(hex)
    })()
    return () => {
      cancelled = true
    }
  }, [text, algo])

  return (
    <ToolLayout
      title="哈希生成"
      description="计算文本的 SHA-1 / 256 / 384 / 512 摘要，使用 Web Crypto 接口。"
    >
      <Card>
        <CardContent className="space-y-4 p-5">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="输入要计算哈希的文本"
            className="min-h-28 font-mono text-sm"
          />
          <div className="max-w-xs">
            <Label>算法</Label>
            <Select value={algo} onValueChange={setAlgo}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALGOS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-md border border-border bg-muted/40 p-3 font-mono text-sm">
              {hash || '—'}
            </code>
            <Button
              variant="outline"
              onClick={() => copyAndToast(hash)}
              disabled={!hash}
            >
              复制
            </Button>
            <Button
              variant="ghost"
              onClick={() => downloadText(hash, `${algo}.txt`)}
              disabled={!hash}
            >
              下载
            </Button>
          </div>
        </CardContent>
      </Card>
    </ToolLayout>
  )
}
