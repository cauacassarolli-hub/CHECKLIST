import {build} from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {validatePublicConfig} from '../src/domain.js';
const cwd=process.cwd(),out=path.join(cwd,'dist');
await fs.rm(out,{recursive:true,force:true});await fs.mkdir(out,{recursive:true});
await fs.cp(path.join(cwd,'public'),out,{recursive:true});
let configured={};try{configured=JSON.parse(await fs.readFile('public/config.json','utf8'));}catch{}
const config={url:process.env.SUPABASE_URL||configured.url||'',key:process.env.SUPABASE_PUBLISHABLE_KEY||configured.key||''};
if((config.url||config.key)&&!validatePublicConfig(config))throw new Error('Only an HTTPS Supabase project URL and sb_publishable_ key may be included.');
if(process.env.CI&&!validatePublicConfig(config))throw new Error('Deployment requires SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY repository variables.');
await fs.writeFile(path.join(out,'config.json'),JSON.stringify(config));
const result=await build({entryPoints:['src/main.js'],bundle:true,format:'esm',target:['safari15.4','chrome100'],outdir:'dist/assets',entryNames:'app-[hash]',assetNames:'[name]-[hash]',minify:true,sourcemap:false,metafile:true,legalComments:'linked'});
const js=Object.keys(result.metafile.outputs).find(p=>p.endsWith('.js')),css=Object.keys(result.metafile.outputs).find(p=>p.endsWith('.css'));
const jsPath='./'+js.replace('dist/',''),cssPath='./'+css.replace('dist/','');
const html=`<!doctype html>
<html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#8f1d2c"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="default"><meta name="apple-mobile-web-app-title" content="Pente Fino"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.co; connect-src 'self' https://*.supabase.co wss://*.supabase.co; font-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'"><link rel="manifest" href="./manifest.webmanifest"><link rel="icon" href="./icons/icon-192.png"><link rel="apple-touch-icon" href="./icons/icon-192.png"><link rel="stylesheet" href="${cssPath}"><title>Pente Fino de Apartamentos</title></head><body><div id="app"><main class="welcome"><p role="status">Carregando…</p></main></div><noscript>Ative o JavaScript para usar o aplicativo.</noscript><script type="module" src="${jsPath}"></script></body></html>`;
await fs.writeFile(path.join(out,'index.html'),html);await fs.writeFile(path.join(out,'.nojekyll'),'');
const shell=['./','./index.html',jsPath,cssPath,'./icons/icon-192.png','./icons/icon-512.png','./manifest.webmanifest'];
const version=crypto.createHash('sha256').update(html+await fs.readFile(js)).digest('hex').slice(0,12);
const sw=await fs.readFile('public/service-worker.js','utf8');await fs.writeFile(path.join(out,'service-worker.js'),sw.replace('__VERSION__',version).replace('__SHELL__',JSON.stringify(shell)));
console.log(`Built ${version}. Public configuration: ${validatePublicConfig(config)?'ready':'not connected'}.`);
