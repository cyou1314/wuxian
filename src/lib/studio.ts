import { useCanvasStore } from '@/store/useCanvasStore';
import { useTaskStore } from '@/store/useTaskStore';
import type { CanvasNode, CanvasNodeData, CanvasGraph, CharacterAsset, LibTVNodeType, Vec2 } from '@/types/libtv-schema';
import type { StudioAsset } from './studio-types';
export const uid = (prefix='node') => `${prefix}-${crypto.randomUUID()}`;
export function nodeName(n: CanvasNode): string { return n.label || ({roleStudio:'角色',scriptEditor:'剧本',storyboardTable:'分镜表',shotImage:'图片',videoGen:'视频',layerSplit:'图层',threeDBox:'3D 预演',smartClip:'剪辑',text:'文本',director:'导演台',group:'分组'}[n.type]) + ('shotNo' in n.data ? ` #${n.data.shotNo}` : ''); }
export function blankData(type: LibTVNodeType): CanvasNodeData {
 switch(type) {
 case 'text': return {kind:type,text:''};
 case 'director': return {kind:type,messages:[]};
 case 'group': return {kind:type,memberIds:[]};
 case 'roleStudio': return {kind:type,characterId:'',views:{}};
 case 'scriptEditor': return {kind:type,original:'',adapted:'',conflicts:[],foreshadows:[]};
 case 'storyboardTable': return {kind:type,rows:[],approved:false};
 case 'shotImage': return {kind:type,shotNo:'新',previewSize:{w:2752,h:1536},rawPrompt:false,referenceSlots:{},imagePromptAST:{composition:{shotSize:'',angle:''},character:'',spatialRelation:'',microExpression:'',environment:'',lighting:'',style:{artStyle:'',focalLength:'',aperture:''}}};
 case 'videoGen': return {kind:type,shotNo:'新',engine:'dola',rawPrompt:false,reshootRanges:[],motionAST:{cameraMove:'',subjectAction:'',envDynamics:'',audio:'',duration:''}};
 case 'layerSplit': return {kind:type,sourceImageUrl:'',layers:[]};
 case 'threeDBox': return {kind:type,sceneJson:'{}',cameraMoves:[]};
 case 'smartClip': return {kind:type,sourceVideoNodeIds:[],trimSilence:true,subtitles:true,bgmCuePoints:[]};
 }
}
export function insertNode(type: LibTVNodeType, position: Vec2, patch: Record<string,unknown> = {}): CanvasNode {
 const s=useCanvasStore.getState(); const id=uid(); let data=blankData(type);
 if(type==='roleStudio') { const charId=uid('char'); s.upsertCharacter({id:charId,name:`新角色${s.characters.length+1}`,age:'',hairstyle:'',outfit:'',props:'',facial:'',aura:'',views:{},roleNodeId:id}); data={kind:type,characterId:charId,views:{}}; }
 const node={id,type,position,data:{...data,...patch} as CanvasNodeData,stale:false}; s.upsertNode(node); return node;
}
export function rememberAsset(asset: StudioAsset) { useCanvasStore.setState(s=>({assets:[...(s.assets??[]).filter(a=>a.id!==asset.id),asset]})); }
export function historyAssets(): StudioAsset[] { return useTaskStore.getState().tasks.flatMap(t=>{ const url=t.kind==='video'?t.playUrl:t.imageUrl; return t.status==='succeeded'&&url ? [{id:`generated-${t.id}`,name:`${t.kind==='video'?'视频':'图片'} · ${new Date(t.createdAt).toLocaleString()}`,kind:t.kind,url,source:'generated' as const,createdAt:t.createdAt}] : []; }); }
export function insertAsset(asset: StudioAsset, position: Vec2) { return insertNode(asset.kind==='image'?'shotImage':'videoGen',position,asset.kind==='image'?{imageUrl:asset.url}:{videoUrl:asset.url}); }
export function duplicateGraph(graph:CanvasGraph, characters:CharacterAsset[], ids:string[], offset:Vec2={x:48,y:48}) {
 const selected=new Set(ids); for(const n of graph.nodes) if(selected.has(n.id)&&n.data.kind==='group') n.data.memberIds.forEach(id=>selected.add(id));
 const map=new Map([...selected].map(id=>[id,uid()])); const nextCharacters=[...characters];
 const copies=graph.nodes.filter(n=>selected.has(n.id)).map(n=>{const copy=structuredClone(n); copy.id=map.get(n.id)!;copy.position={x:n.position.x+offset.x,y:n.position.y+offset.y};copy.label=`${nodeName(n)} 副本`; if(copy.data.kind==='group') copy.data.memberIds=copy.data.memberIds.flatMap(id=>map.has(id)?[map.get(id)!]:[]);
 if(copy.data.kind==='roleStudio'){const characterId=copy.data.characterId;const original=characters.find(c=>c.id===characterId);if(original){const c={...structuredClone(original),id:uid('char'),roleNodeId:copy.id,name:`${original.name} 副本`}; nextCharacters.push(c);copy.data.characterId=c.id;}}
 if(copy.data.kind==='videoGen') { delete copy.data.dolaTaskId; }
 if(copy.data.kind==='shotImage'&&copy.data.rowRef&&map.has(copy.data.rowRef.tableNodeId)) copy.data.rowRef.tableNodeId=map.get(copy.data.rowRef.tableNodeId)!;
 return copy;});
 const edges=graph.edges.filter(e=>selected.has(e.source)&&selected.has(e.target)).map(e=>({...e,id:uid('edge'),source:map.get(e.source)!,target:map.get(e.target)!}));
 return {graph:{nodes:[...graph.nodes,...copies],edges:[...graph.edges,...edges]},characters:nextCharacters};
}
export function groupGraph(graph:CanvasGraph, ids:string[], ungroup=false):CanvasGraph {
 const selected=graph.nodes.filter(n=>ids.includes(n.id)); const groups=selected.filter(n=>n.data.kind==='group');
 if(ungroup) return {...graph,nodes:graph.nodes.filter(n=>!groups.some(g=>g.id===n.id)),edges:graph.edges.filter(e=>!groups.some(g=>g.id===e.source||g.id===e.target))};
 const members=new Set(selected.flatMap(n=>n.data.kind==='group'?n.data.memberIds:[n.id]));const nodes=graph.nodes.filter(n=>members.has(n.id)&&n.type!=='group');if(nodes.length<2) throw new Error('请至少选中两个节点');
 const x=Math.min(...nodes.map(n=>n.position.x))-30,y=Math.min(...nodes.map(n=>n.position.y))-50;
 const width=Math.max(...nodes.map(n=>n.position.x+(n.width??380)))-x+30,height=Math.max(...nodes.map(n=>n.position.y+(n.height??320)))-y+30;
 return {nodes:[{id:uid('group'),type:'group',label:'分组',position:{x,y},width,height,data:{kind:'group',memberIds:[...members]},stale:false},...graph.nodes.filter(n=>!groups.some(g=>g.id===n.id))],edges:graph.edges.filter(e=>!groups.some(g=>g.id===e.source||g.id===e.target))};
}
/** Keep local group envelopes around their existing members after arrange or move. */
export function refreshGroups(graph:CanvasGraph):CanvasGraph {
 return {...graph,nodes:graph.nodes.map(n=>{if(n.data.kind!=='group')return n;const memberIds=n.data.memberIds;const members=graph.nodes.filter(m=>memberIds.includes(m.id)&&m.type!=='group');if(!members.length)return n;
 const x=Math.min(...members.map(m=>m.position.x))-30,y=Math.min(...members.map(m=>m.position.y))-50;
 return {...n,position:{x,y},width:Math.max(...members.map(m=>m.position.x+(m.width??380)))-x+30,height:Math.max(...members.map(m=>m.position.y+(m.height??320)))-y+30};})};
}
