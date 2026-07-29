import { useState } from 'react'
import { ToolLayout } from '@/components/ToolLayout'
import { Button } from '@/components/ui/button'
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

const GROUPS: Record<string, Record<string, number>> = {
  长度: {
    米: 1,
    千米: 1000,
    厘米: 0.01,
    毫米: 0.001,
    英里: 1609.344,
    码: 0.9144,
    英尺: 0.3048,
    英寸: 0.0254,
  },
  重量: {
    千克: 1,
    克: 0.001,
    毫克: 0.000001,
    吨: 1000,
    磅: 0.45359237,
    盎司: 0.0283495,
  },
  温度: { 摄氏度: 1, 华氏度: 1, 开尔文: 1 },
}

function toCelsius(v: number, unit: string): number {
  if (unit === '摄氏度') return v
  if (unit === '华氏度') return ((v - 32) * 5) / 9
  return v - 273.15
}
function fromCelsius(c: number, unit: string): number {
  if (unit === '摄氏度') return c
  if (unit === '华氏度') return (c * 9) / 5 + 32
  return c + 273.15
}

export default function UnitConverter() {
  const [group, setGroup] = useState('长度')
  const units = Object.keys(GROUPS[group])
  const [value, setValue] = useState('1')
  const [from, setFrom] = useState(units[0])
  const [to, setTo] = useState(units[1] ?? units[0])

  const result = (() => {
    const n = Number(value)
    if (isNaN(n)) return null
    if (group === '温度') {
      return fromCelsius(toCelsius(n, from), to)
    }
    const base = n * GROUPS[group][from]
    return base / GROUPS[group][to]
  })()

  function swap() {
    setFrom(to)
    setTo(from)
  }

  return (
    <ToolLayout
      title="单位换算"
      description="长度、重量、温度等单位快速换算。"
    >
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="max-w-xs">
            <Label>类型</Label>
            <Select
              value={group}
              onValueChange={(g) => {
                setGroup(g)
                const u = Object.keys(GROUPS[g])
                setFrom(u[0])
                setTo(u[1] ?? u[0])
              }}
            >
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(GROUPS).map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>从</Label>
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                inputMode="decimal"
                className="mt-2 font-mono"
              />
              <Select value={from} onValueChange={setFrom}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>到</Label>
              <div className="mt-2 flex h-10 items-center rounded-md border border-input px-3 font-mono">
                {result === null ? '—' : Number(result.toFixed(6)).toString()}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Select value={to} onValueChange={setTo}>
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" onClick={swap} aria-label="交换">
                  ⇄
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </ToolLayout>
  )
}
