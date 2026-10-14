import test from 'node:test';
import assert from 'node:assert/strict';
import {planDailyDigest,DAILY_DELIVERY_ZONE,DAILY_DELIVERY_CHANNEL} from '../src/daily-delivery.js';

const prefs={ativo:true,incluir_resumo:true,horario:'07:00:00',timezone:'America/Sao_Paulo'};
const context=(time,overrides={})=>({
  userId:'user-qa',obraId:'obra-qa',
  authorized:true,channelApproved:true,now:time,...overrides
});

test('Plano diário respeita exatamente o horário de Brasília',()=>{
  const before=planDailyDigest(prefs,context('2026-10-14T09:59:59Z'));
  assert.equal(before.eligible,false);
  assert.equal(before.reason,'antes_do_horario');
  const due=planDailyDigest(prefs,context('2026-10-14T10:00:00Z'));
  assert.equal(due.eligible,true);
  assert.equal(due.reason,'apto_para_preparacao');
  assert.equal(due.localDate,'2026-10-14');
  assert.equal(due.horario,'07:00');
  assert.equal(due.timezone,DAILY_DELIVERY_ZONE);
  assert.deepEqual(due.idempotency,{
    user_id:'user-qa',obra_id:'obra-qa',data_local:'2026-10-14',canal:DAILY_DELIVERY_CHANNEL
  });
  assert.equal(due.canSend,false,'Planejar nunca autoriza enviar');
});

test('Avaliação usa dia local e não o calendário UTC',()=>{
  const late=planDailyDigest(prefs,context('2026-10-15T01:59:00Z'));
  assert.equal(late.localDate,'2026-10-14');
  const midnight=planDailyDigest(prefs,context('2026-10-15T03:00:00Z'));
  assert.equal(midnight.localDate,'2026-10-15');
  assert.equal(midnight.reason,'antes_do_horario');
  const next=planDailyDigest(prefs,context('2026-10-15T10:00:00Z',{
    previousLocalDate:'2026-10-14'
  }));
  assert.equal(next.eligible,true,'Novo dia volta a permitir preparação');
});

test('Uma entrega anterior no mesmo dia bloqueia tentativas duplicadas',()=>{
  const result=planDailyDigest(prefs,context('2026-10-14T12:00:00Z',{
    previousLocalDate:'2026-10-14'
  }));
  assert.deepEqual(result,{eligible:false,reason:'ja_preparado',canSend:false,localDate:'2026-10-14'});
  assert.throws(()=>planDailyDigest(prefs,context('2026-10-14T12:00:00Z',{
    previousLocalDate:'14/10/2026'
  })),/controle de duplicidade/);
});

test('Desativação e falta de participação revogam a elegibilidade imediatamente',()=>{
  assert.equal(planDailyDigest(prefs,context('2026-10-14T12:00:00Z',{authorized:false})).reason,'sem_acesso');
  assert.equal(planDailyDigest(null,context('2026-10-14T12:00:00Z')).reason,'sem_preferencia');
  assert.equal(planDailyDigest({...prefs,ativo:false},context('2026-10-14T12:00:00Z')).reason,'desativado');
  assert.equal(planDailyDigest({...prefs,incluir_resumo:false},context('2026-10-14T12:00:00Z')).reason,'resumo_desabilitado');
});

test('Preferência antiga não concede consentimento para e-mail',()=>{
  const result=planDailyDigest(prefs,context('2026-10-14T11:00:00Z',{channelApproved:false}));
  assert.equal(result.eligible,false);
  assert.equal(result.reason,'canal_nao_autorizado');
  assert.equal(result.canSend,false);
});

test('Dados inválidos não permitem autorização por suposição',()=>{
  assert.throws(()=>planDailyDigest(prefs,{userId:'',obraId:'w'}),/Identificação/);
  assert.throws(()=>planDailyDigest(prefs,context('2026-10-14T10:00:00Z',{authorized:'true'})),/Autorização/);
  assert.throws(()=>planDailyDigest(prefs,context('invalid-date')),/Data de avaliação/);
  assert.throws(()=>planDailyDigest({...prefs,horario:'25:00'},context('2026-10-14T12:00:00Z')),/horário válido/);
  assert.throws(()=>planDailyDigest({...prefs,timezone:'UTC'},context('2026-10-14T12:00:00Z')),/fuso horário/);
});

test('O planejamento nunca inclui endereços, fotos, ocorrências ou corpo da mensagem',()=>{
  const result=planDailyDigest(prefs,context('2026-10-14T10:00:00Z'));
  for(const key of ['email','recipient','message','ocorrencias','fotos','statusEnvio']) {
    assert.equal(key in result,false,key);
  }
  assert.equal(result.canSend,false);
});
