const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const Module=require('node:module');const ts=require('typescript');
test('bundled signer initializes and signs completion URLs without cookies or network',async()=>{
 const file=path.join(__dirname,'..','src/lib/dola-signer.ts');const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const m=new Module(file,module);m.filename=file;m.paths=module.paths;m._compile(code,file);
 assert.equal(m.exports.isSignerAvailable(),true);const result=new URL(await m.exports.signDolaUrl('https://www.dola.com/chat/completion'));
 assert.equal(result.origin,'https://www.dola.com');assert.equal(result.pathname,'/chat/completion');assert.ok(result.searchParams.get('a_bogus')?.length>10);
});
