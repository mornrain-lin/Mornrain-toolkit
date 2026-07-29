import { useState } from 'react'
import { ToolLayout } from '@/components/ToolLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { copyAndToast } from '@/lib/helpers'

interface Rgb {
  r: number
  g: number
  b: number
}
interface Hsl {
  h: number
  s: number
  l: number
}

function hexToRgb(hex: string): Rgb | null {
  let h = hex.replace('#', '').trim()
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  const n = parseInt(h, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      default:
        h = (r - g) / d + 4
    }
    h /= 6
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  }
}

export default function ColorConverter() {
  const [hex, setHex] = useState('#3366cc')
  const rgb = hexToRgb(hex)
  const hsl = rgb ? rgbToHsl(rgb) : null

  return (
    <ToolLayout
      title="颜色转换"
      description="HEX / RGB / HSL 互转，支持取色器与一键复制。"
    >
      <Card>
        <CardContent className="space-y-4 p-5">
          <div
            className="h-24 w-full rounded-lg border border-border"
            style={{ background: rgb ? hex : 'transparent' }}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>HEX</Label>
              <div className="mt-2 flex items-center gap-2">
                <Input
                  type="color"
                  value={rgb ? hex : '#000000'}
                  onChange={(e) => setHex(e.target.value)}
                  className="h-10 w-14 cursor-pointer p-1"
                />
                <Input
                  value={hex}
                  onChange={(e) => setHex(e.target.value)}
                  className="font-mono"
                />
              </div>
            </div>
            <div>
              <Label>RGB</Label>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-sm">
                  {rgb ? `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` : '—'}
                </code>
                <Button
                  variant="outline"
                  onClick={() =>
                    rgb && copyAndToast(`rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`)
                  }
                  disabled={!rgb}
                >
                  复制
                </Button>
              </div>
            </div>
          </div>
          <div>
            <Label>HSL</Label>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-sm">
                {hsl ? `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)` : '—'}
              </code>
              <Button
                variant="outline"
                  onClick={() =>
                    hsl && copyAndToast(`hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`)
                  }
                disabled={!hsl}
              >
                复制
              </Button>
            </div>
          </div>
          {!rgb && (
            <p className="text-sm text-destructive">HEX 格式无效，应为 #RRGGBB。</p>
          )}
        </CardContent>
      </Card>
    </ToolLayout>
  )
}
