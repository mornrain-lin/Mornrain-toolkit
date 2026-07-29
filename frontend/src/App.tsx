import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom'
import type { ComponentType } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppShell } from '@/components/AppShell'
import Home from '@/pages/Home'
import NotFound from '@/pages/NotFound'

const ImageCompressor = lazy(() => import('@/pages/tools/ImageCompressor'))
const ImageConverter = lazy(() => import('@/pages/tools/ImageConverter'))
const QrGenerator = lazy(() => import('@/pages/tools/QrGenerator'))
const JsonFormatter = lazy(() => import('@/pages/tools/JsonFormatter'))
const Base64Tool = lazy(() => import('@/pages/tools/Base64'))
const UrlEncoder = lazy(() => import('@/pages/tools/UrlEncoder'))
const TextCase = lazy(() => import('@/pages/tools/TextCase'))
const WordCounter = lazy(() => import('@/pages/tools/WordCounter'))
const MarkdownPreview = lazy(() => import('@/pages/tools/MarkdownPreview'))
const RegexTester = lazy(() => import('@/pages/tools/RegexTester'))
const PasswordGenerator = lazy(() => import('@/pages/tools/PasswordGenerator'))
const UuidGenerator = lazy(() => import('@/pages/tools/UuidGenerator'))
const HashGenerator = lazy(() => import('@/pages/tools/HashGenerator'))
const TimestampConverter = lazy(() => import('@/pages/tools/TimestampConverter'))
const BaseConverter = lazy(() => import('@/pages/tools/BaseConverter'))
const ColorConverter = lazy(() => import('@/pages/tools/ColorConverter'))
const UnitConverter = lazy(() => import('@/pages/tools/UnitConverter'))

const toolComponents: Record<string, ComponentType> = {
  'image-compressor': ImageCompressor,
  'image-converter': ImageConverter,
  'qr-generator': QrGenerator,
  'json-formatter': JsonFormatter,
  'base64': Base64Tool,
  'url-encoder': UrlEncoder,
  'text-case': TextCase,
  'word-counter': WordCounter,
  'markdown-preview': MarkdownPreview,
  'regex-tester': RegexTester,
  'password-generator': PasswordGenerator,
  'uuid-generator': UuidGenerator,
  'hash-generator': HashGenerator,
  'timestamp-converter': TimestampConverter,
  'base-converter': BaseConverter,
  'color-converter': ColorConverter,
  'unit-converter': UnitConverter,
}

function ToolRoute() {
  const { id } = useParams()
  const Comp = id ? toolComponents[id] : undefined
  if (!Comp) return <NotFound />
  return (
    <Suspense
      fallback={
        <div className="p-10 text-center text-sm text-muted-foreground">
          加载中…
        </div>
      }
    >
      <Comp />
    </Suspense>
  )
}

export default function App() {
  return (
    <TooltipProvider>
      <Toaster />
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Home />} />
            <Route path="/t/:id" element={<ToolRoute />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  )
}
