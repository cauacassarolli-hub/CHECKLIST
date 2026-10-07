import test from 'node:test';
import assert from 'node:assert/strict';
import {FiscalAgentGateway} from '../src/fiscal-agent.js';

function setup(){
  const calls=[];
  const repository={queryOccurrences:async(obraId,filters)=>{calls.push({obraId,filters});return{filtros:filters,resumo:{total:1,abertas:1},ocorrencias:[{id:'o1'}]};}};
  return{gateway:new FiscalAgentGateway(repository),calls};
}

test('gateway consulta ocorrencias exclusivamente pela RPC do repository',async()=>{
  const {gateway,calls}=setup();
  const out=await gateway.execute('obra-1',{acao:'consultar_ocorrencias',filtros:{pavimento:'5'}});
  assert.equal(out.acao,'CONSULTAR_OCORRENCIAS');assert.equal(out.ocorrencias[0].id,'o1');
  assert.deepEqual(calls,[{obraId:'obra-1',filters:{pavimento:'5'}}]);
});

test('gateway de resumo nao devolve lista de ocorrencias',async()=>{
  const {gateway}=setup();const out=await gateway.execute('obra-1',{acao:'CONSULTAR_RESUMO'});
  assert.equal(out.resumo.total,1);assert.equal('ocorrencias' in out,false);
});

test('gateway bloqueia qualquer acao de escrita antes de chegar ao repository',async()=>{
  const {gateway,calls}=setup();
  for(const acao of ['CRIAR_OCORRENCIA','ALTERAR_STATUS','EXCLUIR_OCORRENCIA','ENVIAR_EMAIL']) await assert.rejects(gateway.execute('obra-1',{acao}),/não permitida/);
  assert.equal(calls.length,0);
  await assert.rejects(gateway.execute('',{acao:'CONSULTAR_RESUMO'}),/Selecione uma obra/);
  await assert.rejects(gateway.execute('obra-1',null),/inválida/);
});
