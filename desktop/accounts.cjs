const { BrowserWindow, session } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const DOLA_ORIGIN = 'https://www.dola.com';
const PATHS = new Set(['/samantha/skill/pack', '/chat/completion', '/im/chain/single', '/samantha/video/get_play_info']);
async function createAccounts({ app, handle }) {
  const file = path.join(app.getPath('userData'), 'dola-accounts.json');
  let accounts = [];
  try {
    const data = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!Array.isArray(data) || data.some((a) => !/^[a-f0-9-]{36}$/.test(a.id) || typeof a.label !== 'string')) throw new Error('账号索引损坏');
    accounts = data;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const windows = new Map();
  let pendingWrite = Promise.resolve();
  const persist = () => {
    const json = JSON.stringify(accounts);
    pendingWrite = pendingWrite.catch(() => {}).then(async () => {
      await fs.writeFile(`${file}.tmp`, json, { mode: 0o600 });
      await fs.rename(`${file}.tmp`, file);
    });
    return pendingWrite;
  };
  function accountWindow(id, visible) {
    let win = windows.get(id);
    if (win && !win.isDestroyed()) { if (visible) { win.show(); win.focus(); } return win; }
    const accountSession = session.fromPartition(`persist:dola-${id}`);
    accountSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    win = new BrowserWindow({ width: 1100, height: 820, show: visible, title: 'Dola 账号登录',
      webPreferences: { partition: `persist:dola-${id}`, nodeIntegration: false, contextIsolation: true, sandbox: true },
    });
    windows.set(id, win);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event, url) => { if (!url.startsWith('https://')) event.preventDefault(); });
    win.on('closed', () => windows.delete(id));
    win.loadURL(`${DOLA_ORIGIN}/chat/`).catch(() => {});
    return win;
  }
  handle('dola:accounts', () => accounts.map((a) => ({ ...a })));
  handle('dola:login', async (id, label) => {
    if (id) {
      if (!accounts.some((a) => a.id === id)) throw new Error('账号不存在');
    } else {
      id = randomUUID();
      accounts.push({ id, label: typeof label === 'string' && label.trim() ? label.trim().slice(0, 80) : `Dola ${accounts.length + 1}` });
      await persist();
    }
    accountWindow(id, true);
    return accounts.map((a) => ({ ...a }));
  });
  handle('dola:remove', async (id) => {
    if (!accounts.some((a) => a.id === id)) throw new Error('账号不存在');
    windows.get(id)?.destroy();
    const accountSession = session.fromPartition(`persist:dola-${id}`);
    await accountSession.clearStorageData();
    await accountSession.clearCache();
    accounts = accounts.filter((a) => a.id !== id);
    await persist();
    return accounts.map((a) => ({ ...a }));
  });
  handle('dola:request', async (id, requestPath, body) => {
    if (!accounts.some((a) => a.id === id) || !PATHS.has(requestPath)) throw new Error('账号或生成接口无效');
    if (typeof body !== 'string' || Buffer.byteLength(body) > 1024 * 1024) throw new Error('请求数据无效或过大');
    JSON.parse(body);
    const win = accountWindow(id, false);
    if (win.webContents.isLoading()) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => done(new Error('Dola 页面加载超时，请打开账号登录窗口重试')), 30000);
        const loaded = () => done();
        const failed = (_event, code) => { if (code !== -3) done(new Error('Dola 页面无法加载')); };
        function done(error) {
          clearTimeout(timer);
          win.webContents.removeListener('did-finish-load', loaded);
          win.webContents.removeListener('did-fail-load', failed);
          error ? reject(error) : resolve();
        }
        win.webContents.once('did-finish-load', loaded);
        win.webContents.on('did-fail-load', failed);
      });
    }
    if (new URL(win.webContents.getURL()).origin !== DOLA_ORIGIN) throw new Error('请先在该账号窗口完成 Dola 登录');
    // Only fixed same-origin endpoints; never expose JS execution or cookies to the canvas.
    return win.webContents.executeJavaScript(`(async () => {
      const response = await fetch(${JSON.stringify(requestPath)}, {
        method: 'POST', credentials: 'include', headers: {'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream'},
        body: ${JSON.stringify(body)}, signal: AbortSignal.timeout(60000)
      });
      return {status: response.status, text: await response.text()};
    })()`);
  });
}
module.exports = { createAccounts };
