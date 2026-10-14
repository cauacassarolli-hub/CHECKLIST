-- Stage-only SQL fixture. Upon validation this becomes a versioned migration.
-- Internal delivery ledger. Does NOT schedule, send, or retain message bodies.
create schema if not exists chk_private;
create table if not exists chk_private.chk_entregas_resumo (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  obra_id uuid not null references public.chk_obras(id) on delete cascade,
  data_local date not null,
  canal text not null default 'email' check (canal = 'email'),
  horario_previsto time not null,
  timezone text not null default 'America/Sao_Paulo' check (timezone = 'America/Sao_Paulo'),
  status text not null default 'planejada'
    check (status in ('planejada','em_processamento','enviada','falhou','cancelada')),
  tentativas integer not null default 0 check (tentativas between 0 and 5),
  consentimento_validado_em timestamptz not null,
  acesso_validado_em timestamptz not null,
  bloqueio_ate timestamptz,
  enviada_em timestamptz,
  codigo_erro varchar(64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_entregas_resumo_unica_por_dia
    unique (user_id,obra_id,data_local,canal),
  constraint chk_entregas_resumo_bloqueio_estado
    check ((status = 'em_processamento') = (bloqueio_ate is not null)),
  constraint chk_entregas_resumo_envio_estado
    check ((status = 'enviada') = (enviada_em is not null)),
  constraint chk_entregas_resumo_envio_com_tentativa
    check (status <> 'enviada' or tentativas > 0),
  constraint chk_entregas_resumo_erro_estado
    check (codigo_erro is null or status = 'falhou')
);
create index if not exists chk_entregas_resumo_status_dia_idx
  on chk_private.chk_entregas_resumo(status,data_local);

alter table chk_private.chk_entregas_resumo enable row level security;
-- There are intentionally NO public RLS policies for this internal ledger.
revoke all privileges on chk_private.chk_entregas_resumo from public,anon,authenticated;
grant usage on schema chk_private to service_role;
grant select,insert,update on chk_private.chk_entregas_resumo to service_role;
comment on table chk_private.chk_entregas_resumo is
  'Internal audit/deduplication ledger. No cron, messaging, or public Data API access. Future server worker must revalidate membership and explicit channel consent before attempting any delivery.';
