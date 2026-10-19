const fs = require('node:fs/promises');
const path = require('node:path');

const MAX_BYTES = 50 * 1024 * 1024;
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const strings = (v, keys) => object(v) && keys.every((k) => typeof v[k] === 'string');
const list = (v, check) => Array.isArray(v) && v.every(check);
const row = (v) => strings(v, ['shotNo', 'description', 'char1Name', 'char1Desc', 'char1Image', 'char2Name', 'char2Desc', 'char2Image', 'reference', 'shotSize', 'emotion', 'lighting', 'sfx', 'dialogue', 'imagePrompt', 'videoMotionPrompt']) && Number.isFinite(v.duration);
function validNodeData(type, d) {
  switch (type) {
    case 'roleStudio': return strings(d, ['characterId']) && object(d.views);
    case 'scriptEditor': return strings(d, ['original', 'adapted']) && list(d.conflicts, (x) => strings(x, ['id', 'before', 'after'])) && list(d.foreshadows, (x) => strings(x, ['id', 'text']));
    case 'storyboardTable': return list(d.rows, row) && typeof d.approved === 'boolean';
    case 'shotImage': return strings(d, ['shotNo']) && object(d.referenceSlots) && typeof d.rawPrompt === 'boolean' &&
      strings(d.imagePromptAST, ['character', 'spatialRelation', 'microExpression', 'environment', 'lighting']) &&
      strings(d.imagePromptAST.composition, ['shotSize', 'angle']) && strings(d.imagePromptAST.style, ['artStyle', 'focalLength', 'aperture']);
    case 'videoGen': return strings(d, ['shotNo']) && typeof d.rawPrompt === 'boolean' &&
      strings(d.motionAST, ['cameraMove', 'subjectAction', 'envDynamics', 'audio', 'duration']) &&
      list(d.reshootRanges, (x) => Number.isFinite(x?.startMs) && Number.isFinite(x?.endMs));
    case 'layerSplit': return strings(d, ['sourceImageUrl']) && list(d.layers, (x) => strings(x, ['id', 'kind', 'label']) && ['x', 'y', 'scale', 'depth'].every((k) => Number.isFinite(x.transform?.[k])));
    case 'threeDBox': return strings(d, ['sceneJson']) && list(d.cameraMoves, (x) => strings(x, ['id', 'type']) && Number.isFinite(x.durationMs) && [x.from?.x, x.from?.y, x.to?.x, x.to?.y].every(Number.isFinite));
    case 'smartClip': return list(d.sourceVideoNodeIds, (x) => typeof x === 'string') && list(d.bgmCuePoints, Number.isFinite) && typeof d.trimSilence === 'boolean' && typeof d.subtitles === 'boolean';
    default: return false;
  }
}
function validateProject(value) {
  if (!value || value.format !== 'wuxian-project' || value.version !== 1) {
    throw new Error('不是支持的无限画布项目文件（版本 1）');
  }
  const s = value.canvas;
  if (!s || !Array.isArray(s.graph?.nodes) || !Array.isArray(s.graph?.edges) ||
      !Array.isArray(s.characters) || !Array.isArray(s.storyboardRows) ||
      !Array.isArray(s.sessions) || !s.breakdowns || typeof s.breakdowns !== 'object' ||
      !(s.activeSessionId === null || typeof s.activeSessionId === 'string') || !Array.isArray(value.tasks)) {
    throw new Error('项目数据不完整');
  }
  if (!list(s.characters, (c) => strings(c, ['id', 'name', 'age', 'hairstyle', 'outfit', 'props', 'facial', 'aura']) && object(c.views)) ||
      !list(s.storyboardRows, row) || !list(s.sessions, (session) => strings(session, ['sessionId', 'projectUuid']) &&
        Number.isFinite(session.nextSeq) && list(session.messages, (m) => strings(m, ['role', 'content']) && Number.isFinite(m.seq))) ||
      !Object.values(s.breakdowns).every((notes) => ['narrative', 'camera', 'action', 'audio'].every((k) => list(notes?.[k], (n) => strings(n, ['id', 'text']) && Number.isFinite(n.timeMs))))) {
    throw new Error('项目角色、分镜、会话或拉片数据无效');
  }
  const kinds = new Set(['roleStudio', 'scriptEditor', 'storyboardTable', 'shotImage', 'videoGen', 'layerSplit', 'threeDBox', 'smartClip']);
  const ids = new Set();
  for (const n of s.graph.nodes) {
    if (!n || typeof n.id !== 'string' || ids.has(n.id) || !kinds.has(n.type) ||
        n.data?.kind !== n.type || !Number.isFinite(n.position?.x) || !Number.isFinite(n.position?.y)) {
      throw new Error('项目含无效或重复节点');
    }
    if (!validNodeData(n.type, n.data)) throw new Error('项目节点内容不完整');
    ids.add(n.id);
  }
  for (const e of s.graph.edges) {
    if (!e || typeof e.id !== 'string' || !['dataflow', 'autolink'].includes(e.type) || !ids.has(e.source) || !ids.has(e.target)) {
      throw new Error('项目含无效连线');
    }
  }
  for (const t of value.tasks) {
    if (!t || typeof t.id !== 'string' || !['image', 'video'].includes(t.kind) ||
        typeof t.prompt !== 'string' || !['queued', 'submitting', 'polling', 'generating', 'succeeded', 'failed'].includes(t.status)) {
      throw new Error('项目含无效任务');
    }
  }
  return value;
}
async function readProject(file) {
  if ((await fs.stat(file)).size > MAX_BYTES) throw new Error('项目文件超过 50 MB');
  return validateProject(JSON.parse(await fs.readFile(file, 'utf8')));
}
// A single write chain also prevents autosave and explicit save from racing.
let writes = Promise.resolve();
function writeProject(file, value) {
  validateProject(value);
  const json = JSON.stringify(value);
  if (Buffer.byteLength(json) > MAX_BYTES) throw new Error('项目文件超过 50 MB');
  const operation = writes.catch(() => {}).then(async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, json, { mode: 0o600 });
    await fs.rename(tmp, file);
  });
  writes = operation;
  return operation;
}
module.exports = { validateProject, readProject, writeProject };
