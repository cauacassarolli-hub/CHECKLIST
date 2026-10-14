-- Test reservation without ever sending a message. All changes are rolled back.
begin;
alter role service_role bypassrls;
grant select on public.chk_obras,public.chk_membros_obra,
  public.chk_preferencias_notificacao,public.chk_consentimentos_email_resumo
  to service_role;
grant usage on schema chk_private to service_role;
select set_config('qa.reserve_member',gen_random_uuid()::text,true),
       set_config('qa.reserve_outsider',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at)
values (current_setting('qa.reserve_member')::uuid,'member-reserve@example.invalid',now()),
       (current_setting('qa.reserve_outsider')::uuid,'outsider-reserve@example.invalid',now());
insert into public.chk_membros_obra(obra_id,user_id,nome,ativo)
values('00000000-0000-4000-8000-000000000002',current_setting('qa.reserve_member')::uuid,'Reserve QA',true);
insert into public.chk_preferencias_notificacao(user_id,obra_id,ativo,horario,incluir_resumo)
values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',true,'07:00',true),
      (current_setting('qa.reserve_member')::uuid,'00000000-0000-4000-8000-000000000002',true,'07:00',true),
      (current_setting('qa.reserve_outsider')::uuid,'00000000-0000-4000-8000-000000000002',true,'07:00',true);
insert into public.chk_consentimentos_email_resumo(user_id,obra_id,autorizado)
values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',true),
      (current_setting('qa.reserve_member')::uuid,'00000000-0000-4000-8000-000000000002',true),
      (current_setting('qa.reserve_outsider')::uuid,'00000000-0000-4000-8000-000000000002',true);

set local role service_role;
do $$
declare
  u uuid='00000000-0000-4000-8000-000000000001';
  w uuid='00000000-0000-4000-8000-000000000002';
  first_id uuid;
begin
  if has_function_privilege('anon','chk_private.chk_reservar_resumo_email(uuid,uuid,boolean,timestamptz)','EXECUTE')
    or has_function_privilege('authenticated','chk_private.chk_reservar_resumo_email(uuid,uuid,boolean,timestamptz)','EXECUTE') then
    raise exception 'Reservation callable by PWA user'; end if;
  if chk_private.chk_reservar_resumo_email(u,w,false,'2026-10-14 10:00:00+00') is not null then
    raise exception 'Unverified email was reserved'; end if;
  if chk_private.chk_reservar_resumo_email(u,w,null,'2026-10-14 10:00:00+00') is not null then
    raise exception 'Missing proof of email verification was accepted'; end if;
  if chk_private.chk_reservar_resumo_email(u,w,true,'2026-10-14 09:59:00+00') is not null then
    raise exception 'Email was reserved before schedule'; end if;
  first_id:=chk_private.chk_reservar_resumo_email(u,w,true,'2026-10-14 10:00:00+00');
  if first_id is null then raise exception 'Valid reservation not created'; end if;
  if chk_private.chk_reservar_resumo_email(u,w,true,'2026-10-14 10:01:00+00') is not null then
    raise exception 'Duplicate reservation created'; end if;
  if (select count(*) from chk_private.chk_entregas_resumo where id=first_id
    and status='planejada' and tentativas=0 and enviada_em is null
    and data_local='2026-10-14' and canal='email') <> 1 then
    raise exception 'Reservation state is invalid'; end if;
  if (select count(*) from chk_private.chk_entregas_resumo)<>1 then
    raise exception 'Unverified call produced ledger rows'; end if;
  if chk_private.chk_reservar_resumo_email(current_setting('qa.reserve_outsider')::uuid,w,true,'2026-10-14 10:02:00+00') is not null then
    raise exception 'Outsider email was reserved'; end if;
  if chk_private.chk_reservar_resumo_email(u,'ffffffff-ffff-4fff-8fff-ffffffffffff',true,'2026-10-14 10:02:00+00') is not null then
    raise exception 'Unknown work was reserved'; end if;
  begin
    perform chk_private.chk_reservar_resumo_email(null,w,true,'2026-10-14 10:02:00+00');
    raise exception 'Missing user was accepted';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;
update public.chk_consentimentos_email_resumo set autorizado=false
where user_id='00000000-0000-4000-8000-000000000001';
update public.chk_membros_obra set ativo=false
where user_id=current_setting('qa.reserve_member')::uuid;
set local role service_role;
do $$
declare
  w uuid='00000000-0000-4000-8000-000000000002';
begin
  if chk_private.chk_reservar_resumo_email('00000000-0000-4000-8000-000000000001',w,true,'2026-10-15 10:00:00+00') is not null then
    raise exception 'Revoked email consent allowed next-day reservation'; end if;
  if chk_private.chk_reservar_resumo_email(current_setting('qa.reserve_member')::uuid,w,true,'2026-10-15 10:00:00+00') is not null then
    raise exception 'Revoked work member was reserved'; end if;
  if (select count(*) from chk_private.chk_entregas_resumo)<>1 then
    raise exception 'Ineligible candidates created reservations'; end if;
end $$;
reset role;
rollback;
select 'PASS: atomic reservation requires verified email, active consent, membership and unique local day' as result;
