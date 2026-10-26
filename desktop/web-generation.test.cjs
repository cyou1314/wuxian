const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {durationPatch}=require('./web-generation.cjs');
test('official config duration adaptation covers fetch and late XHR without rewriting unrelated responses',async()=>{
 const payload=()=>JSON.stringify({key:'duration',option_list:[{id:1,option_key:'5'},{id:2,option_key:'10'}]});
 const makeXHR=()=>class XHR {open(_method,url){this.responseURL=url;}get responseText(){return payload();}get response(){return this.responseText;}};
 const window={fetch:async()=>new Response(payload()),XMLHttpRequest:makeXHR()};
 const context=vm.createContext({window,document:{addEventListener(){}},Response,Headers,WeakMap,WeakSet,setTimeout});
 vm.runInContext(`(${durationPatch.toString()})()`,context);
 const response=await window.fetch('/samantha/skill/pack');
 assert.equal((await response.json()).option_list.at(-1).option_key,'30');
 assert.equal((await (await window.fetch('/other')).json()).option_list.length,2);
 for(let n=0;n<2;n++){
  const xhr=new window.XMLHttpRequest();xhr.open('GET','/alice/slot/action_bar_v3/get_item_conf');
  const values=JSON.parse(xhr.responseText).option_list.map(x=>x.option_key);
  assert.equal(values.length,26);assert.ok(values.includes('30'));assert.ok(values.includes('5'));
  const ordinary=new window.XMLHttpRequest();ordinary.open('GET','/other');assert.equal(JSON.parse(ordinary.responseText).option_list.length,2);
  window.XMLHttpRequest=makeXHR();
 }
});
