---
name: genie-tcb-auth-miniprogram-integrator
description: Implement user authentication for Taro mini-program (小程序) apps using TCB (Tencent CloudBase). Default login is WeChat (cloud function mini-app-login to get openid). Also supports email OTP and email password login. Use this skill when a mini-program project needs login, signup, session management, or user profile.
_meta_type: sdk
---

# Genie TCB Auth Integration — Mini-program (小程序)

为 Taro 小程序项目实现用户认证。默认添加微信登录（通过云函数获取 openid），同时支持邮箱验证码和邮箱密码登录。用户信息存储在 TCB Auth 用户属性中，无需数据库。

> **Web 项目请使用 `genie-tcb-auth-integrator` skill。**

## Scenarios

### 默认添加
- **WeChat OpenID Login (微信静默登录)**: 通过云函数 `mini-app-login` 获取用户 openid —— 云函数内部使用 `getWXContext()` / `event.userInfo` 自动获取，无需用户操作

### 也可使用（代码已内置，按需在 UI 中接入）
- **Phone Auth (手机号登录)**: 优先使用微信手机号快速验证 `signInWithPhoneAuth({ phoneCode })`；用户拒绝授权时降级为手机号验证码登录 `signInWithOtp({ phone })`（小程序 + H5 均可用）
- **Email OTP (邮箱验证码)**: 发送验证码 → 注册/登录（小程序和 H5 均可用）
- **Email Password (邮箱密码)**: 邮箱 + 密码登录（小程序和 H5 均可用）
- **Password Reset**: 通过邮箱验证码重置密码

### 不支持
- **Google OAuth**: 需要浏览器跳转，小程序环境无法实现
- ~~**signInWithOpenId**: 属于 TCB Web SDK v2 API，在小程序原生 wx.cloud 环境和批量代云开发跨账号模式下不可用~~

### Common
- **Session Management**: TCB JS SDK 自动管理 token 持久化
- **User Profile**: 存储在 TCB Auth 用户属性中
- **Sign Out**: 清除 TCB 会话

**Not recommended for:**
- Web projects — use `genie-tcb-auth-integrator` instead
- Projects that don't need user authentication

## Prerequisites

**Required: Taro mini-program project.**

- Frontend: Taro (React) mini-program
- Dependencies: `@cloudbase/js-sdk`, `@cloudbase/adapter-taro`, `@tarojs/taro`
- Backend: **云函数 `mini-app-login` 由 Genie 平台自动部署**，无需手动配置

**Important:** TCB environments are created and managed by the Genie platform. Users cannot directly access the TCB console. Cloud functions (`oauth-callback`, `mini-app-login`) and custom login keys are pre-configured by Genie.

## MANDATORY: TCB Environment User Confirmation

**DO NOT run `ensure-cloudbase-env.sh` or any TCB setup without explicit user approval.**

Before ANY auth integration work, you MUST follow this exact sequence:

1. **Check** if `/workspace/.env.tcb` exists:
   ```bash
   cat /workspace/.env.tcb 2>/dev/null
   ```

2. **If `.env.tcb` exists** and contains `CLOUDBASE_ENV_ID`: TCB is ready, skip to Setup Step 1.

3. **If `.env.tcb` does NOT exist**: You MUST **STOP** and use `ask_followup_question` to ask the user:
   ```
   The project does not have a TCB (Tencent CloudBase) environment yet.
   This is required for WeChat login authentication.

   Would you like to enable TCB authentication for this project?
   ```
   Options:
   - **Enable TCB Auth** — Creates a TCB environment with WeChat login support
   - **Skip** — Do not enable TCB auth at this time

4. **ONLY if user explicitly selects "Enable TCB Auth"**, run:
   ```bash
   bash /workspace/.codebuddy/skills/genie-tcb-auth-miniprogram-integrator/scripts/ensure-cloudbase-env.sh --project-dir /workspace
   ```

5. If user selects "Skip", do NOT create the environment. Inform the user that auth features require TCB and stop the auth setup.

**NEVER assume the user wants TCB enabled. NEVER skip the confirmation step.**

If the script fails, report the error to the user. Do not retry automatically.

### 配额限流处理（MANDATORY — issue #3156）

