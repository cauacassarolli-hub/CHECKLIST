-- Each scenario runs inside a transaction and leaves the fixture unchanged.
begin;
select set_config('qa.digest_user','00000000-0000-4000-8000-000000000001',true);
select set_config('qa.digest_work','00000000-0000-4000-8000-000000000002',true);
do $$
declare
  v_user uuid=current_setting('qa.digest_user')::uuid;
  v_work uuid=current_setting('qa.digest_work')::uuid;
begin
  if not (select relrowsecurity from pg_class where oid='chk_private.chk_entregas_resumo'::regclass) then
    raise exception 'Ledger does not enable RLS';
  end if;
  if exists(select 1 from pg_policies where schemaname='chk_private' and tablename='chk_entregas_resumo') then
    raise exception 'Ledger exposes RLS policies';
  end if;
  if has_table_privilege('anon','chk_private.chk_entregas_resumo','SELECT')
    or has_table_privilege('authenticated','chk_private.chk_entregas_resumo','SELECT')
    or has_table_privilege('authenticated','chk_private.chk_entregas_resumo','INSERT')
    or has_table_privilege('authenticated','chk_private.chk_entregas_resumo','UPDATE')
    or has_table_privilege('service_role','chk_private.chk_entregas_resumo','DELETE') then
    raise exception 'Ledger has excessive database grants';
  end if;
  if not has_table_privilege('service_role','chk_private.chk_entregas_resumo','INSERT') then
    raise exception 'Authorized backend cannot write delivery ledger';
  end if;
  insert into chk_private.chk_entregas_resumo(user_id,obra_id,data_local,horario_previsto,consentimento_validado_em,acesso_validado_em)
    values(v_user,v_work,'2026-10-14','07:00',now(),now());
  if (select count(*) from chk_private.chk_entregas_resumo where data_local='2026-10-14')<>1 then
    raise exception 'Initial reservation not stored';
  end if;
  begin
    insert into chk_private.chk_entregas_resumo(user_id,obra_id,data_local,horario_previsto,consentimento_validado_em,acesso_validado_em)
      values(v_user,v_work,'2026-10-14','08:00',now(),now());
    raise exception 'Duplicate same-day reservation was accepted';
  exception when unique_violation then null; end;
  insert into chk_private.chk_entregas_resumo(user_id,obra_id,data_local,horario_previsto,consentimento_validado_em,acesso_validado_em)
    values(v_user,v_work,'2026-10-15','07:00',now(),now());
  if (select count(*) from chk_private.chk_entregas_resumo)<>2 then
    raise exception 'Next-day reservation did not work';
  end if;
  begin
    insert into chk_private.chk_entregas_resumo(user_id,obra_id,data_local,horario_previsto,consentimento_validado_em,acesso_validado_em,canal)
      values(v_user,v_work,'2026-10-16','07:00',now(),now(),'whatsapp');
    raise exception 'Unknown channel was accepted';
  exception when check_violation then null; end;
  begin
    insert into chk_private.chk_entregas_resumo(user_id,obra_id,data_local,horario_previsto,acesso_validado_em)
      values(v_user,v_work,'2026-10-16','07:00',now());
    raise exception 'Missing channel consent validation was accepted';
  exception when not_null_violation then null; end;
  begin
    insert into chk_private.chk_entregas_resumo(user_id,obra_id,data_local,horario_previsto,consentimento_validado_em,acesso_validado_em,status)
      values(v_user,v_work,'2026-10-16','07:00',now(),now(),'enviada');
    raise exception 'Sent-without-timestamp state was accepted';
  exception when check_violation then null; end;
  begin
    insert into chk_private.chk_entregas_resumo(user_id,obra_id,data_local,horario_previsto,consentimento_validado_em,acesso_validado_em,status)
      values(v_user,v_work,'2026-10-16','07:00',now(),now(),'em_processamento');
    raise exception 'Processing-without-lease state was accepted';
  exception when check_violation then null; end;
  update chk_private.chk_entregas_resumo
    set status='em_processamento',bloqueio_ate=now()+interval '10 minutes',tentativas=1
    where data_local='2026-10-14' and user_id=v_user;
  update chk_private.chk_entregas_resumo
    set status='enviada',bloqueio_ate=null,enviada_em=now()
    where data_local='2026-10-14' and user_id=v_user;
  if (select count(*) from chk_private.chk_entregas_resumo where status='enviada' and tentativas=1)<>1 then
    raise exception 'Legitimate state transition failed';
  end if;
end $$;

set local role authenticated;
do $$ begin
  begin
    perform 1 from chk_private.chk_entregas_resumo;
    raise exception 'Authenticated user can read internal ledger';
  exception when insufficient_privilege then null; end;
  begin
    insert into chk_private.chk_entregas_resumo(user_id,obra_id,data_local,horario_previsto,consentimento_validado_em,acesso_validado_em)
      values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','2026-10-16','07:00',now(),now());
    raise exception 'Authenticated user can fabricate a delivery';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform 1 from chk_private.chk_entregas_resumo;
    raise exception 'Anonymous user can read internal ledger';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: private ledger, uniqueness, state checks and role denial' as result;
