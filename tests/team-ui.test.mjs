import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountApp} from '../src/app.js';
import {drafts} from '../src/photos.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function setup(userId='owner',queryOccurrencesOverride=null,simulationOverride=null) {
  const {window,document}=parseHTML('<html><body><div id="app"></div></body></html>');
  globalThis.window=window;globalThis.document=document;
  window.HTMLElement.prototype.scrollIntoView=()=>{};
  globalThis.FormData=class TestFormData { constructor(form){this.entries=[];for(const el of form?.querySelectorAll?.('[name]')||[]){if(el.disabled||!el.name)continue;const option=el.tagName==='SELECT'?el.querySelector('option[selected]')||el.querySelector('option'):null;this.entries.push([el.name,option?option.getAttribute('value')||'':el.getAttribute('value')||el.textContent||'']);}} [Symbol.iterator](){return this.entries[Symbol.iterator]();} };
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
  let offline=false,savedNotification=null,savedEmailConsent=null,emailConsentWrites=0,simulationCalls=0;
  const repo={session:async()=>user,acceptInvites:async()=>0,list:async()=>[data.obra],load:async()=>structuredClone(data),
    getNotificationPreferences:async obraId=>{assert.equal(obraId,'w');return savedNotification;},
    saveNotificationPreferences:async(obraId,pref)=>{assert.equal(obraId,'w');savedNotification={...pref,horario:pref.horario+':00'};return savedNotification;},
    simulateEmailDigest:async obraId=>{
      assert.equal(obraId,'w');
      simulationCalls++;
      return simulationOverride
        ? simulationOverride(obraId)
        : {apto_para_preparar:false,motivo:'email_nao_confirmado',
           envio_executado:false,reserva_criada:false};
    },
    getEmailConsent:async obraId=>{assert.equal(obraId,'w');return savedEmailConsent;},
    saveEmailConsent:async(obraId,autorizado)=>{assert.equal(obraId,'w');assert.equal(typeof autorizado,'boolean');emailConsentWrites++;savedEmailConsent={
      autorizado,autorizado_em:autorizado?'2026-10-14T21:00:00Z':savedEmailConsent?.autorizado_em||null,
      revogado_em:autorizado?null:'2026-10-14T22:00:00Z'
    };return savedEmailConsent;},
    get:async(table,id)=>{if(offline)throw new Error('Network unavailable');return structuredClone(data[table].find(r=>r.id===id));},
    signedPhoto:async()=> 'about:blank',queryOccurrences:queryOccurrencesOverride||(async(obraId,filters)=>({filtros:filters,resumo:{total:1,abertas:1,pendentes:1,em_correcao:0,corrigidas:0,conformes:0,servicos:[{servico:'Pintura',abertas:1,total:1}]},ocorrencias:[{id:'i',pavimento:'1º',apartamento:'101',titulo:'Falha de pintura',servico:'Pintura',ambiente:'Sala',status:'pendente',descricao:'Verificar pintura',updated_at:'2026-09-23T10:00:00Z'}]}))};
  const app=await mountApp(repo,root);
  const click=async selector=>{const el=document.querySelector(selector);assert.ok(el,selector);el.dispatchEvent(new window.Event('click',{bubbles:true}));await tick();};
  return{root,document,window,data,app,click,cache,savedNotification:()=>savedNotification,savedEmailConsent:()=>savedEmailConsent,emailConsentWrites:()=>emailConsentWrites,simulationCalls:()=>simulationCalls,goOffline:()=>{offline=true;navigator.onLine=false;}};
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


test('Fiscal reader consults backend and renders read-only results',async()=>{
  const ui=await setup('member');try{
    await ui.click('[data-action="page"][data-page="fiscal"]');
    assert.match(ui.root.textContent,/FISCAL DE QUALIDADE · SOMENTE LEITURA/);
    const form=ui.root.querySelector('form[data-form="fiscal"]');assert.ok(form);
    form.querySelector('[name="pavimento"] option[value="1º"]').setAttribute('selected','');
    form.dispatchEvent(new ui.window.Event('submit',{bubbles:true,cancelable:true}));await tick();await tick();
    assert.equal(form.querySelector('[data-error]').textContent,'');
    assert.match(ui.root.textContent,/Falha de pintura/);assert.match(ui.root.textContent,/1.*ocorrências/s);
    assert.ok(ui.root.querySelector('[data-action="export-excel"]'));
    assert.equal(ui.root.querySelector('.fiscal-record[data-action]'),null);
    assert.equal(ui.root.querySelector('[data-action="edit-item"]'),null);
  }finally{ui.app.stop();}
});

