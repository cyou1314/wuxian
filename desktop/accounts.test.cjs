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
