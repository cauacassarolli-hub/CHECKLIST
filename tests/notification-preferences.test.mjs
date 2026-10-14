import test from 'node:test';
import assert from 'node:assert/strict';
import {Repository} from '../src/repository.js';
import {DEFAULT_NOTIFICATION_PREFERENCES,normalizeNotificationPreferences,validateNotificationPreferences} from '../src/notification-preferences.js';

test('Preferências têm padrões explícitos e não ativam envios',()=>{
  assert.deepEqual(normalizeNotificationPreferences(null),{
    ativo:false,horario:'07:00',timezone:'America/Sao_Paulo',incluir_resumo:true
  });
  assert.equal(DEFAULT_NOTIFICATION_PREFERENCES.ativo,false);
});

test('Preferências aceitam apenas horários e fuso válidos',()=>{
  const input=validateNotificationPreferences({
    ativo:'true',horario:'18:30',timezone:'America/Sao_Paulo',incluir_resumo:'false'
  });
  assert.deepEqual(input,{ativo:true,horario:'18:30',timezone:'America/Sao_Paulo',incluir_resumo:false});
  assert.deepEqual(normalizeNotificationPreferences({...input,horario:'18:30:00'}),input);
  for(const time of ['24:00','7:00','25:50','12:60','18:30:45','']) {
    assert.throws(()=>validateNotificationPreferences({...input,horario:time}),/horário válido/);
  }
  assert.throws(()=>validateNotificationPreferences({...input,ativo:'other'}),/opções válidas/);
  assert.throws(()=>validateNotificationPreferences({...input,timezone:'Etc/UTC'}),/não é suportado/);
});

function mock(row=null,error=null){
  const calls=[];
  const chain={
    select(cols){calls.push(['select',cols]);return chain;},
    eq(k,v){calls.push(['eq',k,v]);return chain;},
    maybeSingle:async()=>error?{error}:{data:row},
    upsert(values,options){calls.push(['upsert',values,options]);return chain;},
    single:async()=>error?{error}:{data:row||{ativo:true,horario:'09:00:00',timezone:'America/Sao_Paulo',incluir_resumo:true}}
  };
  const repo=new Repository({from(table){calls.push(['from',table]);return chain;}});
  repo.user={id:'user-qa'};
  return {repo,calls};
}
test('Leitura de preferências é restrita ao usuário e à obra',async()=>{
  const {repo,calls}=mock();
  assert.equal(await repo.getNotificationPreferences('obra-qa'),null);
  assert.deepEqual(calls,[
    ['from','chk_preferencias_notificacao'],
    ['select','ativo,horario,timezone,incluir_resumo'],
    ['eq','obra_id','obra-qa'],
    ['eq','user_id','user-qa']
  ]);
});
test('Salvar preferências limita colunas, usa upsert único e retorna dados salvos',async()=>{
  const {repo,calls}=mock();
  const saved=await repo.saveNotificationPreferences('obra-qa',{
    ativo:true,horario:'09:00',timezone:'America/Sao_Paulo',incluir_resumo:true,
    user_id:'intruso',obra_id:'outra-obra',role:'admin'
  });
  assert.equal(saved.horario,'09:00:00');
  const upsert=calls.find(c=>c[0]==='upsert');
  assert.equal(upsert[1].user_id,'user-qa');
  assert.equal(upsert[1].obra_id,'obra-qa');
  assert.equal(upsert[1].horario,'09:00');
  assert.equal(upsert[1].role,undefined);
  assert.match(upsert[1].updated_at,/^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(upsert[2],{onConflict:'user_id,obra_id'});
  assert.ok(calls.some(c=>c[0]==='select'));
});
test('Sem sessão, obra ou horário válido não há chamadas de escrita',async()=>{
  const state=mock(),{repo,calls}=state;
  await assert.rejects(repo.saveNotificationPreferences('obra-qa',{ativo:true,horario:'25:00',incluir_resumo:true}),/horário válido/);
  assert.equal(calls.length,0);
  await assert.rejects(repo.saveNotificationPreferences('',{ativo:true,horario:'09:00',incluir_resumo:true}),/Selecione uma obra/);
  assert.equal(calls.length,0);
  repo.user=null;
  await assert.rejects(repo.getNotificationPreferences('obra-qa'),/Entre novamente/);
  await assert.rejects(repo.saveNotificationPreferences('obra-qa',{ativo:true,horario:'09:00',incluir_resumo:true}),/Entre novamente/);
  assert.equal(calls.length,0);
});
test('Erro da base é propagado sem declarar sucesso',async()=>{
  const {repo}=mock(null,new Error('Acesso negado pela RLS'));
  await assert.rejects(repo.getNotificationPreferences('obra-qa'),/Acesso negado/);
  await assert.rejects(repo.saveNotificationPreferences('obra-qa',{ativo:true,horario:'09:00',incluir_resumo:true}),/Acesso negado/);
});
