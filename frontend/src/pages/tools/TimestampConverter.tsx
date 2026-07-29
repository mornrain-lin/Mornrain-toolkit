import { useState } from 'react'
import { ToolLayout } from '@/components/ToolLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'

function toLocalInput(d: Date): string {
  const off = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - off).toISOString().slice(0, 19)
}

export default function TimestampConverter() {
  const now = new Date()
  const [unix, setUnix] = useState(String(Math.floor(now.getTime() / 1000)))
  const [date, setDate] = useState(toLocalInput(now))

  function useNow() {
    const d = new Date()
    setUnix(String(Math.floor(d.getTime() / 1000)))
    setDate(toLocalInput(d))
  }

  function onUnix(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setUnix(v)
    const n = Number(v)
    if (!isNaN(n)) setDate(toLocalInput(new Date(n * 1000)))
  }

  function onDate(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setDate(v)
    const t = new Date(v).getTime()
    if (!isNaN(t)) setUnix(String(Math.floor(t / 1000)))
  }

  return (
    <ToolLayout
      title="时间戳转换"
      description="在 Unix 时间戳与本地日期时间之间相互转换。"
    >
      <Card>
        <CardContent className="space-y-5 p-5">
          <Button variant="outline" onClick={useNow} className="w-full">
            使用当前时间
          </Button>
          <div>
            <Label>Unix 时间戳（秒）</Label>
            <Input
              value={unix}
              onChange={onUnix}
              inputMode="numeric"
              className="mt-2 font-mono"
            />
          </div>
          <div>
            <Label>本地日期时间</Label>
            <Input
              type="datetime-local"
              value={date}
              onChange={onDate}
              className="mt-2 font-mono"
            />
          </div>
        </CardContent>
      </Card>
    </ToolLayout>
  )
}
