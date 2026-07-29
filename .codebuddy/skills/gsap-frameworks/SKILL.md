---
name: gsap-frameworks
description: GSAP 在通用前端框架中的生命周期与作用域规范（适用于 Vue / Nuxt / Svelte 等）。Genie 项目固定 React 技术栈，正常情况下用户不会进入此 skill，仅当用户**明确**要求使用非 React 框架（如 Vue / Svelte）且环境支持时才使用；React 项目一律使用 gsap-react skill。
license: MIT
---

> **来源**：[greensock/gsap-skills](https://github.com/greensock/gsap-skills)（MIT License, Copyright (c) 2026 GreenSock）。
> **裁剪说明**：原 skill 包含 Vue 3 / Nuxt 4 / Svelte 三类框架的 GSAP 用法。Genie web 模板固定 **Vite + React 19**，与 Vue/Svelte 不兼容，因此本副本**已删除原 Vue / Nuxt / Svelte 完整示例正文**，仅保留通用原则（创建时机、作用域、清理）。
> - React 项目请直接使用 [`gsap-react`](../gsap-react/SKILL.md) skill。
> - 如确有需要在非 React 环境查看原文，请访问上游：<https://github.com/greensock/gsap-skills/blob/main/skills/gsap-frameworks/SKILL.md>

# GSAP 在组件框架中的通用原则（Vue / Svelte / 其它）

## 何时使用本 Skill

**Genie 默认场景下不应触发本 skill。** 仅当用户明确放弃 Genie 的 React 模板、转而搭建 Vue / Svelte 项目时才参考。React 项目请使用 **gsap-react** skill。

## 框架无关的通用原则

无论在哪个组件框架中使用 GSAP，都必须遵守以下三条原则：

1. **挂载后再创建**：在组件 DOM 可用之后（如 `onMounted` / `onMount` / `useEffect`）创建 tween 和 ScrollTrigger，不要在组件 setup 顶层的同步代码里创建。
2. **卸载时清理**：在组件卸载（`onUnmounted` / Svelte 的 onMount cleanup / React 的 useEffect cleanup）时调用 `ctx.revert()`，避免在已分离节点上执行动画或泄漏 ScrollTrigger。
3. **作用域选择器**：始终把组件根元素作为 `gsap.context(callback, scope)` 的第二个参数，让 `.box` 这类选择器仅匹配当前组件内部，不影响页面其它实例。

```javascript
// 通用模式（伪代码，请按目标框架替换生命周期 hook）
let ctx;
onMounted(() => {
  ctx = gsap.context(() => {
    gsap.to(".box", { x: 100 });
  }, containerEl); // ← scope 必填
});
onUnmounted(() => ctx?.revert());
```

## 在 React 中

请使用 **gsap-react** skill，它提供了 `useGSAP` hook、`contextSafe` 等 React 专属封装，比手写 `useEffect + gsap.context` 更省心。

## 参考

- React 用法：见 `gsap-react` skill
- 上游完整 Vue / Nuxt / Svelte 示例：<https://github.com/greensock/gsap-skills/blob/main/skills/gsap-frameworks/SKILL.md>
