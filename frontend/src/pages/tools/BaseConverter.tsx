import { useState } from 'react'
import { ToolLayout } from '@/components/ToolLayout'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'

const BASES = [2, 8, 10, 16]

export default function BaseConverter() {
  const [value, setValue] = useState('255')
  const [from, setFrom] = useState('10')

  const num = (() => {
    try {
      if (!value.trim()) return null
      const n = parseInt(value.trim(), Number(from))
      return isNaN(n) ? null : n
    } catch {
      return null
    }
  })()

  return (
    <ToolLayout
      title="进制转换"
      description="在二进制 / 八进制 / 十进制 / 十六进制之间转换。"
    >
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>输入数值</Label>
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="mt-2 font-mono"
                placeholder="例如 255"
              />
            </div>
            <div>
              <Label>当前进制</Label>
              <Select value={from} onValueChange={setFrom}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BASES.map((b) => (
                    <SelectItem key={b} value={String(b)}>
                      {b} 进制
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {BASES.map((b) => (
              <div
                key={b}
                className="rounded-lg border border-border bg-muted/30 p-3"
              >
                <div className="text-xs text-muted-foreground">{b} 进制</div>
                <div className="mt-1 break-all font-mono text-sm">
                  {num === null ? '—' : num.toString(b).toUpperCase()}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </ToolLayout>
  )
}
