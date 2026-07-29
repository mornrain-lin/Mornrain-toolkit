import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ToolLayoutProps {
  title: string
  description: string
  children: ReactNode
  className?: string
}

export function ToolLayout({
  title,
  description,
  children,
  className,
}: ToolLayoutProps) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <Link
        to="/"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> 返回全部工具
      </Link>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </header>
      <div className={cn('space-y-4', className)}>{children}</div>
    </div>
  )
}
