# Xan macOS

Xan 使用 Electron 与 Next.js standalone，默认空白画布。节点标题、参数卡、菜单、连线与各面板共用深灰/青色设计系统。

## 本机构建与安装

需要 Node.js 22.12+、npm；在 macOS 仓库根目录执行：

```sh
bash scripts/test-mac.command
```

应用安装到 `~/deck/Xan.app`，数据在 `~/Library/Application Support/Xan`。
保持 `.wuxian` 项目兼容；已有项目会恢复，不会因为默认空白设置被自动清除。
图标复用 Deck 图标。构建脚本使用本机 ad-hoc 签名，不代表 Developer ID 签名或 Apple 公证。

## 检查

```sh
npm run typecheck
npm run test:desktop
npm run desktop:prepare
npm run test:desktop:smoke
```

macOS arm64 已验证生产构建、空白初始工作区、添加角色、自动恢复、原生打开/保存、重启恢复与 IPC 校验。
Dola 代理与桌面会话集成保持上游实现。真实登录、生成、额度、下载与其他系统仍需分别验收。
