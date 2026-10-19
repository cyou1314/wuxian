#!/bin/bash
# Build and install an isolated local test app on the user's Mac.
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$TASK_ROOT"
if [ "$(uname -s)" != "Darwin" ]; then
  printf '此脚本只能在 macOS 上运行。\n' >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  printf '需要先安装 Node.js 22.12 或更新版本：https://nodejs.org/\n' >&2
  exit 1
fi
node -e 'const [major,minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 12)) { console.error("需要 Node.js 22.12 或更新版本"); process.exit(1); }'
TASK_ARCH="$(node -p 'process.arch')"
case "$TASK_ARCH" in
  arm64|x64) ;;
  *) printf '暂不支持此 Node.js 架构：%s\n' "$TASK_ARCH" >&2; exit 1 ;;
esac
printf '正在为 macOS %s 构建测试版，首次运行需要下载依赖。\n' "$TASK_ARCH"
npm ci
npm run test:desktop
npm run desktop:prepare
npm run test:desktop:smoke
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --dir --"$TASK_ARCH" --publish never
if [ "$TASK_ARCH" = "arm64" ]; then
  TASK_APP="$TASK_ROOT/release/mac-arm64/无限画布.app"
else
  TASK_APP="$TASK_ROOT/release/mac/无限画布.app"
fi
if [ ! -d "$TASK_APP" ]; then
  printf '未找到构建产物：%s\n' "$TASK_APP" >&2
  exit 1
fi
TASK_APPLICATIONS="$HOME/Applications"
TASK_DEST="$TASK_APPLICATIONS/无限画布测试版.app"
TASK_STAGE="$TASK_APPLICATIONS/.wuxian-test-install-$$.app"
mkdir -p "$TASK_APPLICATIONS"
if /usr/bin/pgrep -f "$TASK_DEST/Contents/MacOS/" >/dev/null 2>&1; then
  printf '请先退出正在运行的无限画布测试版，再重新执行脚本。\n' >&2
  exit 1
fi
/usr/bin/ditto "$TASK_APP" "$TASK_STAGE"
if [ -e "$TASK_DEST" ]; then
  TASK_BACKUP="$TASK_APPLICATIONS/无限画布测试版-备份-$(date +%Y%m%d-%H%M%S)-$$.app"
  mv "$TASK_DEST" "$TASK_BACKUP"
  printf '旧测试版已保留：%s\n' "$TASK_BACKUP"
fi
mv "$TASK_STAGE" "$TASK_DEST"
/usr/bin/open "$TASK_DEST"
printf '\n已安装并打开：%s\n' "$TASK_DEST"
printf '请验证画布编辑、保存与重启恢复，再从账号面板登录 Dola。\n'
printf '这是本机构建的测试版，尚未完成正式签名和公证。\n'
