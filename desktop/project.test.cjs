const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { validateProject, readProject, writeProject } = require('./project.cjs');
const fixture = () => ({ format: 'wuxian-project', version: 1,
  canvas: { graph: { nodes: [{ id: 'shot-1', type: 'smartClip', position: { x: 20, y: 30 }, data: { kind: 'smartClip', sourceVideoNodeIds: [], bgmCuePoints: [], trimSilence: true, subtitles: true } }], edges: [] },
    characters: [], storyboardRows: [], sessions: [], activeSessionId: null, breakdowns: {} }, tasks: [],
});
test('concurrent recovery writes keep the latest complete project and survive reopening', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wuxian-'));
  try {
    const file = path.join(dir, '项目.wuxian');
    const projects = Array.from({ length: 12 }, (_, index) => {
      const project = fixture(); project.canvas.graph.nodes[0].position.x = index; return project;
    });
    await Promise.all(projects.map((project) => writeProject(file, project)));
    assert.deepEqual(await readProject(file), projects.at(-1));
    assert.deepEqual(await fs.readdir(dir), ['项目.wuxian']);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test('invalid imports cannot overwrite an existing project', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wuxian-'));
  try {
    const file = path.join(dir, 'project.wuxian');
    await writeProject(file, fixture());
    const invalid = fixture(); invalid.canvas.graph.edges.push({ id: 'edge', source: 'shot-1', target: 'missing' });
    assert.throws(() => writeProject(file, invalid), /连线/);
    assert.deepEqual(await readProject(file), fixture());
    assert.throws(() => validateProject({ ...fixture(), version: 99 }), /版本/);
    const duplicates = fixture(); duplicates.canvas.graph.nodes.push(duplicates.canvas.graph.nodes[0]);
    assert.throws(() => validateProject(duplicates), /重复/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test('malformed files are reported rather than silently replaced', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wuxian-'));
  try {
    const file = path.join(dir, 'broken.wuxian');
    await fs.writeFile(file, '{broken');
    await assert.rejects(readProject(file), SyntaxError);
    assert.equal(await fs.readFile(file, 'utf8'), '{broken');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
