-- Correção de concessões herdadas: acesso somente de usuários autenticados.
-- As políticas RLS continuam exigindo (auth.uid() = user_id) e acesso à obra.
-- Nenhum dado é alterado por esta migração.
revoke all privileges on table public.chk_preferencias_notificacao from public, anon, authenticated;
grant select, insert, update, delete on table public.chk_preferencias_notificacao to authenticated;
