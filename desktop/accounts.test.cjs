const {test}=require('node:test');const assert=require('node:assert/strict');
const {authWindowUrl,browserUserAgent}=require('./accounts.cjs');
test('login popups preserve real Chromium UA and permit HTTPS/initial blank only',()=>{
 assert.ok(authWindowUrl('https://www.dola.com/chat/'));
 assert.ok(authWindowUrl('https://accounts.google.com/'));
 assert.ok(authWindowUrl('about:blank'));
 for(const value of ['javascript:alert(1)','data:text/html,test','file:///etc/passwd','http://example.com','invalid']) assert.equal(authWindowUrl(value),false);
 const ua=browserUserAgent('Mozilla/5.0 Xan/0.2.0 Chrome/148.0.0.0 Electron/42.11.15 Safari/537.36');
 assert.ok(ua.includes('Chrome/148.0.0.0'));assert.ok(!/Electron|Xan/.test(ua));
});
test('protocol diagnostics retain structure while omitting credentials, text and IDs',()=>{
 const {protocolShape}=require('./accounts.cjs');const result=JSON.stringify(protocolShape({cookie:'cookie-private',token:'token-private',prompt:'private-script',conversation_id:'private-id',chat_ability:{ability_type:17,ability_param:JSON.stringify({model:'seedance_v2.0',duration:30,input_box_content:{user_input_content:'private-script'}})}}));
 for(const privateValue of ['cookie-private','token-private','private-script','private-id'])assert.ok(!result.includes(privateValue));assert.ok(result.includes('seedance_v2.0'));assert.ok(result.includes('30'));
});
