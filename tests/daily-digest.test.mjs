import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDailyDigest,formatDailyDigestMessage,DAILY_DIGEST_TIMEZONE} from '../src/daily-digest.js';

const obra={id:'obra-a',nome:'Residencial QA'};
const counts={total:10,abertas:6,pendentes:4,em_correcao:2,corrigidas:3,conformes:1};
const make=(resumo=counts,services=[
  {servico:'Elétrica',abertas:2,total:4},
  {servico:'Pintura',abertas:4,total:6}
])=>({
  acao:'CONSULTAR_RESUMO',
  filtros:{pavimento:'',apartamento:'',servico:'',ambiente:'',status:''},
  resumo:{...resumo,servicos:services}
});

test('Prévia usa totais reais da obra, incluindo pendentes e em correção',()=>{
  const preview=buildDailyDigest(obra,make(),new Date('2026-10-14T15:00:00Z'));
  assert.equal(preview.obra_id,'obra-a');
  assert.equal(preview.obra_nome,'Residencial QA');
  assert.deepEqual(preview.resumo,counts);
  assert.equal(preview.resumo.abertas,6);
  assert.deepEqual(preview.principais_servicos.map(s=>[s.servico,s.abertas]),[['Pintura',4],['Elétrica',2]]);
  assert.equal(preview.outros_servicos,0);
  assert.equal(preview.timezone,DAILY_DIGEST_TIMEZONE);
  assert.equal(preview.gerado_em_iso,'2026-10-14T15:00:00.000Z');
  assert.match(preview.gerado_em,/14\/10\/2026/);
  assert.match(preview.informativo,/Não representa alterações nas últimas 24 horas/);
  assert.equal(preview.enviado,false);
  assert.equal('ocorrencias' in preview,false);
});

test('Prévia sem pendências permanece correta e não inventa ranking',()=>{
  const preview=buildDailyDigest(obra,make(
    {total:3,abertas:0,pendentes:0,em_correcao:0,corrigidas:2,conformes:1},
    [{servico:'Pintura',abertas:0,total:3}]
  ));
  assert.equal(preview.resumo.abertas,0);
  assert.deepEqual(preview.principais_servicos,[]);
  assert.equal(preview.outros_servicos,0);
});

test('Ranking limita a cinco serviços e desempata por nome',()=>{
  const services=[
    {servico:'Zinco',abertas:1,total:1},{servico:'Alvenaria',abertas:1,total:1},
    {servico:'Concreto',abertas:1,total:1},{servico:'Pintura',abertas:1,total:1},
    {servico:'Hidráulica',abertas:1,total:1},{servico:'Elétrica',abertas:1,total:1}
  ];
  const preview=buildDailyDigest(obra,make(
    {total:6,abertas:6,pendentes:3,em_correcao:3,corrigidas:0,conformes:0},
    services));
  assert.deepEqual(preview.principais_servicos.map(s=>s.servico),
    ['Alvenaria','Concreto','Elétrica','Hidráulica','Pintura']);
  assert.equal(preview.outros_servicos,1);
});

test('Prévia recusa ações com lista, filtros ou obra alheia',()=>{
  assert.throws(()=>buildDailyDigest(null,make()),/obra válida/);
  assert.throws(()=>buildDailyDigest(obra,{...make(),acao:'CONSULTAR_OCORRENCIAS',ocorrencias:[]}),/somente leitura/);
  assert.throws(()=>buildDailyDigest(obra,{...make(),ocorrencias:[{id:'i'}]}),/somente leitura/);
  assert.throws(()=>buildDailyDigest(obra,{...make(),filtros:{pavimento:'7º'}}),/obra inteira/);
  assert.throws(()=>buildDailyDigest(obra,make(),new Date('no date')),/Data de geração/);
});

test('Prévia falha fechada com dados incompletos ou inconsistentes',()=>{
  assert.throws(()=>buildDailyDigest(obra,make({...counts,total:undefined})),/total/);
  assert.throws(()=>buildDailyDigest(obra,make({...counts,abertas:5})),/contagens de pendências/);
  assert.throws(()=>buildDailyDigest(obra,make({...counts,total:6})),/total de ocorrências/);
  assert.throws(()=>buildDailyDigest(obra,make(counts,[])),/pendências por serviço/);
  assert.throws(()=>buildDailyDigest(obra,make(counts,[{servico:'X',abertas:7,total:7}])),/pendências por serviço/);
  assert.throws(()=>buildDailyDigest(obra,make(counts,[{servico:'X',abertas:6,total:5}])),/Total inválido/);
  assert.throws(()=>buildDailyDigest(obra,make(counts,undefined).resumo===undefined?{}:{...make(),resumo:{...counts}}),/Ranking de serviços/);
});


test('Mensagem copiável apresenta a situação atual sem inventar alterações diárias',()=>{
  const digest=buildDailyDigest(obra,make(),new Date('2026-10-14T15:00:00Z'));
  const text=formatDailyDigestMessage(digest);
  assert.match(text,/FISCAL DE QUALIDADE — RESUMO DAS PENDÊNCIAS/);
  assert.match(text,/Obra: Residencial QA/);
  assert.match(text,/Ocorrências registradas: 10/);
  assert.match(text,/Pendências abertas: 6/);
  assert.match(text,/• Pendentes: 4/);
  assert.match(text,/• Em correção: 2/);
  assert.match(text,/Pintura: 4 aberta\(s\)/);
  assert.match(text,/Elétrica: 2 aberta\(s\)/);
  assert.match(text,/Não representa necessariamente alterações nas últimas 24 horas/);
  assert.doesNotMatch(text,/http:|https:|foto_|destinatário/);
});

test('Mensagem copiável trata obras sem pendências e impede injeção de linhas',()=>{
  const digest=buildDailyDigest({id:'w',nome:'Obra\nAVISO FALSO'},make(
    {total:1,abertas:0,pendentes:0,em_correcao:0,corrigidas:1,conformes:0},
    [{servico:'Pintura',total:1,abertas:0}]
  ));
  const text=formatDailyDigestMessage(digest);
  assert.match(text,/Obra: Obra AVISO FALSO\nConsulta:/);
  assert.match(text,/Nenhuma pendência aberta/);
  assert.doesNotMatch(text,/Obra:\s*Obra\nAVISO/);
});

test('Mensagem copiável só aceita prévias não enviadas e válidas',()=>{
  const digest=buildDailyDigest(obra,make());
  assert.throws(()=>formatDailyDigestMessage(null),/prévia válida/);
  assert.throws(()=>formatDailyDigestMessage({...digest,enviado:true}),/prévia válida/);
  assert.throws(()=>formatDailyDigestMessage({...digest,resumo:{...digest.resumo,abertas:5}}),/contagens de pendências/);
  assert.throws(()=>formatDailyDigestMessage({...digest,principais_servicos:null}),/Ranking inválido/);
  assert.throws(()=>formatDailyDigestMessage({...digest,outros_servicos:-2}),/outros_servicos/);
});
