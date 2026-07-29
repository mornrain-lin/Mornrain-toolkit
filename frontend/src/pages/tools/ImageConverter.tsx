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
import { downloadBlob, readFileAsDataUrl } from '@/lib/helpers'
import { toast } from 'sonner'

type Fmt = 'image/png' | 'image/jpeg' | 'image/webp'

export default function ImageConverter() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [fmt, setFmt] = useState<Fmt>('image/png')
  const [result, setResult] = useState<{
    blob: Blob
    url: string
    name: string
  } | null>(null)

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setResult(null)
    readFileAsDataUrl(f).then(setPreview)
  }

  function convert() {
    if (!file || !preview) return
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      if (fmt === 'image/jpeg') {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
      ctx.drawImage(img, 0, 0)
      canvas.toBlob(
        (blob) => {
          if (!blob) return
          const ext = fmt.split('/')[1]
          const name = file.name.replace(/\.[^.]+$/, '') + '.' + ext
          setResult({ blob, url: URL.createObjectURL(blob), name })
          toast.success('转换完成')
        },
        fmt,
        0.92,
      )
    }
    img.src = preview
  }

  return (
    <ToolLayout
      title="图片格式转换"
      description="在 PNG / JPEG / WebP 之间互转，纯本地处理，文件不上传。"
    >
      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <Label>选择图片</Label>
            <Input
              type="file"
              accept="image/*"
              onChange={onFile}
              className="mt-2"
            />
          </div>
          {preview && (
            <img
              src={preview}
              alt="预览"
              className="max-h-64 rounded-lg border border-border"
            />
          )}
          <div className="max-w-xs">
            <Label>目标格式</Label>
            <Select value={fmt} onValueChange={(v) => setFmt(v as Fmt)}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="image/png">PNG</SelectItem>
                <SelectItem value="image/jpeg">JPEG</SelectItem>
                <SelectItem value="image/webp">WebP</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={convert} disabled={!file}>
            转换为 {fmt.split('/')[1].toUpperCase()}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <img
              src={result.url}
              alt="结果"
              className="max-h-64 rounded-lg border border-border"
            />
            <Button
              variant="outline"
              onClick={() => downloadBlob(result.blob, result.name)}
            >
              下载图片
            </Button>
          </CardContent>
        </Card>
      )}
    </ToolLayout>
  )
}
