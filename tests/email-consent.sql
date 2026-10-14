-- Consent email RLS, timestamps, opt-in and revocation. No rows persist.
begin;
select set_config('qa.mail_owner',gen_random_uuid()::text,true),
       set_config('qa.mail_member',gen_random_uuid()::text,true),
       set_config('qa.mail_outsider',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at)
select current_setting('qa.mail_'||who)::uuid,'email-consent-'||who||'@example.invalid',now()
from unnest(array['owner','member','outsider']) who;
select set_config('request.jwt.claim.sub',current_setting('qa.mail_owner'),true);
set local role authenticated;
do $$ declare w uuid; r public.chk_consentimentos_email_resumo; begin
  insert into public.chk_obras(user_id,nome) values(auth.uid(),'Consent QA') returning id into w;
  perform set_config('qa.mail_work',w::text,true);
  r := public.chk_configurar_consentimento_email_resumo(w,false);
  if r.autorizado or r.autorizado_em is not null or r.revogado_em is not null then
    raise exception 'Implicit email authorization was granted'; end if;
  r := public.chk_configurar_consentimento_email_resumo(w,true);
  if not r.autorizado or r.autorizado_em is null or r.revogado_em is not null then
    raise exception 'Opt-in was not persisted'; end if;
  if (select count(*) from public.chk_consentimentos_email_resumo where obra_id=w)<>1 then
    raise exception 'Consent upsert created duplicate rows'; end if;
  r := public.chk_configurar_consentimento_email_resumo(w,false);
  if r.autorizado or r.autorizado_em is null or r.revogado_em is null then
    raise exception 'Revocation did not preserve consent audit'; end if;
  r := public.chk_configurar_consentimento_email_resumo(w,true);
  if not r.autorizado or r.revogado_em is not null then
    raise exception 'Reauthorization failed'; end if;
  begin
    update public.chk_consentimentos_email_resumo
    set autorizado_em='1990-01-01' where obra_id=w;
    raise exception 'Timestamp tampering allowed';
  exception when insufficient_privilege then null; end;
  if exists(select 1 from pg_policies where tablename='chk_consentimentos_email_resumo' and cmd='DELETE') then
    raise exception 'Unauthorized deletion policy exists'; end if;
end $$;
reset role;

insert into public.chk_membros_obra(obra_id,user_id,nome,ativo)
values(current_setting('qa.mail_work')::uuid,current_setting('qa.mail_member')::uuid,'Consent Member',true);

select set_config('request.jwt.claim.sub',current_setting('qa.mail_member'),true);
set local role authenticated;
do $$ declare w uuid=current_setting('qa.mail_work')::uuid; r public.chk_consentimentos_email_resumo; begin
  if exists(select 1 from public.chk_consentimentos_email_resumo where obra_id=w) then
    raise exception 'Member saw owner consent'; end if;
  r := public.chk_configurar_consentimento_email_resumo(w,true);
  if r.user_id<>auth.uid() or not r.autorizado then raise exception 'Member consent was not personal'; end if;
  if (select count(*) from public.chk_consentimentos_email_resumo where obra_id=w)<>1 then
    raise exception 'Member can see another consent'; end if;
  begin
    insert into public.chk_consentimentos_email_resumo(user_id,obra_id,autorizado)
    values(current_setting('qa.mail_owner')::uuid,w,true);
    raise exception 'Member impersonated owner';
  exception when insufficient_privilege then null; end;
  begin
    update public.chk_consentimentos_email_resumo
    set user_id=current_setting('qa.mail_owner')::uuid where user_id=auth.uid();
    raise exception 'Member transferred consent ownership';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub',current_setting('qa.mail_outsider'),true);
do $$ declare w uuid=current_setting('qa.mail_work')::uuid; begin
  if exists(select 1 from public.chk_consentimentos_email_resumo where obra_id=w) then
    raise exception 'Outsider read email consent'; end if;
  begin
    perform public.chk_configurar_consentimento_email_resumo(w,true);
    raise exception 'Outsider authorized email for another work';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

update public.chk_membros_obra set ativo=false
where obra_id=current_setting('qa.mail_work')::uuid and user_id=current_setting('qa.mail_member')::uuid;
select set_config('request.jwt.claim.sub',current_setting('qa.mail_member'),true);
set local role authenticated;
do $$ declare w uuid=current_setting('qa.mail_work')::uuid; begin
  if exists(select 1 from public.chk_consentimentos_email_resumo where obra_id=w) then
    raise exception 'Revoked member retains access to email consent'; end if;
  begin
    perform public.chk_configurar_consentimento_email_resumo(w,true);
    raise exception 'Revoked member can re-enable delivery';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  if has_table_privilege('anon','public.chk_consentimentos_email_resumo','SELECT')
    or has_function_privilege('anon','public.chk_configurar_consentimento_email_resumo(uuid,boolean)','EXECUTE') then
    raise exception 'Anonymous email consent exposure'; end if;
end $$;
reset role;
rollback;
select 'PASS: explicit email consent, revocation, RLS and immutable timestamps' as result;
