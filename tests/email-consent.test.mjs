import test from 'node:test';
import assert from 'node:assert/strict';
import {Repository} from '../src/repository.js';
import {DEFAULT_EMAIL_CONSENT,validateEmailConsentChoice,
  normalizeEmailConsent,hasCurrentEmailConsent} from '../src/email-consent.js';

test('A autorização por e-mail nunca é inferida das preferências antigas',()=>{
  assert.deepEqual(normalizeEmailConsent(null),DEFAULT_EMAIL_CONSENT);
  assert.equal(DEFAULT_EMAIL_CONSENT.autorizado,false);
  assert.equal(hasCurrentEmailConsent({autorizado:true,autorizado_em:'2026-10-14'},null),false);
  assert.equal(validateEmailConsentChoice('true'),true);
  assert.equal(validateEmailConsentChoice('false'),false);
  assert.throws(()=>validateEmailConsentChoice(undefined),/Escolha explicitamente/);
  assert.throws(()=>validateEmailConsentChoice('yes'),/Escolha explicitamente/);
});

test('Histórico de consentimento é validado antes de mostrar autorização',()=>{
  const row={autorizado:true,autorizado_em:'2026-10-14T20:00:00Z',revogado_em:null,user_id:'u',obra_id:'w'};
  assert.deepEqual(normalizeEmailConsent(row),{
    autorizado:true,autorizado_em:'2026-10-14T20:00:00Z',revogado_em:null
  });
  assert.equal(hasCurrentEmailConsent(row,{userId:'u',obraId:'w'}),true);
  assert.equal(hasCurrentEmailConsent(row,{userId:'outro',obraId:'w'}),false);
  assert.equal(hasCurrentEmailConsent(row,{userId:'u',obraId:'outra'}),false);
  assert.equal(hasCurrentEmailConsent({...row,autorizado:false,revogado_em:'2026-10-14T22:00:00Z'},{userId:'u',obraId:'w'}),false);
  assert.throws(()=>normalizeEmailConsent({...row,revogado_em:'2026-10-14T22:00:00Z'}),/inconsistente/);
  assert.throws(()=>normalizeEmailConsent({...row,autorizado_em:null}),/inconsistente/);
  assert.throws(()=>normalizeEmailConsent({autorizado:'true'}),/inválidos/);
});

const returned={autorizado:true,autorizado_em:'2026-10-14T20:00:00Z',revogado_em:null};
function mock(error=null){
  const calls=[];
  const chain={
    select(columns){calls.push(['select',columns]);return chain;},
    eq(column,value){calls.push(['eq',column,value]);return chain;},
    maybeSingle:async()=>error?{error}:{data:returned}
  };
  const repository=new Repository({
    from(table){calls.push(['from',table]);return chain;},
    rpc:async(name,args)=>{calls.push(['rpc',name,args]);return error?{error}:{data:returned};}
  });
  repository.user={id:'user-qa'};
  return {repository,calls};
}
test('Consulta só lê o consentimento da própria conta e da obra',async()=>{
  const {repository,calls}=mock();
  assert.deepEqual(await repository.getEmailConsent('obra-qa'),returned);
  assert.deepEqual(calls,[
    ['from','chk_consentimentos_email_resumo'],
    ['select','autorizado,autorizado_em,revogado_em'],
    ['eq','obra_id','obra-qa'],
    ['eq','user_id','user-qa']
  ]);
});
test('Autorização e revogação usam apenas a RPC com bool explícito',async()=>{
  const {repository,calls}=mock();
  assert.deepEqual(await repository.saveEmailConsent('obra-qa','true'),returned);
  assert.deepEqual(await repository.saveEmailConsent('obra-qa',false),returned);
  assert.deepEqual(calls,[
    ['rpc','chk_configurar_consentimento_email_resumo',{p_obra_id:'obra-qa',p_autorizado:true}],
    ['rpc','chk_configurar_consentimento_email_resumo',{p_obra_id:'obra-qa',p_autorizado:false}]
  ]);
  assert.equal(calls.some(c=>c[0]==='from'),false,'Cliente não pode forjar datas de consentimento');
});
test('Sem sessão, obra ou opção explícita, nenhum consentimento é gravado',async()=>{
  const {repository,calls}=mock();
  await assert.rejects(repository.saveEmailConsent('',true),/Selecione uma obra/);
  await assert.rejects(repository.saveEmailConsent('obra-qa',null),/Escolha explicitamente/);
  assert.equal(calls.length,0);
  repository.user=null;
  await assert.rejects(repository.getEmailConsent('obra-qa'),/Entre novamente/);
  await assert.rejects(repository.saveEmailConsent('obra-qa',true),/Entre novamente/);
  assert.equal(calls.length,0);
});
test('Erros do Supabase são propagados, não confirmados como sucesso',async()=>{
  const {repository}=mock(new Error('Acesso revogado'));
  await assert.rejects(repository.getEmailConsent('obra-qa'),/Acesso revogado/);
  await assert.rejects(repository.saveEmailConsent('obra-qa',true),/Acesso revogado/);
});
