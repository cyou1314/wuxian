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

## 桌面版（2026-10-19）

已加入 Electron 桌面入口、原生项目打开/保存、自动恢复、独立 Dola 登录会话，以及 Windows / macOS 安装包构建配置。
开发运行：`npm ci` 后执行 `npm run desktop:dev`。详细说明见 [桌面版文档](docs/desktop.md)。
真实生成和 Windows / macOS 真机验收仍待完成。

## 原有 Web 原型状态

2026-10-18：项目立项，统一方向为 LibTV 形态 × Dola 引擎。Phase 1–6 代码全部完成并推送：
类型契约、7+5 提示词编译器、AutoLink、DAG 调度、Dola 引擎（含多账号额度池与执行器）、
画布 Store（种子：顾长宁×师姐 9 镜分镜表）、8 节点 + 2 边组件、工作台主页面、TV Director、
4 个 OpenAPI 路由。`tsc --noEmit` 零错误，`next build` 一次通过，API 闭环实测通过。
待用户决策：P6 端到端真实生成的执行环境（用户 Mac 家宽 IP / 另行安排）。
