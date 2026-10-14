-- Explicit email consent is independent from the existing daily-summary preferences.
-- No email is sent by this migration.
create table public.chk_consentimentos_email_resumo (
  user_id uuid not null references auth.users(id) on delete cascade,
  obra_id uuid not null references public.chk_obras(id) on delete cascade,
  autorizado boolean not null default false,
  autorizado_em timestamptz,
  revogado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id,obra_id),
  constraint chk_consent_email_authorized_at
    check (not autorizado or (autorizado_em is not null and revogado_em is null)),
  constraint chk_consent_email_revoked
    check (revogado_em is null or not autorizado)
);

create or replace function public.chk_marcar_consentimento_email()
returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.autorizado_em := case when new.autorizado then now() else null end;
    new.revogado_em := null;
    new.updated_at := now();
  else
    -- The authorizations always refer to the original identity/work.
    if new.user_id is distinct from old.user_id or new.obra_id is distinct from old.obra_id then
      raise exception 'Não é permitido transferir consentimento entre usuários ou obras' using errcode='42501';
    end if;
    new.created_at := old.created_at;
    if new.autorizado is distinct from old.autorizado then
      if new.autorizado then
        new.autorizado_em := now();
        new.revogado_em := null;
      else
        new.autorizado_em := old.autorizado_em;
        new.revogado_em := now();
      end if;
      new.updated_at := now();
    else
      new.autorizado_em := old.autorizado_em;
      new.revogado_em := old.revogado_em;
      new.updated_at := old.updated_at;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.chk_marcar_consentimento_email() from public,anon,authenticated;
create trigger chk_consent_email_audit
before insert or update on public.chk_consentimentos_email_resumo
for each row execute function public.chk_marcar_consentimento_email();

alter table public.chk_consentimentos_email_resumo enable row level security;
create policy chk_consent_email_read on public.chk_consentimentos_email_resumo
for select to authenticated
using ((select auth.uid())=user_id and chk_private.has_access(obra_id));
create policy chk_consent_email_insert on public.chk_consentimentos_email_resumo
for insert to authenticated
with check ((select auth.uid())=user_id and chk_private.has_access(obra_id));
create policy chk_consent_email_update on public.chk_consentimentos_email_resumo
for update to authenticated
using ((select auth.uid())=user_id and chk_private.has_access(obra_id))
with check ((select auth.uid())=user_id and chk_private.has_access(obra_id));

revoke all on public.chk_consentimentos_email_resumo from public,anon,authenticated;
grant select on public.chk_consentimentos_email_resumo to authenticated;
grant insert(user_id,obra_id,autorizado) on public.chk_consentimentos_email_resumo to authenticated;
grant update(autorizado) on public.chk_consentimentos_email_resumo to authenticated;

-- RLS and column-level grants execute as the authenticated user, never service_role.
create or replace function public.chk_configurar_consentimento_email_resumo(
  p_obra_id uuid,p_autorizado boolean
) returns public.chk_consentimentos_email_resumo
language plpgsql security invoker set search_path = ''
as $$
declare
  v_result public.chk_consentimentos_email_resumo;
begin
  if auth.uid() is null then
    raise exception 'Entre novamente para continuar' using errcode='28000';
  end if;
  if p_obra_id is null or p_autorizado is null then
    raise exception 'Obra e autorização explícita são obrigatórias' using errcode='22023';
  end if;
  if not chk_private.has_access(p_obra_id) then
    raise exception 'Você não possui acesso a esta obra' using errcode='42501';
  end if;
  insert into public.chk_consentimentos_email_resumo(user_id,obra_id,autorizado)
  values (auth.uid(),p_obra_id,p_autorizado)
  on conflict (user_id,obra_id) do update set autorizado=excluded.autorizado
  returning * into v_result;
  return v_result;
end;
$$;
revoke all on function public.chk_configurar_consentimento_email_resumo(uuid,boolean) from public,anon;
grant execute on function public.chk_configurar_consentimento_email_resumo(uuid,boolean) to authenticated;
comment on table public.chk_consentimentos_email_resumo is
  'Separate opt-in for future daily email. Does not schedule or send. Delivery workers must verify current membership, this flag, daily preferences, recipient verified email, and idempotency immediately before sending.';