`ensure-cloudbase-env.sh` 创建 TCB 环境时，若用户已达会员配额上限，脚本以**退出码 `42`** 结束，并在 stdout 输出 `##GENIE_TCB_ERROR##{json}##END##`（json 含 `code` 与 `display`）。

**你（Agent）必须：**
1. 退出码 `42` → 判定为配额限流，**立即停止**，不重试、不绕过。
2. 提取哨兵之间的 JSON，取 `display`（后端已产出好标题/说明/升级入口）。
3. **原样呈现 `display` 给用户**，告知需升级会员或释放已有环境后重试。
4. 不再执行后续依赖 TCB 的步骤。

Verify after success: `cat /workspace/.env.tcb` should show `CLOUDBASE_ENV_ID`, `CLOUDBASE_REGION`, `CLOUDBASE_PUBLISH_KEY`.

## Setup

```bash
bash /workspace/.codebuddy/skills/genie-tcb-auth-miniprogram-integrator/scripts/ensure-cloudbase-env.sh --project-dir /workspace
```

### 1. Install Dependencies

```bash
npm install @cloudbase/js-sdk@3.3.2 @cloudbase/adapter-taro
```

### 2. Copy SDK Files

Read the following files from this skill's `lib/` directory and copy them to the project:

| Source (this skill) | Target (project) | Used by |
|---------------------|-------------------|---------|
| `lib/cloudbase.ts` | `src/lib/cloudbase.ts` | CloudBase 初始化 |
| `lib/auth-context.tsx` | `src/lib/AuthContext.tsx` | 认证状态管理 |

**Note:** SDK 文件中使用 `process.env.CLOUDBASE_*` 读取凭证，**源码中不含实际值**。值通过 Taro `defineConstants` 在构建时注入到产物中（见 Step 3）。

### 3. Configure Taro defineConstants

由于环境变量名已固定为 `CLOUDBASE_*`（不带 `TARO_APP_` 前缀），无法使用 Taro `.env` 自动加载。需要在 `config/index.ts` 的 `defineConstants` 中**追加** TCB 相关条目（注意：不要覆盖已有的 `defineConstants` 内容如 `TARO_APP_API_URL`）：

```typescript
import fs from 'fs'

// 在文件顶部添加 .env.tcb 读取逻辑
const tcbEnvPath = '/workspace/.env.tcb'
let tcbEnv: Record<string, string> = {}
if (fs.existsSync(tcbEnvPath)) {
  fs.readFileSync(tcbEnvPath, 'utf-8').split('\n').forEach(line => {
    const idx = line.indexOf('=')
    if (idx > 0) tcbEnv[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  })
}

const config = {
  // ...
  defineConstants: {
    'process.env.CLOUDBASE_ENV_ID': JSON.stringify(tcbEnv.CLOUDBASE_ENV_ID || ''),
    'process.env.CLOUDBASE_REGION': JSON.stringify(tcbEnv.CLOUDBASE_REGION || 'ap-shanghai'),
    'process.env.CLOUDBASE_PUBLISH_KEY': JSON.stringify(tcbEnv.CLOUDBASE_PUBLISH_KEY || ''),
    'process.env.CLOUDBASE_RESOURCE_APPID': JSON.stringify(tcbEnv.CLOUDBASE_RESOURCE_APPID || ''),
  },
}
```

> **Why defineConstants instead of `.env`?** Taro 的 `.env` 自动加载要求 `TARO_APP_` 前缀，但环境变量名已在平台侧固定为 `CLOUDBASE_*`（与 Web skill 保持一致）。`defineConstants` 在构建时将 `process.env.CLOUDBASE_*` 替换为实际值，源码中不含凭证，复制项目时安全。

### 4. Wrap App with AuthProvider

In `src/app.tsx`:

```typescript
import { AuthProvider } from './lib/AuthContext'

export default function App({ children }) {
  return (
    <AuthProvider>
      {children}
    </AuthProvider>
  )
}
```

## Environment Variables Reference

凭证存储在 `/workspace/.env.tcb`，通过 `defineConstants` 在构建时注入到产物中。变量名与 Web skill 保持一致。

