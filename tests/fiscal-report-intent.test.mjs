import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReportModel } from '../src/domain.js';
import { isFiscalReportRequest,interpretFiscalReportRequest } from '../src/fiscal-report-intent.js';

const data=()=>({
  obra:{id:'obra',nome:'Obra QA'},
  apartamentos:[{id:'a',pavimento:'5º',apartamento:'501',status:'em_vistoria'},{id:'b',pavimento:'7º',apartamento:'701',status:'em_vistoria'}],
  ambientes:[{nome:'Sala'}],
  servicos:[{nome:'Pintura'},{nome:'Contrapiso'},{nome:'Esquadrias de alumínio'}],
  itens:[{id:'p',apartamento_id:'a',status:'pendente',servico:'Pintura'},
         {id:'c',apartamento_id:'a',status:'correcao',servico:'Pintura'},
         {id:'e',apartamento_id:'b',status:'corrigido',servico:'Contrapiso'}]
});

test('Fiscal identifica pedido de PDF mas não o confunde com uma consulta',()=>{
  assert.equal(isFiscalReportRequest('Gere um relatório das ocorrências de pintura'),true);
  assert.equal(isFiscalReportRequest('Relatório do 5º pavimento'),true);
  assert.equal(isFiscalReportRequest('Quantas pendências existem?'),false);
});

test('Fiscal prepara relatório do pavimento, sem gerar arquivo',()=>{
  const filters=interpretFiscalReportRequest(data(),'Gere um relatório do 5° pavimento');
  assert.deepEqual(filters,{tipo:'pavimento',pavimento:'5º',apartamento_id:'',servico:'',status:'',responsavel:''});
  const model=buildReportModel(data(),filters);
  assert.equal(model.tipo,'pavimento');
  assert.equal(model.apartments.length,1);
  assert.equal(model.items.length,2);
});

test('Fiscal prepara relatório por serviço e pavimento usando o gerador existente',()=>{
  const onlyService=interpretFiscalReportRequest(data(),'Gere um relatório das ocorrências de esquadrias de alumínio');
  assert.equal(onlyService.tipo,'servico');
  assert.equal(onlyService.servico,'Esquadrias de alumínio');
  assert.equal(onlyService.pavimento,'');
  const combined=interpretFiscalReportRequest(data(),'Gere um relatório das ocorrências de pintura do 5º pavimento');
  assert.equal(combined.tipo,'servico');
  assert.equal(combined.pavimento,'5º');
  const model=buildReportModel(data(),combined);
  assert.equal(model.items.length,2);
});

test('Fiscal prepara pendências abrangendo pendentes e em correção',()=>{
  const filters=interpretFiscalReportRequest(data(),'Relatório de pendências do 5º pavimento');
  assert.equal(filters.tipo,'pendencias');
  assert.equal(filters.status,'');
  const model=buildReportModel(data(),filters);
  assert.equal(model.items.length,2);
});

test('Fiscal permite prévia de finalização, mas exige pavimento',()=>{
  const filters=interpretFiscalReportRequest(data(),'Prepare um relatório de finalização do 5º pavimento');
  assert.equal(filters.tipo,'finalizacao');
  assert.equal(filters.pavimento,'5º');
  assert.throws(()=>interpretFiscalReportRequest(data(),'Relatório de finalização'),/exige um pavimento/);
});

test('Fiscal recusa filtros não suportados sem produzir relatório amplo',()=>{
  assert.throws(()=>interpretFiscalReportRequest(data(),'Relatório de pintura do pavimento 99'),/Pavimento não encontrado/);
  assert.throws(()=>interpretFiscalReportRequest(data(),'Relatório do serviço de concreto'),/Serviço não cadastrado/);
  assert.throws(()=>interpretFiscalReportRequest(data(),'Gere um relatório do ambiente de garagem'),/não é suportado/);
  assert.throws(()=>interpretFiscalReportRequest(data(),'Relatório de ocorrências corrigidas'),/não é suportado/);
  assert.throws(()=>interpretFiscalReportRequest(data(),'Relatório'),/Informe o pavimento/);
  assert.throws(()=>interpretFiscalReportRequest(data(),'Relatório e envie por WhatsApp'),/não envia nem exporta/);
  assert.throws(()=>interpretFiscalReportRequest(data(),'Quantas pendências?'),/Peça um relatório/);
});

test('Fiscal gera proposta de PDF fotográfico isolada por apartamento e serviço',()=>{
  const filters=interpretFiscalReportRequest(data(),'Gere um relatório das ocorrências de pintura do apartamento 501');
  assert.equal(filters.tipo,'apartamento');
  assert.equal(filters.pavimento,'5º');
  assert.equal(filters.apartamento_id,'a');
  assert.equal(filters.servico,'Pintura');
  const model=buildReportModel(data(),filters);
  assert.equal(model.apartments.length,1);
  assert.equal(model.apartments[0].id,'a');
  assert.deepEqual(model.items.map(i=>i.id),['p','c']);
  assert.match(model.titulo,/Apto 501.*Pintura/);
});

test('Fiscal filtra pendências por apartamento incluindo itens em correção',()=>{
  const filters=interpretFiscalReportRequest(data(),'Relatório de pendências do apto 501');
  assert.equal(filters.tipo,'pendencias');
  assert.equal(filters.apartamento_id,'a');
  const model=buildReportModel(data(),filters);
  assert.deepEqual(model.items.map(i=>i.status),['pendente','correcao']);
});

test('Fiscal não mistura apartamentos de mesmo número e pavimentos diferentes',()=>{
  const d=data();
  d.apartamentos.push({id:'duplicado',pavimento:'7º',apartamento:'501'});
  d.itens.push({id:'outro',apartamento_id:'duplicado',status:'pendente',servico:'Pintura'});
  assert.throws(()=>interpretFiscalReportRequest(d,'Relatório do apartamento 501'),/Apartamento ambíguo/);
  const filters=interpretFiscalReportRequest(d,'Relatório do apartamento 501 do 5º pavimento');
  assert.equal(filters.apartamento_id,'a');
  const model=buildReportModel(d,filters);
  assert.deepEqual(model.items.map(i=>i.id),['p','c']);
  assert.throws(()=>buildReportModel(d,{tipo:'apartamento',apartamento_id:'duplicado',pavimento:'5º'}),/Apartamento não encontrado/);
  assert.throws(()=>buildReportModel(d,{tipo:'apartamento',apartamento_id:''}),/Selecione um apartamento/);
  assert.throws(()=>buildReportModel(d,{tipo:'pavimento',apartamento_id:'a',pavimento:'5º'}),/não é compatível/);
});
