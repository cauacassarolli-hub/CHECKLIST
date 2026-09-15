export async function compressPhoto(file,maxSide=1800,quality=.82) {
  if(!file?.size)throw new Error('Nenhuma foto selecionada.');
  if(file.type && !file.type.startsWith('image/'))throw new Error('Escolha um arquivo de imagem.');
  const url=URL.createObjectURL(file);
  const img=new Image();img.decoding='async';
  try {
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('Não foi possível ler esta imagem. Tente a câmera ou uma foto JPEG/PNG da galeria.'));img.src=url;});
    const scale=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Não foi possível processar a foto.');
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Falha ao comprimir a foto. Tente novamente.')),'image/jpeg',quality));
    canvas.width=1;canvas.height=1;return blob;
  } finally {URL.revokeObjectURL(url);img.src='';}
}

let database;
async function db() {
  if(!database)database=new Promise((resolve,reject)=>{const r=indexedDB.open('pente-fino-drafts',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  return database;
}
async function transaction(mode,action) {
  const database=await db();
  return new Promise((resolve,reject)=>{const tx=database.transaction('drafts',mode);let result;const request=action(tx.objectStore('drafts'));if(request)request.onsuccess=()=>{result=request.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
}
export const drafts={get:key=>transaction('readonly',s=>s.get(key)),put:(key,value)=>transaction('readwrite',s=>s.put(value,key)),remove:key=>transaction('readwrite',s=>s.delete(key)),clear:()=>transaction('readwrite',s=>s.clear())};
