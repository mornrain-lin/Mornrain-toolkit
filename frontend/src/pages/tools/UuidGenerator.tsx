import { useState } from 'react'
import { ToolLayout } from '@/components/ToolLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { copyAndToast } from '@/lib/helpers'

export default function UuidGenerator() {
  const [count, setCount] = useState(5)
  const [list, setList] = useState<string[]>(() =>
    Array.from({ length: 5 }, () => crypto.randomUUID()),
  )

  function gen() {
    const n = Math.min(100, Math.max(1, count))
    setList(Array.from({ length: n }, () => crypto.randomUUID()))
  }

  return (
    <ToolLayout
      title="UUID 生成器"
      description="批量生成 UUID / GUID，使用浏览器原生接口，本地生成。"
    >
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-32">
              <Label>数量</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="mt-2"
              />
            </div>
            <Button onClick={gen}>生成</Button>
            <Button
              variant="ghost"
              onClick={() => copyAndToast(list.join('\n'))}
            >
              复制全部
            </Button>
          </div>
          <div className="space-y-2">
            {list.map((id, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-sm"
              >
                <span className="truncate">{id}</span>
                <button
                  className="ml-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => copyAndToast(id)}
                >
                  复制
                </button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </ToolLayout>
  )
}
