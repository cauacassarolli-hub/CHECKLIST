-- Additive migration: opt-in customization. Preserves all existing data.
-- No priorities, deadlines or environment states are backfilled or created automatically;
-- existing chk_ambientes rows simply become ativo=true (their pre-existing implicit state).
alter table public.chk_itens add column if not exists prazo date;
alter table public.chk_ambientes add column if not exists ativo boolean not null default true;

create table if not exists public.chk_prioridades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  obra_id uuid not null references public.chk_obras(id) on delete cascade,
  nome text not null,
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.chk_prioridades enable row level security;

create policy "chk_prioridades_owner_select" on public.chk_prioridades for select to authenticated
using (user_id=(select auth.uid()));
create policy "chk_prioridades_owner_insert" on public.chk_prioridades for insert to authenticated
with check (user_id=(select auth.uid()));
create policy "chk_prioridades_owner_update" on public.chk_prioridades for update to authenticated
using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy "chk_prioridades_owner_delete" on public.chk_prioridades for delete to authenticated
using (user_id=(select auth.uid()));

revoke all on public.chk_prioridades from anon;
revoke truncate,references,trigger on public.chk_prioridades from authenticated;
grant select,insert,update,delete on public.chk_prioridades to authenticated;

create index if not exists chk_prioridades_owner_work_idx on public.chk_prioridades(user_id,obra_id);
create index if not exists chk_itens_prazo_idx on public.chk_itens(prazo) where prazo is not null;

-- Reuses the existing generic ownership/immutability trigger function
-- (created in 20260915161027_pente_fino_pdf_integrity.sql).
create trigger chk_prioridades_parent before insert or update on public.chk_prioridades
for each row execute function public.chk_validate_parent();
