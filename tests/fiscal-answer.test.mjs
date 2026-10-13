import test from 'node:test';
import assert from 'node:assert/strict';
import {formatFiscalAnswer} from '../src/fiscal-answer.js';

const resumo={total:9,abertas:5,pendentes:3,em_correcao:2,corrigidas:4,conformes:0,
  servicos:[{servico:'Pintura',total:5,abertas:4},{servico:'Elétrica',total:4,abertas:1}]};
test('Fiscal responde contagem com todos os status abertos da RPC',()=>{
  const result={acao:'CONSULTAR_RESUMO',resumo};
  assert.match(formatFiscalAnswer('Quantas pendências temos?',result),/5 ocorrência\(s\) aberta\(s\): 3 pendente\(s\) e 2 em correção/);
  assert.match(formatFiscalAnswer('Resumo da obra',result),/9 ocorrência\(s\)/);
});
test('Fiscal identifica serviço pelo ranking real e reconhece ausência de abertas',()=>{
  const result={acao:'CONSULTAR_RESUMO',resumo};
  assert.match(formatFiscalAnswer('Qual serviço tem mais pendências?',result),/Pintura, com 4/);
  assert.match(formatFiscalAnswer('Qual serviço tem mais pendências?',{acao:'CONSULTAR_RESUMO',resumo:{servicos:[]}}),/Não há ocorrências abertas/);
});
test('Fiscal não inventa lista nem executa ações desconhecidas',()=>{
  assert.match(formatFiscalAnswer('Liste', {acao:'CONSULTAR_OCORRENCIAS',resumo,ocorrencias:[{id:'a'},{id:'b'}]}),/2 ocorrência\(s\)/);
  assert.throws(()=>formatFiscalAnswer('Apague',{acao:'EXCLUIR_OCORRENCIA',resumo}),/não permitida/);
  assert.throws(()=>formatFiscalAnswer('Resumo',null),/inválido/);
});
