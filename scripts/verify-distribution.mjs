import fs from 'node:fs/promises';
import path from 'node:path';

const dir=path.resolve('dist');
const html=await fs.readFile(path.join(dir,'index.html'),'utf8');
const sw=await fs.readFile(path.join(dir,'service-worker.js'),'utf8');
const refs=[
  ...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+)"/g)
].map(match=>match[1]);
if(refs.length<2 || !refs.some(p=>p.endsWith('.js')) || !refs.some(p=>p.endsWith('.css')))
  throw new Error('A página não aponta para os assets JavaScript e CSS gerados pelo build.');
for(const p of refs){
  const resolved=path.resolve(dir,p);
  if(!resolved.startsWith(dir+path.sep))throw new Error('Asset fora da pasta de publicação.');
  await fs.access(resolved);
}
if(/__VERSION__|__SHELL__/.test(sw))throw new Error('Service Worker não foi gerado pelo build.');
for(const p of refs){
  if(!sw.includes('./'+p))throw new Error('Asset não incluído no cache versionado do PWA: '+p);
}
for(const p of ['index.html','auth.html','config.json','manifest.webmanifest','.nojekyll']){
  await fs.access(path.join(dir,p));
}
const config=JSON.parse(await fs.readFile(path.join(dir,'config.json'),'utf8'));
if(process.env.CI && (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.url||'') ||
    !/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.key||'')))
  throw new Error('Configuração pública do Supabase não está presente no artefato de publicação.');
console.log('Dist verificado: HTML, JS, CSS, PWA, manifest e configuração pública válidos.');
