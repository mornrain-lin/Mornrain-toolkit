import { useState } from 'react'
import { ToolLayout } from '@/components/ToolLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { formatBytes, downloadBlob, readFileAsDataUrl } from '@/lib/helpers'
import { toast } from 'sonner'

type Fmt = 'image/jpeg' | 'image/webp' | 'keep'

export default function ImageCompressor() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [quality, setQuality] = useState(0.8)
  const [fmt, setFmt] = useState<Fmt>('image/jpeg')
  const [origSize, setOrigSize] = useState(0)
  const [result, setResult] = useState<{
    blob: Blob
    url: string
    size: number
    name: string
  } | null>(null)

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setOrigSize(f.size)
    setResult(null)
    readFileAsDataUrl(f).then(setPreview)
  }

  function compress() {
    if (!file || !preview) return
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const mime = fmt === 'keep' ? file.type || 'image/jpeg' : fmt
      canvas.toBlob(
        (blob) => {
          if (!blob) return
          const ext = mime.split('/')[1]
          const name = file.name.replace(/\.[^.]+$/, '') + '-min.' + ext
          setResult({
            blob,
            url: URL.createObjectURL(blob),
            size: blob.size,
            name,
          })
          toast.success('压缩完成')
        },
        mime,
        quality,
      )
    }
    img.src = preview
  }

  const ratio = result && origSize ? 1 - result.size / origSize : 0

  return (
    <ToolLayout
      title="图片压缩"
      description="在浏览器本地压缩图片，质量可调，文件不会上传到任何服务器。"
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>输出格式</Label>
              <Select
                value={fmt}
                onValueChange={(v) => setFmt(v as Fmt)}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="image/jpeg">JPEG</SelectItem>
                  <SelectItem value="image/webp">WebP</SelectItem>
                  <SelectItem value="keep">保持原格式</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>质量：{Math.round(quality * 100)}%</Label>
              <Slider
                value={[quality]}
                min={0.1}
                max={1}
                step={0.05}
                onValueChange={([v]) => setQuality(v)}
                className="mt-3"
              />
            </div>
          </div>
          <Button onClick={compress} disabled={!file}>
            压缩图片
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <div className="text-muted-foreground">原始大小</div>
                <div className="font-semibold">{formatBytes(origSize)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">压缩后</div>
                <div className="font-semibold text-success">
                  {formatBytes(result.size)}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">体积减少</div>
                <div className="font-semibold text-success">
                  {Math.round(ratio * 100)}%
                </div>
              </div>
            </div>
            <img
              src={result.url}
              alt="结果"
              className="max-h-64 rounded-lg border border-border"
            />
            <Button
              variant="outline"
              onClick={() => downloadBlob(result.blob, result.name)}
            >
              下载压缩图
            </Button>
          </CardContent>
        </Card>
      )}
    </ToolLayout>
  )
}
