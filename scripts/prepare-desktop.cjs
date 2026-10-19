const fs = require('node:fs/promises');
const path = require('node:path');
(async () => {
  const root = path.join(__dirname, '..');
  if (require('../package.json').version !== require('../desktop/package.json').version) throw new Error('请同步根目录与 desktop/package.json 的版本号');
  const dest = path.join(root, '.next', 'standalone');
  await fs.access(path.join(dest, 'server.js'));
  await fs.cp(path.join(root, '.next', 'static'), path.join(dest, '.next', 'static'), { recursive: true });
  await fs.cp(path.join(root, 'public'), path.join(dest, 'public'), { recursive: true, filter: (source) => !source.split(path.sep).includes('uploads') });
  await fs.rm(path.join(dest, 'public', 'uploads'), { recursive: true, force: true });
  // Never ship local API data, account state or build caches in the installer.
  await fs.rm(path.join(dest, '.data'), { recursive: true, force: true });
  console.log('桌面 Web 资源已就绪');
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
