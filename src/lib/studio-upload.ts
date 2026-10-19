import { rememberAsset, uid } from './studio';
import type { StudioAsset } from './studio-types';
let accessKey='';
export function setUploadAccessKey(key:string) { accessKey=key; }
export async function uploadAsset(file:File):Promise<StudioAsset> {
 if(!/^(image|video)\//.test(file.type)) throw new Error('请选择图片或视频文件');
 if(!file.size||file.size>50*1024*1024) throw new Error('文件不能为空或超过 50MB');
 let url:string;
 if(window.wuxianDesktop) url=(await window.wuxianDesktop.upload({name:file.name,type:file.type,bytes:await file.arrayBuffer()})).url;
 else {
  if(!accessKey) throw new Error('Web 上传需要在 API 管理中配置本机上传密钥；桌面版无需填写');
  const form=new FormData();form.set('file',file);
  const response=await fetch('/api/openapi/file/upload',{method:'POST',headers:{Authorization:`Bearer ${accessKey}`},body:form});
  const result=await response.json();if(!response.ok||!result.data?.url) throw new Error(result.error||'上传失败，请稍后重试');url=result.data.url;
 }
 const asset:StudioAsset={id:uid('asset'),kind:file.type.startsWith('image/')?'image':'video',url,name:file.name,source:'upload',createdAt:Date.now()};rememberAsset(asset);return asset;
}
export function chooseFiles(accept='image/*,video/*',multiple=true):Promise<File[]> {
 return new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.accept=accept;input.multiple=multiple;input.onchange=()=>resolve(Array.from(input.files??[]));input.addEventListener('cancel',()=>resolve([]));input.click();});
}
export async function captureVideoFrame(url:string,which:'current'|'first'|'last'='current',time?:number):Promise<File> {
 const v=document.createElement('video');v.crossOrigin='anonymous';v.preload='auto';v.muted=true;
 await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('视频读取超时')),15000);v.onloadedmetadata=()=>{clearTimeout(timer);resolve();};v.onerror=()=>{clearTimeout(timer);reject(new Error('视频无法读取；远程视频可能限制跨域，请先下载并上传'));};v.src=url;});
 const target=which==='first'?0:which==='last'?Math.max(0,v.duration-.1):Math.min(time??0,Math.max(0,v.duration-.1));
 if(target>0) await new Promise<void>((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('定位视频帧超时')),10000);v.onseeked=()=>{clearTimeout(t);resolve();};v.currentTime=target;});
 else if(v.readyState<2) await new Promise<void>((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('读取视频帧超时')),10000);v.onloadeddata=()=>{clearTimeout(t);resolve();};});
 const canvas=document.createElement('canvas');canvas.width=v.videoWidth;canvas.height=v.videoHeight;
 const c=canvas.getContext('2d');if(!c) throw new Error('浏览器不支持截帧');c.drawImage(v,0,0);
 try {const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('截帧失败')),'image/png'));return new File([blob],`frame-${which}-${Date.now()}.png`,{type:'image/png'});}catch {throw new Error('截帧受跨域限制，请先下载并上传视频');}finally{v.removeAttribute('src');v.load();}
}

export async function downloadMedia(url:string) {
 if(window.wuxianDesktop && !/^(data|blob):/.test(url)) await window.wuxianDesktop.downloadMedia(url);
 else {const a=document.createElement('a');a.href=url;a.download='';a.target='_blank';a.rel='noopener';a.click();}
}
