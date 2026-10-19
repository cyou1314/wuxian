import {captureProject} from './desktop-workspace';
/** Inline only app-owned uploads; no credentials or account sessions enter the project. */
export async function exportShareProject() {
 const project=structuredClone(captureProject());const replacements=new Map<string,string>();let size=0;
 const find=(value:unknown):void=>{if(typeof value==='string'&&(/^\/api\/openapi\/file\/upload\?name=/.test(value)||/^\/uploads\//.test(value)))replacements.set(value,'');else if(Array.isArray(value))value.forEach(find);else if(value&&typeof value==='object')Object.values(value).forEach(find);};find(project);
 for(const url of replacements.keys()) {const response=await fetch(url);if(!response.ok)throw new Error('分享失败：有本地素材已丢失，请替换后重试');const blob=await response.blob();size+=blob.size;if(size>35*1024*1024)throw new Error('素材超过分享文件容量，请减少素材后重试（本地项目仍可正常保存）');
 const data=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error('素材读取失败'));r.readAsDataURL(blob);});replacements.set(url,data);}
 const json=JSON.stringify(project,(_key,value)=>typeof value==='string'&&replacements.has(value)?replacements.get(value):value);
 if(new Blob([json]).size>50*1024*1024)throw new Error('分享项目超过 50MB，请减少素材后重试');
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([json],{type:'application/json'}));a.download=`Xan-${Date.now()}.wuxian`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),30000);
}