test('Fiscal responde pergunta em português sem expor ações de escrita',async()=>{
  const ui=await setup('member');
  try {
    await ui.click('[data-action="page"][data-page="fiscal"]');
    const form=ui.root.querySelector('form[data-form="fiscal-question"]');
    assert.ok(form);
    form.querySelector('[name="pergunta"]').setAttribute('value','Quantas pendências temos?');
    form.dispatchEvent(new ui.window.Event('submit',{bubbles:true,cancelable:true}));
    await tick();await tick();
    assert.match(ui.root.textContent,/Resposta do Fiscal/);
    assert.match(ui.root.textContent,/1 ocorrência aberta/);
    assert.doesNotMatch(ui.root.textContent,/Nenhuma ocorrência encontrada/);
    ui.data.itens[0].observacao='Nova informação do backend';
    ui.window.dispatchEvent(new ui.window.Event('focus'));await tick();await tick();
    assert.doesNotMatch(ui.root.textContent,/Resposta do Fiscal/);
    assert.equal(ui.root.querySelector('.fiscal-record[data-action]'),null);
    assert.equal(ui.root.querySelector('[data-action="edit-item"]'),null);
  } finally {ui.app.stop();}
});

test('Fiscal descarta resposta antiga quando uma nova consulta termina primeiro',async()=>{
  const pending=[];
  const repoQuery=(_obraId,filters)=>new Promise(resolve=>pending.push({resolve,filters}));
  const ui=await setup('member',repoQuery);
  const summary={total:2,abertas:2,pendentes:1,em_correcao:1,corrigidas:0,conformes:0,servicos:[{servico:'Pintura',total:2,abertas:2}]};
  try {
    await ui.click('[data-action="page"][data-page="fiscal"]');
    let form=ui.root.querySelector('form[data-form="fiscal-question"]');
    form.querySelector('[name="pergunta"]').setAttribute('value','Mostre ocorrências de pintura');
    form.dispatchEvent(new ui.window.Event('submit',{bubbles:true,cancelable:true}));
    await tick();
    assert.equal(pending.length,1);
    await ui.click('[data-action="page"][data-page="apartamentos"]');
    await ui.click('[data-action="page"][data-page="fiscal"]');
    form=ui.root.querySelector('form[data-form="fiscal-question"]');
    form.querySelector('[name="pergunta"]').setAttribute('value','Quantas pendências temos?');
    form.dispatchEvent(new ui.window.Event('submit',{bubbles:true,cancelable:true}));
    await tick();
    assert.equal(pending.length,2);
    pending[1].resolve({filtros:pending[1].filters,resumo:summary});
    await tick();await tick();
    assert.match(ui.root.textContent,/2 ocorrências abertas/);
    assert.equal(ui.root.querySelector('[data-action="export-excel"]'),null);
    pending[0].resolve({filtros:pending[0].filters,resumo:summary,ocorrencias:[{id:'outdated'}]});
    await tick();await tick();
    assert.match(ui.root.textContent,/2 ocorrências abertas/);
    assert.doesNotMatch(ui.root.textContent,/A consulta retornou 1 ocorrência/);
  } finally {ui.app.stop();}
});

test('Fiscal encaminha pedido de PDF para revisão dos filtros, sem gerar arquivo',async()=>{
  const ui=await setup('member',()=>{throw new Error('Consulta RPC indevida durante preparação do PDF.');});
  try {
    await ui.click('[data-action="page"][data-page="fiscal"]');
    const question=ui.root.querySelector('form[data-form="fiscal-question"]');
    question.querySelector('[name="pergunta"]').setAttribute('value','Gere um relatório de pintura no pavimento 1º');
    question.dispatchEvent(new ui.window.Event('submit',{bubbles:true,cancelable:true}));
    await tick();await tick();
    assert.ok(ui.root.querySelector('form[data-form="report"]'));
    assert.match(ui.root.textContent,/Filtros preparados pelo Fiscal/);
    assert.match(ui.root.textContent,/Gerar PDF/);
    const form=ui.root.querySelector('form[data-form="report"]');
    assert.equal(form.querySelector('[name="tipo"] option[selected]')?.getAttribute('value'),'servico');
    assert.equal(form.querySelector('[name="pavimento"] option[selected]')?.getAttribute('value'),'1º');
    assert.equal(form.querySelector('[name="servico"] option[selected]')?.getAttribute('value'),'Pintura');
    assert.equal(ui.root.querySelector('.pdf-panel'),null);
  } finally {ui.app.stop();}
});

