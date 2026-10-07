-- Fiscal de Qualidade: consulta estruturada somente leitura.
-- SECURITY INVOKER preserva as policies RLS das tabelas chk_*.
create or replace function public.chk_consultar_ocorrencias(
  p_obra_id uuid,
  p_pavimento text default null,
  p_apartamento text default null,
  p_servico text default null,
  p_ambiente text default null,
  p_status text default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_pavimento text := nullif(btrim(p_pavimento), '');
  v_apartamento text := nullif(btrim(p_apartamento), '');
  v_servico text := nullif(btrim(p_servico), '');
  v_ambiente text := nullif(btrim(p_ambiente), '');
  v_status text := nullif(btrim(p_status), '');
  v_result jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Autenticação obrigatória.'; end if;
  if p_obra_id is null or not chk_private.has_access(p_obra_id) then raise exception 'Obra não encontrada ou acesso negado.'; end if;
  if v_pavimento is not null and not exists(select 1 from public.chk_apartamentos a where a.obra_id=p_obra_id and a.pavimento=v_pavimento) then raise exception 'Pavimento não encontrado nesta obra.'; end if;
  if v_apartamento is not null and not exists(select 1 from public.chk_apartamentos a where a.obra_id=p_obra_id and a.apartamento=v_apartamento and (v_pavimento is null or a.pavimento=v_pavimento)) then raise exception 'Apartamento não encontrado no filtro informado.'; end if;
  if v_servico is not null and not exists(select 1 from public.chk_servicos s where s.obra_id=p_obra_id and s.nome=v_servico) then raise exception 'Serviço não cadastrado nesta obra.'; end if;
  if v_ambiente is not null and not exists(select 1 from public.chk_ambientes a where a.obra_id=p_obra_id and a.nome=v_ambiente) then raise exception 'Ambiente não cadastrado nesta obra.'; end if;
  if v_status is not null and v_status not in ('pendente','correcao','em_correcao','corrigido','conforme') then raise exception 'Status de ocorrência inválido.'; end if;

  with filtered as (
    select i.*,a.pavimento,a.apartamento
    from public.chk_itens i join public.chk_apartamentos a on a.id=i.apartamento_id and a.obra_id=i.obra_id
    where i.obra_id=p_obra_id
      and (v_pavimento is null or a.pavimento=v_pavimento)
      and (v_apartamento is null or a.apartamento=v_apartamento)
      and (v_servico is null or i.servico=v_servico)
      and (v_ambiente is null or i.ambiente=v_ambiente)
      and (v_status is null or i.status=v_status)
  ), service_counts as (
    select servico,count(*) total,count(*) filter(where status in ('pendente','correcao','em_correcao')) abertas
    from filtered group by servico
  )
  select jsonb_build_object(
    'filtros',jsonb_build_object('pavimento',coalesce(v_pavimento,''),'apartamento',coalesce(v_apartamento,''),'servico',coalesce(v_servico,''),'ambiente',coalesce(v_ambiente,''),'status',coalesce(v_status,'')),
    'resumo',jsonb_build_object(
      'total',(select count(*) from filtered),
      'abertas',(select count(*) from filtered where status in ('pendente','correcao','em_correcao')),
      'pendentes',(select count(*) from filtered where status='pendente'),
      'em_correcao',(select count(*) from filtered where status in ('correcao','em_correcao')),
      'corrigidas',(select count(*) from filtered where status='corrigido'),
      'conformes',(select count(*) from filtered where status='conforme'),
      'servicos',coalesce((select jsonb_agg(jsonb_build_object('servico',servico,'total',total,'abertas',abertas) order by abertas desc,total desc,servico) from service_counts),'[]'::jsonb)
    ),
    'ocorrencias',coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'apartamento_id',apartamento_id,'pavimento',pavimento,'apartamento',apartamento,'ambiente',ambiente,'servico',servico,'titulo',titulo,'descricao',observacao,'status',status,'responsavel',responsavel,'prioridade',prioridade,'prazo',prazo,'foto_antes_path',foto_antes_path,'foto_depois_path',foto_depois_path,'data_vistoria',data_vistoria,'data_correcao',data_correcao,'created_at',created_at,'updated_at',updated_at,'criado_por_nome',criado_por_nome,'resolvido_por_nome',resolvido_por_nome
    ) order by pavimento,apartamento,created_at,id) from filtered),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;

revoke execute on function public.chk_consultar_ocorrencias(uuid,text,text,text,text,text) from public, anon;
grant execute on function public.chk_consultar_ocorrencias(uuid,text,text,text,text,text) to authenticated;
