import { DOLA_BOT_ID, DolaClient, parseQuotaText } from '../dola-engine';
import { getDesktopDolaPool, getDolaPoolSync } from '../dola-pool';
import { createProxyFetch } from '../dola-proxy';
import type { Engine } from './index';
import type { ChatMessage } from '../studio-types';
import type { DolaModel,DolaRatio } from '@/types/libtv-schema';

// Only text blocks use the already known completion envelope. No guessed reader/image ability_param.
export function parseChatResponse(raw:string):string {
 const pieces:string[]=[];
 const visit=(value:unknown)=>{
  if(Array.isArray(value)) {value.forEach(visit);return;}
  if(!value||typeof value!=='object')return;
  const v=value as Record<string,unknown>;
  if(v.text_block&&typeof v.text_block==='object'&&typeof (v.text_block as Record<string,unknown>).text==='string')pieces.push((v.text_block as {text:string}).text);
  if(v.delta&&typeof v.delta==='object'&&typeof (v.delta as Record<string,unknown>).content==='string')pieces.push((v.delta as {content:string}).content);
  if(typeof v.content==='string'&&v.role==='assistant')pieces.push(v.content);
  for(const [key,child] of Object.entries(v)) if(!['text_block','delta'].includes(key)) visit(child);
 };
 for(const line of raw.split('\n')){const data=line.startsWith('data:')?line.slice(5).trim():line.trim();if(!data||data==='[DONE]')continue;try{visit(JSON.parse(data));}catch{/* SSE event labels are not response content */}}
 if(!pieces.length)throw new Error('Dola 未返回可识别的文本，请确认登录状态或保留响应结构供接口核验');
 // Some events contain cumulative text; retain only the latest cumulative version.
 return pieces.reduce((result,p)=>p.startsWith(result)?p:result.endsWith(p)?result:result+p,'');
}
export class DolaEngine implements Engine {
 id='dola';name='Dola';capabilities=['video','chat'] as const;
 private async connection() {
  const pool=window.wuxianDesktop?await getDesktopDolaPool():getDolaPoolSync();if(!pool)throw new Error('请先在 Dola 账号面板登录');const a=pool.pickAccount();if(!a)throw new Error('没有可用的 Dola 账号');
  if(window.wuxianDesktop) return {pool,account:a,client:await pool.clientFor(a.id),post:async(path:string,body:unknown)=>{const r=await window.wuxianDesktop!.request(a.id,path,JSON.stringify(body));if(r.status<200||r.status>=300)throw new Error(`Dola 请求失败（HTTP ${r.status}）`);return r.text;}};
  const cookie=await pool.cookieFor(a.id);const fetchImpl=createProxyFetch(cookie);
  return {pool,account:a,client:new DolaClient(cookie,{fetchImpl}),post:async(path:string,body:unknown)=>{const r=await fetchImpl(`https://www.dola.com${path}`,{method:'POST',body:JSON.stringify(body)});if(!r.ok)throw new Error(`Dola 请求失败（HTTP ${r.status}）`);return r.text();}};
 }
 async skillMetadata(type:number) {const {client}=await this.connection();return client.skillPack(type);}
 async chat(messages:ChatMessage[],context='') {
  const {pool,account,post}=await this.connection();
  const prompt=['你是短剧导演助手。只回答用户请求，不声称已执行生成或修改画布。',context,...messages.slice(-20).map(m=>`${m.role==='user'?'用户':'助手'}：${m.content}`)].join('\n\n');
  const raw=await post('/chat/completion',{client_meta:{local_conversation_id:crypto.randomUUID(),conversation_id:'',bot_id:DOLA_BOT_ID,last_section_id:''},messages:[{content_block:[{block_type:10000,content:{text_block:{text:prompt}}}]}],option:{need_create_conversation:true,unique_key:crypto.randomUUID(),create_time_ms:Date.now()}});
  if(raw.includes('710022002'))throw new Error('Dola 拒绝请求，请确认本人登录及网络环境；未自动重试');
  const text=parseChatResponse(raw);const quota=parseQuotaText(raw);if(quota)pool.recordUsage(account.id,quota);return text;
 }
 async generateVideo(params:{prompt:string;model:DolaModel;duration:number;ratio:DolaRatio}) {const {client}=await this.connection();return client.generateVideo(params);}
 async generateImage(_params:{prompt:string;ratio:DolaRatio}):Promise<{imageUrl:string}> {throw new Error('图片 ability_param 与结果回取尚未实测，本期不提交未经核验的生成请求');}
}
export const dolaEngine=new DolaEngine();