| Variable in `.env.tcb` | Read as in code | Description |
|------------------------|----------------|-------------|
| `CLOUDBASE_ENV_ID` | `process.env.CLOUDBASE_ENV_ID` | TCB environment ID |
| `CLOUDBASE_REGION` | `process.env.CLOUDBASE_REGION` | TCB region (default: `ap-shanghai`) |
| `CLOUDBASE_PUBLISH_KEY` | `process.env.CLOUDBASE_PUBLISH_KEY` | Publishable Key |
| `CLOUDBASE_RESOURCE_APPID` | `process.env.CLOUDBASE_RESOURCE_APPID` | 第三方平台 appid（wx.cloud 跨账号调用） |

> **Security:** 源码中只有 `process.env.CLOUDBASE_*` 引用，不含实际值。`defineConstants` 在 `taro build` 时将其替换为字符串字面量写入产物。复制项目时源码安全；产物上传微信后属于用户自己的小程序。

## Architecture Overview

```
Taro App (React + TCB JS SDK + adapter-taro)
├── WeChat OpenID Login (小程序 only)
│   └── callFunction('mini-app-login') → 云函数 getWXContext() 获取 openid
├── Phone Auth (小程序 only)
│   └── auth.signInWithPhoneAuth({ phoneCode })
├── Email OTP (小程序 + H5)
│   ├── auth.signInWithOtp({ email }) → send code
│   └── verifyOtp({ token: code }) → login/register
├── Email Password (小程序 + H5)
│   └── auth.signInWithPassword({ email, password })
├── AuthContext (user state via useAuth)
└── auth.signOut()
```

### Key Principles

1. **TCB JS SDK v2**: Uses `@cloudbase/js-sdk` v2 API for email/phone auth.
2. **Adapter required**: `@cloudbase/adapter-taro` must be registered via `cloudbase.useAdapters(adapter)` **before** `cloudbase.init()`.
3. **WeChat Login (小程序 only)**: 通过云函数 `mini-app-login` 获取 openid。云函数由 Genie 平台在环境创建时自动部署。批量代云开发模式下 openid 在 `event.userInfo.openId` 中。
4. **Phone Auth (小程序 only)**: `auth.signInWithPhoneAuth({ phoneCode })` — 通过微信手机号快速验证组件获取 phoneCode。
5. **Email login (小程序 + H5)**: `auth.signInWithOtp()` and `auth.signInWithPassword()` are pure TCB SDK calls, work on all platforms.
6. **Credentials via `defineConstants`**: 变量名固定为 `CLOUDBASE_*`（与 Web skill 和 `.env.tcb` 一致），通过 Taro `defineConstants` 在构建时注入。源码中只有 `process.env.CLOUDBASE_*` 引用，不含实际值。
7. **Cloud function auto-deployed**: `mini-app-login` cloud function is deployed by Genie during TCB environment creation. No manual setup needed.
8. **H5 上微信登录按钮不要隐藏**: H5 环境下仍然显示微信登录按钮，点击后弹出提示"请在微信小程序中使用微信登录"。**绝对不要**因为 H5 不支持微信登录就把默认登录方式换成邮箱或其他方式。
9. **Nickname/avatar**: 微信登录是静默登录 — 微信已不再静默返回昵称和头像。如需获取，使用 `<button open-type="getUserInfo">` 或 `<button open-type="chooseAvatar">` UI 组件，然后手动更新 user_metadata。

## CRITICAL: Default Login Behavior

**必须遵守以下规则，AI 不得自行更改默认登录方式：**

1. **默认登录方式永远是微信登录**。即使用户在 H5 环境下预览，也要生成微信登录按钮。
2. **H5 环境点击微信登录时**，使用 `Taro.showToast` 或 UI 弹窗提示用户："请在微信小程序中使用微信登录"。不要替换为邮箱登录。
3. **只有在用户明确要求"手机号登录"时**，才使用手机号登录（微信快速验证 + 降级验证码）。
4. **只有在用户明确要求"邮箱登录"时**，才使用邮箱登录。
5. **不要因为当前是 H5 预览模式就擅自更改登录方式**。小程序的目标平台是微信，H5 只是开发预览。

## Quick Start

### WeChat Login (默认，仅小程序)

