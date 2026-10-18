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
- [ ] **Phase 3**：8 种自定义节点组件 + 2 种自定义边组件（@xyflow/react v12）
- [ ] **Phase 4**：GridSplitterModal（可拖拽分割线宫格切分）、FrameBreakdownModal（四维拉片）、
      DirectorInspectorDrawer（AST/Raw 双模精修台）
- [ ] **Phase 5**：InfiniteCanvasWorkbench 主页面 + `/api/openapi/*` 4 个后端路由
      （session 创建/增量拉取/change-project/文件上传），画布交互与 API 闭环验证
- [ ] **Phase 6（Dola 引擎线）**：executor 真实页面上下文通道打通（Electron webview 或真实浏览器），
      端到端视频生成验证（需用户确认消耗一次额度）；图片 ability_param 内层 schema 抓包确认

## 待用户决策

1. P6 端到端验证的执行环境：用户 Mac（家宽 IP、已有 Dola 登录态）/ 另行安排
2. 账号登录（豆包账号体系）走 OAuth 还是 Cookie 复用——当前按 Cookie 登录优先实现

## 历史

- 2026-10-18 P0：立项文档（愿景/Dola链路定稿/架构/路线图），commit e1177e73
- 2026-10-18：用户拍板统一方向（LibTV 形态 × Dola 引擎），Phase 1 开工
