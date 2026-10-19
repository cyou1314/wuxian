const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const MAX = 50 * 1024 * 1024;
function localName(url, origin) {
  const u = new URL(url, origin);
  const name = u.searchParams.get('name');
  if (u.origin !== origin || u.pathname !== '/api/openapi/file/upload' || !name || !/^[a-zA-Z0-9._-]+$/.test(name) || name.includes('..')) throw new Error('请选择本机上传的视频；远程生成视频请先下载并上传');
  return name;
}
function run(binary, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(binary, ['-hide_banner','-loglevel','error','-nostdin','-n',...args], { windowsHide: true });
    p.stderr.on('data', () => {});
    const timer = setTimeout(() => { p.kill(); reject(new Error('本地处理超时，请缩短片段')); }, 180000);
    p.on('error', () => { clearTimeout(timer); reject(new Error('FFmpeg 无法启动')); });
    p.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`本地媒体处理失败（${code}），请检查视频是否包含所需音视频轨道`)); });
  });
}
function finite(v, min, max) { if (!Number.isFinite(v) || v < min || v > max) throw new Error('剪辑参数超出范围'); return v; }
function createMedia({ app, handle, origin, accessKey }) {
  const uploads = path.join(app.getPath('userData'), 'server-data', 'uploads');
  const binary = path.join(app.isPackaged ? path.join(process.resourcesPath,'media') : path.join(__dirname,'bin'), process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  const available = async () => !!(await fs.stat(binary).catch(() => null))?.isFile();
  handle('asset:upload', async (file) => {
    if (!file || typeof file.name !== 'string' || !/^(image\/(png|jpeg|webp|gif)|video\/(mp4|webm|quicktime))$/.test(file.type)) throw new Error('仅支持 PNG/JPG/WebP/GIF 和 MP4/WebM/MOV');
    const bytes = Buffer.from(file.bytes);
    if (!bytes.length || bytes.length > MAX) throw new Error('上传文件不能为空或超过 50MB');
    const form = new FormData(); form.set('file', new Blob([bytes], {type:file.type}), file.name);
    const response = await fetch(`${origin}/api/openapi/file/upload`, { method:'POST', headers:{Authorization:`Bearer ${accessKey}`}, body:form });
    const result = await response.json();
    if (!response.ok || !result.data?.url) throw new Error('本机上传失败，请稍后重试');
    return {url: result.data.url};
  });
  handle('media:capabilities', async () => ({ ffmpeg: await available() }));
  let busy = false;
  handle('media:process', async (request) => {
    if (!await available()) throw new Error('缺少 FFmpeg，请配置后重新构建桌面版');
    if (busy) throw new Error('已有本地媒体任务正在处理，请稍候');
    if (!request || !['split','trim','crop','concat'].includes(request.operation) || !Array.isArray(request.urls) || !request.urls.length || request.urls.length > 12) throw new Error('媒体操作无效');
    const outputs = []; const written = [];
    busy = true;
    try {
      const inputs = request.urls.map((u) => path.join(uploads, localName(u, origin)));
      for (const file of inputs) await fs.access(file);
      const output = async (extension, kind, args) => {
        const name = `local-${randomUUID()}${extension}`; const dest = path.join(uploads,name); written.push(dest);
        await run(binary,[...args,dest]);
        if ((await fs.stat(dest)).size === 0) throw new Error('媒体输出为空');
        outputs.push({name,kind,url:`/api/openapi/file/upload?name=${encodeURIComponent(name)}`});
      };
      if (request.operation === 'split') {
        await output('.m4a','audio',['-i',inputs[0],'-vn','-c:a','aac']);
        await output('.mp4','video',['-i',inputs[0],'-an','-c:v','copy']);
      } else if (request.operation === 'trim') {
        const start = finite(request.start,0,86400); const end = finite(request.end,start+.05,86400);
        await output('.mp4','video',['-i',inputs[0],'-ss',String(start),'-t',String(end-start),'-c:v','libx264','-c:a','aac']);
      } else if (request.operation === 'crop') {
        const values = ['width','height','x','y'].map((key,i) => Math.floor(finite(request[key],i<2?2:0,16384)));
        await output('.mp4','video',['-i',inputs[0],'-vf',`crop=${values.join(':')}`,'-c:v','libx264','-c:a','aac']);
      } else {
        const listFile = path.join(uploads,`concat-${randomUUID()}.txt`);
        try {
          await fs.writeFile(listFile,inputs.map((input) => `file '${input.replace(/'/g,"'\\''")}'`).join('\n'),{mode:0o600});
          await output('.mp4','video',['-f','concat','-safe','0','-i',listFile,'-c:v','libx264','-c:a','aac']);
        } finally { await fs.rm(listFile,{force:true}); }
      }
      return outputs;
    } catch (e) { for (const file of written) await fs.rm(file,{force:true}); throw e; }
    finally { busy = false; }
  });
}
module.exports = { createMedia, localName, finite };
