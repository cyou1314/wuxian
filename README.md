# wuxian（无限画布工作台）

LibTV 形态 × Dola 生成引擎 × 多账号额度控制。

把 REA 逆向确认的 Dola 服务端链路装进 LibTV 式无限画布：
节点式工作流（17 列分镜表 + 7+5 段式提示词编译），账号 / Cookie 双登录，
多账号以「额度控制」为核心做调度（每账号剩余额度跟踪、按额度分配任务）。

## 定位

- 对标 Deck（Electron）的 30 秒、无水印、多账号能力，用画布形态重做
- 差异点：多账号不止于"能切号"，核心是**每个账号的额度跟踪与调度控制**

## 功能

- 画布：节点式工作流（视频 / 图片生成节点），React Flow
- 登录：Dola 账号登录 + Cookie 登录
- 多账号额度控制：剩余额度跟踪、任务按额度调度、日限额与告警
- 30 秒视频：duration 直传 30
- 无水印：get_play_info 原文件直链下载

## 硬约束（逆向结论，如实记录）

- Dola 写入接口（`/chat/completion`）在机房出口被 `710022002` 拦截（a_bogus 签名强制）；
  只读接口（`/samantha/skill/pack`）可直调
- 提交必须走**已登录真实页面上下文**（Electron webview / 真实浏览器）或家宽出口
- 不做账号批量注册、不绕过验证 / 风控（硬边界）

## 文档

- `docs/dola-api-chain.md` — Dola 接口链路定稿（REA 逆向成果）
- `docs/architecture.md` — 架构设计
- `docs/roadmap.md` — 路线图

## 状态

2026-10-18：项目立项，统一方向为 LibTV 形态 × Dola 引擎。Phase 1 已完成并推送：
项目骨架 + 类型契约 + prompt-compiler + autolink-engine + dag-scheduler + dola-engine，
`tsc --noEmit` 零错误。下一步 Phase 2（画布 Store）。
