import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmailDryRunHandler} from '../supabase/functions/simular-resumo-email/handler.js';
import {build} from 'esbuild';

const userId='10000000-0000-4000-8000-000000000001';
const workId='20000000-0000-4000-8000-000000000002';
const origin='https://cauacassarolli-hub.github.io';
function fixture(overrides={}){
  const calls=[];
  const handle=createEmailDryRunHandler({
    authenticate:async token=>{calls.push(['authenticate',token]);return Object.hasOwn(overrides,'auth')?overrides.auth:userId;},
    simulate:async input=>{
      calls.push(['simulate',input]);
      if(overrides.error)throw Error('backend private failure');
      return overrides.result||{
        apto_para_preparar:true,motivo:'preparacao_possivel_em_simulacao',
        data_local:'2026-10-14',horario:'07:00',fuso:'America/Sao_Paulo',
        envio_executado:false,reserva_criada:false
      };
    }
  });
  const request=(body={work_id:workId},options={})=>new Request('https://example.invalid/functions/v1/simular-resumo-email',{
    method:options.method||'POST',
    headers:{'origin':options.origin??origin,...(options.token===false?{}:{authorization:'Bearer '+(options.token||'test-token')})},
    ...((options.method||'POST')==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})
  });
  return {handle,calls,request};
}
test('Endpoint usa apenas userId do token validado, não do formulário',async()=>{
  const s=fixture(),res=await s.handle(s.request());
  assert.equal(res.status,200);
  assert.equal(res.headers.get('Cache-Control'),'no-store');
  assert.equal(res.headers.get('Access-Control-Allow-Origin'),origin);
  const data=await res.json();
  assert.equal(data.apto_para_preparar,true);
  assert.equal(data.envio_executado,false);
  assert.equal(data.reserva_criada,false);
  assert.deepEqual(s.calls,[
    ['authenticate','test-token'],
    ['simulate',{userId,obraId:workId}]
  ]);
});
test('Rejeita body com identidade alheia, dados extras ou obra inválida',async()=>{
  for(const body of [
    {work_id:workId,user_id:'intruso'},
    {work_id:workId,email:'outro@example.invalid'},
    {work_id:'obra invalida'},[],
    {},'not JSON'
  ]){
    const s=fixture(),res=await s.handle(s.request(body));
    assert.equal(res.status,400);
    assert.equal(s.calls.some(x=>x[0]==='simulate'),false);
  }
});
test('Sessão inválida, método inesperado e origem estranha não executam simulação',async()=>{
  let s=fixture();
  assert.equal((await s.handle(s.request({}, {token:false}))).status,401);
  assert.equal(s.calls.length,0);
  s=fixture({auth:null});
  assert.equal((await s.handle(s.request())).status,401);
  assert.deepEqual(s.calls,[['authenticate','test-token']]);
  s=fixture();
  assert.equal((await s.handle(s.request({work_id:workId},{method:'GET'}))).status,405);
  s=fixture();
  assert.equal((await s.handle(s.request({}, {origin:'https://unknown.example.invalid'}))).status,403);
  assert.equal(s.calls.length,0);
});
test('Preflight do site autorizado não exige token nem consulta dados',async()=>{
  const s=fixture(),res=await s.handle(new Request('https://example.invalid/functions/v1/simular-resumo-email',{
    method:'OPTIONS',headers:{origin}
  }));
  assert.equal(res.status,204);
  assert.equal(res.headers.get('Access-Control-Allow-Methods'),'POST, OPTIONS');
  assert.equal(s.calls.length,0);
});
test('Falha do servidor é genérica e não expõe detalhes internos',async()=>{
  const s=fixture({error:true}),res=await s.handle(s.request());
  assert.equal(res.status,503);
  const body=await res.json();
  assert.match(body.error,/Simulação indisponível/);
  assert.doesNotMatch(JSON.stringify(body),/backend private failure/);
});
test('Endpoint só devolve campos permitidos e nunca confirma envio real',async()=>{
  const s=fixture({result:{
    apto_para_preparar:true,motivo:'apto',
    envio_executado:false,reserva_criada:false,
    email:'secret@example.invalid',user_id:'oculto',
    ocorrencias:[{foto:'private/path.jpg'}],internal:'hidden'
  }});
  const data=await (await s.handle(s.request())).json();
  for(const key of ['email','user_id','ocorrencias','internal'])assert.equal(key in data,false);
  assert.equal(data.envio_executado,false);
  assert.equal(data.reserva_criada,false);
  const denied=fixture({result:{apto_para_preparar:true,envio_executado:true,reserva_criada:false}});
  assert.equal((await denied.handle(denied.request())).status,503);
});
test('Código Deno compila com o mesmo simulador e importações npm externas',async()=>{
  const out=await build({
    entryPoints:['supabase/functions/simular-resumo-email/index.ts'],
    platform:'neutral',format:'esm',bundle:true,write:false,
    external:['npm:*'],logLevel:'silent'
  });
  assert.ok(out.outputFiles[0].text.includes('createEmailDigestDryRun'));
  assert.ok(out.outputFiles[0].text.includes('createEmailDryRunHandler'));
});
