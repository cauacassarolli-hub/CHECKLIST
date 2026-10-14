-- Internal read-only state for a future authenticated Edge dry-run.
-- No email address, message body, reservation, send or write operation.
create or replace function public.chk_estado_simulacao_resumo_email(
  p_user_id uuid,p_obra_id uuid,p_agora timestamptz default now()
)
returns jsonb
language plpgsql stable security invoker
set search_path=''
as $$
declare v_result jsonb;
begin
  if p_user_id is null or p_obra_id is null or p_agora is null then
    raise exception 'Identificadores e data são obrigatórios' using errcode='22023';
  end if;
  select jsonb_build_object(
    'user_id',p_user_id,
    'obra_id',p_obra_id,
    'autorizado_na_obra',
      exists(select 1 from public.chk_obras o
             where o.id=p_obra_id and o.user_id=p_user_id)
      or exists(select 1 from public.chk_membros_obra m
                where m.obra_id=p_obra_id and m.user_id=p_user_id and m.ativo),
    'ledger_consultado',true,
    'reserva_existente',exists(
      select 1 from chk_private.chk_entregas_resumo l
      where l.user_id=p_user_id and l.obra_id=p_obra_id and l.canal='email'
        and l.data_local=(p_agora at time zone 'America/Sao_Paulo')::date
    ),
    'preferencias',(
      select jsonb_build_object(
        'user_id',p.user_id,'obra_id',p.obra_id,
        'ativo',p.ativo,'incluir_resumo',p.incluir_resumo,
        'horario',p.horario,'timezone',p.timezone
      )
      from public.chk_preferencias_notificacao p
      where p.user_id=p_user_id and p.obra_id=p_obra_id
    ),
    'consentimento',(
      select jsonb_build_object(
        'user_id',c.user_id,'obra_id',c.obra_id,
        'autorizado',c.autorizado,'autorizado_em',c.autorizado_em,
        'revogado_em',c.revogado_em
      )
      from public.chk_consentimentos_email_resumo c
      where c.user_id=p_user_id and c.obra_id=p_obra_id
    )
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.chk_estado_simulacao_resumo_email(uuid,uuid,timestamptz)
  from public,anon,authenticated;
grant execute on function public.chk_estado_simulacao_resumo_email(uuid,uuid,timestamptz)
  to service_role;
comment on function public.chk_estado_simulacao_resumo_email(uuid,uuid,timestamptz) is
  'Private-to-service read-only dry-run state through service-only RPC. Future Edge code MUST bind user_id to validated Auth bearer identity and verify email via Auth Admin. This routine does not authorize delivery.';
