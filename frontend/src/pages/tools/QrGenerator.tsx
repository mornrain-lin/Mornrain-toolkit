import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { ToolLayout } from '@/components/ToolLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Card, CardContent } from '@/components/ui/card'
import { downloadDataUrl } from '@/lib/helpers'

export default function QrGenerator() {
  const [text, setText] = useState('https://github.com')
  const [size, setSize] = useState(256)
  const [dark, setDark] = useState('#000000')
  const [light, setLight] = useState('#ffffff')
  const [url, setUrl] = useState('')

  useEffect(() => {
    if (!text.trim()) {
      setUrl('')
      return
    }
    QRCode.toDataURL(text, {
      width: size,
      margin: 2,
      color: { dark, light },
      errorCorrectionLevel: 'M',
    })
      .then(setUrl)
      .catch(() => setUrl(''))
  }, [text, size, dark, light])

  return (
    <ToolLayout
      title="二维码生成"
      description="把文本或网址生成为可下载的二维码图片，全部在本地生成。"
    >
      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <Label>内容</Label>
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="输入文本或网址"
              className="mt-2"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label>尺寸：{size}px</Label>
              <Slider
                value={[size]}
                min={128}
                max={1024}
                step={32}
                onValueChange={([v]) => setSize(v)}
                className="mt-3"
              />
            </div>
            <div>
              <Label>前景色</Label>
              <Input
                type="color"
                value={dark}
                onChange={(e) => setDark(e.target.value)}
                className="mt-2 h-10 w-full cursor-pointer"
              />
            </div>
            <div>
              <Label>背景色</Label>
              <Input
                type="color"
                value={light}
                onChange={(e) => setLight(e.target.value)}
                className="mt-2 h-10 w-full cursor-pointer"
              />
            </div>
          </div>
          {url && (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-white p-4">
              <img
                src={url}
                alt="二维码"
                style={{ width: size / 2, height: size / 2 }}
              />
              <Button variant="outline" onClick={() => downloadDataUrl(url, 'qrcode.png')}>
                下载 PNG
              </Button>
            </div>
          )}
          {!url && text.trim() && (
            <p className="text-sm text-muted-foreground">生成中或内容无效…</p>
          )}
        </CardContent>
      </Card>
    </ToolLayout>
  )
}
