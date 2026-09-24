import test from 'node:test';import assert from 'node:assert/strict';
import {buildReportModel,apartmentStatus,validatePublicConfig,progressOf,isOverdue,catalogOptions,recordOptions,draftRow} from '../src/domain.js';
const data=()=>({obra:{id:'w',nome:'Obra QA'},apartamentos:[{id:'a',pavimento:'13',apartamento:'1301',status:'conforme'},{id:'b',pavimento:'13',apartamento:'1302',status:'nao_iniciado'}],ambientes:[],servicos:[{nome:'Pintura'}],itens:[]});
test('An unvisited floor is never released just because there are no records',()=>{const m=buildReportModel(data(),{tipo:'finalizacao',pavimento:'13'});assert.equal(m.summary.notApproved,1);assert.match(m.summary.conclusion,/não liberado/);});
test('Conforme without records remains in the floor report',()=>{const m=buildReportModel(data(),{tipo:'pavimento',pavimento:'13'});assert.equal(m.apartments.length,2);assert.equal(m.apartments[0].status,'conforme');assert.equal(m.items.length,0);});
test('Pending records override a previously approved apartment',()=>{assert.equal(apartmentStatus({id:'a',status:'conforme'},[{apartamento_id:'a',status:'pendente'}]),'com_pendencias');});
test('Service filtering does not hide pending items from the completion decision',()=>{const d=data();d.apartamentos[1].status='conforme';d.itens=[{id:'i',apartamento_id:'a',servico:'Outro',status:'pendente'}];const m=buildReportModel(d,{tipo:'finalizacao',pavimento:'13',servico:'Pintura',status:'corrigido'});assert.equal(m.summary.pending,1);assert.equal(m.items.length,1);assert.match(m.summary.conclusion,/não liberado/);});
test('Pending report defaults to only Pendente / Em correção',()=>{const d=data();d.itens=['pendente','correcao','corrigido','conforme'].map((status,n)=>({id:String(n),apartamento_id:'a',status,servico:'Pintura'}));assert.deepEqual(buildReportModel(d,{tipo:'pendencias'}).items.map(i=>i.status),['pendente','correcao']);});
test('Service must come from the manual catalog',()=>{assert.throws(()=>buildReportModel(data(),{tipo:'servico',servico:'Inventado'}),/cadastrado/);});
test('Public configuration rejects secret keys and untrusted endpoints',()=>{assert.equal(validatePublicConfig({url:'https://project.supabase.co',key:'sb_publishable_valid'}),true);for(const key of ['sb_secret_abcdef','service_role','eyJnotapublishablekey'])assert.equal(validatePublicConfig({url:'https://project.supabase.co',key}),false);assert.equal(validatePublicConfig({url:'https://project.supabase.co.example.com',key:'sb_publishable_valid'}),false);});
test('Progress is measured by corrected records, not by apartment approval',()=>{const items=[{status:'pendente'},{status:'corrigido'},{status:'conforme'},{status:'correcao'}];const p=progressOf(items);assert.equal(p.total,4);assert.equal(p.done,2);assert.equal(p.percent,50);});
test('A floor with no records yet shows full progress rather than zero',()=>{assert.deepEqual(progressOf([]),{total:0,done:0,percent:100});});
test('A record is overdue only while it is still open and past its deadline',()=>{const today=new Date('2026-09-17T12:00:00');assert.equal(isOverdue({status:'pendente',prazo:'2026-09-10'},today),true);assert.equal(isOverdue({status:'corrigido',prazo:'2026-09-10'},today),false,'fixed records are never overdue, even past their old deadline');assert.equal(isOverdue({status:'pendente',prazo:'2026-09-20'},today),false);assert.equal(isOverdue({status:'pendente',prazo:null},today),false);});
test('Records remain editable after all their catalog entries are inactivated',()=>{
  const d={ambientes:[{nome:'Sala',ativo:false}],servicos:[{nome:'Pintura',ativo:false}],prioridades:[{nome:'Urgente',ativo:false}]};
  const existing=recordOptions(d,{ambiente:'Sala',servico:'Pintura',prioridade:'Urgente'});
  assert.equal(existing.ambientes[0][0],'Sala');assert.equal(existing.servicos[0][0],'Pintura');assert.equal(existing.prioridades[0][0],'Urgente');
  const fresh=recordOptions(d);assert.deepEqual(fresh,{ambientes:[],servicos:[],prioridades:[]});
});
test('Inactive services remain available for reports with their historical photos',()=>{
  const d=data();d.servicos[0].ativo=false;d.itens=[{id:'i',apartamento_id:'a',servico:'Pintura',status:'corrigido',foto_antes_path:'private/photo.jpg'}];
  assert.deepEqual(catalogOptions(d.servicos,'',true),[['Pintura','Pintura (inativo)']]);
  assert.equal(buildReportModel(d,{tipo:'servico',servico:'Pintura'}).items[0].foto_antes_path,'private/photo.jpg');
});
test('An optional priority stays empty and a deadline survives saving',()=>{
  const row=draftRow({id:'i',obra_id:'w',apartamento_id:'a',ambiente:'Sala',servico:'Pintura',status:'pendente',responsavel:'',observacao:'',prioridade:'',prazo:'2026-09-30'},'u');
  assert.equal(row.prioridade,null);assert.equal(row.prazo,'2026-09-30');
});
test('Legacy priorities survive catalog customization without becoming new defaults',()=>{
  const d={ambientes:[],servicos:[],prioridades:[{nome:'Emergência',ativo:true}]};
  assert.deepEqual(recordOptions(d,{prioridade:'alta'}).prioridades,[['Emergência','Emergência'],['alta','alta (histórico)']]);
  assert.deepEqual(recordOptions(d).prioridades,[['Emergência','Emergência']]);
});
