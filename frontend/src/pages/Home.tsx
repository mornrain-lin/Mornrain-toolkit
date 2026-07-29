import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck, Zap, Lock, Github } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { tools, categories, type ToolMeta } from '@/lib/tools'
import { site } from '@/lib/site'

function ToolCard({ t }: { t: ToolMeta }) {
  return (
    <Link
      to={`/t/${t.id}`}
      className="group rounded-xl border border-border bg-card p-4 transition hover:border-primary/50 hover:shadow-md"
    >
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <t.icon className="h-5 w-5" />
      </div>
      <div className="font-medium">{t.name}</div>
      <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
        {t.description}
      </div>
    </Link>
  )
}

export default function Home() {
  const [q, setQ] = useState('')
  const filtered = q.trim()
    ? tools.filter((t) =>
        (t.name + t.description + t.keywords.join(' '))
          .toLowerCase()
          .includes(q.toLowerCase()),
      )
    : null

  return (
    <div>
      <section className="border-b border-border bg-gradient-to-b from-primary/5 to-transparent">
        <div className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-success" /> 100%
            本地运行 · 完全免费 · 开源
          </span>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
            {site.name}
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            {site.tagline}。所有处理都在你的浏览器中完成，文件不会上传到任何服务器。
          </p>
          <div className="mx-auto mt-6 max-w-md">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索工具，例如：压缩、JSON、密码…"
              className="h-11 text-center"
            />
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-success" /> 隐私安全
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Zap className="h-4 w-4 text-info" /> 极速处理
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Lock className="h-4 w-4 text-warning" /> 无需注册
            </span>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        {filtered ? (
          <div>
            <p className="mb-4 text-sm text-muted-foreground">
              找到 {filtered.length} 个工具
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {filtered.map((t) => (
                <ToolCard key={t.id} t={t} />
              ))}
            </div>
          </div>
        ) : (
          categories.map((cat) => (
            <div key={cat.id} className="mb-10">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                <cat.icon className="h-5 w-5 text-primary" /> {cat.name}
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {tools
                  .filter((t) => t.category === cat.id)
                  .map((t) => (
                    <ToolCard key={t.id} t={t} />
                  ))}
              </div>
            </div>
          ))
        )}
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        <p className="inline-flex items-center gap-1.5">
          {site.name} · 开源免费 ·
          <a
            href={site.repoUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <Github className="h-3.5 w-3.5" /> GitHub
          </a>
        </p>
      </footer>
    </div>
  )
}
