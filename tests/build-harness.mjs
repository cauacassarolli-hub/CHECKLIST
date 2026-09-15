import{build}from'esbuild';import fs from'node:fs/promises';
await fs.mkdir('test-results/harness/mobile',{recursive:true});
await build({entryPoints:['tests/harness.js'],bundle:true,format:'esm',outfile:'test-results/harness/qa.js',target:'safari15.4'});
const html='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>QA local · Pente Fino</title><link rel="stylesheet" href="/qa.css"><style>.qa-controls{padding:8px;background:#ffeda9;font:12px system-ui;display:flex;gap:8px;align-items:center;flex-wrap:wrap}.qa-controls button{font:12px system-ui;min-height:44px}.qa-controls strong{font-size:10px}</style></head><body><div id="app"></div><script type="module" src="/qa.js"></script></body></html>';
await fs.writeFile('test-results/harness/index.html',html);
await fs.writeFile('test-results/harness/mobile/index.html','<!doctype html><html><head><title>QA 390px</title></head><body style="margin:0;background:#ddd"><iframe title="Aplicativo mobile 390px" src="/" style="width:390px;height:844px;border:0;display:block;margin:0 auto"></iframe></body></html>');
