"use client";
import {useRef,useState} from 'react';
import {useCanvasStore} from '@/store/useCanvasStore';
import {captureVideoFrame,uploadAsset} from '@/lib/studio-upload';
import {insertAsset} from '@/lib/studio';
import type {StudioAsset} from '@/lib/studio-types';
export default function FrameExtractor({id,url}:{id:string;url:string}) {
 const video=useRef<HTMLVideoElement>(null);const assets=useCanvasStore(s=>s.assets??[]);const [selected,setSelected]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const frames=assets.filter(a=>a.name.startsWith(`拉片-${id}-`));
 const capture=async()=>{setBusy(true);setError('');try{const file=await captureVideoFrame(url,'current',video.current?.currentTime??0);const named=new File([file],`拉片-${id}-${(video.current?.currentTime??0).toFixed(2)}.png`,{type:'image/png'});const asset=await uploadAsset(named);setSelected(s=>[...s,asset.id]);}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const locate=(a:StudioAsset)=>{const n=useCanvasStore.getState().graph.nodes.find(n=>n.id===id);insertAsset(a,{x:(n?.position.x??0)+460,y:n?.position.y??0});};
 return <div className="mb-4 space-y-2"><video ref={video} src={url} controls className="max-h-52 w-full rounded bg-[var(--wx-bg-canvas)]"/><button className="wx-button" disabled={busy} onClick={()=>void capture()}>{busy?'正在抽帧…':'抽取当前帧'}</button>
 <div className="flex gap-2 overflow-x-auto">{frames.map(a=><div key={a.id} className="w-28 shrink-0"><label><input type="checkbox" checked={selected.includes(a.id)} onChange={e=>setSelected(s=>e.target.checked?[...s,a.id]:s.filter(x=>x!==a.id))}/><img src={a.url} alt={a.name} className="w-full"/></label><button className="wx-button" onClick={()=>locate(a)}>加入画布</button></div>)}</div>
 <button className="wx-button" disabled title="需要先验证 Dola 视觉请求格式">AI 帧分析 · {selected.length} 帧 · 待验证</button><p className="text-[11px] text-[var(--wx-text-3)]">抽帧与笔记可本地使用。Dola 视觉参数未验通，本轮不会提交 AI 分析，也不会把人工笔记标为 AI 结果。</p>{error&&<p role="alert" className="wx-error">{error}</p>}</div>;
}
