import type { LucideIcon } from 'lucide-react'
import {
  Image,
  Type,
  Code2,
  ArrowLeftRight,
  ImageDown,
  FileImage,
  QrCode,
  Braces,
  Binary,
  Link as LinkIcon,
  CaseSensitive,
  Text,
  FileText,
  Regex,
  KeyRound,
  Fingerprint,
  Hash,
  Clock,
  Calculator,
  Palette,
  Scale,
} from 'lucide-react'

export type Category = 'image' | 'text' | 'dev' | 'convert'

export interface CategoryMeta {
  id: Category
  name: string
  icon: LucideIcon
}

export interface ToolMeta {
  id: string
  name: string
  description: string
  category: Category
  icon: LucideIcon
  keywords: string[]
}

export const categories: CategoryMeta[] = [
  { id: 'image', name: '图片工具', icon: Image },
  { id: 'text', name: '文本工具', icon: Type },
  { id: 'dev', name: '开发工具', icon: Code2 },
  { id: 'convert', name: '换算工具', icon: ArrowLeftRight },
]

export const tools: ToolMeta[] = [
  {
    id: 'image-compressor',
    name: '图片压缩',
    description: '在浏览器本地压缩图片，可调质量，文件不上传。',
    category: 'image',
    icon: ImageDown,
    keywords: ['compress', '压缩', 'jpg', 'png', 'webp', '体积'],
  },
  {
    id: 'image-converter',
    name: '图片格式转换',
    description: '在 PNG / JPEG / WebP 之间互转，纯本地处理。',
    category: 'image',
    icon: FileImage,
    keywords: ['convert', '转换', 'png', 'jpeg', 'webp', '格式'],
  },
  {
    id: 'qr-generator',
    name: '二维码生成',
    description: '把文本或网址生成为可下载的二维码图片。',
    category: 'image',
    icon: QrCode,
    keywords: ['qrcode', '二维码', '二维码生成', '扫码'],
  },
  {
    id: 'json-formatter',
    name: 'JSON 格式化',
    description: '格式化、压缩并校验 JSON，支持错误提示。',
    category: 'text',
    icon: Braces,
    keywords: ['json', '格式化', '校验', '压缩', '美化'],
  },
  {
    id: 'base64',
    name: 'Base64 编解码',
    description: '文本与 Base64 互转，支持中文与 emoji。',
    category: 'text',
    icon: Binary,
    keywords: ['base64', '编码', '解码', 'encode', 'decode'],
  },
  {
    id: 'url-encoder',
    name: 'URL 编解码',
    description: '对网址或参数进行 URL 编码与解码。',
    category: 'text',
    icon: LinkIcon,
    keywords: ['url', 'encode', 'decode', '编码', '解码', '网址'],
  },
  {
    id: 'text-case',
    name: '大小写转换',
    description: '大写、小写、标题、驼峰、下划线等多种转换。',
    category: 'text',
    icon: CaseSensitive,
    keywords: ['case', '大小写', 'camel', 'snake', '标题', '转换'],
  },
  {
    id: 'word-counter',
    name: '字数统计',
    description: '统计字符、单词、行数，并估算阅读时间。',
    category: 'text',
    icon: Text,
    keywords: ['word', 'count', '字数', '字符', '统计', '阅读时间'],
  },
  {
    id: 'markdown-preview',
    name: 'Markdown 预览',
    description: '实时将 Markdown 渲染为 HTML 预览。',
    category: 'text',
    icon: FileText,
    keywords: ['markdown', 'md', '预览', '渲染', 'html'],
  },
  {
    id: 'regex-tester',
    name: '正则测试',
    description: '测试正则表达式并高亮匹配结果。',
    category: 'text',
    icon: Regex,
    keywords: ['regex', '正则', '表达式', '匹配', '测试'],
  },
  {
    id: 'password-generator',
    name: '密码生成器',
    description: '用浏览器加密接口生成高强度随机密码。',
    category: 'dev',
    icon: KeyRound,
    keywords: ['password', '密码', '随机', '安全', '生成'],
  },
  {
    id: 'uuid-generator',
    name: 'UUID 生成器',
    description: '批量生成 UUID / GUID。',
    category: 'dev',
    icon: Fingerprint,
    keywords: ['uuid', 'guid', '生成', '唯一'],
  },
  {
    id: 'hash-generator',
    name: '哈希生成',
    description: '计算文本的 SHA-1/256/384/512 摘要。',
    category: 'dev',
    icon: Hash,
    keywords: ['hash', 'sha', '摘要', '加密', 'sha256'],
  },
  {
    id: 'timestamp-converter',
    name: '时间戳转换',
    description: '在 Unix 时间戳与日期时间之间互转。',
    category: 'dev',
    icon: Clock,
    keywords: ['timestamp', '时间戳', '时间', 'unix', '日期'],
  },
  {
    id: 'base-converter',
    name: '进制转换',
    description: '在二进制 / 八进制 / 十进制 / 十六进制之间转换。',
    category: 'dev',
    icon: Calculator,
    keywords: ['base', '进制', 'binary', 'hex', '二进制', '十六进制'],
  },
  {
    id: 'color-converter',
    name: '颜色转换',
    description: 'HEX / RGB / HSL 互转，支持取色与复制。',
    category: 'convert',
    icon: Palette,
    keywords: ['color', '颜色', 'hex', 'rgb', 'hsl', '取色'],
  },
  {
    id: 'unit-converter',
    name: '单位换算',
    description: '长度、重量、温度等单位快速换算。',
    category: 'convert',
    icon: Scale,
    keywords: ['unit', '单位', '换算', '长度', '重量', '温度'],
  },
]
