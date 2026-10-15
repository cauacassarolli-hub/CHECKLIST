import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmailDigestDryRun} from '../src/email-dry-run.js';

const userId='10000000-0000-4000-8000-000000000001';
const obraId='20000000-0000-4000-8000-000000000002';
const identity={id:userId,email:'qa@example.invalid',email_confirmed_at:'2026-10-01T12:00:00Z'};
const eligible=()=>({
  user_id:userId,obra_id:obraId,autorizado_na_obra:true,
  ledger_consultado:true,reserva_existente:false,
  preferencias:{user_id:userId,obra_id:obraId,ativo:true,incluir_resumo:true,horario:'07:00:00',timezone:'America/Sao_Paulo'},
  consentimento:{user_id:userId,obra_id:obraId,autorizado:true,autorizado_em:'2026-10-01T15:00:00Z',revogado_em:null}
});
function setup({user=identity,state=eligible(),now=new Date('2026-10-14T11:00:00Z'),failAuth=false,failWork=false}={}){
  const calls=[];
  const service=createEmailDigestDryRun({
    getAuthUser:async id=>{calls.push('auth');if(failAuth)throw Error('connection failed');return user;},
    getWorkState:async()=>{calls.push('state');if(failWork)throw Error('connection failed');return state;},
    clock:()=>now
  });
  return {calls,run:()=>service({userId,obraId})};
}
test('Resumo em simulação é apto, mas jamais realiza reserva ou envio',async()=>{
  const s=setup(),r=await s.run();
  assert.deepEqual(r,{apto_para_preparar:true,motivo:'preparacao_possivel_em_simulacao',
    data_local:'2026-10-14',horario:'07:00',fuso:'America/Sao_Paulo',envio_executado:false,reserva_criada:false});
  assert.deepEqual(s.calls,['auth','state']);
  assert.equal(JSON.stringify(r).includes(identity.email),false);
});
test('Falta de identidade ou email confirmado bloqueia antes de ler a obra',async()=>{
  for(const user of [null,{...identity,id:'outro'},{...identity,email:''},{...identity,email_confirmed_at:null},{...identity,email_confirmed_at:'invalido'}]){
    const s=setup({user});const r=await s.run();
    assert.equal(r.apto_para_preparar,false);
    assert.deepEqual(s.calls,['auth']);
  }
});
test('Acesso revogado e consentimento não autorizado bloqueiam',async()=>{
  for(const [state,reason] of [
    [{...eligible(),autorizado_na_obra:false},'sem_acesso'],
    [{...eligible(),consentimento:{...eligible().consentimento,autorizado:false}},'canal_nao_autorizado'],
    [{...eligible(),consentimento:{...eligible().consentimento,revogado_em:'2026-10-14T10:00:00Z'}},'canal_nao_autorizado'],
    [{...eligible(),consentimento:{...eligible().consentimento,user_id:'outro'}},'canal_nao_autorizado'],
    [{...eligible(),preferencias:null},'sem_preferencia'],
    [{...eligible(),preferencias:{...eligible().preferencias,ativo:false}},'desativado']
  ]){const r=await setup({state}).run();assert.equal(r.motivo,reason);assert.equal(r.reserva_criada,false);}
});
test('Deduplicação é verificada explicitamente, nunca presumida',async()=>{
  for(const [state,reason] of [
    [{...eligible(),reserva_existente:true},'ja_preparado'],
    [{...eligible(),ledger_consultado:false},'ledger_nao_verificado'],
    [{...eligible(),ledger_consultado:undefined},'dados_incompletos'],
    [{...eligible(),reserva_existente:undefined},'dados_incompletos'],
    [{...eligible(),obra_id:'outra'},'dados_incompletos']
  ]){const r=await setup({state}).run();assert.equal(r.motivo,reason);}
});
test('Horário local e erros do backend são tratados com segurança',async()=>{
  assert.equal((await setup({now:new Date('2026-10-14T09:59:00Z')}).run()).motivo,'antes_do_horario');
  assert.equal((await setup({now:new Date('2026-10-15T01:00:00Z')}).run()).data_local,'2026-10-14');
  assert.equal((await setup({state:{...eligible(),preferencias:{...eligible().preferencias,horario:'25:00'}}}).run()).motivo,'preferencias_invalidas');
  assert.equal((await setup({failAuth:true}).run()).motivo,'auth_indisponivel');
  assert.equal((await setup({failWork:true}).run()).motivo,'consulta_indisponivel');
});
test('Rejeita argumentos inválidos e não possui ações de escrita',async()=>{
  const service=createEmailDigestDryRun({getAuthUser:async()=>identity,getWorkState:async()=>eligible()});
  await assert.rejects(service({userId:'inválido',obraId}),/Identificadores inválidos/);
  assert.deepEqual(Object.keys(await setup().run()).sort(),['apto_para_preparar','data_local','envio_executado','fuso','horario','motivo','reserva_criada'].sort());
});

test('Preferências de outra obra ou pessoa nunca autorizam simulação',async()=>{
  for(const invalid of [
    {...eligible(),preferencias:{...eligible().preferencias,user_id:'outro'}},
    {...eligible(),preferencias:{...eligible().preferencias,obra_id:'outra-obra'}},
    {...eligible(),preferencias:{...eligible().preferencias,user_id:undefined}},
    {...eligible(),preferencias:{...eligible().preferencias,obra_id:undefined}}
  ]){
    const r=await setup({state:invalid}).run();
    assert.equal(r.apto_para_preparar,false);
    assert.equal(r.motivo,'dados_incompletos');
    assert.equal(r.reserva_criada,false);
  }
});
test('Consentimento ausente, inválido ou datado no futuro bloqueia preparação',async()=>{
  for(const value of [null,'invalido','2099-01-01T00:00:00Z','1970-01-01T00:00:00Z']){
    const state={...eligible(),consentimento:{...eligible().consentimento,autorizado_em:value}};
    const r=await setup({state}).run();
    assert.equal(r.apto_para_preparar,false);
    assert.equal(r.motivo,'canal_nao_autorizado');
  }
});

test('Consentimento requer estado explícito de não revogação',async()=>{
  const original=eligible().consentimento;
  const {revogado_em, ...withoutRevocation}=original;
  for(const consentimento of [
    withoutRevocation,
    {...original,revogado_em:undefined},
    {...original,revogado_em:''},
    {...original,revogado_em:false},
    {...original,revogado_em:0},
    {...original,revogado_em:'2026-10-01T15:00:00Z'}
  ]){
    const r=await setup({state:{...eligible(),consentimento}}).run();
    assert.equal(r.apto_para_preparar,false);
    assert.equal(r.motivo,'canal_nao_autorizado');
    assert.equal(r.envio_executado,false);
    assert.equal(r.reserva_criada,false);
  }
});
