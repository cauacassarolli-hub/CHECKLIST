-- Run after pente_fino_equipes. Every fixture, including Auth and Storage rows,
-- exists only in this transaction and is rolled back. No invitation is emailed.
begin;
select set_config('qa.owner',gen_random_uuid()::text,true),set_config('qa.member',gen_random_uuid()::text,true),
  set_config('qa.outsider',gen_random_uuid()::text,true),set_config('qa.unverified',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select current_setting('qa.'||kind)::uuid,'qa-'||current_setting('qa.'||kind)||'@example.invalid',
  case when kind='unverified' then null else now() end,jsonb_build_object('full_name','QA '||kind)
from unnest(array['owner','member','outsider','unverified']) kind;
select set_config('request.jwt.claim.sub',current_setting('qa.owner'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare w uuid; a uuid; i uuid; invitation uuid;
begin
  insert into public.chk_obras(user_id,nome) values(auth.uid(),'QA equipe transacional') returning id into w;
  perform set_config('qa.work',w::text,true);
  if exists(select 1 from public.chk_itens where obra_id=w) or exists(select 1 from public.chk_servicos where obra_id=w)
    or exists(select 1 from public.chk_ambientes where obra_id=w) then raise exception 'Unexpected seed'; end if;
  insert into public.chk_apartamentos(user_id,obra_id,pavimento,apartamento) values(auth.uid(),w,'QA','1') returning id into a;
  perform set_config('qa.apt',a::text,true);
  insert into public.chk_servicos(user_id,obra_id,nome) values(auth.uid(),w,'Pintura QA');
  insert into public.chk_ambientes(user_id,obra_id,nome) values(auth.uid(),w,'Sala QA');
  insert into public.chk_itens(user_id,obra_id,apartamento_id,ambiente,servico,status,criado_por_nome,atualizado_por_nome,versao)
    values(auth.uid(),w,a,'Sala QA','Pintura QA','pendente','Forged author','Forged actor',999) returning id into i;
  perform set_config('qa.item',i::text,true);
  if not exists(select 1 from public.chk_itens where id=i and versao=1 and criado_por_nome='QA owner' and atualizado_por_nome='QA owner') then
    raise exception 'Client-supplied authorship was not overridden'; end if;
  insert into storage.objects(bucket_id,name) values('checklist-fotos',auth.uid()::text||'/'||w::text||'/'||a::text||'/'||i::text||'/antes.jpg');
  update public.chk_itens set foto_antes_path=auth.uid()::text||'/'||w::text||'/'||a::text||'/'||i::text||'/antes.jpg' where id=i;
  insert into storage.objects(bucket_id,name) values('checklist-relatorios',auth.uid()::text||'/'||w::text||'/qa.pdf');
  insert into public.chk_relatorios(user_id,obra_id,tipo,titulo,conteudo,pdf_path)
    values(auth.uid(),w,'pavimento','PDF da equipe','{}',auth.uid()::text||'/'||w::text||'/qa.pdf');
  invitation=public.chk_autorizar_membro(w,' QA-'||current_setting('qa.member')||'@EXAMPLE.INVALID ','Colega QA');
  perform public.chk_autorizar_membro(w,'qa-'||current_setting('qa.unverified')||'@example.invalid','Não confirmado');
  if not exists(select 1 from public.chk_convites_obra where id=invitation and email='qa-'||current_setting('qa.member')||'@example.invalid') then
    raise exception 'Email normalization failed'; end if;
  begin
    update public.chk_obras set user_id=current_setting('qa.member')::uuid where id=w;
    raise exception 'Owner reassignment permitted';
  exception when insufficient_privilege then null; end;
end $$;

-- Matching an email claim or editable name is insufficient; Auth must confirm it.
select set_config('request.jwt.claim.sub',current_setting('qa.unverified'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.unverified'),'role','authenticated','email','qa-'||current_setting('qa.member')||'@example.invalid')::text,true);
do $$ begin
  if public.chk_aceitar_convites()<>0 then raise exception 'Unverified account accepted'; end if;
  if exists(select 1 from public.chk_obras where id=current_setting('qa.work')::uuid) then raise exception 'Unverified access'; end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.outsider'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.outsider'),'role','authenticated','email','qa-'||current_setting('qa.member')||'@example.invalid')::text,true);
do $$
declare t text; n bigint; w uuid;
begin
  if public.chk_aceitar_convites()<>0 then raise exception 'Forged email claim accepted'; end if;
  foreach t in array array['obras','apartamentos','ambientes','servicos','prioridades','itens','relatorios','membros_obra','convites_obra','atividades'] loop
    execute format('select count(*) from public.%I where %I=$1','chk_'||t,case when t='obras' then 'id' else 'obra_id' end) into n using current_setting('qa.work')::uuid;
    if n<>0 then raise exception 'Outsider read allowed in %',t; end if;
  end loop;
  if exists(select 1 from storage.objects where name like '%/'||current_setting('qa.work')||'/%') then raise exception 'Outsider storage read'; end if;
  begin
    perform public.chk_autorizar_membro(current_setting('qa.work')::uuid,'hacker@example.invalid','Hacker');
    raise exception 'Outsider authorized membership';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.chk_itens(user_id,obra_id,apartamento_id,ambiente,servico,status)
      values(auth.uid(),current_setting('qa.work')::uuid,current_setting('qa.apt')::uuid,'Sala QA','Pintura QA','pendente');
    raise exception 'Outsider insert allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects(bucket_id,name) values('checklist-fotos',auth.uid()::text||'/'||current_setting('qa.work')||'/outside.jpg');
    raise exception 'Outsider storage insert';
  exception when insufficient_privilege then null; end;
  insert into public.chk_obras(user_id,nome) values(auth.uid(),'Outra obra privada QA') returning id into w;
  perform set_config('qa.other_work',w::text,true);
end $$;

select set_config('request.jwt.claim.sub',current_setting('qa.member'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.member'),'role','authenticated')::text,true);
do $$
declare w uuid=current_setting('qa.work')::uuid; a uuid=current_setting('qa.apt')::uuid; i uuid=current_setting('qa.item')::uuid; revision integer; n integer; own_item uuid;
begin
  if exists(select 1 from public.chk_obras where id=w) then raise exception 'Member had access before acceptance'; end if;
  if public.chk_aceitar_convites()<>1 or public.chk_aceitar_convites()<>0 then raise exception 'Invitation not idempotent'; end if;
  if not exists(select 1 from public.chk_obras where id=w) or not exists(select 1 from public.chk_itens where id=i) or not exists(select 1 from public.chk_relatorios where obra_id=w) then
    raise exception 'Member cannot read shared data'; end if;
  if (select count(*) from storage.objects where name like '%/'||w::text||'/%')<>2 then raise exception 'Shared photo/PDF invisible'; end if;
  if exists(select 1 from public.chk_obras where id=current_setting('qa.other_work')::uuid) then raise exception 'Cross-work leak'; end if;
  if exists(select 1 from public.chk_convites_obra where obra_id=w) then raise exception 'Member can read invitation emails'; end if;
  select versao into revision from public.chk_itens where id=i;
  update public.chk_itens set status='corrigido',criado_por_nome='Forged author',atualizado_por=current_setting('qa.owner')::uuid,atualizado_por_nome='Forged editor' where id=i and versao=revision;
  if not exists(select 1 from public.chk_itens where id=i and user_id=current_setting('qa.owner')::uuid and atualizado_por=auth.uid() and criado_por_nome='QA owner' and atualizado_por_nome='Colega QA' and versao=revision+1) then
    raise exception 'Collaborative edit lost authorship/version'; end if;
  update public.chk_itens set observacao='stale update' where id=i and versao=revision;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'Stale update permitted'; end if;
  update public.chk_apartamentos set status='conforme' where id=a;
  if not exists(select 1 from public.chk_atividades where obra_id=w and autor_id=auth.uid() and entidade='chk_itens' and acao='UPDATE' and detalhes->>'status'='corrigido') then
    raise exception 'Audit missing'; end if;
  begin
    update public.chk_itens set user_id=auth.uid() where id=i;
    raise exception 'Author reassignment allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.chk_apartamentos set apartamento='renamed' where id=a;
    raise exception 'Member renamed apartment';
  exception when insufficient_privilege then null; end;
  update public.chk_servicos set nome='renamed' where obra_id=w;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'Member edited catalog'; end if;
  delete from public.chk_itens where id=i;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'Member deleted another author record'; end if;
  begin
    delete from storage.objects where name like current_setting('qa.owner')||'/'||w::text||'/%';
    get diagnostics n=row_count;
    if n<>0 then raise exception 'Member deleted another author file'; end if;
  -- Hosted Storage also blocks direct SQL deletion before RLS; do not disable it.
  exception when insufficient_privilege then null; end;
  begin
    insert into public.chk_membros_obra(obra_id,user_id,nome) values(w,current_setting('qa.outsider')::uuid,'Hacker');
    raise exception 'Direct member creation allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.chk_atividades(obra_id,entidade,registro_id,acao,autor_nome) values(w,'chk_itens',i,'UPDATE','Forged');
    raise exception 'Forged audit permitted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.chk_revogar_membro(w,(select id from public.chk_membros_obra where obra_id=w and user_id=auth.uid()));
    raise exception 'Member managed access';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects(bucket_id,name) values('checklist-fotos',auth.uid()::text||'/not-a-uuid/x.jpg');
    raise exception 'Malformed path accepted';
  exception when insufficient_privilege then null; end;
  begin
    update public.chk_itens set foto_depois_path=auth.uid()::text||'/'||current_setting('qa.other_work')||'/'||a::text||'/'||i::text||'/depois.jpg' where id=i;
    raise exception 'Cross-work photo reference accepted';
  exception when check_violation then null; end;
  insert into public.chk_itens(user_id,obra_id,apartamento_id,ambiente,servico,status)
    values(auth.uid(),w,a,'Sala QA','Pintura QA','pendente') returning id into own_item;
  perform set_config('qa.member_item',own_item::text,true);
  insert into storage.objects(bucket_id,name) values('checklist-fotos',auth.uid()::text||'/'||w::text||'/'||a::text||'/'||own_item::text||'/antes.jpg');
  update public.chk_itens set foto_antes_path=auth.uid()::text||'/'||w::text||'/'||a::text||'/'||own_item::text||'/antes.jpg' where id=own_item;
  begin
    update public.chk_apartamentos set status='conforme' where id=a;
    raise exception 'Apartment with member pending record approved';
  exception when check_violation then null; end;
end $$;

select set_config('request.jwt.claim.sub',current_setting('qa.owner'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.owner'),'role','authenticated')::text,true);
do $$
declare w uuid=current_setting('qa.work')::uuid;
begin
  if not exists(select 1 from public.chk_itens where id=current_setting('qa.member_item')::uuid and criado_por_nome='Colega QA') then raise exception 'Owner cannot read colleague record'; end if;
  if not exists(select 1 from storage.objects where name like current_setting('qa.member')||'/'||w::text||'/%') then raise exception 'Owner cannot read colleague photo'; end if;
  -- Pending reauthorization must also be canceled when membership is revoked.
  perform public.chk_autorizar_membro(w,'qa-'||current_setting('qa.member')||'@example.invalid','Colega QA');
  perform public.chk_revogar_membro(w,(select id from public.chk_membros_obra where obra_id=w and user_id=current_setting('qa.member')::uuid));
  if not exists(select 1 from public.chk_itens where id=current_setting('qa.member_item')::uuid) then raise exception 'Revocation erased history'; end if;
end $$;
-- Reuse the same session identity: revocation must not depend on JWT expiration.
select set_config('request.jwt.claim.sub',current_setting('qa.member'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.member'),'role','authenticated')::text,true);
do $$ begin
  if public.chk_aceitar_convites()<>0 then raise exception 'Revoked access restored by stale invitation'; end if;
  if exists(select 1 from public.chk_obras where id=current_setting('qa.work')::uuid)
    or exists(select 1 from public.chk_itens where obra_id=current_setting('qa.work')::uuid)
    or exists(select 1 from storage.objects where name like '%/'||current_setting('qa.work')||'/%') then raise exception 'Revoked user retained database/storage access'; end if;
  begin
    insert into public.chk_itens(user_id,obra_id,apartamento_id,ambiente,servico,status)
      values(auth.uid(),current_setting('qa.work')::uuid,current_setting('qa.apt')::uuid,'Sala','Pintura','pendente');
    raise exception 'Revoked member inserted item';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform public.chk_aceitar_convites();
    raise exception 'Anonymous RPC allowed';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'PASS: invitations, verified identity, shared rows/files, immutable authorship, revision conflict, audit, owner permissions, unrelated work isolation, revocation and anonymous denial; all fixtures rolled back' as result;
