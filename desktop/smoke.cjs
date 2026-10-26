// Runs the actual Electron main/preload/renderer against an isolated user-data directory.
const { app, dialog } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
if (!process.env.WUXIAN_SMOKE_DIR) throw new Error('WUXIAN_SMOKE_DIR is required');
app.setPath('userData', path.resolve(process.env.WUXIAN_SMOKE_DIR));
if (process.env.WUXIAN_SMOKE_HEADLESS === '1') app.commandLine.appendSwitch('ozone-platform', 'headless');
app.disableHardwareAcceleration();
const projectFile = path.join(app.getPath('userData'), 'native-save.wuxian');
dialog.showSaveDialog = async () => ({ canceled: false, filePath: projectFile });
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [projectFile] });
const timeout = setTimeout(() => { console.error('Desktop smoke timed out'); process.exit(1); }, 90000);
app.on('browser-window-created', (_event, win) => {
  win.webContents.on('render-process-gone', (_e, details) => { console.error(details.reason); process.exit(1); });
  win.webContents.on('console-message', (_event, details) => { if (details.level === 'error') console.error('renderer:', details.message); });
  win.webContents.once('did-finish-load', async () => {
    try {
      const run = (js) => win.webContents.executeJavaScript(js);
      let ready = false;
      for (let i = 0; i < 150; i++) {
        ready = await run(`Boolean(window.wuxianDesktop && [...document.querySelectorAll('button')].some(b => b.textContent.includes('新建角色')))`);
        if (ready) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.ok(ready, 'canvas and preload should load');
      const platform = await run('window.wuxianDesktop.platform');
      assert.equal(platform, process.platform);
      assert.equal(await run('typeof require'), 'undefined', 'renderer must not have Node access');
      const png='iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGPQ2PEAiBggFAAuLgcBzaRnYAAAAABJRU5ErkJggg==';
      const waitFor=async(check,message)=>{for(let i=0;i<100;i++){if(await check())return;await new Promise(r=>setTimeout(r,100));}throw new Error(message);};
      const click=label=>{console.log('UI step:',label);return run(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim().replace(/\\+$/,'')===${JSON.stringify(label)}).click()`);};
      if (process.env.WUXIAN_SMOKE_PHASE !== 'restore') {
        let initial;
        for (let i = 0; i < 100; i++) {
          initial = await run('window.wuxianDesktop.loadRecovery()');
          if (initial) break;
          await new Promise((r) => setTimeout(r, 100));
        }
        assert.ok(initial, 'fresh empty workspace must be saved');
        assert.deepEqual(initial.canvas.graph, { nodes: [], edges: [] });
        assert.equal(initial.canvas.characters.length, 0);
        assert.equal(initial.canvas.storyboardRows.length, 0);
        assert.equal(initial.tasks.length, 0);
        await run(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('新建角色')).click()`);
      }
      let project;
      for (let i = 0; i < 100; i++) {
        project = await run('window.wuxianDesktop.loadRecovery()');
        if (project?.canvas.characters.some((c) => c.name === '新角色1')) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.ok(project?.canvas.characters.some((c) => c.name === '新角色1'), 'new character must be saved/restored');
      if(process.env.WUXIAN_SMOKE_PHASE!=='restore') {
        await run(`document.querySelector('[aria-label="添加节点"]').click()`);
        await click('文本');
        await waitFor(()=>run(`Boolean(document.querySelector('[aria-label="文本内容"]'))`),'text node should render');
        await run(`(()=>{const el=document.querySelector('[aria-label="文本内容"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'本地验收：文本保存与复制');el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
        await run(`document.querySelector('[aria-label="文本内容"]').blur();document.querySelector('[tabindex="0"]').focus()`);
        await waitFor(async()=>{const p=await run('window.wuxianDesktop.loadRecovery()');return p.canvas.graph.nodes.some(n=>n.data.text==='本地验收：文本保存与复制');},'text edits should autosave');
        await run(`document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true}))`);
        assert.ok(await run(`Boolean(document.querySelector('[role="dialog"][aria-label="添加节点"]'))`),'Tab opens add menu');
        await run(`document.querySelector('[aria-label="关闭添加节点"]').click()`);
        const uploaded=await run(`(async()=>{const bytes=Uint8Array.from(atob('${png}'),c=>c.charCodeAt(0));const result=await window.wuxianDesktop.upload({name:'test.png',type:'image/png',bytes:bytes.buffer});const response=await fetch(result.url);return {keys:Object.keys(result),ok:response.ok,mime:response.headers.get('content-type')};})()`);
        assert.deepEqual(uploaded,{keys:['url'],ok:true,mime:'image/png'});
        assert.equal(await run(`fetch('/api/dola/sign',{method:'POST'}).then(r=>r.status)`),401,'signer must require private main-process authentication');
        assert.equal(await run(`fetch('/api/openapi/file/upload',{method:'POST'}).then(r=>r.status)`),401,'upload API requires auth');
        await assert.rejects(run(`window.wuxianDesktop.upload({name:'bad.txt',type:'text/plain',bytes:new ArrayBuffer(1)})`),/仅支持/);
        await run(`(()=>{const data=new DataTransfer();data.items.add(new File([Uint8Array.from(atob('${png}'),c=>c.charCodeAt(0))],'drop.png',{type:'image/png'}));document.querySelector('.react-flow__pane').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data,clientX:700,clientY:350}));})()`);
        await waitFor(async()=>{const p=await run('window.wuxianDesktop.loadRecovery()');return p.canvas.assets.length===1&&p.canvas.graph.nodes.length===3;},'file drop creates uploaded image node and asset');
        await click('资产库');await click('资产');
        await waitFor(()=>run(`document.querySelector('.wx-asset-card img')?.naturalWidth>0`),'uploaded image must decode and display in the asset library');
        await run(`document.querySelector('.wx-asset-card > button').click()`);
        await waitFor(async()=>{const p=await run('window.wuxianDesktop.loadRecovery()');return p.canvas.graph.nodes.length===4;},'asset click creates image node');
        await run(`document.querySelector('[aria-label="关闭资产库"]').click();document.querySelector('[aria-label="API 管理器"]').click()`);
        assert.ok(await run(`document.querySelector('.wx-engine-manager').textContent.includes('Dola')`));await click('添加 API');
        assert.ok(await run(`Boolean(document.querySelector('.wx-engine-manager select'))`));
        await click('导演助手');await waitFor(()=>run(`Boolean(document.querySelector('.wx-director-sidebar textarea'))`),'director sidebar should open');
        assert.ok(await run(`document.querySelector('.wx-director-sidebar').textContent.includes('可能消耗额度')`));
        // No chat or provider endpoint is called in this local-only acceptance.
        project=await run('window.wuxianDesktop.loadRecovery()');
        await waitFor(async()=>{project=await run('window.wuxianDesktop.loadRecovery()');return project.canvas.graph.nodes.length===5;},'director node should persist');
      }
      if(process.env.WUXIAN_SMOKE_PHASE!=='restore') {
        await run(`document.querySelector('[aria-label="添加节点"]').click()`);await click('智能剪辑');
        await waitFor(async()=>{const p=await run('window.wuxianDesktop.loadRecovery()');return p.canvas.graph.nodes.length===6;},'smart clip must render and persist without a client crash');
        assert.ok(await run(`Boolean(document.querySelector('.react-flow'))`),'smart clip should not trigger unstable selector loop');
        await run(`document.querySelector('[aria-label="添加节点"]').click()`);await click('视频生成');
        await waitFor(async()=>{project=await run('window.wuxianDesktop.loadRecovery()');return project.canvas.graph.nodes.length===7;},'video node should persist');
        assert.ok(await run(`Boolean(document.querySelector('.react-flow'))`));
        await run(`document.querySelector('.react-flow__node-videoGen').click()`);
        await waitFor(()=>run(`Boolean(document.querySelector('.react-flow__node-videoGen.selected'))`),'video selection should settle');
        await run(`document.querySelector('.react-flow__node-videoGen').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true,cancelable:true}))`);
        await waitFor(()=>run(`/请先在账号面板|无可用账号/.test(document.querySelector('.wx-parameters')?.textContent??'')`),'Ctrl Enter should reach generation check before React Flow toggles selection');
        assert.ok(await run(`Boolean(document.querySelector('.react-flow__node-videoGen.selected'))`));
        // Upload real local MP4 through the chooser, extract a decoded frame and split audio/video.
        const ffmpeg=path.join(__dirname,'bin','ffmpeg');const videoFixture=path.join(app.getPath('userData'),'fixture.mp4');
        require('node:child_process').execFileSync(ffmpeg,['-v','error','-f','lavfi','-i','color=c=blue:s=320x180:r=24:d=1','-f','lavfi','-i','sine=frequency=440:duration=1','-c:v','libx264','-c:a','aac','-shortest',videoFixture]);
        const videoBase64=(await require('node:fs/promises').readFile(videoFixture)).toString('base64');
        await run(`(()=>{const original=HTMLInputElement.prototype.click;HTMLInputElement.prototype.click=function(){if(this.type!=='file')return original.call(this);const video=this.accept.includes('video');const data=new DataTransfer();data.items.add(new File([Uint8Array.from(atob(video?${JSON.stringify(videoBase64)}:'${png}'),c=>c.charCodeAt(0))],video?'fixture.mp4':'reference.png',{type:video?'video/mp4':'image/png'}));this.files=data.files;this.dispatchEvent(new Event('change',{bubbles:true}));};})()`);
        await click('替换视频');
        await waitFor(async()=>{const p=await run('window.wuxianDesktop.loadRecovery()');return p.canvas.graph.nodes.some(n=>n.type==='videoGen'&&n.data.videoUrl);},'replace video should persist uploaded URL');
        await click('首帧');
        await waitFor(async()=>{const p=await run('window.wuxianDesktop.loadRecovery()');return p.canvas.assets.length===3&&p.canvas.graph.nodes.length===8;},'decoded first frame should become a real image asset and node');
        await click('音视频分离');
        await waitFor(async()=>{const p=await run('window.wuxianDesktop.loadRecovery()');return p.canvas.assets.length===4&&p.canvas.graph.nodes.length===9;},'FFmpeg IPC split should create output video asset and node');
        await run(`document.querySelector('.react-flow__node-shotImage').click()`);
        await waitFor(()=>run(`Boolean(document.querySelector('.wx-parameters button'))`),'image parameter panel should open');
        await run(`[...document.querySelectorAll('.wx-parameters button')].find(b=>b.textContent.trim()==='上传').click()`);
        await waitFor(async()=>{const p=await run('window.wuxianDesktop.loadRecovery()');return p.canvas.assets.length===5&&p.canvas.graph.nodes.some(n=>n.type==='shotImage'&&n.data.referenceSlots.image1);},'reference slot chooser should upload and persist binding');
        project=await run('window.wuxianDesktop.loadRecovery()');

      }
      assert.equal(project.canvas.graph.nodes.length, 9);
      assert.equal(project.canvas.assets.length, 5);
      assert.ok(project.canvas.graph.nodes.some(n=>n.data.kind==='text'&&n.data.text==='本地验收：文本保存与复制'));
      assert.ok(project.canvas.graph.nodes.some(n=>n.type==='director'));

      assert.equal(project.canvas.characters.length, 1);
      if(process.env.WUXIAN_SMOKE_PHASE!=='restore') {
        const downloaded=path.join(app.getPath('userData'),'native-download.png');
        win.webContents.session.once('will-download',(_e,item)=>item.setSavePath(downloaded));
        await run(`window.wuxianDesktop.downloadMedia(${JSON.stringify(project.canvas.assets[0].url)})`);
        await waitFor(async()=>{try{return (await require('node:fs/promises').stat(downloaded)).size>0;}catch{return false;}},'native media download should complete');
        await assert.rejects(run(`window.wuxianDesktop.downloadMedia('file:///etc/passwd')`),/不支持/);
        const shareFile=path.join(app.getPath('userData'),'shared.wuxian');
        win.webContents.session.once('will-download',(_e,item)=>item.setSavePath(shareFile));
        await click('分享 .wuxian');await waitFor(async()=>{try{await require('./project.cjs').readProject(shareFile);return true;}catch{return false;}},'share download should be valid project');
        const shared=await require('./project.cjs').readProject(shareFile);assert.ok(shared.canvas.assets[0].url.startsWith('data:image/png;base64,'),'shared uploads should be embedded');
        assert.ok(shared.canvas.graph.nodes.filter(n=>n.data.kind==='shotImage').every(n=>n.data.imageUrl.startsWith('data:image/png;base64,')));
      }
      await run(`document.querySelector('.react-flow__node-videoGen').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:500,clientY:300}))`);
      assert.ok(await run(`document.querySelector('.wx-context-menu')?.textContent.includes('上传素材')`),'node right-click should use the same custom menu as the pane');
      const saved = await run('(async () => window.wuxianDesktop.saveProject(await window.wuxianDesktop.loadRecovery(), true))()');
      assert.equal(saved, 'native-save.wuxian');
      assert.deepEqual(await run('window.wuxianDesktop.openProject()'), project);
      await assert.rejects(run(`window.wuxianDesktop.request('unknown-account', '/chat/completion', '{}')`), /无效/);
      console.log(`PASS desktop ${process.env.WUXIAN_SMOKE_PHASE || 'edit'}: canvas, empty startup, text editing, Tab menu, authenticated upload, file drop, assets, director/API UI, restart recovery, native save/open, IPC validation; NO Dola calls`);
      clearTimeout(timeout);
      await run('(async () => { const p = await window.wuxianDesktop.loadRecovery(); await window.wuxianDesktop.close(p); })()');
    } catch (error) {
      clearTimeout(timeout); console.error(error); process.exit(1);
    }
  });
});
require('./main.cjs');
