import test from 'node:test';
import assert from 'node:assert/strict';
import {describeEmailSimulation} from '../src/email-simulation-view.js';
import {Repository} from '../src/repository.js';

const candidate={
  apto_para_preparar:true,motivo:'preparacao_possivel_em_simulacao',
  data_local:'2026-10-14',horario:'07:00',
  envio_executado:false,reserva_criada:false
};
test('Exibição diferencia elegibilidade hipotética de entrega executada',()=>{
  const display=describeEmailSimulation(candidate);
  assert.equal(display.apto,true);
  assert.match(display.titulo,/Prévia apta/);
  assert.match(display.explicacao,/preparação atendidas/);
  assert.match(display.aviso,/Nenhum e-mail foi enviado/);
  const blocked=describeEmailSimulation({...candidate,apto_para_preparar:false,motivo:'canal_nao_autorizado'});
  assert.equal(blocked.apto,false);
  assert.match(blocked.explicacao,/não está autorizado/);
});
test('Diagnóstico nunca repassa mensagens arbitrárias ou dados privados do servidor',()=>{
  const display=describeEmailSimulation({...candidate,apto_para_preparar:false,motivo:'código inventado'});
  assert.equal(display.explicacao,'Não foi possível concluir a simulação.');
  assert.equal(JSON.stringify(display).includes('código inventado'),false);
  assert.throws(()=>describeEmailSimulation({...candidate,envio_executado:true}),/Resposta inválida/);
  assert.throws(()=>describeEmailSimulation({...candidate,reserva_criada:true}),/Resposta inválida/);
  assert.throws(()=>describeEmailSimulation({...candidate,motivo:'sem_acesso'}),/inconsistente/);
  assert.throws(()=>describeEmailSimulation(null),/Resposta inválida/);
});
function setup({response=candidate,error=null}={}){
  const calls=[];
  const repository=new Repository({
    functions:{invoke:async(name,args)=>{
      calls.push([name,args]);
      return error?{error}:{data:response};
    }}
  });
  repository.user={id:'logged-in'};
  return {repository,calls};
}
test('Repositório chama somente a Edge Function sem e-mail ou destinatário',async()=>{
  const {repository,calls}=setup();
  const result=await repository.simulateEmailDigest('obra-id');
  assert.deepEqual(result,candidate);
  assert.deepEqual(calls,[['simular-resumo-email',{body:{work_id:'obra-id'}}]]);
});
test('Sem usuário, obra ou resposta de simulação válida não informa sucesso',async()=>{
  let state=setup();state.repository.user=null;
  await assert.rejects(state.repository.simulateEmailDigest('obra-id'),/Entre novamente/);
  assert.equal(state.calls.length,0);
  state=setup();
  await assert.rejects(state.repository.simulateEmailDigest(''),/Selecione uma obra/);
  assert.equal(state.calls.length,0);
  state=setup({response:{...candidate,envio_executado:true}});
  await assert.rejects(state.repository.simulateEmailDigest('obra-id'),/Resposta inválida/);
});
test('Falha autenticada da Edge Function é apresentada sem declarar envio',async()=>{
  const error={context:{json:async()=>({error:'Sessão inválida. Entre novamente.'})}};
  const {repository}=setup({error});
  await assert.rejects(repository.simulateEmailDigest('obra-id'),/Sessão inválida/);
});
