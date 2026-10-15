import test from 'node:test';
import assert from 'node:assert/strict';
import {buildEmailContentPreview} from '../src/email-content-preview.js';
import {buildDailyDigest} from '../src/daily-digest.js';

const work={id:'w',nome:'Residencial Teste'};
const query={
  acao:'CONSULTAR_RESUMO',
  filtros:{pavimento:'',apartamento:'',servico:'',ambiente:'',status:''},
  resumo:{
    total:6,abertas:3,pendentes:2,em_correcao:1,corrigidas:2,conformes:1,
    servicos:[{servico:'Pintura',abertas:2,total:4},{servico:'Elétrica',abertas:1,total:2}]
  }
};
const make=()=>buildDailyDigest(work,query,new Date('2026-10-15T11:00:00.000Z'));

test('Prévia usa resumo autorizado e não inclui destinatário nem operações de envio',()=>{
  const preview=buildEmailContentPreview(make());
  assert.equal(preview.assunto,'Fiscal de Qualidade | Residencial Teste | 2026-10-15');
  assert.match(preview.corpo,/Pendências abertas: 3/);
  assert.match(preview.corpo,/Pintura: 2 aberta\(s\)/);
  assert.equal(preview.formato,'text/plain; charset=utf-8');
  assert.deepEqual({
    destinatario_definido:preview.destinatario_definido,
    reserva_criada:preview.reserva_criada,
    envio_executado:preview.envio_executado
  },{destinatario_definido:false,reserva_criada:false,envio_executado:false});
  assert.equal(Object.isFrozen(preview),true);
  assert.equal('recipient' in preview,false);
  assert.equal('email' in preview,false);
});

test('Assunto neutraliza quebras de linha e não permite cabeçalhos adicionais',()=>{
  const digest=buildDailyDigest(
    {id:'w',nome:'Prédio QA\r\nBCC:intruso@example.invalid\n'},
    query,new Date('2026-10-15T11:00:00Z'));
  const preview=buildEmailContentPreview(digest);
  assert.doesNotMatch(preview.assunto,/[\r\n]/);
  assert.match(preview.assunto,/Prédio QA BCC:intruso@example.invalid/);
  assert.ok(preview.assunto.length<=160);
  const long=buildEmailContentPreview({...make(),obra_nome:'A'.repeat(500)});
  assert.ok(long.assunto.length<=160);
});

test('Prévia bloqueia dados sem integridade, envio anterior e timestamps inválidos',()=>{
  assert.throws(()=>buildEmailContentPreview(null),/resumo válido/);
  assert.throws(()=>buildEmailContentPreview({...make(),enviado:true}),/resumo válido/);
  assert.throws(()=>buildEmailContentPreview({...make(),gerado_em_iso:'data inválida'}),/Data do resumo inválida/);
  assert.throws(()=>buildEmailContentPreview({...make(),resumo:{...make().resumo,abertas:100}}),/contagens de pendências/);
  assert.throws(()=>buildEmailContentPreview({...make(),timezone:'Etc/UTC'}),/resumo válido/);
});