test('Fiscal prepara relatório por apartamento e serviço, sem gerar PDF automaticamente',async()=>{
  const ui=await setup('member',()=>{throw new Error('Consulta RPC indevida durante preparação do PDF.');});
  try {
    await ui.click('[data-action="page"][data-page="fiscal"]');
    const question=ui.root.querySelector('form[data-form="fiscal-question"]');
    question.querySelector('[name="pergunta"]').setAttribute('value','Gere um relatório das ocorrências de pintura do apartamento 101');
    question.dispatchEvent(new ui.window.Event('submit',{bubbles:true,cancelable:true}));
    await tick();await tick();
    const form=ui.root.querySelector('form[data-form="report"]');
    assert.ok(form);
    assert.match(ui.root.textContent,/Filtros preparados pelo Fiscal/);
    assert.equal(form.querySelector('[name="tipo"] option[selected]')?.getAttribute('value'),'apartamento');
    assert.equal(form.querySelector('[name="pavimento"] option[selected]')?.getAttribute('value'),'1º');
    assert.equal(form.querySelector('[name="apartamento_id"] option[selected]')?.getAttribute('value'),'a');
    assert.equal(form.querySelector('[name="servico"] option[selected]')?.getAttribute('value'),'Pintura');
    assert.equal(ui.root.querySelector('.pdf-panel'),null);
  } finally {ui.app.stop();}
});

test('Fiscal rejeita unidade inexistente em vez de gerar relatório de toda a obra',async()=>{
  const ui=await setup('member');
  try {
    await ui.click('[data-action="page"][data-page="fiscal"]');
    const question=ui.root.querySelector('form[data-form="fiscal-question"]');
    question.querySelector('[name="pergunta"]').setAttribute('value','Gere um relatório do apartamento 999');
    question.dispatchEvent(new ui.window.Event('submit',{bubbles:true,cancelable:true}));
    await tick();await tick();
    assert.ok(ui.root.querySelector('form[data-form="fiscal-question"]'));
    assert.equal(ui.root.querySelector('form[data-form="report"]'),null);
    assert.match(question.querySelector('[data-error]').textContent,/Apartamento não encontrado/);
  } finally {ui.app.stop();}
});

test('Fiscal prepara planilha Excel por linguagem natural sem baixar automaticamente',async()=>{
  const ui=await setup('member');
  try{
    await ui.click('[data-action="page"][data-page="fiscal"]');
    const form=ui.root.querySelector('form[data-form="fiscal-question"]');
    form.querySelector('[name="pergunta"]').setAttribute('value','Gere uma planilha Excel das pendências do apartamento 101');
    form.dispatchEvent(new ui.window.Event('submit',{bubbles:true,cancelable:true}));
    await tick();await tick();
    assert.match(ui.root.textContent,/ocorrências abertas \(pendentes e em correção\)/);
    assert.ok(ui.root.querySelector('[data-action="export-excel"]'));
    assert.ok(ui.root.querySelector('form[data-form="fiscal-question"]'));
    assert.equal(ui.root.querySelector('.pdf-panel'),null);
    assert.equal(ui.root.querySelector('a[download]'),null);
    assert.equal(ui.root.querySelector('.fiscal-record[data-action]'),null);
  }finally{ui.app.stop();}
});

