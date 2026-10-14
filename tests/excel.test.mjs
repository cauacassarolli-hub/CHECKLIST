import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFiscalExcel,fiscalExcelFilename,EXCEL_COLUMNS,EXCEL_MIME} from '../src/excel.js';

const decoder=new TextDecoder();
const readZip=bytes=>{
  assert.equal(bytes[0],0x50);assert.equal(bytes[1],0x4b);
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const files=new Map();let at=0;
  while(at+4<bytes.length&&view.getUint32(at,true)===0x04034b50){
    const method=view.getUint16(at+8,true);
    assert.equal(method,0,'as entradas devem ser ZIP store');
    const len=view.getUint32(at+18,true);
    const nameLen=view.getUint16(at+26,true),extraLen=view.getUint16(at+28,true);
    const name=decoder.decode(bytes.subarray(at+30,at+30+nameLen));
    const start=at+30+nameLen+extraLen;
    files.set(name,decoder.decode(bytes.subarray(start,start+len)));
    at=start+len;
  }
  assert.equal(view.getUint32(at,true),0x02014b50,'diretório central ZIP obrigatório');
  const eocd=bytes.byteLength-22;
  assert.equal(view.getUint32(eocd,true),0x06054b50);
  assert.equal(view.getUint16(eocd+10,true),files.size,'contagem de entradas ZIP deve bater');
  assert.equal(view.getUint32(eocd+16,true),at,'offset do diretório central deve bater');
  return files;
};
const obra={id:'obra',nome:'Residencial Âncoras'};
const record={
  id:'id-1',pavimento:'05º',apartamento:'001',ambiente:'Sala',servico:'Pintura',
  titulo:'Mancha no teto',descricao:'Mancha & infiltração < observar >',
  status:'pendente',created_at:'2026-10-14T15:00:00Z',criado_por_nome:'Fiscal',
  data_correcao:null,resolvido_por_nome:null,responsavel:'Empreiteira',
  prioridade:'alta',prazo:'2026-10-30',data_vistoria:'2026-10-14'
};
const result=(records=[record])=>({
  acao:'CONSULTAR_OCORRENCIAS',
  filtros:{pavimento:'05º',apartamento:'001',servico:'Pintura',ambiente:'Sala',status:''},
  resumo:{total:records.length,abertas:records.length,pendentes:records.length,
    em_correcao:0,corrigidas:0,conformes:0,
    servicos:[{servico:'Pintura',abertas:records.length,total:records.length}]},
  ocorrencias:records
});

test('XLSX válido como ZIP, com duas planilhas, filtros e congelamento',()=>{
  const bytes=buildFiscalExcel(obra,result());
  const files=readZip(bytes);
  assert.equal(files.size,7);
  for(const name of ['[Content_Types].xml','_rels/.rels','xl/workbook.xml',
    'xl/_rels/workbook.xml.rels','xl/styles.xml','xl/worksheets/sheet1.xml',
    'xl/worksheets/sheet2.xml'])assert.ok(files.has(name),name);
  assert.match(files.get('xl/workbook.xml'),/name="Ocorrências".*name="Resumo"/);
  const sheet=files.get('xl/worksheets/sheet1.xml');
  assert.match(sheet,/ySplit="1"/);
  assert.match(sheet,/<autoFilter ref="A1:R2"\/>/);
  assert.match(sheet,/A1/);
  assert.equal((sheet.match(/<c r="/g)||[]).length,EXCEL_COLUMNS.length*2);
  assert.equal(EXCEL_MIME,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
});

test('Excel preserva número do apartamento como texto e protege fórmulas maliciosas',()=>{
  const suspect={...record,apartamento:'001',descricao:'=HYPERLINK("https://evil.test") & <script>\u0001',
    titulo:'+SUM(A1:A9)',servico:'Esquadrias de alumínio'};
  const files=readZip(buildFiscalExcel(obra,result([suspect])));
  const sheet=files.get('xl/worksheets/sheet1.xml');
  assert.match(sheet,/001/);
  assert.match(sheet,/<c r="E2" s="0" t="inlineStr">/);
  assert.match(sheet,/&lt;script&gt;/);
  assert.match(sheet,/&amp;/);
  assert.match(sheet,/=HYPERLINK/);
  assert.doesNotMatch(sheet,/<f(?:\s|>)/);
  assert.doesNotMatch(sheet,/\u0001/);
  assert.match(sheet,/Esquadrias de alumínio/);
});

test('Resumo possui contagens numéricas reais e filtros da consulta',()=>{
  const files=readZip(buildFiscalExcel(obra,result()));
  const summary=files.get('xl/worksheets/sheet2.xml');
  assert.match(summary,/Residencial Âncoras/);
  assert.match(summary,/05º/);
  assert.match(summary,/001/);
  assert.match(summary,/Pintura/);
  assert.match(summary,/<c r="B10" t="n"><v>1<\/v><\/c>/);
  assert.match(summary,/Ocorrências abertas|Abertas/);
  const sheet=files.get('xl/worksheets/sheet1.xml');
  assert.match(sheet,/30\/10\/2026/);
  assert.match(sheet,/14\/10\/2026/);
});

test('Exportação não aceita resumo isolado, totais inconsistentes ou volume excessivo',()=>{
  assert.throws(()=>buildFiscalExcel(obra,{acao:'CONSULTAR_RESUMO',resumo:{},ocorrencias:[]}),/Consulte as ocorrências/);
  assert.throws(()=>buildFiscalExcel(obra,{...result(),resumo:{...result().resumo,total:2}}),/não confere/);
  assert.throws(()=>buildFiscalExcel(obra,{...result(),resumo:{...result().resumo,pendentes:undefined}}),/Contagem inválida/);
  assert.throws(()=>buildFiscalExcel(obra,{...result(),resumo:{...result().resumo,servicos:undefined}}),/Ranking de serviços/);
  assert.throws(()=>buildFiscalExcel(obra,result(new Array(25001).fill(record))),/muito grande/);
});

test('Exportação vazia é válida e nome de arquivo não inclui caminho fornecido pelo usuário',()=>{
  const bytes=buildFiscalExcel(obra,result([]));
  const sheet=readZip(bytes).get('xl/worksheets/sheet1.xml');
  assert.match(sheet,/<autoFilter ref="A1:R1"\/>/);
  assert.match(sheet,/<sheetData><row r="1">/);
  const filename=fiscalExcelFilename({nome:'Obra ../ Salas & Pavimentos'},new Date('2026-10-14T18:00:00Z'));
  assert.match(filename,/^fiscal-ocorrencias-Obra-Salas-Pavimentos-2026-10-14\.xlsx$/);
});
