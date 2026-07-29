# ToolKit · 免费本地运行的在线工具箱

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Made with React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![100% Client-side](https://img.shields.io/badge/100%25-Client--side-success)](https://github.com)

**ToolKit** 是一个开源、免费、纯前端的在线工具集合。所有处理都在你的浏览器本地完成，**文件与文本不会上传到任何服务器**，无需注册，打开即用。

> 隐私优先 · 完全免费 · 开源可定制

---

## ✨ 功能特性

共 **17 个工具**，分为四大类：

### 🖼️ 图片工具
- **图片压缩** — 可调质量，体积对比一目了然
- **图片格式转换** — PNG / JPEG / WebP 互转
- **二维码生成** — 自定义尺寸与配色，导出 PNG

### 📝 文本工具
- **JSON 格式化** — 格式化 / 压缩 / 校验，错误提示
- **Base64 编解码** — 支持中文与 emoji
- **URL 编解码** — 接口调试好帮手
- **大小写转换** — 大写 / 小写 / 标题 / 驼峰 / 下划线 / 中划线
- **字数统计** — 字符、单词、行数、阅读时间
- **Markdown 预览** — 实时渲染，安全过滤，可导出
- **正则测试** — 高亮匹配结果，支持标志位

### 🛠️ 开发工具
- **密码生成器** — 浏览器加密接口，强度评估
- **UUID 生成器** — 批量生成
- **哈希生成** — SHA-1 / 256 / 384 / 512
- **时间戳转换** — Unix 时间戳 ⇄ 日期
- **进制转换** — 二进制 / 八进制 / 十进制 / 十六进制

### 🔁 换算工具
- **颜色转换** — HEX / RGB / HSL 互转，取色器
- **单位换算** — 长度 / 重量 / 温度

---

## 🌟 为什么选择 ToolKit

| 优势 | 说明 |
| --- | --- |
| 🔒 隐私安全 | 纯前端运行，数据不出本机 |
| 🆓 完全免费 | 无付费墙、无广告 |
| ⚡ 极速处理 | 本地计算，零网络延迟 |
| 📱 响应式 | 桌面与手机均可用 |
| 🌗 深色 / 浅色 | 偏好本地保存 |
| 🧩 开源 | MIT 协议，欢迎贡献 |

---

## 🚀 本地运行

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev
```

构建生产版本：

```bash
pnpm build
pnpm preview
```

---

## 📦 技术栈

- [React 19](https://react.dev) + [TypeScript](https://www.typescriptlang.org)
- [Vite 7](https://vitejs.dev) 构建工具
- [Tailwind CSS v4](https://tailwindcss.com) 样式
- [shadcn/ui](https://ui.shadcn.com) 组件（基于 Radix UI）
- [lucide-react](https://lucide.dev) 图标

依赖的纯前端库：`qrcode`、`marked`、`dompurify`。

---

## 🤝 贡献

欢迎提交 Issue 与 Pull Request！无论是新增工具、修复 Bug 还是改进界面，都非常感谢。

1. Fork 本仓库
2. 创建分支 `git checkout -b feature/your-feature`
3. 提交改动 `git commit -m "feat: your feature"`
4. 推送并创建 Pull Request

---

## 📄 开源协议

[MIT License](./LICENSE) © ToolKit
