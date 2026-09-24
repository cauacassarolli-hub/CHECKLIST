# Entrega 1.3.0 — equipes e convite individual

O pacote contém o código completo e o build na raiz, para revisão e aplicação sobre o repositório CHECKLIST. Inclui as melhorias 1.1.0 e 1.2.0 que ainda não chegaram à branch pública. As migrações e a função abaixo já foram aplicadas no Supabase conectado; não executá-las novamente nesse projeto.

## Estado do servidor

- Projeto: `arhjpncxmwunlnulpbhu`.
- Equipes: `20260923105248_pente_fino_equipes` no histórico remoto.
- Convites: `20260924095701_pente_fino_convites_auth` no histórico remoto.
- Função `convidar-colega`: implantada, com validação própria de JWT e propriedade da obra.
- Nenhum colega foi convidado ou autorizado automaticamente. Os dados existentes foram mantidos.

## Antes do primeiro convite real

1. Publicar o conteúdo revisado na branch usada pelo GitHub Pages. Confirmar que `https://cauacassarolli-hub.github.io/CHECKLIST/auth.html` abre a aplicação (sem token, é esperado informar link inválido).
2. Em Supabase → Authentication → URL Configuration, confirmar o Site URL `https://cauacassarolli-hub.github.io/CHECKLIST/` e incluir exatamente `https://cauacassarolli-hub.github.io/CHECKLIST/auth.html` em Redirect URLs. Preservar outros endereços legítimos já utilizados.
3. Em Authentication → e-mail/SMTP, verificar um provedor de envio apropriado aos destinatários. Nenhuma credencial SMTP foi fornecida nem alterada nesta entrega. Conferir que o template de convite mantém o link de confirmação do Supabase e o retorno solicitado, sem redirecionar para outro site.
4. Usar um destinatário autorizado para validar recebimento, link, definição de senha e entrada na mesma obra com conta própria. Se o convite expirar, usar Reenviar; se a conta já estiver confirmada, entrar com a senha atual ou usar Esqueci minha senha.
5. Confirmar compartilhamento nos dois sentidos, incluindo fotos e PDFs reais. Remover o acesso e verificar que a pessoa perde novas consultas sem apagar seu histórico.

As configurações de URL e e-mail ainda precisam ser conferidas. A integração disponível não expõe essas configurações. Não iniciar convites reais antes de confirmar os itens 1–3.

## Uso

O proprietário abre a obra → Ajustes → Equipe da obra → informa nome e e-mail → Convidar colega. O painel mostra envio em andamento, enviado, falha ou conta existente. Reenviar tem intervalo mínimo de um minuto. Cancelar revoga a autorização daquela obra; não apaga o cadastro Auth ou dados de vistoria.

O convite cria o acesso individual via Auth, e o próprio destinatário define a senha. Contas existentes mantêm a senha atual. O proprietário administra somente a autorização da obra. Não receber nem compartilhar senhas por chat.

Todos os participantes ativos consultam os registros e arquivos da obra. Podem criar registros, corrigir registros de colegas, classificar apartamentos e gerar PDFs. Colegas excluem somente os próprios registros/relatórios. O proprietário gerencia equipe, cadastros e exclusões da obra.

## Validação

- `npm ci`
- `npm test` — 47 testes aprovados.
- `npm run test:rls` — banco PostgreSQL local, migrações e roteiros com rollback.
- `npm run build` — build completo com chave publicável.
- `tests/invites.sql` — também aprovado no Supabase conectado, sem persistir fixtures.

O teste real de envio de e-mail, a publicação e os testes físicos de iPhone não foram concluídos. Não confundir testes simulados de provedor/DOM com uma sessão real no Safari.

## Publicação pendente

O envio anterior ao repositório público foi rejeitado pela revisão automática de autorização. Nenhuma tentativa de contornar o bloqueio foi feita. É necessária autorização explícita para publicar o código em `cauacassarolli-hub/CHECKLIST`. O pacote pode ser repassado para revisão manual.
