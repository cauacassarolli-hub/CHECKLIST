-- Run after the customization migration. All fixture changes are rolled back.
-- Uses an existing app owner's identity only inside this transaction.
begin;
select set_config('qa.owner',(select user_id::text from public.chk_obras order by id limit 1),true);
select set_config('request.jwt.claim.sub',current_setting('qa.owner'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare w uuid; a uuid; i uuid; p uuid; e uuid; s uuid;
begin
  insert into public.chk_obras(user_id,nome) values(auth.uid(),'QA transacional - será revertido') returning id into w;
  perform set_config('qa.work',w::text,true);
  if exists(select 1 from public.chk_ambientes where obra_id=w)
     or exists(select 1 from public.chk_servicos where obra_id=w)
     or exists(select 1 from public.chk_prioridades where obra_id=w)
     or exists(select 1 from public.chk_itens where obra_id=w) then
    raise exception 'A new work was automatically seeded';
  end if;
  insert into public.chk_apartamentos(user_id,obra_id,pavimento,apartamento,status) values(auth.uid(),w,'QA','1','conforme') returning id into a;
  insert into public.chk_ambientes(user_id,obra_id,nome) values(auth.uid(),w,'Ambiente QA') returning id into e;
  insert into public.chk_servicos(user_id,obra_id,nome) values(auth.uid(),w,'Serviço QA') returning id into s;
  insert into public.chk_prioridades(user_id,obra_id,nome) values(auth.uid(),w,'Prioridade QA') returning id into p;
  insert into public.chk_itens(user_id,obra_id,apartamento_id,ambiente,servico,status,prioridade,prazo)
    values(auth.uid(),w,a,'Ambiente QA','Serviço QA','pendente','Prioridade QA',current_date-1) returning id into i;
  if (select status from public.chk_apartamentos where id=a)<>'com_pendencias' then raise exception 'Status was not synchronized'; end if;
  begin
    update public.chk_apartamentos set status='conforme' where id=a;
    raise exception 'Apartment approval incorrectly allowed';
  exception when check_violation then null;
  end;
  update public.chk_ambientes set ativo=false where id=e;
  update public.chk_servicos set ativo=false where id=s;
  update public.chk_prioridades set ativo=false where id=p;
  if not exists(select 1 from public.chk_itens where id=i and ambiente='Ambiente QA' and servico='Serviço QA' and prioridade='Prioridade QA' and prazo=current_date-1) then raise exception 'History was lost'; end if;
  update public.chk_itens set status='corrigido' where id=i;
  update public.chk_apartamentos set status='conforme' where id=a;
  update public.chk_ambientes set ativo=true where id=e;
  update public.chk_servicos set ativo=true where id=s;
  update public.chk_prioridades set ativo=true where id=p;
  begin
    update public.chk_prioridades set user_id=gen_random_uuid() where id=p;
    raise exception 'Ownership reassignment incorrectly allowed';
  exception when insufficient_privilege then null;
  end;
  insert into public.chk_relatorios(user_id,obra_id,tipo,titulo,conteudo,pdf_path)
    values(auth.uid(),w,'finalizacao','QA transacional','{}',auth.uid()::text||'/'||w::text||'/qa.pdf');
end $$;
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('request.jwt.claim.sub'),'role','authenticated')::text,true);
do $$
declare t text; n bigint;
begin
  foreach t in array array['obras','apartamentos','ambientes','servicos','prioridades','itens','relatorios'] loop
    execute format('select count(*) from public.%I','chk_'||t) into n;
    if n<>0 then raise exception 'Cross-user visibility in %',t; end if;
  end loop;
  if exists(select 1 from storage.objects where bucket_id in ('checklist-fotos','checklist-relatorios')) then raise exception 'Cross-user storage visibility'; end if;
  begin
    insert into public.chk_prioridades(user_id,obra_id,nome)
      values(current_setting('qa.owner')::uuid,current_setting('qa.work')::uuid,'Unauthorized priority');
    raise exception 'Cross-user write incorrectly allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
select 'PASS: empty catalogs, CRUD, deadlines, inactivation/reactivation, history, apartment status and cross-user RLS; all fixtures rolled back' as result;
