const { app, BrowserWindow, dialog, ipcMain, Menu, shell, utilityProcess } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const net = require('node:net');
const http = require('node:http');
const { randomBytes } = require('node:crypto');
const { readProject, writeProject } = require('./project.cjs');
const { createAccounts } = require('./accounts.cjs');

let window;
let server;
let origin;
let currentFile = null;
let closing = false;
let rendererReady = false;
const recoveryFile = () => path.join(app.getPath('userData'), 'workspace.wuxian');

function handle(channel, callback) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!window || event.sender !== window.webContents ||
        event.senderFrame !== window.webContents.mainFrame ||
        (new URL(event.senderFrame.url).origin !== origin || new URL(event.senderFrame.url).pathname !== '/')) throw new Error('拒绝未知页面访问桌面接口');
    return callback(...args);
  });
}
async function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => { const port = s.address().port; s.close(() => resolve(port)); });
  });
}
async function waitForServer(url) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (!server) throw new Error('画布服务已退出');
    const ready = await new Promise((resolve) => {
      const req = http.get(url, (res) => { res.resume(); resolve(res.statusCode === 200); });
      req.on('error', () => resolve(false));
      req.setTimeout(1000, () => req.destroy());
    });
    if (ready) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('画布服务启动超时');
}
async function startServer() {
  const port = await freePort();
  const root = app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(__dirname, '..', '.next', 'standalone');
  await fs.access(path.join(root, 'server.js')).catch(() => { throw new Error('请先执行 npm run desktop:prepare'); });
  origin = `http://127.0.0.1:${port}`;
  server = utilityProcess.fork(path.join(root, 'server.js'), [], {
    cwd: app.getPath('userData'),
    env: { ...process.env, NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: String(port),
      WUXIAN_DATA_DIR: path.join(app.getPath('userData'), 'server-data'),
      LIBTV_ACCESS_KEY: randomBytes(32).toString('hex'), NEXT_TELEMETRY_DISABLED: '1' },
    stdio: 'pipe',
  });
  // Drain output without logging user content or credentials.
  server.stdout?.on('data', () => {});
  server.stderr?.on('data', () => {});
  server.on('exit', () => {
    server = null;
    if (window && !closing) dialog.showErrorBox('画布服务已停止', '请关闭并重新打开软件。本地恢复文件会保留。');
  });
  await waitForServer(origin);
}
function command(name) { if (rendererReady) window?.webContents.send('desktop:command', name); }
function installMenu() {
  const mac = process.platform === 'darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(mac ? [{ role: 'appMenu' }] : []),
    { label: '文件', submenu: [
      { label: '打开项目…', accelerator: 'CmdOrCtrl+O', click: () => command('open') },
      { label: '保存项目', accelerator: 'CmdOrCtrl+S', click: () => command('save') },
      { label: '另存为…', accelerator: 'CmdOrCtrl+Shift+S', click: () => command('saveAs') },
      { type: 'separator' }, { role: mac ? 'close' : 'quit' },
    ] },
    { role: 'editMenu' },
    { label: '视图', submenu: [{ role: 'togglefullscreen' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }] },
    { role: 'windowMenu' },
  ]));
}
async function createWindow() {
  rendererReady = false;
  window = new BrowserWindow({ width: 1440, height: 960, minWidth: 1050, minHeight: 700,
    title: 'Xan', backgroundColor: '#0b0d12', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== origin || new URL(url).pathname !== '/') event.preventDefault();
  });
  window.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  window.webContents.on('render-process-gone', () => { rendererReady = false; });
  window.on('close', (event) => {
    if (closing || !rendererReady) return;
    event.preventDefault();
    // The renderer supplies its latest state; the main process writes it before closing.
    command('close');
  });
  window.on('closed', () => { window = null; });
  await window.loadURL(origin);
  window.show();
}
function registerProjects() {
  handle('desktop:ready', () => { rendererReady = true; });
  handle('project:recovery', async () => {
    try { return await readProject(recoveryFile()); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  });
  handle('project:autosave', (project) => writeProject(recoveryFile(), project));
  handle('project:open', async () => {
    const result = await dialog.showOpenDialog(window, { properties: ['openFile'], filters: [{ name: 'Xan项目', extensions: ['wuxian'] }] });
    if (result.canceled) return null;
    const project = await readProject(result.filePaths[0]);
    await writeProject(recoveryFile(), project);
    currentFile = result.filePaths[0];
    window.setTitle(`Xan — ${path.basename(currentFile)}`);
    return project;
  });
  handle('project:save', async (project, saveAs) => {
    let target = currentFile;
    if (!target || saveAs) {
      const result = await dialog.showSaveDialog(window, { defaultPath: target || '未命名.wuxian', filters: [{ name: 'Xan项目', extensions: ['wuxian'] }] });
      if (result.canceled) return null;
      target = result.filePath;
    }
    await writeProject(target, project);
    currentFile = target;
    window.setTitle(`Xan — ${path.basename(target)}`);
    return path.basename(target);
  });
  handle('project:close', async (project) => {
    await writeProject(recoveryFile(), project);
    closing = true;
    window.destroy();
    app.quit();
  });
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { window?.show(); window?.focus(); });
  app.whenReady().then(async () => {
    await fs.mkdir(app.getPath('userData'), { recursive: true });
    await startServer();
    registerProjects();
    await createAccounts({ app, handle });
    installMenu();
    await createWindow();
    app.on('activate', () => { if (!window) void createWindow(); });
  }).catch((error) => { dialog.showErrorBox('Xan启动失败', error.message); app.quit(); });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => { closing = true; server?.kill(); });
}
