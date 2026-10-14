-- Server-only discovery of potentially due email digests.
-- NO recipient email address, send permission, delivery reservation, cron or message body.
-- A future worker must additionally confirm the Auth email address is verified,
-- re-check current membership and channel consent at send time, and claim the ledger
-- atomically before any delivery. Discovery is NOT permission to send.
create or replace function chk_private.chk_listar_candidatos_resumo_email(
  p_agora timestamptz default now()
)
returns table (
  user_id uuid,
  obra_id uuid,
  data_local date,
  horario time without time zone
)
language sql stable security invoker
set search_path = ''
as $$
  with momento as (
    select p_agora at time zone 'America/Sao_Paulo' as instante_local
  )
  select c.user_id,c.obra_id,m.instante_local::date,p.horario
  from public.chk_consentimentos_email_resumo c
  join public.chk_preferencias_notificacao p
    on p.user_id=c.user_id and p.obra_id=c.obra_id
  cross join momento m
  where c.autorizado = true
    and c.autorizado_em is not null
    and c.revogado_em is null
    and p.ativo = true
    and p.incluir_resumo = true
    and p.timezone = 'America/Sao_Paulo'
    and p.horario <= m.instante_local::time
    and (
      exists(select 1 from public.chk_obras o
             where o.id=c.obra_id and o.user_id=c.user_id)
      or exists(select 1 from public.chk_membros_obra member
                where member.obra_id=c.obra_id
                  and member.user_id=c.user_id
                  and member.ativo=true)
    )
    and not exists(
      select 1 from chk_private.chk_entregas_resumo l
      where l.user_id=c.user_id
        and l.obra_id=c.obra_id
        and l.data_local=m.instante_local::date
        and l.canal='email'
    );
$$;
revoke all on function chk_private.chk_listar_candidatos_resumo_email(timestamptz)
  from public,anon,authenticated;
grant execute on function chk_private.chk_listar_candidatos_resumo_email(timestamptz)
  to service_role;
comment on function chk_private.chk_listar_candidatos_resumo_email(timestamptz) is
  'Private, non-sending discovery of possible email digests. Returns only IDs/date/time. Service must separately verify Auth email ownership/verification and atomically revalidate consent, work membership, preferences and ledger before delivery.';