test('Preferências pessoais são salvas por obra sem realizar envio de mensagens',async()=>{
  const ui=await setup('member');
  try{
    await ui.click('[data-action="page"][data-page="ajustes"]');
    assert.match(ui.root.textContent,/o envio automático ainda não está habilitado/i);
    await ui.click('[data-action="notification-prefs"]');
    const form=ui.root.querySelector('form[data-form="notification-preferences"]');
    assert.ok(form);
    form.querySelector('[name="ativo"] option[value="false"]').removeAttribute('selected');
    form.querySelector('[name="ativo"] option[value="true"]').setAttribute('selected','');
    form.querySelector('[name="horario"]').setAttribute('value','08:45');
    form.dispatchEvent(new ui.window.Event('submit',{bubbles:true,cancelable:true}));
    await tick();await tick();
    assert.equal(ui.savedNotification().ativo,true);
    assert.equal(ui.savedNotification().horario,'08:45:00');
    assert.equal(ui.savedNotification().timezone,'America/Sao_Paulo');
    assert.equal(ui.root.querySelector('form[data-form="notification-preferences"]'),null);
    assert.match(ui.root.textContent,/o envio automático ainda não está habilitado/i);
    await ui.click('[data-action="notification-prefs"]');
    assert.equal(ui.root.querySelector('[name="horario"]').getAttribute('value'),'08:45');
  }finally{ui.app.stop();}
});

test('Horário inválido não é enviado ao repositório nem altera preferências',async()=>{
  const ui=await setup('member');
  try{
    await ui.click('[data-action="page"][data-page="ajustes"]');
    await ui.click('[data-action="notification-prefs"]');
    const form=ui.root.querySelector('form[data-form="notification-preferences"]');
    form.querySelector('[name="horario"]').setAttribute('value','30:80');
    form.dispatchEvent(new ui.window.Event('submit',{bubbles:true,cancelable:true}));
    await tick();await tick();
    assert.equal(ui.savedNotification(),null);
    assert.match(form.querySelector('[data-error]').textContent,/horário válido/);
  }finally{ui.app.stop();}
});


test('Resumo diário consulta RPC de leitura e não envia mensagens',async()=>{
  let calls=0;
  const ui=await setup('member',async(obraId,filters)=>{
    calls++;
    assert.equal(obraId,'w');
    assert.deepEqual(filters,{});
    return {
      filtros:{pavimento:'',apartamento:'',servico:'',ambiente:'',status:''},
      resumo:{total:4,abertas:3,pendentes:2,em_correcao:1,corrigidas:1,conformes:0,
        servicos:[{servico:'Pintura',total:4,abertas:3}]},
      ocorrencias:[{id:'secret-photo-path',foto_antes_path:'private/photo.jpg'}]
    };
  });
  try {
    await ui.click('[data-action="page"][data-page="ajustes"]');
    assert.ok(ui.root.querySelector('[data-action="daily-preview"]'));
    assert.equal(ui.root.querySelector('[data-daily-preview]'),null);
    await ui.click('[data-action="daily-preview"]');
    await tick();await tick();
    const preview=ui.root.querySelector('[data-daily-preview]');
    assert.ok(preview,'Prévia deve aparecer somente após a consulta');
    assert.match(preview.textContent,/Obra compartilhada/);
    assert.match(preview.textContent,/3.*abertas/);
    assert.match(preview.textContent,/2.*pendentes/);
    assert.match(preview.textContent,/1.*em correção/);
    assert.match(preview.textContent,/Pintura/);
    assert.match(preview.textContent,/Nenhuma mensagem foi enviada/);
    assert.doesNotMatch(preview.textContent,/private\/photo.jpg|secret-photo-path/);
    assert.equal(calls,1,'Somente uma consulta autenticada deve ocorrer');
  }finally{ui.app.stop();}
});

test('Resumo diário antigo não aparece depois da troca de obra',async()=>{
  let resolveQuery;
  const ui=await setup('member',()=>new Promise(resolve=>{resolveQuery=resolve;}));
  try {
    await ui.click('[data-action="page"][data-page="ajustes"]');
    await ui.click('[data-action="daily-preview"]');
    assert.equal(typeof resolveQuery,'function');
    await ui.click('[data-action="obras"]');
    resolveQuery({
      filtros:{pavimento:'',apartamento:'',servico:'',ambiente:'',status:''},
      resumo:{total:1,abertas:1,pendentes:1,em_correcao:0,corrigidas:0,conformes:0,
        servicos:[{servico:'Pintura',total:1,abertas:1}]}
    });
    await tick();await tick();
    assert.equal(ui.root.querySelector('[data-daily-preview]'),null);
    assert.doesNotMatch(ui.root.textContent,/Nenhuma mensagem foi enviada/);
  }finally{ui.app.stop();}
});

