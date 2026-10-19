"use client";
import {useEffect,useState} from 'react';
import {getDolaPoolSync,getDesktopDolaPool} from '@/lib/dola-pool';
import {setUploadAccessKey} from '@/lib/studio-upload';
import type {DolaAccount} from '@/types/libtv-schema';
export default function EngineManager({onClose,onAccounts}:{onClose:()=>void;onAccounts:()=>void}) {
 const [accounts,setAccounts]=useState<DolaAccount[]>([]),[form,setForm]=useState(false),[name,setName]=useState('Dola'),[saved,setSaved]=useState(''),[error,setError]=useState('');
 useEffect(()=>{setSaved(localStorage.getItem('xan-dola-engine-name')||'');void(async()=>{const pool=window.wuxianDesktop?await getDesktopDolaPool():getDolaPoolSync();setAccounts(pool?.listAccounts()??[]);})().catch(()=>setError('无法读取本机账号状态'));},[]);
 return <aside className="wx-panel wx-engine-manager" aria-label="API 管理"><div className="wx-panel-title"><h2>API 管理</h2><button onClick={onClose} aria-label="关闭 API 管理">×</button></div><div className="wx-engine-entry"><strong>{saved||'Dola'}</strong><p>已接入 · {accounts.length} 个账号</p><p>剩余额度：{accounts.length&&accounts.every(a=>a.quotaRemaining!==null)?accounts.reduce((n,a)=>n+(a.quotaRemaining??0),0):'未知（以 Dola 响应为准）'}</p><p className="wx-footnote">视频 / 文本对话；图片与 AI 阅读参数待核验。</p><button className="wx-button" onClick={onAccounts}>管理 Dola 账号</button></div>
 <button className="wx-button mt-3" onClick={()=>setForm(v=>!v)}>添加 API</button>{form&&<form className="mt-3 space-y-3" onSubmit={e=>{e.preventDefault();setSaved(name.trim()||'Dola');localStorage.setItem('xan-dola-engine-name',name.trim()||'Dola');setForm(false);}}><label>名称<input className="wx-input" value={name} onChange={e=>setName(e.target.value)} maxLength={60}/></label><label>类型<select className="wx-input"><option>Dola</option><option disabled>更多引擎即将支持</option></select></label><p className="wx-footnote">Dola 使用本人网页登录，无需 API 密钥。此处设置本机引擎显示名称，不会重复创建引擎。</p><button className="wx-primary wx-button" type="submit">保存 Dola 配置</button></form>}
 {!window.wuxianDesktop&&<label className="mt-4 block">本机 Web 上传访问密钥<input type="password" className="wx-input" autoComplete="off" onChange={e=>setUploadAccessKey(e.target.value)} placeholder="仅保留在当前页面内存"/></label>}{error&&<p className="wx-error">{error}</p>}</aside>;
}
