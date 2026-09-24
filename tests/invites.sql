begin;
select set_config('qa.owner',gen_random_uuid()::text,true),set_config('qa.member',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at) select current_setting('qa.'||kind)::uuid,'qa-'||current_setting('qa.'||kind)||'@example.invalid',now() from unnest(array['owner','member']) kind;
select set_config('request.jwt.claim.sub',current_setting('qa.owner'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare w uuid; invitation jsonb; begin
 insert into chk_obras(user_id,nome) values(auth.uid(),'QA invites rollback') returning id into w;
 perform set_config('qa.work',w::text,true);
 invitation=public.chk_preparar_convite(w,'qa-'||current_setting('qa.member')||'@example.invalid','Colega');
 perform set_config('qa.invite',invitation->>'id',true);perform set_config('qa.attempt',invitation->>'envio_id',true);
 begin
  perform public.chk_preparar_convite(w,'qa-'||current_setting('qa.member')||'@example.invalid','Colega');
  raise exception 'Resend cooldown bypassed';
 exception when check_violation then null;end;
 begin
  perform public.chk_finalizar_convite((invitation->>'id')::uuid,(invitation->>'envio_id')::uuid,'enviado');
  raise exception 'Owner forged delivery';
 exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.member'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.member'),'role','authenticated')::text,true);
do $$ begin
 if public.chk_aceitar_convites()<>0 then raise exception 'In-flight delivery accepted';end if;
 begin
  perform public.chk_preparar_convite(current_setting('qa.work')::uuid,'other@example.invalid','Other');
  raise exception 'Outsider sent invitation';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role service_role;
do $$ begin
 if public.chk_finalizar_convite(current_setting('qa.invite')::uuid,gen_random_uuid(),'enviado') then raise exception 'Wrong attempt accepted';end if;
 if not public.chk_finalizar_convite(current_setting('qa.invite')::uuid,current_setting('qa.attempt')::uuid,'falhou') then raise exception 'Failure not recorded';end if;
end $$;
reset role;
set local role authenticated;
do $$ begin if public.chk_aceitar_convites()<>0 then raise exception 'Failed delivery activated membership';end if;end $$;
reset role;
-- Advance only the disposable fixture's retry timestamp; no clock/policy bypass in the app.
update public.chk_convites_obra set ultima_tentativa=now()-interval '2 minutes' where id=current_setting('qa.invite')::uuid;
select set_config('request.jwt.claim.sub',current_setting('qa.owner'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.owner'),'role','authenticated')::text,true);
set local role authenticated;
select set_config('qa.attempt',(public.chk_preparar_convite(current_setting('qa.work')::uuid,'qa-'||current_setting('qa.member')||'@example.invalid','Colega'))->>'envio_id',true);
reset role;
set local role service_role;
select public.chk_finalizar_convite(current_setting('qa.invite')::uuid,current_setting('qa.attempt')::uuid,'conta_existente');
reset role;
select set_config('request.jwt.claim.sub',current_setting('qa.member'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.member'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if public.chk_aceitar_convites()<>1 or public.chk_aceitar_convites()<>0 then raise exception 'Verified existing account acceptance failed';end if;
 if not exists(select 1 from chk_obras where id=current_setting('qa.work')::uuid) then raise exception 'Authorized work unavailable';end if;
end $$;
reset role;
update public.chk_convites_obra set ultima_tentativa=now()-interval '2 minutes' where id=current_setting('qa.invite')::uuid;
select set_config('request.jwt.claim.sub',current_setting('qa.owner'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.owner'),'role','authenticated')::text,true);
set local role authenticated;
select set_config('qa.attempt',(public.chk_preparar_convite(current_setting('qa.work')::uuid,'qa-'||current_setting('qa.member')||'@example.invalid','Colega'))->>'envio_id',true);
select public.chk_revogar_membro(current_setting('qa.work')::uuid,(select id from public.chk_membros_obra where obra_id=current_setting('qa.work')::uuid and user_id=current_setting('qa.member')::uuid));
reset role;
set local role service_role;
do $$ begin
 if public.chk_finalizar_convite(current_setting('qa.invite')::uuid,current_setting('qa.attempt')::uuid,'enviado') then raise exception 'Canceled authorization reactivated';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('qa.member'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.member'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if public.chk_aceitar_convites()<>0 or exists(select 1 from chk_obras where id=current_setting('qa.work')::uuid) then raise exception 'Canceled invite allowed access';end if;
end $$;
rollback;
select 'PASS: owner authorization, resend cooldown, server-only delivery confirmation, failure isolation, stale attempts, verified existing-account acceptance, cancellation during send; all fixtures rolled back' as result;
