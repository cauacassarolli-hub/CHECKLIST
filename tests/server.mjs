// Deterministic Supabase protocol fixture. This is not a database/RLS validator.
import http from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';
const base=path.resolve('test-results/harness');
const user={id:'11111111-1111-4111-8111-111111111111',email:'qa@example.invalid',aud:'authenticated',role:'authenticated'};
const tables=Object.fromEntries(['obras','apartamentos','ambientes','servicos','itens','relatorios'].map(t=>['chk_'+t,[]]));
const objects=new Map();let failUpload=false;
const jwt=()=>[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:user.id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'local-only'].join('.');
const response=(res,status,data,headers={})=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store',...headers});res.end(JSON.stringify(data));};
const readBody=async(req)=>{const buffers=[];for await(const b of req)buffers.push(b);return Buffer.concat(buffers);};
function syncStatus(id){const apt=tables.chk_apartamentos.find(a=>a.id===id);if(!apt)return;const rows=tables.chk_itens.filter(i=>i.apartamento_id===id);apt.status=rows.some(i=>i.status==='pendente')?'com_pendencias':rows.some(i=>i.status==='correcao')?'em_correcao':rows.length&&!['conforme','finalizado'].includes(apt.status)?'em_vistoria':apt.status;}
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost:4173'),p=url.pathname;
 if(p==='/mock/qa/fail-upload'){failUpload=true;return response(res,200,{ok:true});}
 if(p==='/mock/qa/state')return response(res,200,{tables,objects:[...objects].map(([name,v])=>({name,bytes:v.bytes.length,type:v.type}))});
 if(p.startsWith('/mock/auth/v1/')){
   if(p.endsWith('/logout'))return response(res,200,{});
   if(p.endsWith('/user'))return response(res,200,user);
   return response(res,200,{access_token:jwt(),refresh_token:'local-fixture-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user});
 }
 if(p.startsWith('/mock/rest/v1/')){
   const name=p.split('/').at(-1),rows=tables[name];if(!rows)return response(res,404,{message:'Unknown table'});
   const matches=row=>[...url.searchParams].filter(([k])=>!['select','order','offset','limit','on_conflict'].includes(k)).every(([k,v])=>v.startsWith('eq.')?String(row[k])===v.slice(3):true);
   const one=req.headers.accept?.includes('vnd.pgrst.object');
   if(req.method==='GET'){const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||500);const list=rows.filter(matches).slice(offset,offset+limit);return response(res,200,one?list[0]:list);}
   if(req.method==='DELETE'){const deleted=rows.filter(matches);tables[name]=rows.filter(r=>!matches(r));deleted.forEach(r=>syncStatus(r.apartamento_id));return response(res,200,deleted);}
   const body=JSON.parse((await readBody(req)).toString()||'{}');let result;
   if(req.method==='PATCH'){result=rows.filter(matches);for(const row of result){if(name==='chk_apartamentos'&&['conforme','finalizado'].includes(body.status)&&tables.chk_itens.some(i=>i.apartamento_id===row.id&&['pendente','correcao'].includes(i.status)))return response(res,400,{code:'23514',message:'Existem pendências abertas.'});Object.assign(row,body);syncStatus(row.apartamento_id);}}
   else {result=[];for(const v of Array.isArray(body)?body:[body]){let row=rows.find(r=>r.id===v.id);if(row)Object.assign(row,v);else{row={id:crypto.randomUUID(),created_at:new Date().toISOString(),updated_at:new Date().toISOString(),data_vistoria:new Date().toISOString(),...v};rows.push(row);}syncStatus(row.apartamento_id);result.push(row);}}
   return response(res,200,one?result[0]:result);
 }
 if(p.startsWith('/mock/storage/v1/')){
   let tail=p.slice('/mock/storage/v1/'.length);
   if(tail.startsWith('object/sign/')&&req.method==='POST'){const key=decodeURIComponent(tail.slice('object/sign/'.length));if(!objects.has(key))return response(res,404,{message:'Not found'});return response(res,200,{signedURL:'/object/sign/'+key+'?token=local'});}
   if(tail.startsWith('object/authenticated/'))tail='object/'+tail.slice('object/authenticated/'.length);
   if(tail.startsWith('object/sign/'))tail='object/'+tail.slice('object/sign/'.length);
   if(tail.startsWith('object/')){
     const key=decodeURIComponent(tail.slice('object/'.length));
     if(req.method==='GET'){const object=objects.get(key);if(!object)return response(res,404,{message:'Not found'});res.writeHead(200,{'content-type':object.type,'cache-control':'no-store'});return res.end(object.bytes);}
     if(req.method==='DELETE'){const body=JSON.parse((await readBody(req)).toString());for(const prefix of body.prefixes||[])objects.delete(key+'/'+prefix);return response(res,200,[]);}
     if(failUpload){failUpload=false;return response(res,503,{message:'Falha de rede simulada. Tente salvar novamente.'});}
     const raw=await readBody(req);objects.set(key,{bytes:raw,type:req.headers['content-type']||'application/octet-stream'});return response(res,200,{Key:key});
   }
 }
 const file=path.resolve(base,'.'+decodeURIComponent(p)+(p.endsWith('/')?'index.html':''));if(!file.startsWith(base+path.sep))throw Error('Forbidden');
 const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.pdf':'application/pdf'};res.writeHead(200,{'content-type':types[path.extname(file)]||'text/plain','cache-control':'no-store'});res.end(await fs.readFile(file));
}catch(e){response(res,500,{message:e.message});}});
server.listen(4173,'0.0.0.0',()=>console.log('Local QA running http://localhost:4173'));
