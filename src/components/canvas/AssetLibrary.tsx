"use client";
import { useState } from 'react';
import { useCanvasStore } from '@/store/useCanvasStore';
import { useTaskStore } from '@/store/useTaskStore';
import { historyAssets,nodeName } from '@/lib/studio';
import type { StudioAsset } from '@/lib/studio-types';
import StudioIcon from '../ui/StudioIcon';
export default function AssetLibrary({onClose,onLocate,onPick,onUpload,historyOnly=false}:{onClose:()=>void;onLocate:(id:string)=>void;onPick:(asset:StudioAsset)=>void;onUpload:()=>void;historyOnly?:boolean}) {
 const nodes=useCanvasStore(s=>s.graph.nodes),assets=useCanvasStore(s=>s.assets??[]);useTaskStore(s=>s.tasks);
 const [tab,setTab]=useState<'canvas'|'assets'>(historyOnly?'assets':'canvas'),[query,setQuery]=useState(''),[kind,setKind]=useState<'image'|'video'|'audio'>('image'),[categories,setCategories]=useState(false);
 const all=[...assets,...historyAssets()].filter((a,i,arr)=>arr.findIndex(b=>b.url===a.url)===i).filter(a=>(!historyOnly||a.source==='generated')&&a.kind===kind&&a.name.includes(query));
 const remove=(a:StudioAsset)=>{if(!window.confirm('从本地资产库移除？画布上的素材引用和源文件会保留。'))return;useCanvasStore.setState(s=>({assets:(s.assets??[]).filter(x=>x.id!==a.id)}));if(a.source==='generated')useTaskStore.getState().removeTask(a.id.replace(/^generated-/,''));};
 return <aside className="wx-panel wx-asset-library" aria-label={historyOnly?'生成历史':'资产库'}><div className="wx-panel-title"><h2>{historyOnly?'生成历史':'资产库'}</h2><button onClick={onClose} aria-label="关闭资产库">×</button></div>
 <div className="wx-tabs"><button aria-pressed={tab==='canvas'} onClick={()=>setTab('canvas')}>画布</button><button aria-pressed={tab==='assets'} onClick={()=>setTab('assets')}>资产</button></div>
 <input className="wx-input" aria-label="搜索画布或资产" autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索节点或资产" />
 {tab==='canvas'?<div className="wx-library-list">{nodes.filter(n=>nodeName(n).includes(query)).map(n=><div key={n.id} className="wx-library-row"><button onClick={()=>onLocate(n.id)} title="定位到节点"><StudioIcon name={n.type}/><span>{nodeName(n)}</span></button><details><summary aria-label={`更多操作 ${nodeName(n)}`}>···</summary><div className="wx-row-actions"><button onClick={()=>{const label=window.prompt('节点名称',nodeName(n));if(label?.trim())useCanvasStore.getState().upsertNode({...n,label:label.trim().slice(0,100)});}}>重命名</button><button onClick={()=>{if(window.confirm(`删除“${nodeName(n)}”？`))useCanvasStore.getState().removeNodes([n.id]);}}>删除</button></div></details></div>)}{!nodes.length&&<p className="wx-empty-copy">画布暂无节点</p>}</div>:<>
 <div className="wx-tabs">{(['image','video','audio'] as const).map(k=><button key={k} aria-pressed={kind===k} onClick={()=>setKind(k)}>{k==='image'?'图片':k==='video'?'视频':'音频'}</button>)}</div>
 {kind==='audio'?<p className="wx-empty-copy">音频资产即将支持；当前不提供音频生成。</p>:<div className="wx-asset-grid">{all.map(a=><div key={a.id} className="wx-asset-card"><button onClick={()=>onPick(a)} title="在画布中心创建节点">{a.kind==='image'?<img src={a.url} alt={a.name}/>:<video src={a.url} preload="metadata" muted/>}<span>{a.name}</span><small>{a.source==='generated'?'生成':a.source==='local'?'本地处理':'上传'}</small></button><button className="wx-asset-remove" onClick={()=>remove(a)} aria-label={`移除资产 ${a.name}`}>×</button></div>)}</div>}
 {kind!=='audio'&&!all.length&&<div className="wx-empty-copy"><p>暂无资产</p>{!categories&&<button onClick={()=>setCategories(true)}>创建默认资产分类</button>}{categories&&<p>已创建图片 / 视频分类</p>}<button className="wx-primary" onClick={onUpload}>上传资产</button></div>}
 <button className="wx-button mt-3" onClick={onUpload}>上传图片 / 视频</button></>}
 <p className="wx-footnote">资产索引随 .wuxian 项目保存。上传素材仅保存在本机。</p></aside>;
}
