const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');
// Pure graph transformations and protocol fixtures, without a store, browser or provider connection.
function load(relative){const source=fs.readFileSync(path.join(__dirname,'..',relative),'utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const exports={};new Function('require','exports',code)(()=>({}),exports);return exports;}
const {duplicateGraph,groupGraph}=load('src/lib/studio.ts');
test('duplicating connected nodes remaps edges, groups, character ownership and clears generation task ownership',()=>{
 const graph={nodes:[{id:'r',type:'roleStudio',position:{x:0,y:0},data:{kind:'roleStudio',characterId:'c',views:{}}},{id:'v',type:'videoGen',position:{x:400,y:0},data:{kind:'videoGen',shotNo:'1',dolaTaskId:'job'}},{id:'g',type:'group',position:{x:0,y:0},data:{kind:'group',memberIds:['r','v']}}],edges:[{id:'e',type:'dataflow',source:'r',target:'v'}]};const chars=[{id:'c',name:'角色',roleNodeId:'r'}];
 const original=structuredClone(graph);const result=duplicateGraph(graph,chars,['g']);assert.deepEqual(graph,original);assert.equal(result.graph.nodes.length,6);const copies=result.graph.nodes.slice(3);assert.equal(new Set(result.graph.nodes.map(n=>n.id)).size,6);const r=copies.find(n=>n.type==='roleStudio'),v=copies.find(n=>n.type==='videoGen'),g=copies.find(n=>n.type==='group');
 assert.equal(result.graph.edges[1].source,r.id);assert.equal(result.graph.edges[1].target,v.id);assert.deepEqual(g.data.memberIds.sort(),[r.id,v.id].sort());assert.equal(v.data.dolaTaskId,undefined);assert.notEqual(r.data.characterId,'c');assert.equal(result.characters.at(-1).roleNodeId,r.id);assert.equal(v.position.x,448);
});
test('group, merge groups and ungroup retain member nodes and existing dataflow edges',()=>{
 const graph={nodes:['a','b','c'].map((id,i)=>({id,type:'text',position:{x:i*400,y:0},data:{kind:'text',text:id}})),edges:[{id:'e',type:'dataflow',source:'a',target:'b'}]};
 const grouped=groupGraph(graph,['a','b']);const first=grouped.nodes.find(n=>n.type==='group');assert.ok(first.width>700);const merged=groupGraph(grouped,[first.id,'c']);assert.equal(merged.nodes.filter(n=>n.type==='group').length,1);const group=merged.nodes.find(n=>n.type==='group');assert.deepEqual(group.data.memberIds.sort(),['a','b','c']);assert.deepEqual(groupGraph(merged,[group.id],true),graph);assert.throws(()=>groupGraph(graph,['a']),/至少/);
});
const {parseChatResponse}=load('src/lib/engines/dola.ts');
test('text response fixture handles cumulative SSE blocks and refuses unrecognized payloads',()=>{
 const event=text=>'data: '+JSON.stringify({message:{content_block:[{content:{text_block:{text}}}]}})+'\n';assert.equal(parseChatResponse(event('你好')+event('你好，导演')+'data: [DONE]\n'),'你好，导演');assert.throws(()=>parseChatResponse('data: {"code":401}'),/未返回/);
});
