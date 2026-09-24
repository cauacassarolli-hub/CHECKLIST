import test from 'node:test';import assert from 'node:assert/strict';
import {consumeAuthLink,validateNewPassword} from '../src/auth-links.js';
import {createInviteHandler,APP_URL} from '../supabase/functions/convidar-colega/handler.js';
const memory=()=>{const map=new Map();return{getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
const authFake=()=>{const calls=[];return{calls,client:{auth:{setSession:async data=>{calls.push(['session',data]);return{data:{},error:null};},verifyOtp:async data=>{calls.push(['verify',data]);return{data:{}};},getUser:async()=>({data:{user:{id:'invited-user',email:'qa@example.invalid'}}})}}};};
test('Auth invite establishes the invited session, scrubs URL and survives reload without storing tokens',async()=>{
 const {client,calls}=authFake(),storage=memory();let clean;
 const user=await consumeAuthLink(client,{href:APP_URL+'#access_token=fixture-access&refresh_token=fixture-refresh&type=invite',replace:url=>clean=url,storage});
 assert.equal(user.id,'invited-user');assert.equal(clean,'/CHECKLIST/auth.html');assert.equal(storage.getItem('pf-password-setup-user'),'invited-user');assert.equal(calls.length,1);
 assert.equal((await consumeAuthLink(client,{href:APP_URL,storage})).id,user.id);
});
test('Token hash recovery validates with Auth and allows the password screen',async()=>{
 const {client,calls}=authFake();await consumeAuthLink(client,{href:APP_URL+'?token_hash=fixture&type=recovery',replace:()=>{},storage:memory()});
 assert.deepEqual(calls[0],['verify',{token_hash:'fixture',type:'recovery'}]);
});
test('Expired or malformed invitation never uses an existing session to change its password',async()=>{
 const {client,calls}=authFake(),storage=memory();storage.setItem('pf-password-setup-user','invited-user');let clean;
 await assert.rejects(consumeAuthLink(client,{href:APP_URL+'#error=access_denied&error_description=private-detail&type=invite',replace:v=>clean=v,storage}),/expirou/);
 assert.equal(calls.length,0);assert.equal(clean,'/CHECKLIST/auth.html');assert.equal(storage.getItem('pf-password-setup-user'),undefined);
 await assert.rejects(consumeAuthLink(client,{href:APP_URL,storage}),/inválido/);
 await assert.rejects(consumeAuthLink(client,{href:APP_URL+'#access_token=x&type=invite',replace:()=>{},storage}),/inválido/);
});
test('A setup marker for another account cannot select the password screen',async()=>{
 const {client}=authFake(),storage=memory();storage.setItem('pf-password-setup-user','another-user');
 assert.equal(await consumeAuthLink(client,{href:'https://example.invalid/',storage}),null);
});
test('Short and mismatched passwords are rejected before update',()=>{
 assert.throws(()=>validateNewPassword('short','short'),/10/);assert.throws(()=>validateNewPassword('long-enough-password','different'),/iguais/);
 assert.doesNotThrow(()=>validateNewPassword('long-enough-password','long-enough-password'));
});
const work='11111111-1111-4111-8111-111111111111';
function endpoint({invalid=false,forbidden=false,mailError=null,canceled=false}={}){
 const calls=[];
 const handler=createInviteHandler({userClient:()=>({auth:{getUser:async()=>invalid?{error:{}}:{data:{user:{id:'owner'}}}},rpc:async(name,args)=>{calls.push(['prepare',args]);return forbidden?{error:{code:'42501'}}:{data:{id:'invite',envio_id:'attempt',email:'qa@example.invalid'}};}}),adminClient:()=>({auth:{admin:{inviteUserByEmail:async(email,options)=>{calls.push(['mail',email,options]);return{error:mailError};}}},rpc:async(name,args)=>{calls.push(['finish',args]);return{data:!canceled};}})});
 return{handler,calls};
}
const request=(overrides={})=>new Request('https://example.invalid/functions/v1/convidar-colega',{method:'POST',headers:{Authorization:'Bearer fixture-token','Content-Type':'application/json'},body:JSON.stringify({work_id:work,member_email:'qa@example.invalid',member_name:'Colega'}),...overrides});
test('Missing/invalid sessions and non-owner calls send no email',async()=>{
 for(const settings of [{invalid:true},{forbidden:true}]){const {handler,calls}=endpoint(settings);assert.ok([401,403].includes((await handler(request())).status));assert.ok(!calls.some(c=>c[0]==='mail'));}
 const {handler,calls}=endpoint();assert.equal((await handler(request({headers:{}}))).status,401);assert.equal(calls.length,0);
});
test('Valid owner request sends through Auth with the fixed callback and reports completion',async()=>{
 const {handler,calls}=endpoint();const response=await handler(request());assert.equal(response.status,200);assert.equal((await response.json()).status,'enviado');
 assert.deepEqual(calls.map(c=>c[0]),['prepare','mail','finish']);assert.equal(calls[1][2].redirectTo,APP_URL);assert.equal(calls[2][1].result_status,'enviado');
});
test('Provider failure persists failure and never claims an invitation was sent',async()=>{
 const {handler,calls}=endpoint({mailError:{code:'unexpected_failure',message:'secret-provider-detail'}});const response=await handler(request());assert.equal(response.status,502);
 assert.equal(calls.at(-1)[1].result_status,'falhou');assert.doesNotMatch(await response.text(),/secret-provider/);
});
test('Existing accounts keep their password and are explicitly distinguished from sent invitations',async()=>{
 const {handler,calls}=endpoint({mailError:{code:'email_exists'}});const response=await handler(request());assert.equal((await response.json()).status,'conta_existente');assert.equal(calls.at(-1)[1].result_status,'conta_existente');
});
test('Canceled authorization cannot be reported as activated after mail delivery',async()=>{
 const {handler}=endpoint({canceled:true});assert.equal((await handler(request())).status,409);
});
test('Disallowed origins cannot invoke email delivery',async()=>{
 const {handler,calls}=endpoint();assert.equal((await handler(request({headers:{Origin:'https://untrusted.invalid',Authorization:'Bearer fixture-token'}}))).status,403);assert.equal(calls.length,0);
});
