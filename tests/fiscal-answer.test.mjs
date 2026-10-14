import test from 'node:test';
import assert from 'node:assert/strict';
import {formatFiscalAnswer} from '../src/fiscal-answer.js';

const resumo={total:9,abertas:5,pendentes:3,em_correcao:2,corrigidas:4,conformes:0,
  servicos:[{servico:'Pintura',total:5,abertas:4},{servico:'Elétrica',total:4,abertas:1}]};
const response=(acao='CONSULTAR_RESUMO',patch={},filtros={})=>({acao,resumo:{...resumo,...patch},filtros});

test('Fiscal usa todos os status abertos ao responder uma contagem',()=>{
  assert.match(formatFiscalAnswer('Quantas pendências temos?',response()),/5 ocorrências abertas: 3 pendentes e 2 em correção/);
  assert.match(formatFiscalAnswer('Resumo da obra',response()),/9 ocorrências/);
});
test('Ranking usa as ocorrências abertas, não o total nem apenas pendentes',()=>{
  assert.match(formatFiscalAnswer('Qual serviço tem mais pendências?',response()),/Pintura, com 4 ocorrências abertas/);
  assert.match(formatFiscalAnswer('Qual serviço tem mais pendências?',response('CONSULTAR_RESUMO',{servicos:[]})),/Não há ocorrências abertas/);
});
test('Ranking não escolhe vencedor arbitrário em empate',()=>{
  const tie=response('CONSULTAR_RESUMO',{servicos:[{servico:'Pintura',abertas:2},{servico:'Elétrica',abertas:2}]});
  assert.match(formatFiscalAnswer('Qual serviço tem mais pendências?',tie),/empate entre Pintura, Elétrica: 2 ocorrências abertas/);
});
test('Filtro de status determina resposta precisa sem ocultar corrigidas',()=>{
  assert.match(formatFiscalAnswer('Quantas pendências corrigidas?',response('CONSULTAR_RESUMO',{}, {status:'corrigido'})),/4 ocorrências corrigidas/);
  assert.match(formatFiscalAnswer('Quantas em correção?',response('CONSULTAR_RESUMO',{}, {status:'correcao'})),/2 ocorrências em correção/);
  assert.match(formatFiscalAnswer('Quantas pendentes?',response('CONSULTAR_RESUMO',{}, {status:'pendente'})),/3 ocorrências pendentes/);
});
test('Lista usa apenas ocorrências efetivamente recebidas',()=>{
  assert.match(formatFiscalAnswer('Liste', {...response('CONSULTAR_OCORRENCIAS'),ocorrencias:[{id:'a'}]}),/1 ocorrência para/);
  assert.match(formatFiscalAnswer('Liste', {...response('CONSULTAR_OCORRENCIAS'),ocorrencias:[]}),/0 ocorrências/);
});
test('Fiscal falha de maneira explícita com dados ausentes ou ação proibida',()=>{
  assert.throws(()=>formatFiscalAnswer('Resumo',null),/inválido/);
  assert.throws(()=>formatFiscalAnswer('Resumo',response('CONSULTAR_RESUMO',{abertas:undefined})),/Dados incompletos/);
  assert.throws(()=>formatFiscalAnswer('Qual serviço tem mais pendências?',response('CONSULTAR_RESUMO',{servicos:undefined})),/indisponível/);
  assert.throws(()=>formatFiscalAnswer('Liste',response('CONSULTAR_OCORRENCIAS')),/indisponível/);
  assert.throws(()=>formatFiscalAnswer('Apague',response('EXCLUIR_OCORRENCIA')),/não permitida/);
});

test('Fiscal diferencia zero válido de contagem ausente',()=>{
  const empty={total:0,abertas:0,pendentes:0,em_correcao:0,corrigidas:0,conformes:0,servicos:[]};
  assert.match(formatFiscalAnswer('Quantas pendências temos?',{acao:'CONSULTAR_RESUMO',resumo:empty}),/0 ocorrências abertas/);
  assert.match(formatFiscalAnswer('Resumo da obra',{acao:'CONSULTAR_RESUMO',resumo:empty}),/0 ocorrências/);
  assert.throws(()=>formatFiscalAnswer('Resumo da obra',{acao:'CONSULTAR_RESUMO',resumo:{...empty,total:null}}),/Dados incompletos/);
});
