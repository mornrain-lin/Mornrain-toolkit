import { useState } from 'react'
import { Link, Outlet, useNavigate } from 'react-router-dom'
import { Menu, Search, Github, Wrench } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ThemeToggle } from './ThemeToggle'
import { tools, categories } from '@/lib/tools'
import { site } from '@/lib/site'

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="space-y-6">
      <Link
        to="/"
        onClick={onNavigate}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition hover:bg-accent"
      >
        <Wrench className="h-4 w-4 text-primary" /> 全部工具
      </Link>
      {categories.map((cat) => (
        <div key={cat.id}>
          <div className="mb-1 flex items-center gap-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <cat.icon className="h-3.5 w-3.5" /> {cat.name}
          </div>
          <div className="space-y-0.5">
            {tools
              .filter((t) => t.category === cat.id)
              .map((t) => (
                <Link
                  key={t.id}
                  to={`/t/${t.id}`}
                  onClick={onNavigate}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
                >
                  <t.icon className="h-4 w-4" /> {t.name}
                </Link>
              ))}
          </div>
        </div>
      ))}
    </nav>
  )
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [q, setQ] = useState('')
  const navigate = useNavigate()

  const results = q.trim()
    ? tools.filter((t) =>
        (t.name + t.description + t.keywords.join(' '))
          .toLowerCase()
          .includes(q.toLowerCase()),
      )
    : []

  function go(id: string) {
    setQ('')
    setMobileOpen(false)
    navigate(`/t/${id}`)
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="菜单"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-4">
              <div className="mb-4 flex items-center gap-2 font-semibold">
                <Wrench className="h-5 w-5 text-primary" /> {site.name}
              </div>
              <ScrollArea className="h-[calc(100vh-5rem)]">
                <NavLinks onNavigate={() => setMobileOpen(false)} />
              </ScrollArea>
            </SheetContent>
          </Sheet>

          <Link to="/" className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Wrench className="h-4 w-4" />
            </span>
            <span className="text-base">{site.name}</span>
          </Link>

          <div className="relative ml-auto w-full max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索工具…"
              className="pl-8"
            />
            {results.length > 0 && (
              <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-lg">
                {results.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => go(t.id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-accent"
                  >
                    <t.icon className="h-4 w-4 text-muted-foreground" /> {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <ThemeToggle />
          <Button variant="ghost" size="icon" asChild aria-label="GitHub">
            <a href={site.repoUrl} target="_blank" rel="noreferrer">
              <Github className="h-5 w-5" />
            </a>
          </Button>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="hidden w-60 shrink-0 border-r border-border p-4 md:block">
          <ScrollArea className="h-[calc(100vh-3.5rem)]">
            <NavLinks />
          </ScrollArea>
        </aside>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
