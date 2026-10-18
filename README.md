# wuxian（无限画布）

支持 Dola 的 AI 创作画布：把 REA 逆向确认的 Dola 服务端链路装进节点式画布，
账号 / Cookie 双登录，多账号以「额度控制」为核心做调度。

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

2026-10-18：项目立项，文档先行。P1 开发待形态确认（Web / Electron）。
