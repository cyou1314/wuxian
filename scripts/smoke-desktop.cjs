const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
async function run(directory, phase) {
  return new Promise((resolve, reject) => {
    const child = spawn(require('electron'), [path.join(__dirname, '..', 'desktop', 'smoke.cjs')], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, WUXIAN_SMOKE_DIR: directory, WUXIAN_SMOKE_PHASE: phase },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const collect = (data) => { output = (output + data).slice(-16000); };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0 && output.includes(`PASS desktop ${phase}`)) { console.log(`PASS desktop ${phase}`); resolve(); }
      else reject(new Error(`Desktop ${phase} failed (${code}):\n${output}`));
    });
  });
}
(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wuxian-desktop-test-'));
  try { await run(directory, 'edit'); await run(directory, 'restore'); }
  finally { await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
