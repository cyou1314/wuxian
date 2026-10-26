// Official-page compatibility path. Submission stays visible in the Dola window.
// Media downloaded from that window is archived into this app's upload storage.
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {spawn}=require('node:child_process');
function durationPatch(){
 if(window.__xanDurationPatch)return;window.__xanDurationPatch=true;
 const walk=v=>{if(!v||typeof v!=='object')return;
  if(Array.isArray(v)){v.forEach(walk);return;}
  if((v.value==='duration'||v.key==='duration'||v.label==='时长')&&Array.isArray(v.options)){
   const sample=v.options.find(x=>String(x.value)==='10')||v.options[0]||{};
   for(let n=5;n<=30;n++)if(!v.options.some(x=>String(x.value)===String(n)))v.options.push({...sample,value:String(n),show_name:`${n}s`,is_default:false});
   v.options.sort((a,b)=>Number(a.value)-Number(b.value));
  }
  if(Array.isArray(v.supported_durations)){for(let n=5;n<=30;n++)if(!v.supported_durations.map(String).includes(String(n)))v.supported_durations.push(String(n));v.supported_durations.sort((a,b)=>Number(a)-Number(b));}
  if((v.key==='duration'||v.label==='时长')&&Array.isArray(v.option_list)){let id=Math.max(0,...v.option_list.map(x=>Number(x.id)||0));for(let n=5;n<=30;n++)if(!v.option_list.some(x=>String(x.option_key)===String(n)))v.option_list.push({id:++id,display_text:`${n}s`,message_text:'',option_key:String(n)});v.option_list.sort((a,b)=>Number(a.option_key)-Number(b.option_key));}
  for(const [k,x] of Object.entries(v)){if(typeof x==='string'&&/^[\[{]/.test(x.trim())){try{const j=JSON.parse(x);walk(j);v[k]=JSON.stringify(j);}catch{}}else walk(x);}
 };
 const original=window.fetch.bind(window);window.fetch=async(...args)=>{const response=await original(...args);const url=String(args[0]?.url||args[0]);if(!/\/samantha\/skill\/pack|\/alice\/slot\/action_bar_v3\/get_item_conf/.test(url))return response;
  try{const value=await response.clone().json();walk(value);const headers=new Headers(response.headers);headers.delete('content-encoding');headers.delete('content-length');return new Response(JSON.stringify(value),{status:response.status,statusText:response.statusText,headers});}catch{return response;}
 };
 // Dola also hydrates these read-only settings through XHR, including late wrappers.
 const target=url=>/\/samantha\/skill\/pack|\/alice\/slot\/action_bar_v3\/get_item_conf/.test(url);
 const patch=text=>{try{const data=JSON.parse(text);walk(data);return JSON.stringify(data);}catch{return text;}};
 const wrapped=new WeakSet();
 const hook=Constructor=>{const proto=Constructor?.prototype;if(!proto||wrapped.has(proto))return;wrapped.add(proto);
  const descriptor=key=>{for(let owner=proto;owner;owner=Object.getPrototypeOf(owner)){const d=Object.getOwnPropertyDescriptor(owner,key);if(d)return d;}};
  const text=descriptor('responseText'),response=descriptor('response'),open=proto.open;if(!text?.get||!open)return;
  const urls=new WeakMap();proto.open=function(method,url,...rest){urls.set(this,String(url));return open.call(this,method,url,...rest);};
  Object.defineProperty(proto,'responseText',{configurable:true,get(){const raw=text.get.call(this);return target(urls.get(this)||this.responseURL||'')?patch(raw):raw;}});
  if(response?.get)Object.defineProperty(proto,'response',{configurable:true,get(){const raw=response.get.call(this);if(!target(urls.get(this)||this.responseURL||''))return raw;if(this.responseType==='json'){walk(raw);return raw;}return typeof raw==='string'?patch(raw):raw;}});
 };
 let constructor=window.XMLHttpRequest;hook(constructor);
 if(Object.getOwnPropertyDescriptor(window,'XMLHttpRequest')?.configurable)Object.defineProperty(window,'XMLHttpRequest',{configurable:true,get:()=>constructor,set:value=>{constructor=value;hook(value);}});
 // Some Dola layouts render a native range independently of their option list.
 document.addEventListener('click',()=>{for(const delay of [50,200,600])setTimeout(()=>{for(const input of document.querySelectorAll('input[type="range"]')){const box=input.closest('[role="dialog"],[data-radix-popper-content-wrapper]')||input.parentElement?.parentElement?.parentElement;if(box&&/时长|duration/i.test(box.textContent||'')){input.min='5';input.max='30';input.step='1';input.setAttribute('aria-label','视频时长（5到30秒）');}}},delay);},true);
}
async function inspectDuration(binary,file){return new Promise(resolve=>{let out='';const child=spawn(binary,['-hide_banner','-i',file],{windowsHide:true});child.stderr.on('data',b=>{out=(out+b).slice(-24000);});child.on('error',()=>resolve(null));child.on('close',()=>{const m=/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(out);resolve(m?Number(m[1])*3600+Number(m[2])*60+Number(m[3]):null);});});}
function registerWebGeneration({app,handle,accountWindow,accounts}){
 const jobs=new Map(),active=new Map();
 const root=path.join(app.getPath('userData'),'server-data','uploads');
 handle('dola:open-generation',async input=>{
  if(!input||!['image','video'].includes(input.kind)||typeof input.prompt!=='string'||!input.prompt.trim()||input.prompt.length>30000)throw new Error('生成参数无效');
  if(input.kind==='video'&&(!Number.isFinite(input.duration)||input.duration<5||input.duration>30))throw new Error('视频时长须为5到30秒');
  const account=accounts().find(a=>a.id===input.accountId)||accounts()[0];if(!account)throw new Error('请先添加并本人登录 Dola 账号');
  if(active.has(account.id))throw new Error('此账号已有官网生成窗口，请先完成下载或关闭该窗口后重试');
  const win=accountWindow(account.id,true),contents=win.webContents,id=randomUUID(),accountSession=contents.session;
  const job={id,accountId:account.id,kind:input.kind,duration:input.duration,status:'preparing'};jobs.set(id,job);active.set(account.id,id);
  const finish=()=>active.delete(account.id);
  const onDownload=(_event,item,source)=>{
   if(source&&source.id!==contents.id)return;
   const mime=item.getMimeType()||'',filename=item.getFilename()||'';
   if(input.kind==='video'&&!/video\//.test(mime)&&! /\.(mp4|webm|mov)$/i.test(filename))return;
   if(input.kind==='image'&&!/image\//.test(mime)&&! /\.(png|jpe?g|webp)$/i.test(filename))return;
   const ext=input.kind==='video'?'.mp4':mime.includes('webp')?'.webp':mime.includes('jpeg')?'.jpg':'.png';const name=`generated-${id}${ext}`,file=path.join(root,name);
   item.setSavePath(file);job.status='downloading';item.once('done',async(_e,state)=>{
    accountSession.removeListener('will-download',onDownload);finish();
    try{if(state!=='completed'||!(await fs.stat(file)).size)throw new Error('素材下载未完成，请在官网重试下载');
     job.url=`/api/openapi/file/upload?name=${encodeURIComponent(name)}`;job.name=name;
     if(input.kind==='video'){const binary=path.join(app.isPackaged?path.join(process.resourcesPath,'media'):path.join(__dirname,'bin'),'ffmpeg');job.actualDuration=await inspectDuration(binary,file);if(job.actualDuration===null)throw new Error('已下载视频，但未能核验时长');if(Math.abs(job.actualDuration-input.duration)>.6)throw new Error(`实际视频为${job.actualDuration.toFixed(2)}秒，未达到请求的${input.duration}秒`);}
     job.status='completed';
    }catch(e){job.status='failed';job.error=e.message;}
   });
  };
  await fs.mkdir(root,{recursive:true});accountSession.on('will-download',onDownload);
  win.once('closed',()=>{accountSession.removeListener('will-download',onDownload);finish();if(!['completed','failed','downloading'].includes(job.status)){job.status='cancelled';job.error='官网窗口已关闭；若已提交，请重新打开官网查看结果，避免重复生成';}});
  try{
   if(!contents.debugger.isAttached())contents.debugger.attach('1.3');
   await contents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:`(${durationPatch.toString()})()`});
   await contents.loadURL('https://www.dola.com/chat/create-image');
   const until=Date.now()+150000;let filled=false;
   while(Date.now()<until&&!win.isDestroyed()){
    filled=await contents.executeJavaScript(`(()=>{const label=${JSON.stringify(input.kind==='video'?'视频':'图像')};const tab=[...document.querySelectorAll('[role="tab"]')].find(b=>b.textContent.trim()===label);if(!tab)return false;if(tab.getAttribute('aria-selected')!=='true'){tab.click();return false;}const control=document.querySelector(${JSON.stringify('[data-input-engine-actionbar-control-key="'+(input.kind==='video'?'video-model':'model')+'"]')});if(!control)return false;const e=document.querySelector('.ProseMirror')?.editor;if(!e?.commands?.setContent)return false;e.commands.setContent({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:${JSON.stringify(input.prompt)}}]}]});return true;})()`);
    if(filled)break;await new Promise(r=>setTimeout(r,400));
   }
   if(!filled)throw new Error('Dola 创作参数尚未加载完成，请确认网络和网页登录状态后重试');
   await contents.executeJavaScript(`(()=>{const label=${JSON.stringify(input.kind==='video'?'视频':'图像')};const tab=[...document.querySelectorAll('button[role="tab"]')].find(b=>b.textContent.trim()===label);if(tab&&tab.getAttribute('aria-selected')!=='true')tab.click();})()`);
   win.setTitle(input.kind==='video'?`Xan · 请核对 ${input.duration} 秒视频参数后生成`:'Xan · 请核对图片参数后生成');
   job.status='awaiting-confirmation';return {id,accountId:account.id};
  }catch(e){accountSession.removeListener('will-download',onDownload);finish();job.status='failed';job.error=e.message;throw new Error(e.message);}
 });
 handle('dola:generation-status',id=>{const job=jobs.get(id);if(!job)throw new Error('生成会话已重启，请先在官网确认结果，避免重复提交');return {...job};});
}
module.exports={registerWebGeneration,durationPatch};