```typescript
import { useAuth } from './lib/AuthContext'

// 微信静默登录（无需用户交互）
const { signInWithWechat } = useAuth()
const { isNewUser } = await signInWithWechat()

if (isNewUser) {
  // 首次注册，跳转到资料补充页
  Taro.navigateTo({ url: '/pages/complete-profile/index' })
} else {
  // 老用户，直接进入首页
  Taro.switchTab({ url: '/pages/index/index' })
}
```

> **Note:** 微信登录通过云函数 `mini-app-login` 获取 openid，该云函数由 Genie 自动部署。`isNewUser` 判断依据是云函数返回的用户是否有昵称——没有昵称说明是首次登录。

### Profile Completion (首次登录后补充资料)

微信 2022 年起取消静默获取用户昵称头像。新用户首次登录后需通过 UI 组件让用户主动填写。

```typescript
import { useState } from 'react'
import { View, Text, Input, Button, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useAuth } from '../../lib/AuthContext'

export default function CompleteProfile() {
  const { updateProfile } = useAuth()
  const [nickName, setNickName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')

  // 微信头像选择（小程序专用组件）
  const handleChooseAvatar = (e) => {
    setAvatarUrl(e.detail.avatarUrl)
  }

  const handleSubmit = () => {
    if (!nickName.trim()) {
      Taro.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }
    // 更新本地用户状态
    updateProfile({ nickName: nickName.trim(), avatarUrl })
    // 跳转到首页
    Taro.switchTab({ url: '/pages/index/index' })
  }

  return (
    <View className="complete-profile">
      <Text className="title">完善个人资料</Text>

      {/* 头像选择：使用微信 chooseAvatar 组件 */}
      <Button openType="chooseAvatar" onChooseAvatar={handleChooseAvatar}>
        {avatarUrl
          ? <Image src={avatarUrl} className="avatar" />
          : <Text>点击选择头像</Text>
        }
      </Button>

      {/* 昵称输入：使用微信 nickname 类型自动填充微信昵称 */}
      <Input
        type="nickname"
        placeholder="请输入昵称"
        value={nickName}
        onInput={(e) => setNickName(e.detail.value)}
      />

      <Button type="primary" onClick={handleSubmit}>
        完成
      </Button>
    </View>
  )
}
```

**关键点：**
- `<Button openType="chooseAvatar">` — 微信小程序专用组件，弹出头像选择面板
- `<Input type="nickname">` — 微信小程序专用，自动弹出微信昵称供用户确认/修改
- `updateProfile()` — 更新 AuthContext 中的用户状态并持久化到本地存储
- H5 环境下这两个组件不可用，可降级为普通的文件上传和文本输入

### Phone Auth (手机号登录，仅小程序)

**推荐流程：微信快速验证 → 降级为验证码**

```typescript
const { signInWithPhone, sendPhoneCode, signInWithPhoneOtp } = useAuth()

// 方式一：微信快速获取手机号（用户点击授权按钮）
const handleGetPhoneNumber = async (e) => {
  if (e.detail.code) {
    // 用户同意授权，走微信快速验证
    await signInWithPhone(e.detail.code)
  } else {
    // 用户拒绝授权，降级为手机号验证码登录
    // → 显示手机号输入框 + 验证码输入框
    setShowPhoneInput(true)
  }
}

// 方式二（降级）：手机号验证码登录
const handlePhoneOtpLogin = async (phone: string, code: string) => {
  const verificationInfo = await sendPhoneCode(phone)
  // 用户输入验证码后：
  await signInWithPhoneOtp(phone, code, verificationInfo)
}

// JSX:
// <Button openType="getPhoneNumber" onGetPhoneNumber={handleGetPhoneNumber}>
//   手机号登录
// </Button>
```

### Email OTP Login (小程序 + H5)

```typescript
const { sendEmailCode, signInWithEmail } = useAuth()

// Step 1: 发送验证码
const verificationInfo = await sendEmailCode('user@example.com')

// Step 2: 用户输入验证码后登录（自动注册新用户）
await signInWithEmail('user@example.com', '123456', verificationInfo)
```

### Email Password Login (小程序 + H5)

```typescript
const { signInWithEmailPassword } = useAuth()
await signInWithEmailPassword('user@example.com', 'myPassword123')
```

### Reset Password

