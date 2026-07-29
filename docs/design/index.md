# 设计系统

## 视觉风格
专业稳重（Professional / Stable）的深色优先主题，适配工具类产品。

## 配色
- 主色（Primary）：靛蓝 `oklch(0.65 0.19 264)`，用于强调、按钮、链接
- 背景（Background）：深石板色 `oklch(0.17 0.012 265)`
- 卡片（Card）：`oklch(0.21 0.014 265)`
- 文字（Foreground）：`oklch(0.95 0.005 265)`
- 边框（Border）：白色 8% 透明度
- 功能色：成功 `success`、警告 `warning`、信息 `info`、危险 `destructive`

浅色模式为干净的冷白底，主色略深以保证对比度。

## 排版
- 字体：Inter Variable（回退系统字体）
- 圆角：基础 `0.625rem`
- 标题分级：首页主标题 4–5rem，工具页标题 2rem

## 组件
基于 shadcn/ui（Radix UI）的 Card、Button、Input、Select、Slider、Switch、Tabs、Sheet、Badge、Separator 等，统一使用设计令牌变量。

## 布局
- 顶栏：品牌 + 全局搜索 + 主题切换 + GitHub 链接
- 左侧栏：分类导航（桌面）；移动端为 Sheet 抽屉
- 内容区：最大宽度 4xl 居中，工具统一使用 ToolLayout 头部
