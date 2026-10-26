"use client";
import {useEffect,useRef,useState} from 'react';
import {useCanvasStore} from '@/store/useCanvasStore';
import {useTaskStore} from '@/store/useTaskStore';
import type {DolaModel,DolaRatio,DolaTask} from '@/types/libtv-schema';
import type {WebGenerationStatus} from '@/lib/studio-types';
export default function WebGenerationButton({nodeId,kind,prompt,model,duration,ratio='16:9'}:{nodeId:string;kind:'image'|'video';prompt:string;model?:DolaModel;duration?:number;ratio?:DolaRatio}) {
 const node=useCanvasStore(s=>s.graph.nodes.find(n=>n.id===nodeId));const jobId=(node?.data as unknown as {webGenerationId?:string})?.webGenerationId;
 const [job,setJob]=useState<WebGenerationStatus|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');const applied=useRef('');
 useEffect(()=>{if(!jobId||!window.wuxianDesktop)return;let stopped=false;let timer:ReturnType<typeof setTimeout>;
  const poll=async()=>{try{const status=await window.wuxianDesktop!.generationStatus(jobId);if(stopped)return;setJob(status);
   if(status.status==='completed'&&status.url&&applied.current!==jobId){
    if(kind==='image')await new Promise<void>((resolve,reject)=>{const image=new Image();image.onload=()=>image.naturalWidth?resolve():reject(new Error('图片无法解码'));image.onerror=()=>reject(new Error('图片无法解码'));image.src=status.url!;});
    if(stopped)return;applied.current=jobId;const id=`web-${jobId}`;
    const base={id,prompt,accountId:status.accountId,status:'succeeded' as const,nodeId,createdAt:Date.now(),ratio};
    const task:DolaTask=kind==='video'?{...base,kind,model:model??'seedance_v2.5',duration:duration??5,playUrl:status.url}:{...base,kind,imageUrl:status.url};
    if(!useTaskStore.getState().tasks.some(t=>t.id===id))useTaskStore.getState().enqueueTask(task);
    useCanvasStore.getState().patchNodeData(nodeId,kind==='video'?{videoUrl:status.url,dolaTaskId:id}:{imageUrl:status.url});setBusy(false);return;
   }
   if(['failed','cancelled'].includes(status.status)){if(status.url)useCanvasStore.getState().patchNodeData(nodeId,kind==='video'?{videoUrl:status.url}:{imageUrl:status.url});setError(status.error||'官网生成未完成');setBusy(false);return;}
   setBusy(true);timer=setTimeout(()=>void poll(),3000);
  }catch(e){if(!stopped){setError((e as Error).message);setBusy(false);}}};void poll();return()=>{stopped=true;clearTimeout(timer);};
 },[jobId,kind,nodeId,prompt,model,duration,ratio]);
 const start=async()=>{if(!window.wuxianDesktop||busy)return;if(!prompt.trim()){setError('请先填写生成提示词');return;}
  if(!window.confirm(`将在已登录的 Dola 官网准备${kind==='video'?`${duration}秒视频`:'图片'}。请在官网核对模型、规格和额度，再点击生成；完成后下载该结果，Xan 会自动归档。继续？`))return;
  setBusy(true);setError('');try{const result=await window.wuxianDesktop.openGeneration({kind,prompt,model,duration,ratio});useCanvasStore.getState().patchNodeData(nodeId,{webGenerationId:result.id});}catch(e){setBusy(false);setError((e as Error).message);}
 };
 return <div className="space-y-2"><button className="wx-primary wx-button w-full" disabled={busy||!window.wuxianDesktop} onClick={()=>void start()}>{busy?'官网生成会话进行中…':kind==='video'?'在 Dola 官网生成视频':'在 Dola 官网生成图片'}</button><p className="wx-footnote">兼容通道：在官网核对参数并生成，完成后点击官网的下载按钮，素材将自动进入画布和历史。{kind==='video'?'视频会校验实际时长。':''}</p>{job&&<p role="status" className="text-xs">{job.status==='completed'?`已归档${job.actualDuration?` · 实际 ${job.actualDuration.toFixed(2)}秒`:''}`:job.status==='awaiting-confirmation'?'已准备：请在官网核对参数、生成并下载':job.status==='downloading'?'正在归档下载素材…':job.status}</p>}{error&&<p className="wx-error" role="alert">{error}</p>}</div>;
}
