"use client";
import {useState} from 'react';
import {useReactFlow} from '@xyflow/react';
import {useCanvasStore} from '@/store/useCanvasStore';
import {dolaEngine} from '@/lib/engines/dola';
import {nodeName} from '@/lib/studio';
import {runDirector} from '@/lib/tv-director-agent';
import type {ChatMessage} from '@/lib/studio-types';
const pending=new Set<string>();
export default function DirectorChat({id,contextIds=[]}:{id:string;contextIds?:string[]}) {
 const node=useCanvasStore(s=>s.graph.nodes.find(n=>n.id===id));const graph=useCanvasStore(s=>s.graph);
 const assets=useCanvasStore(s=>s.assets??[]);const {getNodes}=useReactFlow();
 const [text,setText]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 if(node?.data.kind!=='director')return null;
 const messages=node.data.messages;const query=/@([^@\n]*)$/.exec(text)?.[1];const matches=query!==undefined?graph.nodes.filter(n=>n.id!==id&&nodeName(n).includes(query)).slice(0,6):[];
 const resourceMatches=query!==undefined?assets.filter(a=>a.name.includes(query)).slice(0,4):[];
 const send=async(value=text)=>{
  if(!value.trim()||pending.has(id))return;
  const selectedIds=[...contextIds,...getNodes().filter(n=>n.selected).map(n=>n.id)];
  const mentioned=graph.nodes.filter(n=>n.id!==id&&(selectedIds.includes(n.id)||value.includes(`@${nodeName(n)}`)));
  const resources=assets.filter(a=>value.includes(`@${a.name}`));
  const context=mentioned.map(n=>{const d=n.data as unknown as Record<string,unknown>;return `${nodeName(n)}：${String(d.text??d.adapted??d.original??d.rawText??JSON.stringify(d.motionAST??d.imagePromptAST??{})).slice(0,4000)}`;}).join('\n').slice(0,10000)+resources.map(a=>`\n素材 ${a.name}（${a.kind}）：${a.url}；仅作文本引用，未识别媒体内容。`).join('').slice(0,2000);
  if(!window.confirm(`将向 Dola 发送对话${mentioned.length?`及 ${mentioned.length} 个引用节点的文本`:''}，可能消耗额度。是否继续？`))return;
  const next:ChatMessage[]=[...messages,{role:'user',content:value.trim()}];pending.add(id);setBusy(true);setError('');
  useCanvasStore.getState().patchNodeData(id,{messages:next});setText('');
  try{const reply=await dolaEngine.chat(next,context);useCanvasStore.getState().patchNodeData(id,{messages:[...next,{role:'assistant',content:reply}]});}catch(e){setError(e instanceof Error?e.message:'对话失败，请重试');}finally{pending.delete(id);setBusy(false);}
 };
 const latest=[...messages].reverse().find(m=>m.role==='assistant');
 return <div className="wx-director-chat"><div className="wx-chat-history">{!messages.length&&<p className="wx-empty-copy">我是你的短剧导演助手。输入问题，或用 @ 引用画布节点。</p>}{messages.map((m,i)=><div key={i} className={`wx-chat-message ${m.role}`}><small>{m.role==='user'?'你':'Dola 导演'}</small><p>{m.content}</p></div>)}{busy&&<p role="status">正在等待 Dola 回复…</p>}</div>
 <div className="wx-chat-presets">{['扩写剧本','拆分镜','优化提示词'].map(label=><button key={label} disabled={busy} onClick={()=>void send(`${label}：${text||'请根据引用的节点内容提供建议'}`)}>{label}</button>)}</div>
 <textarea className="wx-input" aria-label="导演对话" value={text} onChange={e=>setText(e.target.value)} placeholder="描述创作需求，@ 引用节点" rows={3}/>
 {(matches.length+resourceMatches.length)>0&&<div className="wx-mentions">{matches.map(n=><button key={n.id} onClick={()=>setText(text.replace(/@[^@\n]*$/,`@${nodeName(n)} `))}>{nodeName(n)}</button>)}{resourceMatches.map(a=><button key={a.id} onClick={()=>setText(text.replace(/@[^@\n]*$/,`@${a.name} `))}>素材 · {a.name}</button>)}</div>}
 {error&&<p className="wx-error" role="alert">{error}</p>}
 <p className="wx-footnote">媒体引用只传名称与地址，不代表 Dola 已识别画面。</p>
 <div className="flex gap-2"><button className="wx-primary wx-button flex-1" disabled={busy||!text.trim()} onClick={()=>void send()}>发送 · 可能消耗额度</button>{latest&&<button className="wx-button" onClick={()=>{const s=useCanvasStore.getState();const result=runDirector({graph:s.graph,text:latest.content,characters:s.characters,mode:'plan'});s.setGraph(result.graph);}}>回复拆为分镜表</button>}</div></div>;
}
