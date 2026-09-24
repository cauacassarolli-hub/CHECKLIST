-- Shared access is explicit per work. user_id remains the immutable author.
-- No accounts, memberships, catalog entries or inspection records are seeded.
create schema if not exists chk_private;
revoke all on schema chk_private from public, anon;
grant usage on schema chk_private to authenticated;

create table public.chk_membros_obra (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.chk_obras(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null check (length(nome) between 1 and 150),
  ativo boolean not null default true,
  adicionado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(obra_id,user_id)
);
create index chk_membros_user_work_idx on public.chk_membros_obra(user_id,obra_id) where ativo;
create table public.chk_convites_obra (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.chk_obras(id) on delete cascade,
  email text not null check (email=lower(btrim(email)) and length(email)<=254),
  nome text not null check (length(nome) between 1 and 150),
  ativo boolean not null default true,
  convidado_por uuid references auth.users(id) on delete set null,
  aceito_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  aceito_em timestamptz,
  unique(obra_id,email)
);
create index chk_convites_email_idx on public.chk_convites_obra(email) where ativo and aceito_por is null;
create table public.chk_atividades (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.chk_obras(id) on delete cascade,
  entidade text not null,
  registro_id uuid not null,
  acao text not null,
  autor_id uuid references auth.users(id) on delete set null,
  autor_nome text not null,
  detalhes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index chk_atividades_work_time_idx on public.chk_atividades(obra_id,created_at desc);
alter table public.chk_membros_obra enable row level security;
alter table public.chk_convites_obra enable row level security;
alter table public.chk_atividades enable row level security;
revoke all on public.chk_membros_obra,public.chk_convites_obra,public.chk_atividades from public,anon,authenticated;
grant select on public.chk_membros_obra,public.chk_convites_obra,public.chk_atividades to authenticated;

create function chk_private.is_owner(work_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(
    select 1 from public.chk_obras where id=work_id and user_id=auth.uid()
  );
$$;
create function chk_private.has_access(work_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and (
    exists(select 1 from public.chk_obras where id=work_id and user_id=auth.uid())
    or exists(select 1 from public.chk_membros_obra where obra_id=work_id and user_id=auth.uid() and ativo)
  );
$$;
create function chk_private.actor_name(work_id uuid) returns text
language sql stable security definer set search_path='' as $$
  select coalesce(
    (select nome from public.chk_membros_obra where obra_id=work_id and user_id=auth.uid() and ativo),
    (select coalesce(nullif(left(btrim(raw_user_meta_data->>'full_name'),150),''),email) from auth.users where id=auth.uid()),
    'Usuário'
  );
$$;
create function chk_private.path_work(path text) returns uuid
language plpgsql immutable security invoker set search_path='' as $$
begin
  return split_part(path,'/',2)::uuid;
exception when invalid_text_representation then return null;
end;
$$;

create policy chk_members_read on public.chk_membros_obra for select to authenticated using (chk_private.has_access(obra_id));
create policy chk_invites_owner_read on public.chk_convites_obra for select to authenticated using (chk_private.is_owner(obra_id));
create policy chk_activity_read on public.chk_atividades for select to authenticated using (chk_private.has_access(obra_id));

-- Only the owner can authorize/revoke an e-mail. No e-mail is sent by these RPCs.
create function chk_private.authorize_member(work_id uuid, member_email text, member_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare invite_id uuid;
begin
  if not chk_private.is_owner(work_id) then raise exception 'Somente o proprietário pode autorizar a equipe.' using errcode='42501'; end if;
  perform 1 from public.chk_obras where id=work_id for update;
  member_email=lower(btrim(member_email)); member_name=btrim(member_name);
  if member_email is null or length(member_email)>254 or member_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or member_name is null or length(member_name) not between 1 and 150 then
    raise exception 'Informe um nome e um e-mail válidos.' using errcode='23514';
  end if;
  if exists(select 1 from auth.users where id=auth.uid() and lower(email)=member_email) then
    raise exception 'O proprietário já tem acesso à obra.' using errcode='23514';
  end if;
  insert into public.chk_convites_obra(obra_id,email,nome,convidado_por)
    values(work_id,member_email,member_name,auth.uid())
  on conflict(obra_id,email) do update set nome=excluded.nome,ativo=true,convidado_por=auth.uid(),aceito_por=null,aceito_em=null
  returning id into invite_id;
  return invite_id;
end;
$$;
create function chk_private.accept_invites() returns integer
language plpgsql security definer set search_path='' as $$
declare verified_email text; invitation record; accepted integer=0;
begin
  -- Read the verified identity from Auth, never from editable metadata/JWT email claims.
  select lower(email) into verified_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if verified_email is null then return 0; end if;
  for invitation in select obra_id,id from public.chk_convites_obra
    where email=verified_email and ativo and aceito_por is null order by obra_id loop
    perform 1 from public.chk_obras where id=invitation.obra_id for update;
    insert into public.chk_membros_obra(obra_id,user_id,nome,adicionado_por)
      select obra_id,auth.uid(),nome,convidado_por from public.chk_convites_obra
      where id=invitation.id and email=verified_email and ativo and aceito_por is null
    on conflict(obra_id,user_id) do update set nome=excluded.nome,ativo=true,adicionado_por=excluded.adicionado_por;
    if found then
      update public.chk_convites_obra set aceito_por=auth.uid(),aceito_em=now() where id=invitation.id;
      accepted=accepted+1;
    end if;
  end loop;
  return accepted;
end;
$$;
create function chk_private.revoke_member(work_id uuid, member_id uuid default null, invite_id uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare target_user uuid;
begin
  if not chk_private.is_owner(work_id) then raise exception 'Somente o proprietário pode remover acessos.' using errcode='42501'; end if;
  perform 1 from public.chk_obras where id=work_id for update;
  if member_id is not null then
    update public.chk_membros_obra set ativo=false where id=member_id and obra_id=work_id returning user_id into target_user;
  elsif invite_id is not null then
    update public.chk_convites_obra set ativo=false where id=invite_id and obra_id=work_id returning aceito_por into target_user;
    update public.chk_membros_obra set ativo=false where obra_id=work_id and user_id=target_user;
  else raise exception 'Selecione um acesso.' using errcode='23514'; end if;
  update public.chk_convites_obra set ativo=false where obra_id=work_id and (aceito_por=target_user
    or email=(select lower(email) from auth.users where id=target_user));
end;
$$;
create function public.chk_autorizar_membro(work_id uuid, member_email text, member_name text) returns uuid
language sql security invoker set search_path='' as $$ select chk_private.authorize_member(work_id,member_email,member_name); $$;
create function public.chk_aceitar_convites() returns integer
language sql security invoker set search_path='' as $$ select chk_private.accept_invites(); $$;
create function public.chk_revogar_membro(work_id uuid, member_id uuid default null, invite_id uuid default null) returns void
language sql security invoker set search_path='' as $$ select chk_private.revoke_member(work_id,member_id,invite_id); $$;

-- Preserve historical data, adding only attribution and a record revision counter.
alter table public.chk_itens add column versao integer not null default 1;
alter table public.chk_itens add column criado_por_nome text;
alter table public.chk_itens add column atualizado_por uuid references auth.users(id) on delete set null;
alter table public.chk_itens add column atualizado_por_nome text;
alter table public.chk_apartamentos add column criado_por_nome text;
alter table public.chk_apartamentos add column atualizado_por uuid references auth.users(id) on delete set null;
alter table public.chk_apartamentos add column atualizado_por_nome text;
alter table public.chk_apartamentos add column updated_at timestamptz;
alter table public.chk_relatorios add column criado_por_nome text;
alter table public.chk_relatorios add column atualizado_por uuid references auth.users(id) on delete set null;
alter table public.chk_relatorios add column atualizado_por_nome text;
alter table public.chk_relatorios add column updated_at timestamptz;

-- Old triggers expect an authenticated owner. Backfill only the new display column.
alter table public.chk_itens disable trigger chk_itens_parent;
alter table public.chk_itens disable trigger chk_itens_sync_status;
alter table public.chk_apartamentos disable trigger chk_apartamentos_parent;
alter table public.chk_relatorios disable trigger chk_relatorios_parent;
update public.chk_itens t set criado_por_nome=coalesce(nullif(left(btrim(u.raw_user_meta_data->>'full_name'),150),''),u.email,'Usuário') from auth.users u where u.id=t.user_id;
update public.chk_apartamentos t set criado_por_nome=coalesce(nullif(left(btrim(u.raw_user_meta_data->>'full_name'),150),''),u.email,'Usuário') from auth.users u where u.id=t.user_id;
update public.chk_relatorios t set criado_por_nome=coalesce(nullif(left(btrim(u.raw_user_meta_data->>'full_name'),150),''),u.email,'Usuário') from auth.users u where u.id=t.user_id;
alter table public.chk_itens enable trigger chk_itens_parent;
alter table public.chk_itens enable trigger chk_itens_sync_status;
alter table public.chk_apartamentos enable trigger chk_apartamentos_parent;
alter table public.chk_relatorios enable trigger chk_relatorios_parent;

create or replace function public.chk_validate_parent() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if not chk_private.has_access(new.obra_id) then raise exception 'Você não faz parte desta obra.' using errcode='42501'; end if;
  if tg_op='INSERT' and new.user_id is distinct from auth.uid() then raise exception 'Autor inválido.' using errcode='42501'; end if;
  if tg_op='UPDATE' then
    if new.user_id is distinct from old.user_id or new.obra_id is distinct from old.obra_id or new.id is distinct from old.id then
      raise exception 'A autoria e a obra do cadastro não podem ser alteradas.' using errcode='42501';
    end if;
    new.created_at=old.created_at;
    if tg_table_name='chk_apartamentos' then
      if not chk_private.is_owner(new.obra_id) and (new.apartamento is distinct from old.apartamento or new.pavimento is distinct from old.pavimento) then
        raise exception 'Somente o proprietário pode editar o cadastro do apartamento.' using errcode='42501';
      end if;
    end if;
  end if;
  if tg_table_name='chk_itens' then
    if tg_op='UPDATE' and new.apartamento_id is distinct from old.apartamento_id then
      raise exception 'O apartamento do registro não pode ser alterado.' using errcode='23514';
    end if;
    perform 1 from public.chk_apartamentos where id=new.apartamento_id and obra_id=new.obra_id for update;
    if not found then raise exception 'Apartamento indisponível nesta obra.' using errcode='42501'; end if;
    new.updated_at=now();
    if (tg_op='INSERT' or new.foto_antes_path is distinct from old.foto_antes_path) and new.foto_antes_path is not null
       and (chk_private.path_work(new.foto_antes_path) is distinct from new.obra_id or split_part(new.foto_antes_path,'/',3)<>new.apartamento_id::text or split_part(new.foto_antes_path,'/',4)<>new.id::text) then
      raise exception 'A foto antes deve pertencer a este registro.' using errcode='23514';
    end if;
    if (tg_op='INSERT' or new.foto_depois_path is distinct from old.foto_depois_path) and new.foto_depois_path is not null
       and (chk_private.path_work(new.foto_depois_path) is distinct from new.obra_id or split_part(new.foto_depois_path,'/',3)<>new.apartamento_id::text or split_part(new.foto_depois_path,'/',4)<>new.id::text) then
      raise exception 'A foto depois deve pertencer a este registro.' using errcode='23514';
    end if;
  end if;
  if tg_table_name='chk_relatorios' then
    if (tg_op='INSERT' or new.pdf_path is distinct from old.pdf_path)
       and new.pdf_path is not null and chk_private.path_work(new.pdf_path) is distinct from new.obra_id then
      raise exception 'O PDF deve pertencer a esta obra.' using errcode='23514';
    end if;
  end if;
  return new;
end;
$$;
create function chk_private.guard_work() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.id is distinct from old.id or new.user_id is distinct from old.user_id then
    raise exception 'O proprietário da obra não pode ser alterado.' using errcode='42501';
  end if;
  new.created_at=old.created_at;
  return new;
end;
$$;
create trigger chk_obras_guard before update on public.chk_obras for each row execute function chk_private.guard_work();
create function chk_private.stamp_author() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='INSERT' then new.criado_por_nome=chk_private.actor_name(new.obra_id);
  else new.criado_por_nome=old.criado_por_nome; end if;
  new.atualizado_por=auth.uid(); new.atualizado_por_nome=chk_private.actor_name(new.obra_id); new.updated_at=now();
  if tg_table_name='chk_itens' then new.versao=case when tg_op='INSERT' then 1 else old.versao+1 end; end if;
  return new;
end;
$$;
create function chk_private.log_activity() returns trigger
language plpgsql security definer set search_path='' as $$
declare row_data jsonb; old_data jsonb;
begin
  row_data=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  old_data=case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  -- A cascading work deletion needs no orphan audit entry.
  if exists(select 1 from public.chk_obras where id=(row_data->>'obra_id')::uuid) then
    insert into public.chk_atividades(obra_id,entidade,registro_id,acao,autor_id,autor_nome,detalhes)
      values((row_data->>'obra_id')::uuid,tg_table_name,(row_data->>'id')::uuid,tg_op,auth.uid(),chk_private.actor_name((row_data->>'obra_id')::uuid),
        jsonb_strip_nulls(jsonb_build_object('status',row_data->>'status','status_anterior',old_data->>'status','servico',row_data->>'servico',
          'ambiente',row_data->>'ambiente','apartamento_id',row_data->>'apartamento_id','apartamento',row_data->>'apartamento',
          'pavimento',row_data->>'pavimento','titulo',row_data->>'titulo','versao',row_data->>'versao')));
  end if;
  return null;
end;
$$;
do $$
declare t text;
begin
  foreach t in array array['chk_itens','chk_apartamentos','chk_relatorios'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function chk_private.stamp_author()',t||'_stamp',t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function chk_private.log_activity()',t||'_activity',t);
  end loop;
end;
$$;
-- Avoid recording an apartment update when its calculated status did not change.
create or replace function public.chk_sync_apartment_status() returns trigger
language plpgsql security invoker set search_path='' as $$
declare target_id uuid; target_status text;
begin
  if tg_op='DELETE' then target_id=old.apartamento_id; else target_id=new.apartamento_id; end if;
  select status into target_status from public.chk_apartamentos where id=target_id for update;
  if not found then return null; end if;
  if exists(select 1 from public.chk_itens where apartamento_id=target_id and status='pendente') then target_status='com_pendencias';
  elsif exists(select 1 from public.chk_itens where apartamento_id=target_id and status in ('correcao','em_correcao')) then target_status='em_correcao';
  elsif target_status not in ('conforme','finalizado') then
    target_status=case when exists(select 1 from public.chk_itens where apartamento_id=target_id) then 'em_vistoria' else 'nao_iniciado' end;
  end if;
  update public.chk_apartamentos set status=target_status where id=target_id and status is distinct from target_status;
  return null;
end;
$$;

-- Replace only this application's known policies; keep every other app untouched.
drop policy "Usuário acessa suas obras" on public.chk_obras;
drop policy "Usuário acessa seus apartamentos" on public.chk_apartamentos;
drop policy "Usuário acessa seus ambientes" on public.chk_ambientes;
drop policy "Usuário acessa seus serviços" on public.chk_servicos;
drop policy "Usuário acessa seus itens" on public.chk_itens;
drop policy "Usuário acessa seus relatórios" on public.chk_relatorios;
drop policy chk_prioridades_owner_select on public.chk_prioridades;
drop policy chk_prioridades_owner_insert on public.chk_prioridades;
drop policy chk_prioridades_owner_update on public.chk_prioridades;
drop policy chk_prioridades_owner_delete on public.chk_prioridades;
create policy chk_work_read on public.chk_obras for select to authenticated using(user_id=(select auth.uid()) or chk_private.has_access(id));
create policy chk_work_insert on public.chk_obras for insert to authenticated with check(user_id=(select auth.uid()));
create policy chk_work_update on public.chk_obras for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy chk_work_delete on public.chk_obras for delete to authenticated using(user_id=(select auth.uid()));
do $$
declare t text;
begin
  foreach t in array array['chk_ambientes','chk_servicos','chk_prioridades','chk_apartamentos','chk_itens','chk_relatorios'] loop
    execute format('create policy %I on public.%I for select to authenticated using(chk_private.has_access(obra_id))',t||'_team_read',t);
    execute format('create policy %I on public.%I for insert to authenticated with check(user_id=(select auth.uid()) and chk_private.%s(obra_id))',t||'_team_insert',t,
      case when t in ('chk_itens','chk_relatorios') then 'has_access' else 'is_owner' end);
    execute format('create policy %I on public.%I for update to authenticated using(%s) with check(%s)',t||'_team_update',t,
      case when t in ('chk_itens','chk_apartamentos') then 'chk_private.has_access(obra_id)'
        when t='chk_relatorios' then 'chk_private.has_access(obra_id) and (user_id=(select auth.uid()) or chk_private.is_owner(obra_id))'
        else 'chk_private.is_owner(obra_id)' end,
      case when t in ('chk_itens','chk_apartamentos') then 'chk_private.has_access(obra_id)'
        when t='chk_relatorios' then 'chk_private.has_access(obra_id) and (user_id=(select auth.uid()) or chk_private.is_owner(obra_id))'
        else 'chk_private.is_owner(obra_id)' end);
    execute format('create policy %I on public.%I for delete to authenticated using(%s)',t||'_team_delete',t,
      case when t in ('chk_itens','chk_relatorios') then 'chk_private.has_access(obra_id) and (user_id=(select auth.uid()) or chk_private.is_owner(obra_id))'
        else 'chk_private.is_owner(obra_id)' end);
    execute format('create index if not exists %I on public.%I(obra_id)',t||'_work_idx',t);
  end loop;
end;
$$;

drop policy "Usuário visualiza suas fotos do checklist" on storage.objects;
drop policy "Usuário envia suas fotos do checklist" on storage.objects;
drop policy "Usuário atualiza suas fotos do checklist" on storage.objects;
drop policy "Usuário remove suas fotos do checklist" on storage.objects;
drop policy chk_pdf_owner_select on storage.objects;
drop policy chk_pdf_owner_insert on storage.objects;
drop policy chk_pdf_owner_update on storage.objects;
drop policy chk_pdf_owner_delete on storage.objects;
create policy chk_files_team_read on storage.objects for select to authenticated
  using(bucket_id in ('checklist-fotos','checklist-relatorios') and chk_private.has_access(chk_private.path_work(name)));
create policy chk_files_team_insert on storage.objects for insert to authenticated
  with check(bucket_id in ('checklist-fotos','checklist-relatorios') and split_part(name,'/',1)=(select auth.uid())::text and chk_private.has_access(chk_private.path_work(name)));
create policy chk_files_team_update on storage.objects for update to authenticated
  using(bucket_id in ('checklist-fotos','checklist-relatorios') and chk_private.has_access(chk_private.path_work(name)) and (split_part(name,'/',1)=(select auth.uid())::text or chk_private.is_owner(chk_private.path_work(name))))
  with check(bucket_id in ('checklist-fotos','checklist-relatorios') and chk_private.has_access(chk_private.path_work(name)) and (split_part(name,'/',1)=(select auth.uid())::text or chk_private.is_owner(chk_private.path_work(name))));
create policy chk_files_team_delete on storage.objects for delete to authenticated
  using(bucket_id in ('checklist-fotos','checklist-relatorios') and chk_private.has_access(chk_private.path_work(name)) and (split_part(name,'/',1)=(select auth.uid())::text or chk_private.is_owner(chk_private.path_work(name))));

revoke all on all functions in schema chk_private from public,anon,authenticated;
grant execute on function chk_private.has_access(uuid),chk_private.is_owner(uuid),chk_private.actor_name(uuid),chk_private.path_work(text),
  chk_private.authorize_member(uuid,text,text),chk_private.accept_invites(),chk_private.revoke_member(uuid,uuid,uuid) to authenticated;
revoke all on function public.chk_autorizar_membro(uuid,text,text),public.chk_aceitar_convites(),public.chk_revogar_membro(uuid,uuid,uuid) from public,anon;
grant execute on function public.chk_autorizar_membro(uuid,text,text),public.chk_aceitar_convites(),public.chk_revogar_membro(uuid,uuid,uuid) to authenticated;
notify pgrst,'reload schema';
