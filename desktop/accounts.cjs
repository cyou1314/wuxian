const { BrowserWindow, session } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { registerWebGeneration } = require('./web-generation.cjs');

const DOLA_ORIGIN = 'https://www.dola.com';
const PATHS = new Set(['/samantha/skill/pack', '/chat/completion', '/im/chain/single', '/samantha/video/get_play_info']);
function authWindowUrl(value) { try { const url=new URL(value); return url.protocol==='https:' || url.href==='about:blank'; } catch { return false; } }
function browserUserAgent(value) { return value.replace(/\b(?:Electron|Xan|wuxian)\/[\w.-]+\s?/gi, ''); }
function protocolShape(value, key='', depth=0) {
  if(depth>10)return '[depth]';if(/cookie|token|authorization|secret/i.test(key))return '[redacted]';
  if(key==='ability_param'&&typeof value==='string'){try{return {serialized:protocolShape(JSON.parse(value),'',depth+1)};}catch{return '[string]';}}
  if(Array.isArray(value))return value.slice(0,2).map(v=>protocolShape(v,'',depth+1));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,protocolShape(v,k,depth+1)]));
  if(value===null||typeof value==='boolean')return value;
  if(['model','duration','ratio','style','ability_type','skill_type','block_type','type','message_type'].includes(key))return value;
  return `[${typeof value}]`;
}
async function createAccounts({ app, handle, signRequest }) {
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
    // Keep Chromium's real version and omit app-specific tokens for browser compatibility.
    accountSession.setUserAgent(browserUserAgent(accountSession.getUserAgent()));
    // Diagnostic schema only: never store headers, URL values, text, IDs or credentials.
    accountSession.webRequest.onBeforeRequest({urls:[`${DOLA_ORIGIN}/chat/completion*`]},(details,callback)=>{
      try {const bytes=Buffer.concat((details.uploadData??[]).flatMap(x=>x.bytes?[x.bytes]:[]));const url=new URL(details.url);
        const shape={queryKeys:[...url.searchParams.keys()],body:protocolShape(JSON.parse(bytes.toString()))};
        void fs.writeFile(path.join(app.getPath('userData'),'dola-request-shape.json'),JSON.stringify(shape,null,2),{mode:0o600}).catch(()=>{});
      }catch{}callback({});
    });
    accountSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    win = new BrowserWindow({ width: 1100, height: 820, show: visible, title: 'Dola 账号登录',
      webPreferences: { partition: `persist:dola-${id}`, nodeIntegration: false, contextIsolation: true, sandbox: true },
    });
    windows.set(id, win);
    const configureAuthWindow = (target) => {
      target.webContents.setWindowOpenHandler(({ url }) => {
        if(!authWindowUrl(url)) return {action:'deny'};
        return {action:'allow',overrideBrowserWindowOptions:{width:620,height:800,parent:win,autoHideMenuBar:true,
          webPreferences:{partition:`persist:dola-${id}`,nodeIntegration:false,contextIsolation:true,sandbox:true}}};
      });
      target.webContents.on('did-create-window', (child) => configureAuthWindow(child));
      target.webContents.on('will-navigate', (event, url) => { if(!url.startsWith('https://')) event.preventDefault(); });
    };
    configureAuthWindow(win);
    win.webContents.on('did-fail-load', (_event, code, _description, _url, mainFrame) => {
      if(mainFrame && code!==-3) win.setTitle(`Dola 页面加载失败（${code}）· 请关闭窗口后重新打开`);
    });
    win.on('closed', () => windows.delete(id));
    win.loadURL(`${DOLA_ORIGIN}/chat/`).catch(error => { if(error.code!==-3 && !String(error.message).includes('ERR_ABORTED') && !win.isDestroyed()) win.setTitle('Dola 页面无法加载 · 请关闭窗口后重新打开'); });
    return win;
  }
  registerWebGeneration({app,handle,accountWindow,accounts:()=>accounts});
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
    let target=`${DOLA_ORIGIN}${requestPath}`;
    if(requestPath==='/chat/completion') {
      try {
        const present=await win.webContents.executeJavaScript(`Boolean(window.byted_acrawler?.frontierSign)`);
        if(!present) {
          const root=app.isPackaged?path.join(process.resourcesPath,'web'):path.join(__dirname,'..');
          const parts=await Promise.all(Array.from({length:4},(_,i)=>fs.readFile(path.join(root,'src/lib/vendor',`webmssdk_1.0.0.44.part${i}.js`),'utf8')));
          await win.webContents.executeJavaScript(parts.join(''));
        }
        target=await win.webContents.executeJavaScript(`(()=>{const url=${JSON.stringify(target)};const result=window.byted_acrawler.frontierSign(url);const signature=result['X-Bogus']||result.a_bogus;if(!signature)throw new Error('页面签名为空');return url+'?a_bogus='+encodeURIComponent(signature);})()`);
      }catch { target=await signRequest(requestPath); }
    }
    const targetUrl = new URL(target);
    if(targetUrl.origin!==DOLA_ORIGIN || targetUrl.pathname!==requestPath) throw new Error('签名地址无效');
    // Only fixed same-origin endpoints; never expose JS execution or cookies to the canvas.
    return win.webContents.executeJavaScript(`(async () => {
      const response = await fetch(${JSON.stringify(target)}, {
        method: 'POST', credentials: 'include', headers: {'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream'},
        body: ${JSON.stringify(body)}, signal: AbortSignal.timeout(60000)
      });
      return {status: response.status, text: await response.text()};
    })()`);
  });
}
module.exports = { createAccounts, authWindowUrl, browserUserAgent, protocolShape };
