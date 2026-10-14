-- RLS fixture: dry-run state requires privileged backend access, returns no email.
begin;
alter role service_role bypassrls;
grant select on public.chk_obras,public.chk_membros_obra,
  public.chk_preferencias_notificacao,public.chk_consentimentos_email_resumo
  to service_role;
grant usage on schema chk_private to service_role;
select set_config('qa.sim_member',gen_random_uuid()::text,true),
       set_config('qa.sim_outsider',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at)
values(current_setting('qa.sim_member')::uuid,'sim-member@example.invalid',now()),
      (current_setting('qa.sim_outsider')::uuid,'sim-outside@example.invalid',now());
insert into public.chk_membros_obra(obra_id,user_id,nome,ativo)
values('00000000-0000-4000-8000-000000000002',current_setting('qa.sim_member')::uuid,'Sim Member',true);
insert into public.chk_preferencias_notificacao(user_id,obra_id,ativo,horario,incluir_resumo)
values ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',true,'07:00',true),
       (current_setting('qa.sim_member')::uuid,'00000000-0000-4000-8000-000000000002',true,'08:30',true);
insert into public.chk_consentimentos_email_resumo(user_id,obra_id,autorizado)
values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',true),
      (current_setting('qa.sim_member')::uuid,'00000000-0000-4000-8000-000000000002',true);

set local role service_role;
do $$
declare
  w uuid='00000000-0000-4000-8000-000000000002';
  u uuid='00000000-0000-4000-8000-000000000001';
  result jsonb;
begin
  if has_function_privilege('anon','public.chk_estado_simulacao_resumo_email(uuid,uuid,timestamptz)','EXECUTE')
    or has_function_privilege('authenticated','public.chk_estado_simulacao_resumo_email(uuid,uuid,timestamptz)','EXECUTE') then
    raise exception 'Simulation exposed to PWA user'; end if;
  if not has_function_privilege('service_role','public.chk_estado_simulacao_resumo_email(uuid,uuid,timestamptz)','EXECUTE') then
    raise exception 'Server adapter cannot inspect simulation'; end if;
  result:=public.chk_estado_simulacao_resumo_email(u,w,'2026-10-14 10:00:00+00');
  if result->>'user_id'<>u::text or result->>'obra_id'<>w::text
    or result->>'autorizado_na_obra'<>'true'
    or result->>'ledger_consultado'<>'true'
    or result->>'reserva_existente'<>'false'
    or result->'preferencias'->>'horario'<>'07:00:00'
    or result->'consentimento'->>'autorizado'<>'true' then
    raise exception 'Authorized state differs: %',result; end if;
  if result ? 'email' or result ? 'recipient' or result ? 'ocorrencias'
    or result ? 'fotos' or result ? 'body' or result ? 'user_metadata' then
    raise exception 'Sensitive response key leaked'; end if;
  result:=public.chk_estado_simulacao_resumo_email(
    current_setting('qa.sim_outsider')::uuid,w,'2026-10-14 10:00:00+00');
  if result->>'autorizado_na_obra'<>'false'
    or result->'consentimento'<>'null'::jsonb
    or result->'preferencias'<>'null'::jsonb then
    raise exception 'Outsider wrongly authorized: %',result; end if;
  result:=public.chk_estado_simulacao_resumo_email(
    current_setting('qa.sim_member')::uuid,w,'2026-10-14 10:00:00+00');
  if result->>'autorizado_na_obra'<>'true'
    or result->'preferencias'->>'horario'<>'08:30:00' then
    raise exception 'Member state mismatch: %',result; end if;
end $$;
reset role;
insert into chk_private.chk_entregas_resumo(
  user_id,obra_id,data_local,horario_previsto,consentimento_validado_em,acesso_validado_em
) values('00000000-0000-4000-8000-000000000001',
         '00000000-0000-4000-8000-000000000002',
         '2026-10-14','07:00',now(),now());
set local role service_role;
do $$ declare result jsonb; begin
  result:=public.chk_estado_simulacao_resumo_email(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    '2026-10-14 12:00:00+00');
  if result->>'reserva_existente'<>'true' then raise exception 'Ledger reservation not detected'; end if;
  result:=public.chk_estado_simulacao_resumo_email(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    '2026-10-15 12:00:00+00');
  if result->>'reserva_existente'<>'false' then raise exception 'Yesterday blocks new local day'; end if;
end $$;
reset role;
update public.chk_membros_obra set ativo=false
where user_id=current_setting('qa.sim_member')::uuid;
update public.chk_consentimentos_email_resumo set autorizado=false
where user_id=current_setting('qa.sim_member')::uuid;
set local role service_role;
do $$ declare result jsonb;begin
  result:=public.chk_estado_simulacao_resumo_email(
    current_setting('qa.sim_member')::uuid,
    '00000000-0000-4000-8000-000000000002',
    '2026-10-15 12:00:00+00');
  if result->>'autorizado_na_obra'<>'false'
    or result->'consentimento'->>'autorizado'<>'false' then
    raise exception 'Revoked access/consent not reflected'; end if;
end $$;
reset role;
rollback;
select 'PASS: service-only simulation state validates membership, consent and daily ledger without sending' as result;
