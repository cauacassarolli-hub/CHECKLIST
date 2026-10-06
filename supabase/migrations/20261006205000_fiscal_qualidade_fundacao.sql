-- Fiscal de Qualidade / Agente IA - fundacao de dados
-- Evolucao aditiva sobre o CHECKLIST v1.3.0.

alter table public.chk_itens
  add column if not exists titulo text,
  add column if not exists origem text not null default 'manual',
  add column if not exists resolvido_por uuid references auth.users(id) on delete set null,
  add column if not exists resolvido_por_nome text,
  add column if not exists ia_metadados jsonb not null default '{}'::jsonb;

create index if not exists chk_itens_obra_servico_status_idx
  on public.chk_itens (obra_id, servico, status);
create index if not exists chk_itens_apartamento_status_agent_idx
  on public.chk_itens (apartamento_id, status);
create index if not exists chk_itens_resolvido_por_idx
  on public.chk_itens (resolvido_por);

create table if not exists public.chk_preferencias_notificacao (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  obra_id uuid not null references public.chk_obras(id) on delete cascade,
  ativo boolean not null default true,
  horario time not null default '07:00',
  timezone text not null default 'America/Sao_Paulo',
  incluir_resumo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, obra_id)
);

alter table public.chk_preferencias_notificacao enable row level security;

drop policy if exists chk_notify_read on public.chk_preferencias_notificacao;
create policy chk_notify_read on public.chk_preferencias_notificacao
for select to authenticated
using ((select auth.uid()) = user_id and chk_private.has_access(obra_id));

drop policy if exists chk_notify_insert on public.chk_preferencias_notificacao;
create policy chk_notify_insert on public.chk_preferencias_notificacao
for insert to authenticated
with check ((select auth.uid()) = user_id and chk_private.has_access(obra_id));

drop policy if exists chk_notify_update on public.chk_preferencias_notificacao;
create policy chk_notify_update on public.chk_preferencias_notificacao
for update to authenticated
using ((select auth.uid()) = user_id and chk_private.has_access(obra_id))
with check ((select auth.uid()) = user_id and chk_private.has_access(obra_id));

drop policy if exists chk_notify_delete on public.chk_preferencias_notificacao;
create policy chk_notify_delete on public.chk_preferencias_notificacao
for delete to authenticated
using ((select auth.uid()) = user_id and chk_private.has_access(obra_id));

create index if not exists chk_notify_user_obra_idx
  on public.chk_preferencias_notificacao (user_id, obra_id);

grant select, insert, update, delete on public.chk_preferencias_notificacao to authenticated;
grant select, insert, update on public.chk_itens to authenticated;

-- A funcao e usada internamente pelo event trigger; clientes nao precisam executa-la.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
