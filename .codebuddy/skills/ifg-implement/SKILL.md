---
name: ifg-implement
description: Use when a user provides a public HTTP(S) URL to a story.json file and wants to import it into an interactive film game (互动影游/IFG) project. Trigger for story.json URL ingestion in an IFG project; do not trigger for story authoring, schema consultation, engine development, or general web application work.
_meta_type: template
_meta_template_name: ifg
---

# IFG story.json 接入

## 职责

本 skill 是 IFG 项目的数据接入守门员，只执行以下固定流程：

1. 项目尚未初始化时，通过标准初始化脚本安装 IFG 模板。
2. 接收用户提供的 `story.json` HTTP(S) URL。
3. 将文件原样下载到临时目录。
4. 调用本 skill 自带的校验器进行全量校验。
5. 校验通过后原样落盘到 `frontend/public/story/story.json`；校验失败则保持目标文件不变并报告错误。

本 skill 只允许通过标准脚本初始化项目，不负责理解或修改模板。

## 硬边界

- 不生成、修改或重构任何代码。
- 除执行 `REPO_ROOT/.genie/scripts/bash/setup-project.sh ifg` 外，不查找、枚举、读取或分析模板及模板文件。
- Agent 不主动读取 schema、参考文档或示例；结构校验由 `validate.py` 自动加载 bundled Schema 完成。
- 不编写、补全、转换、修复或改写 `story.json`。
- 不为通过校验而修改任何字段。
- 不启动开发服务器，不预览应用，不执行后续项目开发。
- 不接受本地文件路径；缺少 URL 时只向用户索取 URL。

## 输入要求

- URL 必须使用 `http` 或 `https` 协议，并直接返回 `story.json` 文件内容。
- URL 指向内网、私有地址或本机地址时，必须先取得用户明确确认。
- 下载失败、重定向失败、HTTP 非成功状态或响应不是合法 JSON 时，终止流程并报告错误。

## 执行流程

在项目根目录执行以下流程，将 `<story.json URL>` 替换为用户提供的原始 URL：

```bash
set -euo pipefail

REPO_ROOT/.genie/scripts/bash/setup-project.sh ifg

IFS= read -r story_url <<'IFG_STORY_URL'
<story.json URL>
IFG_STORY_URL
tmp_story="$(mktemp /tmp/ifg-story.XXXXXX)"
trap 'rm -f "$tmp_story"' EXIT

curl -fsSL \
  --proto '=http,https' \
  --proto-redir '=http,https' \
  "$story_url" \
  -o "$tmp_story"

python3 .codebuddy/skills/ifg-implement/scripts/validate.py \
  --file "$tmp_story" \
  --stage full

mkdir -p frontend/public/story
cp "$tmp_story" frontend/public/story/story.json
```

不要使用会摘要、转换或改写响应内容的网页抓取工具代替原始下载。

## 结果处理

校验器退出码是唯一判断依据：

- `0`：PASS。允许包含 WARNING；完成落盘，并向用户报告成功及 WARNING。
- 非 `0`：FAIL。不得复制文件；保持已有 `frontend/public/story/story.json` 不变，向用户转达校验器输出。

无论成功或失败，到此结束，不执行任何额外操作。
