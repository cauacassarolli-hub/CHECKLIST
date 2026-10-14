-- Server-only atomic reservation for a potential future digest email.
-- This does NOT send anything, create a cron job or mark deliveries as sent.
-- The caller must verify the account email with Auth Admin API immediately
-- beforehand. p_email_verificado is an attestation from that trusted server,
-- never a parameter exposed to the PWA or authenticated users.
create or replace function chk_private.chk_reservar_resumo_email(
  p_user_id uuid,
  p_obra_id uuid,
  p_email_verificado boolean default false,
  p_agora timestamptz default now()
)
returns uuid
language plpgsql volatile security invoker
set search_path = ''
as $$
declare v_reserva uuid;
begin
  if p_user_id is null or p_obra_id is null or p_agora is null then
    raise exception 'Usuário, obra e data são obrigatórios'
      using errcode='22023';
  end if;
  if p_email_verificado is distinct from true then
    return null;
  end if;
  -- The selection is re-evaluated inside this INSERT. The ledger's
  -- UNIQUE(user_id,obra_id,data_local,canal) protects concurrent workers.
  insert into chk_private.chk_entregas_resumo (
    user_id,obra_id,data_local,canal,horario_previsto,
    consentimento_validado_em,acesso_validado_em
  )
  select
    c.user_id,c.obra_id,c.data_local,'email',c.horario,
    statement_timestamp(),statement_timestamp()
  from chk_private.chk_listar_candidatos_resumo_email(p_agora) c
  where c.user_id=p_user_id and c.obra_id=p_obra_id
  on conflict (user_id,obra_id,data_local,canal) do nothing
  returning id into v_reserva;
  return v_reserva;
end;
$$;
revoke all on function chk_private.chk_reservar_resumo_email(uuid,uuid,boolean,timestamptz)
  from public,anon,authenticated;
grant execute on function chk_private.chk_reservar_resumo_email(uuid,uuid,boolean,timestamptz)
  to service_role;
comment on function chk_private.chk_reservar_resumo_email(uuid,uuid,boolean,timestamptz) is
  'Internal reservation only; returns UUID of newly planned ledger row or NULL. Never sends, retries or confirms deliveries. Future worker must independently verify confirmed Auth email and revalidate consent/access immediately before actual send.';