test('Resumo diário incompleto exibe erro e não inventa totais zerados',async()=>{
  const ui=await setup('member',async()=>({
    filtros:{pavimento:'',apartamento:'',servico:'',ambiente:'',status:''},
    resumo:{total:2,abertas:2,pendentes:1,em_correcao:0,corrigidas:0,conformes:0,
      servicos:[{servico:'Pintura',total:2,abertas:2}]}
  }));
  try {
    await ui.click('[data-action="page"][data-page="ajustes"]');
    await ui.click('[data-action="daily-preview"]');
    await tick();await tick();
    assert.equal(ui.root.querySelector('[data-daily-preview]'),null);
    assert.match(ui.root.textContent,/contagens de pendências não conferem/);
  }finally{ui.app.stop();}
});


test('Resumo diário só copia texto após toque explícito do usuário',async()=>{
  const ui=await setup('member');
  const copied=[];
  navigator.clipboard={writeText:async value=>{copied.push(value);}};
  try{
    await ui.click('[data-action="page"][data-page="ajustes"]');
    assert.equal(ui.root.querySelector('[data-action="daily-copy"]'),null);
    await ui.click('[data-action="daily-preview"]');
    await tick();await tick();
    const pre=ui.root.querySelector('[data-daily-message]');
    assert.ok(pre,'Texto deve estar disponível para seleção manual');
    assert.match(pre.textContent,/FISCAL DE QUALIDADE — RESUMO DAS PENDÊNCIAS/);
    assert.equal(copied.length,0,'Nunca copiar automaticamente na consulta');
    await ui.click('[data-action="daily-copy"]');
    await tick();
    assert.equal(copied.length,1);
    assert.match(copied[0],/Pendências abertas: 1/);
    assert.match(copied[0],/Pintura: 1 aberta\(s\)/);
    assert.doesNotMatch(copied[0],/foto_antes_path|foto_depois_path/);
    assert.equal(ui.root.querySelector('[data-action="send-email"]'),null);
  }finally{ui.app.stop();}
});

test('Falha do clipboard não informa sucesso e permite seleção manual',async()=>{
  const ui=await setup('member');
  navigator.clipboard={writeText:async()=>{throw new Error('Permissão para copiar negada');}};
  try{
    await ui.click('[data-action="page"][data-page="ajustes"]');
    await ui.click('[data-action="daily-preview"]');
    await tick();await tick();
    await ui.click('[data-action="daily-copy"]');
    await tick();
    assert.match(ui.root.textContent,/Permissão para copiar negada/);
    assert.ok(ui.root.querySelector('[data-daily-message]'));
  }finally{ui.app.stop();}
});


