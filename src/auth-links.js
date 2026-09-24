const MARKER='pf-password-setup-user';
const LINK_ERROR='Este link é inválido, expirou ou já foi utilizado. Peça ao proprietário para reenviar o convite.';
const read=storage=>{try{return storage?.getItem(MARKER);}catch{return null;}};
export function clearPasswordSetup(storage=globalThis.sessionStorage){try{storage?.removeItem(MARKER);}catch{}}
export async function consumeAuthLink(client,{href=globalThis.location?.href,replace=url=>globalThis.history?.replaceState(null,'',url),storage=globalThis.sessionStorage}={}) {
  if(!href)return null;
  const url=new URL(href),hash=new URLSearchParams(url.hash.slice(1));
  const type=hash.get('type')||url.searchParams.get('type');
  const access=hash.get('access_token'),refresh=hash.get('refresh_token'),tokenHash=url.searchParams.get('token_hash');
  const callback=!!(access||refresh||tokenHash||hash.has('error')||url.searchParams.has('error'));
  if(callback){
    clearPasswordSetup(storage);
    // Remove secrets/errors before any I/O; no raw provider response is displayed.
    url.hash='';for(const key of ['token_hash','type','error','error_code','error_description','code'])url.searchParams.delete(key);
    replace(url.pathname+url.search);
    if(hash.has('error')||new URL(href).searchParams.has('error')||!['invite','recovery'].includes(type))throw new Error(LINK_ERROR);
    let result;
    if(access&&refresh)result=await client.auth.setSession({access_token:access,refresh_token:refresh});
    else if(tokenHash)result=await client.auth.verifyOtp({token_hash:tokenHash,type});
    else throw new Error(LINK_ERROR);
    if(result.error)throw new Error(LINK_ERROR);
    const verified=await client.auth.getUser();
    if(verified.error||!verified.data?.user)throw new Error(LINK_ERROR);
    const user=verified.data.user;
    try{storage?.setItem(MARKER,user.id);}catch{}
    return user;
  }
  const pending=read(storage);
  if(pending){
    const verified=await client.auth.getUser();
    if(!verified.error&&verified.data?.user?.id===pending)return verified.data.user;
    clearPasswordSetup(storage);
  }
  if(url.pathname.endsWith('/auth.html'))throw new Error(LINK_ERROR);
  return null;
}
export function validateNewPassword(password,confirmation){
  if(typeof password!=='string'||password.length<10)throw new Error('Use uma senha com pelo menos 10 caracteres.');
  if(password!==confirmation)throw new Error('As senhas não são iguais. Confira os dois campos.');
}
