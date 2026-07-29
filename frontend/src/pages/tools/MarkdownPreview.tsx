import { useState } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { ToolLayout } from '@/components/ToolLayout'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { downloadText, copyAndToast } from '@/lib/helpers'

const SAMPLE = `# 标题示例

输入 **Markdown** 即可 *实时预览*。

- 列表项一
- 列表项二

\`\`\`js
console.log("Hello ToolKit")
\`\`\`

> 引用块示例

[链接](https://github.com)
`

export default function MarkdownPreview() {
  const [md, setMd] = useState(SAMPLE)
  const html = DOMPurify.sanitize(marked.parse(md, { async: false }) as string)

  return (
    <ToolLayout
      title="Markdown 预览"
      description="实时将 Markdown 渲染为 HTML，输出经过安全过滤，可导出。"
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <Button
          variant="ghost"
          onClick={() => copyAndToast(html, '已复制 HTML')}
        >
          复制 HTML
        </Button>
        <Button
          variant="ghost"
          onClick={() => downloadText(html, 'preview.html', 'text/html')}
        >
          下载 HTML
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-3">
            <Textarea
              value={md}
              onChange={(e) => setMd(e.target.value)}
              className="min-h-[60vh] border-0 font-mono text-sm focus-visible:ring-0"
              placeholder="输入 Markdown…"
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div
              className="md-body"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </CardContent>
        </Card>
      </div>
    </ToolLayout>
  )
}
