const fs = require('node:fs/promises');
const path = require('node:path');
module.exports = async function verifyDesktopPackage(context) {
  const resources = context.electronPlatformName === 'darwin'
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources');
  const web = path.join(resources, 'web');
  // electron-builder excludes a mapping's root node_modules. Keep this check
  // so future resource filter changes cannot silently ship an unbootable app.
  for (const relative of ['server.js', 'node_modules/next/dist/server/lib/start-server.js', 'node_modules/react/package.json', '.next/BUILD_ID', '.next/static']) {
    await fs.access(path.join(web, relative));
  }
};
