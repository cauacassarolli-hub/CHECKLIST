-- Validate notification ownership, work access and revocation. All QA rows rolled back.
begin;
select set_config('qa.notify_owner',gen_random_uuid()::text,true),
       set_config('qa.notify_member',gen_random_uuid()::text,true),
       set_config('qa.notify_outsider',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at)
select current_setting('qa.notify_'||who)::uuid,'notify-'||who||'@example.invalid',now()
from unnest(array['owner','member','outsider']) who;

select set_config('request.jwt.claim.sub',current_setting('qa.notify_owner'),true);
set local role authenticated;
do $$ declare w uuid; begin
  insert into public.chk_obras(user_id,nome) values(auth.uid(),'Notification QA')
    returning id into w;
  perform set_config('qa.notify_work',w::text,true);
  insert into public.chk_preferencias_notificacao(user_id,obra_id,ativo,horario)
    values(auth.uid(),w,true,'08:00');
  if (select count(*) from public.chk_preferencias_notificacao where obra_id=w)<>1 then
    raise exception 'Owner cannot read own notification preference';
  end if;
end $$;

reset role;
insert into public.chk_membros_obra(obra_id,user_id,nome,ativo)
values(current_setting('qa.notify_work')::uuid,current_setting('qa.notify_member')::uuid,'Member QA',true);

select set_config('request.jwt.claim.sub',current_setting('qa.notify_member'),true);
set local role authenticated;
do $$ declare w uuid=current_setting('qa.notify_work')::uuid; n bigint; begin
  select count(*) into n from public.chk_preferencias_notificacao where obra_id=w;
  if n<>0 then raise exception 'Member can read owner notification preferences'; end if;
  insert into public.chk_preferencias_notificacao(user_id,obra_id,ativo,horario)
    values(auth.uid(),w,false,'09:30');
  select count(*) into n from public.chk_preferencias_notificacao where obra_id=w;
  if n<>1 then raise exception 'Member could not see their own preference'; end if;
  update public.chk_preferencias_notificacao set horario='10:00'
    where obra_id=w and user_id=auth.uid();
  if not exists(select 1 from public.chk_preferencias_notificacao where obra_id=w and horario='10:00') then
    raise exception 'Member could not update own preference'; end if;
  begin
    update public.chk_preferencias_notificacao set user_id=current_setting('qa.notify_owner')::uuid
      where obra_id=w and user_id=auth.uid();
    raise exception 'Member transferred preference ownership';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub',current_setting('qa.notify_outsider'),true);
do $$ declare w uuid=current_setting('qa.notify_work')::uuid; begin
  if exists(select 1 from public.chk_preferencias_notificacao where obra_id=w) then
    raise exception 'Outsider can read notification preferences'; end if;
  begin
    insert into public.chk_preferencias_notificacao(user_id,obra_id,horario)
      values(auth.uid(),w,'11:00');
    raise exception 'Outsider can subscribe to work';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
update public.chk_membros_obra set ativo=false
where obra_id=current_setting('qa.notify_work')::uuid
and user_id=current_setting('qa.notify_member')::uuid;

select set_config('request.jwt.claim.sub',current_setting('qa.notify_member'),true);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.chk_preferencias_notificacao
    where obra_id=current_setting('qa.notify_work')::uuid) then
    raise exception 'Revoked member retains notification access'; end if;
end $$;

reset role;
rollback;
select 'PASS: personal notification RLS, ownership, member access and revocation' as result;
