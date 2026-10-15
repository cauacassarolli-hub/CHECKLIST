import assert from 'node:assert/strict';

const ORIGIN='https://cauacassarolli-hub.github.io';
const PAGE=ORIGIN+'/CHECKLIST/';
const timeout=12000;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const attempt=async (label,fn,{tries:Number(process.env.SMOKE_TRIES||8),interval=10000}={})=>{
  let last;
  for(let i=1;i<=tries;i++){
    try{return await fn();}
    catch(error){
      last=error;
      console.warn(label+': tentativa '+i+'/'+tries+' ainda não validada: '+error.message);
      if(i<tries)await sleep(interval);
    }
  }
  throw new Error(label+' não passou após '+tries+' tentativas: '+last.message);
};
const request=async(url,options={})=>{
  const response=await fetch(url,{
    redirect:'follow',
    cache:'no-store',
    signal:AbortSignal.timeout(timeout),
    ...options
  });
  return response;
};
const getText=async(url)=>{
  const response=await request(url);
  assert.equal(response.status,200,'HTTP '+response.status+' ao consultar '+new URL(url).pathname);
  return response.text();
};
const fresh=path=>new URL(path+'?smoke='+Date.now(),PAGE).href;

const assets=await attempt('Publicação PWA',async()=>{
  const html=await getText(fresh('./index.html'));
  assert.match(html,/Simular resumo|app-[A-Z0-9]+\.js|assets\/app-/i,'HTML não aparenta ser o build atualizado.');
  const paths=[...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+\.(?:js|css))"/g)].map(m=>m[1]);
  assert.ok(paths.some(p=>p.endsWith('.js')) && paths.some(p=>p.endsWith('.css')),'HTML sem JS/CSS empacotados.');
  for(const path of paths){
    const content=await getText(fresh('./'+path));
    assert.ok(content.length>500,'Asset vazio ou muito pequeno: '+path);
    if(path.endsWith('.js'))assert.ok(content.includes('simulate-email') && content.includes('simular-resumo-email'),'Interface Fiscal ou chamada ao backend ainda não publicada.');
  }
  const sw=await getText(fresh('./service-worker.js'));
  for(const path of paths)assert.ok(sw.includes('./'+path),'Service Worker desatualizado: '+path);
  assert.ok(!sw.includes('__VERSION__'),'Service Worker não compilado.');
  const config=JSON.parse(await getText(fresh('./config.json')));
  assert.match(config.url||'',/^https:\/\/[a-z0-9-]+\.supabase\.co$/);
  assert.match(config.key||'',/^sb_publishable_[A-Za-z0-9_-]+$/);
  console.log('PWA: HTML, JS, CSS, service worker e configuração pública verificados.');
  return {config};
});
const endpoint=new URL('/functions/v1/simular-resumo-email',assets.config.url).href;
await attempt('CORS da função de simulação',async()=>{
  const response=await request(endpoint,{
    method:'OPTIONS',
    headers:{
      origin:ORIGIN,
      'Access-Control-Request-Method':'POST',
      'Access-Control-Request-Headers':'authorization, apikey, content-type'
    }
  });
  assert.equal(response.status,204,'Preflight CORS deveria retornar 204.');
  assert.equal(response.headers.get('access-control-allow-origin'),ORIGIN,'Origem de CORS incorreta.');
  console.log('Edge: preflight CORS válido (204).');
});
await attempt('Rejeição de chamada sem sessão',async()=>{
  const response=await request(endpoint,{
    method:'POST',
    headers:{
      origin:ORIGIN,
      apikey:assets.config.key,
      'content-type':'application/json'
    },
    body:JSON.stringify({work_id:'00000000-0000-4000-8000-000000000002'})
  });
  assert.equal(response.status,401,'Endpoint sem sessão deve recusar com 401.');
  const data=await response.json();
  assert.equal(data.error,'Faça login para simular o resumo.','Resposta deveria vir do handler protegido.');
  assert.equal(response.headers.get('cache-control'),'no-store','Endpoint não deve armazenar respostas em cache.');
  console.log('Edge: chamada não autenticada rejeitada pelo handler (401, sem cache).');
});
console.log('Smoke público concluído; nenhum usuário foi autenticado, nenhum envio ou reserva foi executado.');
