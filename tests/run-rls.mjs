import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const db=new PGlite();
try {
  await db.exec(await fs.readFile(new URL('./rls-base.sql',import.meta.url),'utf8'));
  const original=await fs.readFile(new URL('../supabase/migrations/20260915161027_pente_fino_pdf_integrity.sql',import.meta.url),'utf8');
  await db.exec(original.slice(original.indexOf('create function public.chk_validate_parent')));
  await db.exec('create trigger chk_prioridades_parent before insert or update on public.chk_prioridades for each row execute function public.chk_validate_parent();');
  // An old record verifies additive migration/backfill without touching real data.
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values('00000000-0000-4000-8000-000000000001','legacy@example.invalid',now());
    insert into public.chk_obras(id,user_id,nome) values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Historical work');
    insert into public.chk_apartamentos(id,user_id,obra_id,pavimento,apartamento) values('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','1','101');
    insert into public.chk_itens(user_id,obra_id,apartamento_id,ambiente,servico,status,prioridade,observacao) values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','Historical room','Historical service','pendente','alta','Preserve this note');`);
  const before=(await db.query('select to_jsonb(t) as row from chk_itens t')).rows[0].row;
  await db.exec(await fs.readFile(new URL('../supabase/migrations/20260923103621_pente_fino_equipes.sql',import.meta.url),'utf8'));
  const after=(await db.query("select to_jsonb(t)-array['versao','criado_por_nome','atualizado_por','atualizado_por_nome'] as row from chk_itens t")).rows[0].row;
  assert.deepEqual(after,before,'Existing item data must remain identical');
  for(const test of ['teams.sql','customization.sql']) {
    const result=await db.exec(await fs.readFile(new URL(test,import.meta.url),'utf8'));
    console.log(test+': '+result.at(-1).rows[0].result);
  }
  await db.exec(await fs.readFile(new URL('../supabase/migrations/20260924094954_pente_fino_convites_auth.sql',import.meta.url),'utf8'));
  const invites=await db.exec(await fs.readFile(new URL('./invites.sql',import.meta.url),'utf8'));
  console.log('invites.sql: '+invites.at(-1).rows[0].result);
  assert.equal((await db.query('select count(*)::int as n from auth.users')).rows[0].n,1,'Test Auth fixtures rolled back');
  assert.equal((await db.query('select count(*)::int as n from chk_membros_obra')).rows[0].n,0,'No production membership seeds');
} catch(e) {console.error(e.message);if(e.where)console.error(e.where);process.exitCode=1;}
finally {await db.close();}
