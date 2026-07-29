import { useState } from 'react'
import { ToolLayout } from '@/components/ToolLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent } from '@/components/ui/card'
import { copyAndToast } from '@/lib/helpers'

const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const NUMS = '0123456789'
const SYMS = '!@#$%^&*()-_=+[]{};:,.<>?'

interface Opts {
  lower: boolean
  upper: boolean
  num: boolean
  sym: boolean
}

function generate(len: number, opts: Opts): string {
  let pool = ''
  if (opts.lower) pool += LOWER
  if (opts.upper) pool += UPPER
  if (opts.num) pool += NUMS
  if (opts.sym) pool += SYMS
  if (!pool) pool = LOWER
  const arr = new Uint32Array(len)
  crypto.getRandomValues(arr)
  let out = ''
  for (let i = 0; i < len; i++) out += pool[arr[i] % pool.length]
  return out
}

function strength(len: number, poolSize: number): { label: string; color: string } {
  const entropy = len * (poolSize > 1 ? Math.log2(poolSize) : 0)
  if (entropy < 40) return { label: '弱', color: 'text-destructive' }
  if (entropy < 70) return { label: '中', color: 'text-warning' }
  if (entropy < 100) return { label: '强', color: 'text-info' }
  return { label: '非常强', color: 'text-success' }
}

export default function PasswordGenerator() {
  const [len, setLen] = useState(16)
  const [opts, setOpts] = useState<Opts>({
    lower: true,
    upper: true,
    num: true,
    sym: true,
  })
  const [pw, setPw] = useState(() => generate(16, { lower: true, upper: true, num: true, sym: true }))

  function regen() {
    setPw(generate(len, opts))
  }

  const poolSize =
    (opts.lower ? 26 : 0) +
    (opts.upper ? 26 : 0) +
    (opts.num ? 10 : 0) +
    (opts.sym ? SYMS.length : 0)
  const s = strength(len, poolSize)

  return (
    <ToolLayout
      title="密码生成器"
      description="使用浏览器加密接口生成高强度随机密码，全程本地完成。"
    >
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <Input
              value={pw}
              readOnly
              className="font-mono text-base"
            />
            <Button
              variant="outline"
              onClick={() => copyAndToast(pw)}
            >
              复制
            </Button>
          </div>

          <div>
            <Label>长度：{len}</Label>
            <Slider
              value={[len]}
              min={4}
              max={64}
              step={1}
              onValueChange={([v]) => setLen(v)}
              className="mt-3"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center justify-between rounded-md border border-border p-3">
              <span>小写 a-z</span>
              <Switch
                checked={opts.lower}
                onCheckedChange={(v) => setOpts((o) => ({ ...o, lower: v }))}
              />
            </label>
            <label className="flex items-center justify-between rounded-md border border-border p-3">
              <span>大写 A-Z</span>
              <Switch
                checked={opts.upper}
                onCheckedChange={(v) => setOpts((o) => ({ ...o, upper: v }))}
              />
            </label>
            <label className="flex items-center justify-between rounded-md border border-border p-3">
              <span>数字 0-9</span>
              <Switch
                checked={opts.num}
                onCheckedChange={(v) => setOpts((o) => ({ ...o, num: v }))}
              />
            </label>
            <label className="flex items-center justify-between rounded-md border border-border p-3">
              <span>符号 !@#</span>
              <Switch
                checked={opts.sym}
                onCheckedChange={(v) => setOpts((o) => ({ ...o, sym: v }))}
              />
            </label>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">强度</span>
            <span className={`font-semibold ${s.color}`}>{s.label}</span>
          </div>

          <Button onClick={regen} className="w-full">
            重新生成
          </Button>
        </CardContent>
      </Card>
    </ToolLayout>
  )
}