test('O usuário autoriza futuros e-mails somente após seleção e envio explícitos',async()=>{
  const ui=await setup('member');
  try {
    await ui.click('[data-action="page"][data-page="ajustes"]');
    assert.match(ui.root.textContent,/a preferência de horário não autoriza e-mails/i);
    assert.equal(ui.savedEmailConsent(),null);
    assert.equal(ui.emailConsentWrites(),0);
    await ui.click('[data-action="email-consent-open"]');
    const form=ui.root.querySelector('form[data-form="email-consent"]');
    assert.ok(form);
    assert.equal(form.querySelector('[name="autorizado"] option[selected]')?.getAttribute('value'),'false');
    assert.equal(ui.emailConsentWrites(),0,'Abrir formulário não deve criar consentimento');
    form.querySelector('[name="autorizado"] option[value="false"]').removeAttribute('selected');
    form.querySelector('[name="autorizado"] option[value="true"]').setAttribute('selected','');
    form.dispatchEvent(new ui.window.Event('submit',{bubbles:true,cancelable:true}));
    await tick();await tick();
    assert.equal(ui.emailConsentWrites(),1);
    assert.equal(ui.savedEmailConsent().autorizado,true);
    assert.match(ui.root.textContent,/Autorizado para futuros e-mails/);
    assert.equal(ui.root.querySelector('form[data-form="email-consent"]'),null);
    assert.match(ui.root.textContent,/Nenhuma mensagem automática está habilitada/i);
  } finally {ui.app.stop();}
});
test('Usuário revoga e-mail sem afetar preferências de horário nem enviar mensagens',async()=>{
  const ui=await setup('member');
  try{
    await ui.click('[data-action="page"][data-page="ajustes"]');
    await ui.click('[data-action="email-consent-open"]');
    let form=ui.root.querySelector('form[data-form="email-consent"]');
    form.querySelector('[name="autorizado"] option[value="false"]').removeAttribute('selected');
    form.querySelector('[name="autorizado"] option[value="true"]').setAttribute('selected','');
    form.dispatchEvent(new ui.window.Event('submit',{bubbles:true,cancelable:true}));
    await tick();await tick();
    await ui.click('[data-action="email-consent-open"]');
    form=ui.root.querySelector('form[data-form="email-consent"]');
    assert.equal(form.querySelector('[name="autorizado"] option[selected]')?.getAttribute('value'),'true');
    form.querySelector('[name="autorizado"] option[value="true"]').removeAttribute('selected');
    form.querySelector('[name="autorizado"] option[value="false"]').setAttribute('selected','');
    form.dispatchEvent(new ui.window.Event('submit',{bubbles:true,cancelable:true}));
    await tick();await tick();
    assert.equal(ui.emailConsentWrites(),2);
    assert.equal(ui.savedEmailConsent().autorizado,false);
    assert.match(ui.root.textContent,/Não autorizado/);
    assert.equal(ui.savedNotification(),null);
    assert.equal(ui.root.querySelector('[data-action="send-email"]'),null);
  }finally{ui.app.stop();}
});
test('Cancelar consentimento não grava autorização',async()=>{
  const ui=await setup('member');
  try{
    await ui.click('[data-action="page"][data-page="ajustes"]');
    await ui.click('[data-action="email-consent-open"]');
    await ui.click('[data-action="email-consent-close"]');
    assert.equal(ui.emailConsentWrites(),0);
    assert.equal(ui.root.querySelector('form[data-form="email-consent"]'),null);
  }finally{ui.app.stop();}
});


test('Simulação em Ajustes é iniciada somente por toque, sem reserva ou envio',async()=>{
  const ui=await setup('member');
  try {
    await ui.click('[data-action="page"][data-page="ajustes"]');
    assert.ok(ui.root.querySelector('[data-action="simulate-email"]'));
    assert.equal(ui.simulationCalls(),0);
    assert.equal(ui.root.querySelector('[data-email-simulation]'),null);
    await ui.click('[data-action="simulate-email"]');
    await tick();
    const panel=ui.root.querySelector('[data-email-simulation]');
    assert.ok(panel);
    assert.match(panel.textContent,/Prévia ainda não apta/);
    assert.match(panel.textContent,/e-mail da conta ainda não está confirmado/);
    assert.match(panel.textContent,/Nenhum e-mail foi enviado e nenhuma entrega foi reservada/);
    assert.equal(ui.simulationCalls(),1);
    assert.equal(ui.root.querySelector('[data-action="send-email"]'),null);
  }finally{ui.app.stop();}
});

test('Simulação aprovada não é apresentada como envio realizado',async()=>{
  const ui=await setup('member',null,async()=>({
    apto_para_preparar:true,motivo:'preparacao_possivel_em_simulacao',
    horario:'07:00',data_local:'2026-10-14',fuso:'America/Sao_Paulo',
    envio_executado:false,reserva_criada:false
  }));
  try{
    await ui.click('[data-action="page"][data-page="ajustes"]');
    await ui.click('[data-action="simulate-email"]');
    await tick();
    assert.match(ui.root.querySelector('[data-email-simulation]').textContent,/Prévia apta para preparação/);
    assert.match(ui.root.textContent,/Nenhum e-mail foi enviado/);
  }finally{ui.app.stop();}
});

test('Atraso de rede não mostra simulação depois da troca de obra',async()=>{
  let resolve;
  const ui=await setup('member',null,()=>new Promise(r=>{resolve=r;}));
  try {
    await ui.click('[data-action="page"][data-page="ajustes"]');
    await ui.click('[data-action="simulate-email"]');
    assert.equal(typeof resolve,'function');
    await ui.click('[data-action="obras"]');
    resolve({apto_para_preparar:true,motivo:'preparacao_possivel_em_simulacao',
      envio_executado:false,reserva_criada:false});
    await tick();await tick();
    assert.equal(ui.root.querySelector('[data-email-simulation]'),null);
    assert.doesNotMatch(ui.root.textContent,/Prévia apta para preparação/);
  }finally{ui.app.stop();}
});

