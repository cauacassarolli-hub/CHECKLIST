import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountApp} from '../src/app.js';
import {drafts} from '../src/photos.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function setup(userId='owner') {
  const {window,document}=parseHTML('<html><body><div id="app"></div></body></html>');
  globalThis.window=window;globalThis.document=document;
  Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
  Object.defineProperty(document,'visibilityState',{value:'visible'});
  window.scrollTo=()=>{};
  const root=document.querySelector('#app'),cache=new Map(),user={id:userId,email:userId+'@example.invalid'};
  globalThis.localStorage={getItem:()=> 'w',setItem:()=>{}};
  drafts.get=async key=>cache.get(key);drafts.put=async(key,value)=>cache.set(key,structuredClone(value));drafts.remove=async key=>cache.delete(key);
  const data={obra:{id:'w',user_id:'owner',nome:'Obra compartilhada'},apartamentos:[{id:'a',user_id:'owner',pavimento:'1º',apartamento:'101',status:'com_pendencias'}],
    ambientes:[{id:'env',nome:'Sala',ativo:true}],servicos:[{id:'service',nome:'Pintura',ativo:true}],prioridades:[],
    itens:[{id:'i',user_id:'owner',obra_id:'w',apartamento_id:'a',versao:1,ambiente:'Sala',servico:'Pintura',status:'pendente',criado_por_nome:'Autor original',atualizado_por_nome:'Colega da obra',foto_antes_path:'owner/w/a/i/a.jpg',observacao:'Verificar pintura'}],
    relatorios:[],membros_obra:[{id:'m',user_id:'member',obra_id:'w',nome:'Colega da obra',ativo:true}],
    convites_obra:[],atividades:[{id:'log',obra_id:'w',entidade:'chk_itens',acao:'UPDATE',autor_nome:'Colega da obra',created_at:'2026-09-23T10:00:00Z',detalhes:{apartamento_id:'a',servico:'Pintura',status:'pendente'}}]};
  let offline=false;
  const repo={session:async()=>user,acceptInvites:async()=>0,list:async()=>[data.obra],load:async()=>structuredClone(data),
    get:async(table,id)=>{if(offline)throw new Error('Network unavailable');return structuredClone(data[table].find(r=>r.id===id));},
    signedPhoto:async()=> 'about:blank'};
  const app=await mountApp(repo,root);
  const click=async selector=>{const el=document.querySelector(selector);assert.ok(el,selector);el.dispatchEvent(new window.Event('click',{bubbles:true}));await tick();};
  return{root,document,window,data,app,click,cache,goOffline:()=>{offline=true;navigator.onLine=false;}};
}
test('Owner manages the team and sees who changed a shared record',async()=>{
  const ui=await setup();try{
    await ui.click('[data-action="page"][data-page="ajustes"]');
    assert.ok(ui.root.querySelector('form[data-form="member"]'));
    assert.ok(ui.root.querySelector('[data-action="revoke-member"]'));
    assert.match(ui.root.querySelector('.activity-list').textContent,/Colega da obra.*atualizou Registro/s);
    await ui.click('[data-action="page"][data-page="apartamentos"]');await ui.click('[data-action="open-apt"]');
    assert.match(ui.root.querySelector('.record-card').textContent,/Registrado por Autor original.*Última alteração: Colega da obra/s);
  }finally{ui.app.stop();}
});
test('Member sees shared checklists and editing but no owner controls or foreign deletion',async()=>{
  const ui=await setup('member');try{
    assert.equal(ui.root.querySelector('[data-action="new-apt"]'),null);
    await ui.click('[data-action="open-apt"]');
    assert.equal(ui.root.querySelector('[data-action="edit-apt"]'),null);assert.ok(ui.root.querySelector('[data-action="new-item"]'));
    await ui.click('[data-action="edit-item"]');
    assert.ok(ui.document.querySelector('form[data-form="item"]'));assert.equal(ui.document.querySelector('[data-action="delete-item"]'),null);
    assert.equal(ui.document.querySelector('input[name="antes-camera"]').getAttribute('capture'),'environment');
    await ui.click('[data-action="close"]');await ui.click('[data-action="page"][data-page="ajustes"]');
    assert.equal(ui.root.querySelector('form[data-form="member"]'),null);assert.equal(ui.root.querySelector('[data-action="revoke-member"]'),null);
    assert.equal(ui.root.querySelector('form[data-form="catalog"]'),null);assert.match(ui.root.textContent,/Colega da obra \(você\)/);
  }finally{ui.app.stop();}
});
test('Refresh on focus displays colleague changes and never replaces an open draft',async()=>{
  const ui=await setup('member');try{
    await ui.click('[data-action="open-apt"]');ui.data.itens[0].observacao='Correção recebida da equipe';ui.data.itens[0].versao=2;
    ui.window.dispatchEvent(new ui.window.Event('focus'));await tick();assert.match(ui.root.textContent,/Correção recebida da equipe/);
    await ui.click('[data-action="edit-item"]');
    const form=ui.document.querySelector('form[data-form="item"]');ui.data.itens[0].observacao='Outra atualização';
    ui.window.dispatchEvent(new ui.window.Event('focus'));await tick();assert.equal(ui.document.querySelector('form[data-form="item"]'),form);
  }finally{ui.app.stop();}
});
test('Offline recovery preserves the draft revision and local observations',async()=>{
  const ui=await setup('member');try{
    ui.cache.set('member/w/a/i',{...ui.data.itens[0],existing:true,observacao:'Anotação ainda não enviada',responsavel:'',prioridade:'',prazo:'',photos:{}});
    ui.goOffline();await ui.click('[data-action="open-apt"]');await ui.click('[data-action="edit-item"]');
    assert.match(ui.document.querySelector('.modal').textContent,/Rascunho recuperado/);
    assert.equal(ui.document.querySelector('textarea[name="observacao"]').value,'Anotação ainda não enviada');
    assert.equal(ui.cache.get('member/w/a/i').versao,1);
  }finally{ui.app.stop();}
});
