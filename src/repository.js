import { createClient } from '@supabase/supabase-js';
import { draftRow } from './domain.js';
import {consumeAuthLink,clearPasswordSetup,validateNewPassword} from './auth-links.js';

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
  async acceptInvites() {this.requireUser();return check(await this.client.rpc('chk_aceitar_convites'));}
  async authorizeMember(obraId,email,nome) {
    this.requireUser();
    const result=await this.client.functions.invoke('convidar-colega',{body:{work_id:obraId,member_email:email.trim(),member_name:nome.trim()}});
    if(result.error){let message;try{message=(await result.error.context?.json())?.error;}catch{}
      throw new Error(message||'Não foi possível confirmar o convite. Confira a lista e tente novamente.');}
    return result.data;
  }
  async passwordLink(options) {const user=await consumeAuthLink(this.client,options);if(user)this.user=user;return user;}
  async setPassword(password,confirmation) {
    this.requireUser();validateNewPassword(password,confirmation);
    const data=check(await this.client.auth.updateUser({password}));this.user=data.user;clearPasswordSetup();return data.user;
  }
  async resetPassword(email) {check(await this.client.auth.resetPasswordForEmail(email.trim(),{redirectTo:new URL('./auth.html',location.href).href}));}
  async cancelPasswordSetup() {check(await this.client.auth.signOut({scope:'local'}));this.user=null;clearPasswordSetup();}
  async revokeMember(obraId,{memberId=null,inviteId=null}) {this.requireUser();return check(await this.client.rpc('chk_revogar_membro',{work_id:obraId,member_id:memberId,invite_id:inviteId}));}
  async get(table,id) {this.requireUser();return check(await this.client.from('chk_'+table).select('*').eq('id',id).maybeSingle());}
  async list(table,obraId) {
    this.requireUser();
    const out=[];
    for(let offset=0;;offset+=500) {
      // RLS resolves active work membership; user_id remains the original author.
      let query=this.client.from('chk_'+table).select('*').order('id').range(offset,offset+499);
      if(obraId) query=query.eq('obra_id',obraId);
      const rows=check(await query);out.push(...rows);if(rows.length<500) return out;
    }
  }
  async insert(table,row) {return check(await this.client.from('chk_'+table).insert({...row,user_id:this.requireUser()}).select().single());}
  async update(table,id,row) {this.requireUser();return check(await this.client.from('chk_'+table).update(row).eq('id',id).select().single());}
  async remove(table,id) {this.requireUser();const rows=check(await this.client.from('chk_'+table).delete().eq('id',id).select('id'));if(!rows.length)throw new Error('O item já foi removido ou não está acessível.');}
  async load(obra) {
    const current=await this.get('obras',obra.id);
    if(!current) {const e=new Error('Seu acesso a esta obra foi removido ou ela não está mais disponível.');e.code='WORK_ACCESS';throw e;}
    const tables=['apartamentos','ambientes','servicos','prioridades','itens','relatorios','membros_obra','convites_obra'];
    const rows=await Promise.all(tables.map(t=>this.list(t,obra.id)));
    const activities=check(await this.client.from('chk_atividades').select('*').eq('obra_id',obra.id).order('created_at',{ascending:false}).order('id').limit(50));
    return Object.fromEntries([['obra',current],['atividades',activities],...tables.map((t,i)=>[t,rows[i]])]);
  }
  async signedPhoto(path) {return check(await this.client.storage.from(PHOTOS).createSignedUrl(path,60)).signedUrl;}
  async download(bucket,path) {const blob=check(await this.client.storage.from(bucket).download(path));if(!blob?.size)throw new Error('Arquivo vazio ou indisponível.');return blob;}
  async upload(bucket,path,blob) {
    if(!blob?.size)throw new Error('O arquivo está vazio. Selecione a foto novamente.');
    check(await this.client.storage.from(bucket).upload(path,blob,{upsert:true,contentType:blob.type,cacheControl:'60'}));
    // Verify authenticated reading before referring to the object in a database row.
    const verified=await this.download(bucket,path);
    if(verified.size!==blob.size)throw new Error('Não foi possível confirmar o envio completo. Tente novamente.');
  }
  async saveDraft(draft,onProgress=()=>{}) {
    const userId=this.requireUser(),row=draftRow(draft,draft.user_id||userId);
    const conflict=()=>Object.assign(new Error('Este registro foi alterado por outra pessoa, removido ou ficou indisponível. Seu rascunho foi mantido. Recarregue o registro para conferir antes de editar novamente.'),{code:'CONFLICT'});
    if(draft.existing && !Number.isInteger(draft.versao))throw conflict();
    if(row.data_correcao)draft.data_correcao=row.data_correcao;
    if (!row.foto_antes_path && !draft.photos?.antes?.blob) throw new Error('Adicione a foto antes de salvar o registro.');
    for(const kind of ['antes','depois']) {
      const photo=draft.photos?.[kind];if(!photo?.blob) continue;
      // Versioned paths preserve the previous photo if the database write fails.
      const path=photo.path||`${this.user.id}/${draft.obra_id}/${draft.apartamento_id}/${draft.id}/${kind}-${crypto.randomUUID()}.jpg`;
      photo.path=path;onProgress(`Enviando foto ${kind}…`);
      await this.upload(PHOTOS,path,photo.blob);row[`foto_${kind}_path`]=path;
    }
    onProgress('Confirmando o registro…');
    // Compare-and-swap prevents silent loss of a colleague's corrections.
    let result;
    if(draft.existing) {
      const {id,user_id,obra_id,apartamento_id,...changes}=row;
      result=await this.client.from('chk_itens').update(changes).eq('id',id).eq('versao',draft.versao).select().maybeSingle();
      if(result.error)throw result.error;
      if(result.data)return result.data;
    } else {
      result=await this.client.from('chk_itens').insert(row).select().single();
      if(!result.error)return result.data;
      if(result.error.code!=='23505')throw result.error;
    }
    // A successful write with a lost response may be retried, never overwritten.
    const saved=await this.get('itens',draft.id);
    const fields=['user_id','obra_id','apartamento_id','ambiente','servico','status','responsavel','prioridade','observacao','prazo','foto_antes_path','foto_depois_path'];
    if(saved && fields.every(k=>(saved[k]??null)===(row[k]??null)) &&
      (saved.data_correcao ? Date.parse(saved.data_correcao) : null)===(row.data_correcao ? Date.parse(row.data_correcao) : null))return saved;
    throw conflict();
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
