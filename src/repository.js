import { createClient } from '@supabase/supabase-js';
import { draftRow } from './domain.js';

export const PHOTOS='checklist-fotos', REPORTS='checklist-relatorios';
export function createRepository(config) {
  const fetchWithTimeout=async (input, init={})=>{
    const controller=new AbortController();
    const onAbort=()=>controller.abort();
    init.signal?.addEventListener('abort',onAbort,{once:true});
    const timer=setTimeout(()=>controller.abort(),45000);
    try {return await fetch(input,{...init,signal:controller.signal});}
    catch(e) {if(e.name==='AbortError') throw new Error('A conexão demorou demais. Seu rascunho foi mantido; tente salvar novamente.'); throw e;}
    finally {clearTimeout(timer);init.signal?.removeEventListener('abort',onAbort);}
  };
  return new Repository(createClient(config.url,config.key,{global:{fetch:fetchWithTimeout},auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}}));
}
function check(result) { if(result.error) throw result.error; return result.data; }
export class Repository {
  constructor(client) {this.client=client;this.user=null;}
  async session() {const s=check(await this.client.auth.getSession()).session;this.user=s?.user||null;return this.user;}
  async login(email,password) {const data=check(await this.client.auth.signInWithPassword({email,password}));this.user=data.user;return data.user;}
  async logout() {check(await this.client.auth.signOut());this.user=null;}
  requireUser() {if(!this.user) throw new Error('Entre novamente para continuar.');return this.user.id;}
  async list(table,obraId) {
    const out=[];
    for(let offset=0;;offset+=500) {
      let query=this.client.from('chk_'+table).select('*').eq('user_id',this.requireUser()).order('id').range(offset,offset+499);
      if(obraId) query=query.eq('obra_id',obraId);
      const rows=check(await query);out.push(...rows);if(rows.length<500) return out;
    }
  }
  async insert(table,row) {return check(await this.client.from('chk_'+table).insert({...row,user_id:this.requireUser()}).select().single());}
  async update(table,id,row) {return check(await this.client.from('chk_'+table).update(row).eq('id',id).eq('user_id',this.requireUser()).select().single());}
  async remove(table,id) {const rows=check(await this.client.from('chk_'+table).delete().eq('id',id).eq('user_id',this.requireUser()).select('id'));if(!rows.length)throw new Error('O item já foi removido ou não está acessível.');}
  async load(obra) {
    const tables=['apartamentos','ambientes','servicos','itens','relatorios'];
    const rows=await Promise.all(tables.map(t=>this.list(t,obra.id)));
    return Object.fromEntries([['obra',obra],...tables.map((t,i)=>[t,rows[i]])]);
  }
  async signedPhoto(path) {return check(await this.client.storage.from(PHOTOS).createSignedUrl(path,900)).signedUrl;}
  async download(bucket,path) {const blob=check(await this.client.storage.from(bucket).download(path));if(!blob?.size)throw new Error('Arquivo vazio ou indisponível.');return blob;}
  async upload(bucket,path,blob) {
    if(!blob?.size)throw new Error('O arquivo está vazio. Selecione a foto novamente.');
    check(await this.client.storage.from(bucket).upload(path,blob,{upsert:true,contentType:blob.type,cacheControl:'60'}));
    // Verify authenticated reading before referring to the object in a database row.
    const verified=await this.download(bucket,path);
    if(verified.size!==blob.size)throw new Error('Não foi possível confirmar o envio completo. Tente novamente.');
  }
  async saveDraft(draft,onProgress=()=>{}) {
    const row=draftRow(draft,this.requireUser());
    if (!row.foto_antes_path && !draft.photos?.antes?.blob) throw new Error('Adicione a foto antes de salvar o registro.');
    for(const kind of ['antes','depois']) {
      const photo=draft.photos?.[kind];if(!photo?.blob) continue;
      // Versioned paths preserve the previous photo if the database write fails.
      const path=photo.path||`${this.user.id}/${draft.obra_id}/${draft.apartamento_id}/${draft.id}/${kind}-${crypto.randomUUID()}.jpg`;
      photo.path=path;onProgress(`Enviando foto ${kind}…`);
      await this.upload(PHOTOS,path,photo.blob);row[`foto_${kind}_path`]=path;
    }
    onProgress('Confirmando o registro…');
    // Idempotent ID prevents duplicate records after a timeout or retry.
    return check(await this.client.from('chk_itens').upsert(row,{onConflict:'id'}).select().single());
  }
  async saveReport(report) {
    const path=report.pdf_path||`${this.requireUser()}/${report.model.obra.id}/${report.id}.pdf`;
    await this.upload(REPORTS,path,report.blob);
    const m=report.model;
    const row={id:report.id,user_id:this.user.id,obra_id:m.obra.id,tipo:m.tipo,titulo:m.titulo,pavimento:m.filters.pavimento||null,servico:m.filters.servico||null,pdf_path:path,conteudo:{filters:m.filters,summary:m.summary,generated_at:m.created_at,record_count:m.items.length}};
    return check(await this.client.from('chk_relatorios').upsert(row,{onConflict:'id'}).select().single());
  }
  async deleteReport(report) {
    // Keep recoverable bytes until the database acknowledges the deletion.
    const blob=report.pdf_path?await this.download(REPORTS,report.pdf_path):null;
    if(report.pdf_path)check(await this.client.storage.from(REPORTS).remove([report.pdf_path]));
    try {await this.remove('relatorios',report.id);}
    catch(e) {
      // A failed delete must not leave a listed PDF pointing to a missing object.
      if(blob) await this.upload(REPORTS,report.pdf_path,blob);
      throw e;
    }
  }
}
