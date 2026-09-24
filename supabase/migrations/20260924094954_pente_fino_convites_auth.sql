-- Add delivery state to the existing authorizations; never touch inspection data.
alter table public.chk_convites_obra
  add column status_envio text not null default 'pendente' check(status_envio in ('pendente','enviando','enviado','conta_existente','falhou')),
  add column envio_id uuid,
  add column ultima_tentativa timestamptz,
  add column enviado_em timestamptz;
-- Accepted memberships are already active and remain untouched.
update public.chk_convites_obra set status_envio='conta_existente' where aceito_por is not null;

create function chk_private.prepare_invite(work_id uuid, member_email text, member_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare invitation public.chk_convites_obra; invitation_id uuid; attempt uuid=gen_random_uuid();
begin
  if not chk_private.is_owner(work_id) then raise exception 'Somente o proprietário pode convidar colegas.' using errcode='42501'; end if;
  perform 1 from public.chk_obras where id=work_id for update;
  select * into invitation from public.chk_convites_obra where obra_id=work_id and email=lower(btrim(member_email));
  if invitation.ultima_tentativa>now()-interval '60 seconds' then
    raise exception 'Aguarde um minuto antes de reenviar este convite.' using errcode='23514';
  end if;
  if (select count(*) from public.chk_convites_obra where obra_id=work_id and ultima_tentativa>now()-interval '1 hour')>=20 then
    raise exception 'Limite de convites atingido. Tente novamente mais tarde.' using errcode='23514';
  end if;
  invitation_id=chk_private.authorize_member(work_id,member_email,member_name);
  update public.chk_convites_obra set status_envio='enviando',envio_id=attempt,ultima_tentativa=now(),enviado_em=null
    where id=invitation_id returning * into invitation;
  return jsonb_build_object('id',invitation.id,'envio_id',attempt,'email',invitation.email);
end $$;
create function public.chk_preparar_convite(work_id uuid, member_email text, member_name text) returns jsonb
language sql security invoker set search_path='' as $$ select chk_private.prepare_invite(work_id,member_email,member_name); $$;
revoke all on function chk_private.prepare_invite(uuid,text,text),public.chk_preparar_convite(uuid,text,text) from public,anon;
grant execute on function chk_private.prepare_invite(uuid,text,text),public.chk_preparar_convite(uuid,text,text) to authenticated;

-- Only the Edge Function's server credential can report Auth delivery outcomes.
create function chk_private.finish_invite(invite_id uuid, attempt_id uuid, result_status text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if result_status not in ('enviado','conta_existente','falhou') then raise exception 'Estado de envio inválido.' using errcode='23514'; end if;
  update public.chk_convites_obra set status_envio=result_status,enviado_em=case when result_status='enviado' then now() else null end
    where id=invite_id and envio_id=attempt_id and status_envio='enviando' and ativo;
  return found;
end $$;
create function public.chk_finalizar_convite(invite_id uuid, attempt_id uuid, result_status text) returns boolean
language sql security invoker set search_path='' as $$ select chk_private.finish_invite(invite_id,attempt_id,result_status); $$;
revoke all on function chk_private.finish_invite(uuid,uuid,text),public.chk_finalizar_convite(uuid,uuid,text) from public,anon,authenticated;
grant usage on schema chk_private to service_role;
grant execute on function chk_private.finish_invite(uuid,uuid,text),public.chk_finalizar_convite(uuid,uuid,text) to service_role;

create or replace function chk_private.accept_invites() returns integer
language plpgsql security definer set search_path='' as $$
declare verified_email text; invitation record; accepted integer=0;
begin
  select lower(email) into verified_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if verified_email is null then return 0; end if;
  for invitation in select obra_id,id from public.chk_convites_obra
    where email=verified_email and ativo and aceito_por is null and status_envio in ('enviado','conta_existente') order by obra_id loop
    perform 1 from public.chk_obras where id=invitation.obra_id for update;
    insert into public.chk_membros_obra(obra_id,user_id,nome,adicionado_por)
      select obra_id,auth.uid(),nome,convidado_por from public.chk_convites_obra
      where id=invitation.id and email=verified_email and ativo and aceito_por is null and status_envio in ('enviado','conta_existente')
    on conflict(obra_id,user_id) do update set nome=excluded.nome,ativo=true,adicionado_por=excluded.adicionado_por;
    if found then
      update public.chk_convites_obra set aceito_por=auth.uid(),aceito_em=now() where id=invitation.id;
      accepted=accepted+1;
    end if;
  end loop;
  return accepted;
end $$;
notify pgrst,'reload schema';
