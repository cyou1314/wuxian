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
      assert.equal(project.canvas.graph.nodes.length, 1);
      assert.equal(project.canvas.characters.length, 1);
      const saved = await run('(async () => window.wuxianDesktop.saveProject(await window.wuxianDesktop.loadRecovery(), true))()');
      assert.equal(saved, 'native-save.wuxian');
      assert.deepEqual(await run('window.wuxianDesktop.openProject()'), project);
      await assert.rejects(run(`window.wuxianDesktop.request('unknown-account', '/chat/completion', '{}')`), /无效/);
      console.log(`PASS desktop ${process.env.WUXIAN_SMOKE_PHASE || 'edit'}: canvas, isolated preload, empty startup, created node, recovery, native save/open, IPC validation`);
      clearTimeout(timeout);
      await run('(async () => { const p = await window.wuxianDesktop.loadRecovery(); await window.wuxianDesktop.close(p); })()');
    } catch (error) {
      clearTimeout(timeout); console.error(error); process.exit(1);
    }
  });
});
require('./main.cjs');
