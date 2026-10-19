const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile);
const {createMedia,localName,finite}=require('./media.cjs');
const origin='http://127.0.0.1:45678';
test('local media accepts only owned upload paths and finite bounded parameters',()=>{
 assert.equal(localName('/api/openapi/file/upload?name=clip.mp4',origin),'clip.mp4');
 for(const url of ['file:///etc/passwd','https://example.com/api/openapi/file/upload?name=a.mp4','/api/openapi/file/upload?name=..%2Fprivate','/api/openapi/file/upload?name=a..mp4','/api/openapi/file/upload?name=a%27.mp4'])assert.throws(()=>localName(url,origin));
 for(const value of [NaN,Infinity,-1,'10',100])assert.throws(()=>finite(value,0,99));assert.equal(finite(1.5,0,2),1.5);
});
test('real FFmpeg split, trim, crop, concat produce decodable outputs; failed operations clean up',async t=>{
 const binary=path.join(__dirname,'bin','ffmpeg');try{await fs.access(binary);}catch{t.skip('FFmpeg 未配置：打包验收时必须设置 XAN_FFMPEG_PATH');return;}
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'xan-media-'));const uploads=path.join(dir,'server-data','uploads');await fs.mkdir(uploads,{recursive:true});const input=path.join(uploads,'fixture.mp4');
 const handlers=new Map();createMedia({app:{getPath:()=>dir,isPackaged:false},handle:(name,fn)=>handlers.set(name,fn),origin,accessKey:'test-only'});const processMedia=handlers.get('media:process');const url='/api/openapi/file/upload?name=fixture.mp4';
 try{
 await exec(binary,['-v','error','-f','lavfi','-i','color=c=blue:s=320x180:r=24:d=1','-f','lavfi','-i','sine=frequency=440:duration=1','-c:v','libx264','-c:a','aac','-shortest',input]);
 assert.deepEqual(await handlers.get('media:capabilities')(),{ffmpeg:true});
 const all=[];
 for(const request of [{operation:'split',urls:[url]},{operation:'trim',urls:[url],start:.1,end:.6},{operation:'crop',urls:[url],width:160,height:90,x:0,y:0},{operation:'concat',urls:[url,url]}]) {
  const output=await processMedia(request);assert.ok(output.length);for(const item of output){const file=path.join(uploads,localName(item.url,origin));assert.ok((await fs.stat(file)).size>0);await exec(binary,['-v','error','-i',file,'-f','null','-']);all.push(item);}
 }
 assert.equal(all.length,5);assert.equal(all.filter(o=>o.kind==='audio').length,1);
 const before=await fs.readdir(uploads);await assert.rejects(processMedia({operation:'trim',urls:[url],start:2,end:1}),/参数/);assert.deepEqual(await fs.readdir(uploads),before);
 await assert.rejects(processMedia({operation:'crop',urls:[url],width:9999,height:9999,x:0,y:0}),/处理失败/);assert.deepEqual(await fs.readdir(uploads),before);
 const pending=processMedia({operation:'trim',urls:[url],start:0,end:.7});await assert.rejects(processMedia({operation:'trim',urls:[url],start:0,end:.7}),/正在处理/);await pending;
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