```typescript
const { resetPasswordForEmail } = useAuth()

const resetData = await resetPasswordForEmail('user@example.com')
await resetData.updateUser({ nonce: '123456', password: 'newPassword' })
```

### Sign Out

```typescript
const { signOut } = useAuth()
await signOut()
```

### Access User in Page

```typescript
import { useAuth } from '../lib/AuthContext'

export default function Profile() {
  const { user, signOut, loading } = useAuth()

  if (loading) return <View>Loading...</View>
  if (!user) return <View>Please login</View>

  return (
    <View>
      <Image src={user.avatarUrl} />
      <Text>{user.nickName || user.openid}</Text>
      <Button onClick={signOut}>Sign Out</Button>
    </View>
  )
}
```

## Auth Methods Reference

| Method | Code | Platform | Backend Needed? |
|--------|------|----------|-----------------|
| WeChat OpenID Login | `signInWithWechat()` → `{ isNewUser }` | 小程序 only | Cloud function (auto-deployed) |
| Update Profile | `updateProfile({ nickName, avatarUrl })` | All | No |
| Phone Auth (微信快速验证) | `signInWithPhone(phoneCode)` | 小程序 only | No (SDK 内置) |
| Phone Send Code (降级) | `sendPhoneCode(phone)` | 小程序 + H5 | No |
| Phone OTP Login (降级) | `signInWithPhoneOtp(phone, code, info)` | 小程序 + H5 | No |
| Email Send Code | `sendEmailCode(email)` | 小程序 + H5 | No |
| Email OTP Register/Login | `signUpWithEmail()` / `signInWithEmail()` | 小程序 + H5 | No |
| Email Password Login | `signInWithEmailPassword(email, pwd)` | 小程序 + H5 | No |
| Reset Password (forgot) | `resetPasswordForEmail(email)` | 小程序 + H5 | No |
| Change Password (logged in) | `resetPasswordForOld(oldPwd, newPwd)` | 小程序 + H5 | No |
| Sign Out | `signOut()` | All | No |
| Get User | `useAuth().user` | All | No |

## Troubleshooting

### `-105 ERR_NAME_NOT_RESOLVED`

**Cause:** `process.env.CLOUDBASE_ENV_ID` 为空——`config/index.ts` 的 `defineConstants` 未配置或 `/workspace/.env.tcb` 不存在。

**Solution:** 确认 `/workspace/.env.tcb` 包含 `CLOUDBASE_ENV_ID`，`config/index.ts` 的 `defineConstants` 正确读取了该文件，然后重新 `taro build`。

### 微信登录返回「云函数不存在」

**Cause:** `mini-app-login` 云函数未部署。

**Solution:** `mini-app-login` 由 Genie 平台在创建 TCB 环境时自动部署。如果环境是旧版创建的（未包含此函数），需要重新触发环境创建或联系管理员手动部署。

### H5 环境调用微信登录报错

**Cause:** 微信登录依赖小程序环境（`wx.cloud.callFunction`），H5 环境下不可用。

**Solution:** 微信登录只能在小程序真机或开发者工具中使用。如果需要 H5 登录能力，请使用邮箱登录或 `genie-tcb-auth-integrator` skill。

### User Profile Empty After Login

**Cause:** Cloud function failed to return openid.

**Solution:** Check the console log for detailed error. Ensure TCB environment is properly shared with the mini-program (see environment binding docs).

## Security Best Practices

1. **Custom Login Key stays in cloud function** — injected as environment variables by Genie, never exposed to frontend
2. **Session tokens auto-refresh** — TCB JS SDK handles token refresh automatically
3. **Sign out clears session** — `auth.signOut()` removes tokens from storage
4. **Cloud function openid** — `mini-app-login` 获取的 openid 由微信服务器注入，不可伪造

## Resources

- **SDK Files**: `lib/cloudbase.ts`, `lib/auth-context.tsx`
- **Environment Script**: `scripts/ensure-cloudbase-env.sh`
- **TCB Auth API Docs**: https://docs.cloudbase.net/api-reference/webv2/authentication
- **Cloud Function**: `mini-app-login` — auto-deployed by Genie, source at `backend/cmd/api-server/cloud-functions/mini-app-login/`
