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
  // Apply only the preference segment from the shipped migration to verify its exact RLS policies.
  const foundation=await fs.readFile(new URL('../supabase/migrations/20261006205000_fiscal_qualidade_fundacao.sql',import.meta.url),'utf8');
  const start=foundation.indexOf('create table if not exists public.chk_preferencias_notificacao');
  const end=foundation.indexOf('-- A funcao e usada internamente',start);
  if(start<0||end<0)throw new Error('Notification migration segment not found.');
  await db.exec(foundation.slice(start,end));
  await db.exec(await fs.readFile(new URL('../supabase/migrations/20261014211654_fiscal_preferencias_notificacao_grants_seguros.sql',import.meta.url),'utf8'));
  const grants=await db.query("select has_table_privilege('anon','public.chk_preferencias_notificacao','SELECT') as anon_select,has_table_privilege('authenticated','public.chk_preferencias_notificacao','INSERT') as authenticated_insert");
  assert.equal(grants.rows[0].anon_select,false,'Anonymous grants must be revoked');
  assert.equal(grants.rows[0].authenticated_insert,true,'Authenticated RLS writes require table grant');
  const notifications=await db.exec(await fs.readFile(new URL('./notifications.sql',import.meta.url),'utf8'));
  console.log('notifications.sql: '+notifications.at(-1).rows[0].result);
  // Exercise the internal delivery table in a rollback-only PostgreSQL fixture.
  await db.exec(await fs.readFile(new URL('../supabase/migrations/20261014214934_fiscal_entregas_resumo_ledger_privado.sql',import.meta.url),'utf8'));
  const ledger=await db.exec(await fs.readFile(new URL('./delivery-ledger.sql',import.meta.url),'utf8'));
  console.log('delivery-ledger.sql: '+ledger.at(-1).rows[0].result);
  await db.exec(await fs.readFile(new URL('../supabase/migrations/20261014221406_fiscal_consentimento_email_explicito.sql',import.meta.url),'utf8'));
  const consent=await db.exec(await fs.readFile(new URL('./email-consent.sql',import.meta.url),'utf8'));
  console.log('email-consent.sql: '+consent.at(-1).rows[0].result);
  await db.exec(await fs.readFile(new URL('../supabase/migrations/20261014222101_fiscal_candidatos_email_privados.sql',import.meta.url),'utf8'));
  const candidates=await db.exec(await fs.readFile(new URL('./email-candidates.sql',import.meta.url),'utf8'));
  console.log('email-candidates.sql: '+candidates.at(-1).rows[0].result);
  await db.exec(await fs.readFile(new URL('../supabase/migrations/20261014222654_fiscal_reserva_atomica_email_privada.sql',import.meta.url),'utf8'));
  const reservation=await db.exec(await fs.readFile(new URL('./email-reservation.sql',import.meta.url),'utf8'));
  console.log('email-reservation.sql: '+reservation.at(-1).rows[0].result);
  await db.exec(await fs.readFile(new URL('./email-dry-run-state-schema.sql',import.meta.url),'utf8'));
  const dryRunState=await db.exec(await fs.readFile(new URL('./email-dry-run-state.sql',import.meta.url),'utf8'));
  console.log('email-dry-run-state.sql: '+dryRunState.at(-1).rows[0].result);
  assert.equal((await db.query('select count(*)::int as n from auth.users')).rows[0].n,1,'Test Auth fixtures rolled back');
  assert.equal((await db.query('select count(*)::int as n from chk_membros_obra')).rows[0].n,0,'No production membership seeds');
} catch(e) {console.error(e.message);if(e.where)console.error(e.where);process.exitCode=1;}
finally {await db.close();}
