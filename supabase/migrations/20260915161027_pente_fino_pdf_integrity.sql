-- Inspected existing chk_* schema, policies and private photo bucket first.
-- Additive migration: no preloaded environments, services, items or apartments.
alter table public.chk_relatorios add column if not exists servico text;
alter table public.chk_relatorios add column if not exists pdf_path text;

insert into storage.buckets (id,name,public)
values ('checklist-relatorios','checklist-relatorios',false)
on conflict (id) do nothing;

create policy "chk_pdf_owner_select" on storage.objects for select to authenticated
using (bucket_id='checklist-relatorios' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "chk_pdf_owner_insert" on storage.objects for insert to authenticated
with check (bucket_id='checklist-relatorios' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "chk_pdf_owner_update" on storage.objects for update to authenticated
using (bucket_id='checklist-relatorios' and (storage.foldername(name))[1]=(select auth.uid())::text)
with check (bucket_id='checklist-relatorios' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "chk_pdf_owner_delete" on storage.objects for delete to authenticated
using (bucket_id='checklist-relatorios' and (storage.foldername(name))[1]=(select auth.uid())::text);

-- RLS does not apply to TRUNCATE. Remove unnecessary non-row privileges.
revoke all on public.chk_obras,public.chk_apartamentos,public.chk_ambientes,
  public.chk_servicos,public.chk_itens,public.chk_relatorios from anon;
revoke truncate,references,trigger on public.chk_obras,public.chk_apartamentos,
  public.chk_ambientes,public.chk_servicos,public.chk_itens,public.chk_relatorios from authenticated;
grant select,insert,update,delete on public.chk_obras,public.chk_apartamentos,
  public.chk_ambientes,public.chk_servicos,public.chk_itens,public.chk_relatorios to authenticated;

create index if not exists chk_apartamentos_owner_work_idx on public.chk_apartamentos(user_id,obra_id);
create index if not exists chk_ambientes_owner_work_idx on public.chk_ambientes(user_id,obra_id);
create index if not exists chk_servicos_owner_work_idx on public.chk_servicos(user_id,obra_id);
create index if not exists chk_itens_owner_work_idx on public.chk_itens(user_id,obra_id);
create index if not exists chk_itens_apartment_status_idx on public.chk_itens(apartamento_id,status);
create index if not exists chk_relatorios_owner_work_idx on public.chk_relatorios(user_id,obra_id);
create index if not exists chk_obras_owner_idx on public.chk_obras(user_id);

create function public.chk_validate_parent() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if not exists(select 1 from public.chk_obras o where o.id=new.obra_id and o.user_id=new.user_id) then
    raise exception 'A obra não pertence ao usuário autenticado.' using errcode='42501';
  end if;
  if tg_op='UPDATE' and (new.user_id<>old.user_id or new.obra_id<>old.obra_id or new.id<>old.id) then
    raise exception 'A propriedade do cadastro não pode ser alterada.' using errcode='42501';
  end if;
  if tg_table_name='chk_itens' then
    if tg_op='UPDATE' and new.apartamento_id<>old.apartamento_id then
      raise exception 'O apartamento do registro não pode ser alterado.' using errcode='23514';
    end if;
    perform 1 from public.chk_apartamentos a where a.id=new.apartamento_id and a.obra_id=new.obra_id and a.user_id=new.user_id for update;
    if not found then raise exception 'Apartamento indisponível nesta obra.' using errcode='42501'; end if;
    new.updated_at=now();
  end if;
  return new;
end $$;
create trigger chk_apartamentos_parent before insert or update on public.chk_apartamentos for each row execute function public.chk_validate_parent();
create trigger chk_ambientes_parent before insert or update on public.chk_ambientes for each row execute function public.chk_validate_parent();
create trigger chk_servicos_parent before insert or update on public.chk_servicos for each row execute function public.chk_validate_parent();
create trigger chk_itens_parent before insert or update on public.chk_itens for each row execute function public.chk_validate_parent();
create trigger chk_relatorios_parent before insert or update on public.chk_relatorios for each row execute function public.chk_validate_parent();

create function public.chk_sync_apartment_status() returns trigger
language plpgsql security invoker set search_path='' as $$
declare target_id uuid; target_status text;
begin
  if tg_op='DELETE' then target_id=old.apartamento_id; else target_id=new.apartamento_id; end if;
  select status into target_status from public.chk_apartamentos where id=target_id for update;
  if not found then return null; end if;
  if exists(select 1 from public.chk_itens where apartamento_id=target_id and status='pendente') then target_status='com_pendencias';
  elsif exists(select 1 from public.chk_itens where apartamento_id=target_id and status in ('correcao','em_correcao')) then target_status='em_correcao';
  elsif target_status not in ('conforme','finalizado') then
    target_status=case when exists(select 1 from public.chk_itens where apartamento_id=target_id) then 'em_vistoria' else 'nao_iniciado' end;
  end if;
  update public.chk_apartamentos set status=target_status where id=target_id;
  return null;
end $$;
create trigger chk_itens_sync_status after insert or update or delete on public.chk_itens for each row execute function public.chk_sync_apartment_status();

create function public.chk_validate_apartment_status() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.status in ('conforme','finalizado') and exists(
    select 1 from public.chk_itens where apartamento_id=new.id and status in ('pendente','correcao','em_correcao')
  ) then raise exception 'Corrija as pendências antes de classificar o apartamento como Conforme ou Finalizado.' using errcode='23514'; end if;
  return new;
end $$;
create trigger chk_apartamentos_validate_status before update of status on public.chk_apartamentos for each row execute function public.chk_validate_apartment_status();
revoke all on function public.chk_validate_parent(),public.chk_sync_apartment_status(),public.chk_validate_apartment_status() from public,anon,authenticated;
