import test from 'node:test';import assert from 'node:assert/strict';
import {Repository} from '../src/repository.js';
const sample=()=>({id:'record-id',obra_id:'work-id',apartamento_id:'apartment-id',ambiente:'Sala QA',servico:'Pintura QA',status:'pendente',responsavel:'',observacao:'Teste',prioridade:'normal',photos:{antes:{blob:new Blob(['before'],{type:'image/jpeg'})}}});
function fake(controls={}) {
  const calls=[],stored=new Map(),rows=new Map(),filters=[];
  const repo=new Repository({storage:{from:()=>({
    upload:async(path,blob)=>{calls.push('upload');if(controls.uploadFail)return{error:new Error('Rede indisponível')};stored.set(path,blob);return{data:{path}};},
    download:async path=>({data:controls.corruptDownload?new Blob(['x']):stored.get(path)}),remove:async()=>({data:[]})
  })},from:()=>{
    let operation='select',values,conditions=[];
    const query={
      insert:row=>{operation='insert';values=row;return query;},
      update:row=>{operation='update';values=row;return query;},
      upsert:row=>{operation='upsert';values=row;return query;},
      eq:(key,value)=>{conditions.push([key,value]);filters.push([key,value]);return query;},
      select:()=>query,order:()=>query,range:()=>query,
      single:()=>execute(true),maybeSingle:()=>execute(true),then:(resolve,reject)=>execute(false).then(resolve,reject)
    };
    async function execute(single){
      const found=[...rows.values()].filter(row=>conditions.every(([k,v])=>row[k]===v));
      if(operation==='select')return{data:single?found[0]||null:found};
      calls.push('write');
      if(controls.dbFail)return{error:new Error('Banco indisponível')};
      if(operation==='insert'&&rows.has(values.id))return{error:{code:'23505',message:'duplicate'}};
      if(operation==='update'&&!found.length)return{data:null};
      const row=operation==='update'?{...found[0],...values,versao:found[0].versao+1}:{...values,versao:1};
      rows.set(row.id,structuredClone(row));
      if(controls.lostResponse){controls.lostResponse=false;return{error:new Error('Network response lost')};}
      return{data:row};
    }
    return query;
  }});repo.user={id:'user-id'};return{repo,calls,stored,rows,filters,controls};
}
test('Failed upload does not create a database record and the draft retains the photo',async()=>{const {repo,calls,rows}=fake({uploadFail:true}),draft=sample();await assert.rejects(repo.saveDraft(draft),/Rede/);assert.equal(rows.size,0);assert.deepEqual(calls,['upload']);assert.equal(await draft.photos.antes.blob.text(),'before');});
test('Incomplete download verification prevents database write',async()=>{const {repo,calls}=fake({corruptDownload:true});await assert.rejects(repo.saveDraft(sample()),/confirmar/);assert.ok(!calls.includes('write'));});
test('Before and after must both upload before metadata is saved',async()=>{const {repo,calls}=fake(),draft=sample();draft.photos.depois={blob:new Blob(['after'],{type:'image/jpeg'})};const row=await repo.saveDraft(draft);assert.deepEqual(calls,['upload','upload','write']);assert.match(row.foto_antes_path,/user-id\/work-id\/apartment-id\/record-id\/antes-/);assert.match(row.foto_depois_path,/depois-/);assert.equal(row.foto_antes_data,undefined);});
test('Retry is idempotent and never overwrites the previously saved image',async()=>{const {repo,rows,stored}=fake(),draft=sample();draft.foto_antes_path='old-before.jpg';await repo.saveDraft(draft);const newPath=draft.photos.antes.path;await repo.saveDraft(draft);assert.equal(rows.size,1);assert.equal(stored.size,1);assert.notEqual(newPath,'old-before.jpg');assert.equal(rows.get(draft.id).foto_antes_path,newPath);});
test('Database failure preserves the draft for retry',async()=>{const {repo}=fake({dbFail:true}),draft=sample();await assert.rejects(repo.saveDraft(draft),/Banco/);assert.ok(draft.photos.antes.blob);assert.ok(draft.photos.antes.path);});
test('Saved report metadata is not inserted after failed PDF upload',async()=>{const {repo,calls}=fake({uploadFail:true});await assert.rejects(repo.saveReport({id:'pdf',blob:new Blob(['pdf'],{type:'application/pdf'}),model:{obra:{id:'w'}}}),/Rede/);assert.ok(!calls.includes('write'));});
test('Team listing includes colleagues records and only filters by work',async()=>{
  const {repo,rows,filters}=fake();rows.set('theirs',{id:'theirs',user_id:'colleague',obra_id:'work-id'});
  assert.equal((await repo.list('itens','work-id'))[0].user_id,'colleague');assert.deepEqual(filters,[['obra_id','work-id']]);
});
test('Editing a colleague record preserves its author and compares its revision',async()=>{
  const {repo,rows,filters}=fake(),draft=sample();const saved=await repo.saveDraft(draft);
  rows.set(saved.id,{...saved,user_id:'colleague'});
  const edit={...saved,user_id:'colleague',existing:true,status:'corrigido',photos:{}};
  const result=await repo.saveDraft(edit);assert.equal(result.user_id,'colleague');assert.equal(result.versao,2);
  assert.ok(filters.some(([k,v])=>k==='versao'&&v===1));
});
test('Stale draft never overwrites a colleague correction and stays recoverable',async()=>{
  const {repo,rows}=fake(),draft=sample();const saved=await repo.saveDraft(draft);
  const edit={...saved,existing:true,observacao:'My unsaved note',photos:{}};
  rows.set(saved.id,{...saved,status:'corrigido',observacao:'Colleague correction',versao:2});
  await assert.rejects(repo.saveDraft(edit),e=>e.code==='CONFLICT');
  assert.equal(rows.get(saved.id).observacao,'Colleague correction');assert.equal(edit.observacao,'My unsaved note');
});
test('New-record retry after another edit does not upsert over the correction',async()=>{
  const {repo,rows}=fake(),draft=sample();const saved=await repo.saveDraft(draft);
  rows.set(saved.id,{...saved,status:'corrigido',versao:2});
  await assert.rejects(repo.saveDraft(draft),e=>e.code==='CONFLICT');assert.equal(rows.get(saved.id).status,'corrigido');
});
test('Lost successful response is recognized for new and existing corrected records',async()=>{
  const {repo,rows,controls}=fake({lostResponse:true}),draft=sample();draft.status='corrigido';
  await assert.rejects(repo.saveDraft(draft),/response lost/);const inserted=await repo.saveDraft(draft);assert.equal(rows.size,1);
  const edit={...inserted,existing:true,observacao:'New observation',photos:{}};
  controls.lostResponse=true;await assert.rejects(repo.saveDraft(edit),/response lost/);
  assert.equal((await repo.saveDraft(edit)).versao,2);assert.equal(rows.size,1);
});
test('Pre-upgrade draft without revision must be explicitly reloaded',async()=>{
  const {repo,calls}=fake();await assert.rejects(repo.saveDraft({...sample(),existing:true}),e=>e.code==='CONFLICT');assert.deepEqual(calls,[]);
});
