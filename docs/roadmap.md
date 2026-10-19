# 路线图（2026-10-18 修订：统一方向）

**项目定位（用户已拍板）**：wuxian 画布采用 LibTV 形态（无限画布 + 17 列分镜表 + 7+5 段式提示词），
**Dola 做生成引擎**，多账号额度控制仍是差异化核心。

## 阶段（按 LibTV spec 的 5 Phase + Dola 引擎线）

- [x] **Phase 1**（2026-10-18）：项目骨架（Next.js 15 + TS strict + Tailwind v4）、
      `src/types/libtv-schema.ts`（节点/边/17列分镜表/7+5 AST/OpenAPI/Dola引擎类型）、
      `src/lib/prompt-compiler.ts`（7+5 双向编译器 + {{Image N}} 槽位重写器 + raw 旁路）、
      `src/lib/autolink-engine.ts`（@引用扫描 + 引用边 + 槽位绑定）、
      `src/lib/dag-scheduler.ts`（Kahn 拓扑排序 + stale 级联传播）、
      `src/lib/dola-engine.ts`（Dola 客户端：提交/轮询/取链/额度解析/多账号额度池）。
      `tsc --noEmit` 零错误；7+5 公式 round-trip、AutoLink、拓扑排序运行时验证通过。
- [x] **Phase 2**（2026-10-18）：`src/store/useCanvasStore.ts`（zustand + immer + zundo 50 步历史 +
      IndexedDB 持久化；预置双角色顾长宁×师姐 + 9 镜完整 17 列分镜表 + 分镜/视频节点初始图谱，
      21 节点 29 边；expandStoryboard 行列布局展开、touchNode 级联 stale、autoLinkNode、
      OpenAPI 会话消息均运行时验证通过）
- [x] **Phase 3**（2026-10-18）：8 种自定义节点组件（角色造型室/剧本编辑/17列分镜表/分镜画面/视频生成/图层分离/3D-BOX/智能剪辑）
      + 2 种自定义边（数据流光边/AutoLink 引用边）+ NodeShell 外壳 + useUIStore + useTaskStore 任务队列
- [x] **Phase 4**（2026-10-18）：`src/lib/grid-slicer.ts`（可拖拽分割线裁切数学库）+
      GridSplitterModal（2×2/3×3 拖拽切分 → 批量生成子节点）+ FrameBreakdownModal（四维拉片，store 持久化）+
      DirectorInspectorDrawer（7/5 段 AST 表单与 Raw 双模精修台，应用后级联 stale）
- [x] **Phase 5**（2026-10-18）：InfiniteCanvasWorkbench（视口虚拟化/Minimap/双击建节点/Delete/方向键微调/
      Shift 框选/Ctrl+C/V 复制粘贴/撤销重做/资产抽屉/Dola 账号面板/任务队列/导出）+
      `src/lib/tv-director-agent.ts`（auto/plan 双模式）+ 4 个 OpenAPI 路由（session 创建与追加/
      增量拉取/change-project/文件上传，Bearer 鉴权）。
      `next build` 一次通过；4 路由 + 401 鉴权 + 首页全部实测通过。
- [x] **Phase 6（Dola 引擎线·代码完成）**：`src/lib/dola-executor.ts`（按账号剩余额度 draining 队列：
      选号→提交→轮询→取无水印直链→回写额度），工作台"按额度执行队列"按钮已接线。
      ⏳ 待用户决策后验证：端到端真实生成需在已登录真实页面上下文或家宽出口执行（VM 机房出口会被 710022002 拦截）；
      图片结果回取（draw_result）待一次带响应抓包确认。

## 执行方式（2026-10-19 更新）

产品已确定为 Windows / macOS 桌面软件。桌面版通过独立的 Dola 页面窗口登录，使用每账号隔离的 Chromium 会话；真实生成待在用户电脑上验证。

## 优化记录

- 2026-10-19 优化 #2（a_bogus 签名接入）：把逆向破解的 webmssdk 签名器接进提交链路——
  新增 `src/lib/dola-signer.ts`（Node vm 沙箱直调 `frontierSign`，SDK 切 4 块 vendor 进
  `src/lib/vendor/`（push_files 单参数 128KB 上限），运行时拼接校验一致，多路径回退定位）；`DolaClient` 支持 `signer` 注入，
  写路径（/chat/completion）自动带 a_bogus，读路径不受影响；
  新增 `POST /api/dola/fetch` 服务端代签代理（仅允许 dola.com 域名，cookie 只过内存），
  `TaskQueuePanel` 经 `createProxyFetch` + `clientFactory` 走代理执行
  （浏览器直发会被 CORS/forbidden Cookie header 拦死）。
  验证：`tsc` 零错误，`next build` 通过；签名器离线产出 16 字节 a_bogus（与逆向结论一致）；
  DolaClient 写签/读不签/无 signer 时旧行为三项全过；代理冒烟：非法域名 400、
  skill/pack 透传得 Dola 710012001（鉴权错，链路通）、/chat/completion 代签后得
  STREAM_ERROR 710012001（签名流程无崩溃）。
- 2026-10-19 10:0x **签名服务端接受度验证通过**（Mac 真机，零额度消耗）：在用户 Mac Chrome 的 Dola
  页面控制台注入官方 webmssdk_1.0.0.44（CDN 直链），`frontierSign` 产出 16 字节 X-Bogus
  （与自研 signer 离线输出一致）；带签名发 `POST /chat/completion`（空 body 纯文本探测），
  服务端返回 `STREAM_ERROR 7100202`（参数错）而**不是** `710022002`（签名/IP 拦截）——
  证明家宽 IP + 该签名可通过 Dola 签名关。wuxian 的 `/api/dola/fetch` 代签链路服务端逻辑已就绪，
  待用户在 Mac 本地跑起 wuxian 后做一次真实视频提交闭环。
- 2026-10-18 优化 #1（生成闭环）：DolaTask 新增 `nodeId` 字段（任务 ↔ 发起节点双向绑定）；
  TaskQueuePanel 执行队列成功后自动把无水印直链写回对应视频/分镜节点（未知节点静默跳过，
  失败任务不回写）。`tsc` 零错误，`next build` 通过，回写逻辑运行时验证通过。
- 2026-10-18 用户否决 Wink HD 视频转换器接入（收费原因），此线关闭。

## 历史

- 2026-10-18 P0：立项文档（愿景/Dola链路定稿/架构/路线图），commit e1177e73
- 2026-10-18：用户拍板统一方向（LibTV 形态 × Dola 引擎），Phase 1 开工

## 桌面版推进（2026-10-19）

- [x] Electron 主程序与隔离 preload，内置 Next.js standalone 本地服务。
- [x] 原生项目打开/保存/另存为、文件菜单快捷键、自动恢复、任务中断恢复。
- [x] 多账号独立 Chromium 登录会话与限定接口的页面执行通道。
- [x] Windows NSIS / macOS Intel 与 ARM DMG、ZIP 配置和 CI 构建矩阵。
- [ ] Windows / macOS 真机安装与 Dola 真实生成验收。
- [ ] 图片结果回取、额度跨日刷新与持久化、离线媒体归档。
- [ ] 正式签名、公证、应用图标、自动更新。

实现与运行说明见 [desktop.md](desktop.md)。
