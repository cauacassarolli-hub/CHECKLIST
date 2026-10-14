-- Candidate selection is read-only. Transaction rollback preserves all fixtures.
begin;
-- PGlite service role mirrors Supabase service_role (BYPASSRLS + table grants).
alter role service_role bypassrls;
grant select on public.chk_obras,public.chk_membros_obra,
  public.chk_preferencias_notificacao,public.chk_consentimentos_email_resumo
  to service_role;
grant usage on schema chk_private to service_role;

select set_config('qa.candidate_member',gen_random_uuid()::text,true),
       set_config('qa.candidate_outsider',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at)
values(current_setting('qa.candidate_member')::uuid,'member@example.invalid',now()),
      (current_setting('qa.candidate_outsider')::uuid,'outsider@example.invalid',now());
insert into public.chk_membros_obra(obra_id,user_id,nome,ativo)
values('00000000-0000-4000-8000-000000000002',current_setting('qa.candidate_member')::uuid,'Candidate QA',true);
insert into public.chk_preferencias_notificacao(user_id,obra_id,ativo,horario,timezone,incluir_resumo)
values ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',true,'07:00','America/Sao_Paulo',true),
       (current_setting('qa.candidate_member')::uuid,'00000000-0000-4000-8000-000000000002',true,'07:00','America/Sao_Paulo',true),
       (current_setting('qa.candidate_outsider')::uuid,'00000000-0000-4000-8000-000000000002',true,'07:00','America/Sao_Paulo',true);
insert into public.chk_consentimentos_email_resumo(user_id,obra_id,autorizado)
values ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',true),
       (current_setting('qa.candidate_member')::uuid,'00000000-0000-4000-8000-000000000002',true),
       (current_setting('qa.candidate_outsider')::uuid,'00000000-0000-4000-8000-000000000002',true);

set local role service_role;
do $$ declare n integer; begin
  if has_function_privilege('anon','chk_private.chk_listar_candidatos_resumo_email(timestamptz)','EXECUTE') or
     has_function_privilege('authenticated','chk_private.chk_listar_candidatos_resumo_email(timestamptz)','EXECUTE') then
    raise exception 'Private candidate function publicly executable'; end if;
  select count(*) into n from chk_private.chk_listar_candidatos_resumo_email('2026-10-14 09:59:00+00');
  if n<>0 then raise exception 'Premature candidates: %',n; end if;
  select count(*) into n from chk_private.chk_listar_candidatos_resumo_email('2026-10-14 10:00:00+00');
  if n<>2 then raise exception 'Expected two authorized work members, got %',n; end if;
  if exists(select 1 from chk_private.chk_listar_candidatos_resumo_email('2026-10-14 10:00:00+00')
     where user_id=current_setting('qa.candidate_outsider')::uuid) then
    raise exception 'Outsider was included in candidate list'; end if;
  if exists(select 1 from chk_private.chk_listar_candidatos_resumo_email('2026-10-14 10:00:00+00')
     where data_local<>'2026-10-14' or horario<>'07:00') then
    raise exception 'Candidate dates/hours mismatch'; end if;
end $$;
reset role;

-- Existing ledger record always blocks duplicate reservation for the same local day.
insert into chk_private.chk_entregas_resumo(user_id,obra_id,data_local,horario_previsto,consentimento_validado_em,acesso_validado_em)
values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','2026-10-14','07:00',now(),now());
set local role service_role;
do $$ declare n integer; begin
  select count(*) into n from chk_private.chk_listar_candidatos_resumo_email('2026-10-14 10:05:00+00');
  if n<>1 then raise exception 'Existing delivery ledger did not suppress duplicate: %',n; end if;
  if not exists(select 1 from chk_private.chk_listar_candidatos_resumo_email('2026-10-14 10:05:00+00')
    where user_id=current_setting('qa.candidate_member')::uuid) then
    raise exception 'Expected active member not returned'; end if;
end $$;
reset role;

-- Revoked membership blocks discovery immediately despite prior consent.
update public.chk_membros_obra set ativo=false where user_id=current_setting('qa.candidate_member')::uuid;
set local role service_role;
do $$ begin
  if exists(select 1 from chk_private.chk_listar_candidatos_resumo_email('2026-10-14 10:10:00+00')) then
    raise exception 'Revoked member remained eligible'; end if;
end $$;
reset role;
update public.chk_membros_obra set ativo=true where user_id=current_setting('qa.candidate_member')::uuid;
update public.chk_consentimentos_email_resumo set autorizado=false
where user_id=current_setting('qa.candidate_member')::uuid;
set local role service_role;
do $$ begin
  if exists(select 1 from chk_private.chk_listar_candidatos_resumo_email('2026-10-14 10:10:00+00')) then
    raise exception 'Revoked email consent was ignored'; end if;
end $$;
reset role;

-- Old preferences are not enough to re-enable future email delivery.
update public.chk_consentimentos_email_resumo set autorizado=true
where user_id=current_setting('qa.candidate_member')::uuid;
update public.chk_preferencias_notificacao set incluir_resumo=false
where user_id=current_setting('qa.candidate_member')::uuid;
set local role service_role;
do $$ begin
  if exists(select 1 from chk_private.chk_listar_candidatos_resumo_email('2026-10-14 10:10:00+00')) then
    raise exception 'Disabled daily summary still produced candidate'; end if;
end $$;
reset role;
rollback;
select 'PASS: private due candidates enforce time, consent, membership, preferences and ledger' as result;