test('Salvar nova autorização limpa uma simulação desatualizada',async()=>{
  const ui=await setup('member');
  try{
    await ui.click('[data-action="page"][data-page="ajustes"]');
    await ui.click('[data-action="simulate-email"]');
    await tick();
    assert.ok(ui.root.querySelector('[data-email-simulation]'));
    await ui.click('[data-action="email-consent-open"]');
    const form=ui.root.querySelector('form[data-form="email-consent"]');
    form.querySelector('[name="autorizado"] option[value="false"]').removeAttribute('selected');
    form.querySelector('[name="autorizado"] option[value="true"]').setAttribute('selected','');
    form.dispatchEvent(new ui.window.Event('submit',{bubbles:true,cancelable:true}));
    await tick();await tick();
    assert.equal(ui.root.querySelector('[data-email-simulation]'),null);
    assert.equal(ui.emailConsentWrites(),1);
  }finally{ui.app.stop();}
});


test('Simulação apta permite pré-visualizar conteúdo mas não envia nem reserva',async()=>{
  const eligible=async()=>({
    apto_para_preparar:true,motivo:'preparacao_possivel_em_simulacao',
    horario:'07:00',data_local:'2026-10-15',fuso:'America/Sao_Paulo',
    envio_executado:false,reserva_criada:false
  });
  const ui=await setup('member',null,eligible);
  try{
    await ui.click('[data-action="page"][data-page="ajustes"]');
    assert.equal(ui.root.querySelector('[data-action="email-content-preview"]'),null);
    await ui.click('[data-action="simulate-email"]');
    await tick();
    assert.ok(ui.root.querySelector('[data-action="email-content-preview"]'));
    assert.equal(ui.root.querySelector('[data-email-content-preview]'),null);
    await ui.click('[data-action="email-content-preview"]');
    await tick();
    const preview=ui.root.querySelector('[data-email-content-preview]');
    assert.ok(preview);
    assert.match(preview.textContent,/Fiscal de Qualidade \| Obra compartilhada/);
    assert.match(preview.textContent,/Pendências abertas: 1/);
    assert.match(preview.textContent,/Pintura: 1 aberta\(s\)/);
    assert.match(preview.textContent,/Nenhum destinatário foi definido/);
    assert.doesNotMatch(preview.textContent,/owner\/w\/a\/i\/a.jpg/);
    assert.equal(ui.root.querySelector('[data-action="send-email"]'),null);
    assert.equal(ui.root.querySelector('a[download]'),null);
    assert.equal(ui.simulationCalls(),1);
  }finally{ui.app.stop();}
});

test('Prévia não é permitida com simulação bloqueada',async()=>{
  const ui=await setup('member');
  try{
    await ui.click('[data-action="page"][data-page="ajustes"]');
    await ui.click('[data-action="simulate-email"]');
    await tick();
    assert.equal(ui.root.querySelector('[data-action="email-content-preview"]'),null);
    assert.equal(ui.root.querySelector('[data-email-content-preview]'),null);
  }finally{ui.app.stop();}
});

test('Uma troca de obra descarta a prévia atrasada do corpo do e-mail',async()=>{
  let complete;
  const eligible=async()=>({
    apto_para_preparar:true,motivo:'preparacao_possivel_em_simulacao',
    horario:'07:00',data_local:'2026-10-15',fuso:'America/Sao_Paulo',
    envio_executado:false,reserva_criada:false
  });
  const ui=await setup('member',()=>new Promise(resolve=>{complete=resolve;}),eligible);
  try{
    await ui.click('[data-action="page"][data-page="ajustes"]');
    await ui.click('[data-action="simulate-email"]');
    await tick();
    await ui.click('[data-action="email-content-preview"]');
    assert.equal(typeof complete,'function');
    await ui.click('[data-action="obras"]');
    complete({filtros:{pavimento:'',apartamento:'',servico:'',ambiente:'',status:''},
      resumo:{total:1,abertas:1,pendentes:1,em_correcao:0,corrigidas:0,conformes:0,
        servicos:[{servico:'Pintura',total:1,abertas:1}]}});
    await tick();await tick();
    assert.equal(ui.root.querySelector('[data-email-content-preview]'),null);
    assert.doesNotMatch(ui.root.textContent,/Prévia do futuro e-mail/);
  }finally{ui.app.stop();}
});
