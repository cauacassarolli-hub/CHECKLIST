import test from 'node:test';
import assert from 'node:assert/strict';
import {isFiscalExcelRequest,interpretFiscalExcelRequest,prepareFiscalExcelResult} from '../src/fiscal-excel-intent.js';
import {buildFiscalExcel} from '../src/excel.js';

const data=()=>({
  obra:{id:'w',nome:'Obra QA'},
  apartamentos:[{id:'a',pavimento:'5º',apartamento:'501'},{id:'b',pavimento:'7º',apartamento:'701'}],
  servicos:[{nome:'Pintura'},{nome:'Esquadrias de alumínio'}],
  ambientes:[{nome:'Sala'}]
});
const result=(items)=>({acao:'CONSULTAR_OCORRENCIAS',filtros:{pavimento:'5º',apartamento:'501',servico:'Pintura',ambiente:'',status:''},
  resumo:{total:items.length,abertas:items.length,pendentes:0,em_correcao:0,corrigidas:0,conformes:0,servicos:[]},
  ocorrencias:items});

test('Fiscal reconhece pedidos de Excel, não confunde PDF e não aceita envio automático',()=>{
  assert.equal(isFiscalExcelRequest('Gere uma planilha das pendências do apartamento 501'),true);
  assert.equal(isFiscalExcelRequest('Gere um relatório Excel do 5º pavimento'),true);
  assert.equal(isFiscalExcelRequest('Exportar Excel das ocorrências de pintura'),true);
  assert.equal(isFiscalExcelRequest('Gere um relatório PDF de pintura'),false);
  assert.equal(isFiscalExcelRequest('Quantas pendências temos?'),false);
  for(const q of ['Gere uma planilha de pendências e envie por WhatsApp',
    'Prepare um relatório Excel e mande por email',
    'Gere uma planilha de pintura e compartilhe'])
    assert.throws(()=>interpretFiscalExcelRequest(data(),q),/não envia, compartilha ou salva/);
});

test('Excel usa filtros cadastrados de pavimento, apartamento e serviço',()=>{
  const q=interpretFiscalExcelRequest(data(),'Gere um relatório Excel das ocorrências de pintura do apartamento 501 no 5º pavimento');
  assert.equal(q.acao,'CONSULTAR_OCORRENCIAS');
  assert.equal(q.filtros.pavimento,'5º');
  assert.equal(q.filtros.apartamento,'501');
  assert.equal(q.filtros.servico,'Pintura');
  assert.equal(q.somenteAbertas,false);
  const byService=interpretFiscalExcelRequest(data(),'Gere uma planilha Excel de esquadrias de alumínio');
  assert.equal(byService.filtros.servico,'Esquadrias de alumínio');
});

test('Pedido genérico de pendências seleciona abertas e nunca corrige ou altera dados',()=>{
  const q=interpretFiscalExcelRequest(data(),'Gere uma planilha das pendências do apartamento 501');
  assert.equal(q.filtros.apartamento,'501');
  assert.equal(q.filtros.status,'');
  assert.equal(q.somenteAbertas,true);
  const rows=[
    {id:'1',status:'pendente',servico:'Pintura'},
    {id:'2',status:'correcao',servico:'Pintura'},
    {id:'3',status:'em_correcao',servico:'Esquadrias de alumínio'},
    {id:'4',status:'corrigido',servico:'Pintura'},
    {id:'5',status:'conforme',servico:'Pintura'}];
  const source=result(rows);
  const processed=prepareFiscalExcelResult(source,true);
  assert.deepEqual(processed.ocorrencias.map(i=>i.id),['1','2','3']);
  assert.deepEqual(processed.resumo,{total:3,abertas:3,pendentes:1,em_correcao:2,corrigidas:0,conformes:0,
    servicos:[{servico:'Pintura',total:2,abertas:2},{servico:'Esquadrias de alumínio',total:1,abertas:1}]});
  assert.equal(processed.filtros.status,'abertas');
  assert.equal(source.ocorrencias.length,5,'resultado original não deve ser mutado');
  const bytes=buildFiscalExcel(data().obra,processed);
  assert.ok(bytes.length>500);
});

test('Filtro explícito de status permanece específico, sem conversão para todas as abertas',()=>{
  const q=interpretFiscalExcelRequest(data(),'Planilha Excel das pendências em correção do apartamento 501');
  assert.equal(q.filtros.status,'correcao');
  assert.equal(q.somenteAbertas,false);
  const r=interpretFiscalExcelRequest(data(),'Planilha Excel das ocorrências corrigidas do 5º pavimento');
  assert.equal(r.filtros.status,'corrigido');
  assert.equal(r.somenteAbertas,false);
});

test('Fiscal rejeita planilha sem alvo, apartamento inexistente e perguntas que não são Excel',()=>{
  assert.throws(()=>interpretFiscalExcelRequest(data(),'Gere uma planilha Excel'),/Informe quais ocorrências/);
  assert.throws(()=>interpretFiscalExcelRequest(data(),'Relatório Excel do apartamento 999'),/Apartamento não encontrado/);
  assert.throws(()=>interpretFiscalExcelRequest(data(),'Relatório Excel de serviço de concreto'),/Serviço não cadastrado/);
  assert.throws(()=>interpretFiscalExcelRequest(data(),'Relatório PDF de pintura'),/Peça uma planilha Excel/);
  assert.throws(()=>prepareFiscalExcelResult({acao:'CONSULTAR_RESUMO',resumo:{},ocorrencias:[]},true),/Consulta detalhada inválida/);
});
