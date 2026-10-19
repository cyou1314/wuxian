# Windows / macOS 桌面版

桌面版采用 Electron + Next.js standalone。安装后内置本地服务，不要求用户安装 Node.js，也不依赖开发服务器。画布和现有 Web 版本共享源码。

## 开发与打包

需要 Node.js 22.12+ 和 npm。

```sh
npm ci
npm run desktop:dev
```

`desktop:dev` 会先构建前端资源、下载匹配的 Electron 运行时，再启动桌面窗口。只修改主程序时，可用 `npm run desktop:start` 直接启动上次构建。

在目标系统生成安装包：

```sh
npm run desktop:dist -- --win --x64 --publish never
npm run desktop:dist -- --mac --arm64 --publish never
npm run desktop:dist -- --mac --x64 --publish never
```

Windows 使用 NSIS 安装包，macOS 使用 DMG / ZIP，输出在 `release/`。macOS Intel 和 Apple Silicon 分别构建，Next.js 的原生依赖需要与运行架构匹配，不能把 Linux 构建资源直接打入其他平台。

`.github/workflows/desktop.yml` 可手动运行，也可通过 `v*` 标签触发，在 Windows、macOS Intel、macOS ARM 各自构建、运行桌面冒烟并上传制品。工作流仅生成未签名测试包，不会发布 release。

## 项目文件与恢复

- 底部工具栏或文件菜单可打开、保存和另存为 `.wuxian` 文件。
- Windows 使用 Ctrl+O / Ctrl+S / Ctrl+Shift+S；macOS 使用 Cmd 对应组合。
- 文件包含画布、角色、分镜、拉片笔记、会话和任务；不包含账号凭证。
- 本地自动恢复文件位于 Electron 的 `userData` 目录：Windows 通常为 `%APPDATA%/无限画布`，macOS 通常为 `~/Library/Application Support/无限画布`（开发模式目录名为 `wuxian`）。
- 每次修改写入 `workspace.wuxian`，使用串行临时文件替换，退出前再次保存最新快照。自动恢复只保留最近工作区；需要保留多个项目时使用“保存/另存为”。
- 重启后，未完成的提交、轮询和生成任务会标记为中断，不自动重提，以免重复消耗额度。请先到 Dola 确认结果。
- 本轮采用版本化 JSON 项目文件，而非 SQLite。项目上限 50 MB，超过时会显示保存错误。角色上传图以 data URL 随项目保存；外部媒体 URL 仍依赖原地址，尚未做离线媒体归档。

## Dola 账号与执行

添加账号会打开独立登录窗口，用户在 Dola 页面自行登录。账号使用独立的持久化 Chromium session；画布不读取、导出或手动注入 Cookie。账号索引只保存随机 ID 与备注，移除账号会清除对应的本机会话和缓存。

执行器通过该账号的页面上下文请求限定的 Dola 接口，再把结果交给现有任务队列。主程序只向可信的本地画布主框架提供受限 IPC；账号窗口不加载应用 preload。额度仍按响应解析，仅在当前运行期间跟踪，尚未做跨日自动刷新或跨重启额度持久化。

这条通道解决了前端手动设置 Cookie 和跨域的问题，但不会绕过平台验证。Dola 登录、页面签名和真实生成还需要在用户 Windows / Mac 网络环境中验证。图片结果回取仍未实现。

## 验证与发布边界

```sh
npm run typecheck
npm run test:desktop
npm run desktop:prepare
```

Linux 图形环境可运行实际 Electron 冒烟验证（使用独立临时用户目录）：

```sh
npm run test:desktop:smoke
```

冒烟覆盖真实画布加载、preload 隔离、编辑后自动保存、重启恢复、原生文件 IPC 保存/打开和无效账号请求拒绝；不会访问 Dola。

当前 Linux 环境已验证真实 Electron 启动、编辑与重启恢复，以及解包后的独立程序启动；Windows / macOS 工作流尚未执行。

正式分发前仍需完成 Windows / macOS 真机验收、应用图标、Windows 代码签名、macOS Developer ID 签名与公证。自动更新尚未接入。仓库的 macOS entitlement 已启用 JIT，正式签名配置需要结合签名证书验证。
