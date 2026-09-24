# Pente Fino de Apartamentos

Aplicativo privado com Supabase Auth, PostgreSQL e buckets privados. Cadastros de ambientes, serviços e registros exclusivamente manuais. Interface em português com inputs nativos de câmera/galeria, compressão JPEG, rascunhos locais, PDFs com imagens incorporadas e compartilhamento por arquivo.

## Desenvolvimento

Node 22 ou superior. Execute `npm ci`, `npm test`, `npm run test:rls`, `npm run build` e `npm run serve`. A pasta `dist` contém o site estático, com caminhos relativos para GitHub Pages em subdiretórios. `public/config.json` contém somente URL e chave publicável; nunca inserir chaves secretas. O workflow valida testes e build. A saída de `dist` também é versionada na raiz para manter a publicação GitHub Pages existente pela branch main. Ao atualizar, copiar o build para a raiz antes do commit.

## Banco

A migração `supabase/migrations/20260915161027_pente_fino_pdf_integrity.sql` já foi aplicada ao projeto conectado. Não reaplicar cegamente. Mantém os dados existentes, adiciona metadados de PDF, bucket privado de relatórios, políticas por usuário e proteções de integridade/status.

A migração `supabase/migrations/20260917234213_pente_fino_customizacao.sql` **foi aplicada em 18/09/2026** ao projeto conectado, registrada como `20260918101515_pente_fino_customizacao`. Não reaplicar: conferir o histórico remoto antes de executar migrações. É aditiva: adiciona `prazo` (date) em `chk_itens`, `ativo` em `chk_ambientes` e a nova tabela `chk_prioridades` com RLS própria; não altera nem apaga dados existentes.

## Correção de câmera e customização (2026-09-17)

Após o relato de que o seletor não abria no iPhone, o modal de registro foi reescrito em `<div>` com backdrop, foco controlado e tecla Esc, mantendo o toque diretamente nos inputs nativos. A interação com `<dialog>` era uma hipótese de incompatibilidade; a causa e a resolução só podem ser confirmadas no aparelho físico. Não há dependência de `getUserMedia()`.

Customizações adicionadas: catálogo de **prioridades** (cadastro manual, em Ajustes, como ambientes/serviços), **ativar/inativar** ambientes/serviços/prioridades sem perder o histórico dos registros já lançados, **prazo de conclusão** opcional por registro (com aviso de atraso no card, no PDF e nos relatórios) e **barra de progresso** das correções por obra e por apartamento.

## Revisão 1.1.0 — 18/09/2026

Registros antigos continuam editáveis quando seus ambientes, serviços ou prioridades são inativados. Serviços inativos permanecem nos filtros de pendências e relatórios. Prioridade pode ficar em branco; valores históricos são preservados. O progresso também aparece na tela do apartamento. A versão instalada aparece em Ajustes.

Validação local: 26 testes automatizados e build aprovados; teste SQL transacional em `tests/customization.sql`, com rollback, aprovado no projeto real. Buckets continuam privados e todas as sete tabelas usam RLS.

## Equipes por obra — versão 1.2.0

Cada pessoa continua usando uma conta individual. O proprietário autoriza o nome e o e-mail do colega em **Ajustes → Equipe da obra → Convidar colega**. Quando essa pessoa entra com uma conta de e-mail confirmado, a obra aparece na lista e ela passa a ver os mesmos apartamentos, registros, fotos e PDFs. Não criar uma segunda obra para representar a mesma equipe.

Na versão 1.3.0, a função de servidor `convidar-colega` envia o convite pelo Supabase Auth. O colega define a própria senha em `auth.html`; o proprietário nunca a recebe. Quem já tem conta mantém sua senha: a interface informa que a autorização foi registrada, sem afirmar que um novo convite de criação foi enviado. “Esqueci minha senha” permite solicitar recuperação pelo próprio Auth. Pessoas já cadastradas podem sair e entrar novamente, ou abrir “Trocar obra”, para ativar a nova autorização. O envio real depende da configuração de Auth/e-mail descrita em `docs/ENTREGA-1.3.0.md`.

| Ação | Proprietário | Colega autorizado |
| --- | --- | --- |
| Ver checklists, fotos, PDFs e atividades da obra | Sim | Sim |
| Criar registros, atualizar correções e classificar apartamentos | Sim | Sim |
| Gerar e salvar PDF | Sim | Sim |
| Excluir registro/PDF | Qualquer autor da obra | Somente os próprios |
| Gerenciar equipe, cadastro da obra, apartamentos e catálogos | Sim | Não |

A autoria original (`user_id`) permanece imutável. O banco registra o nome do criador, a pessoa da última atualização e o histórico das alterações feitas após a migração. Os registros antigos recebem o nome da conta que já constava como autora; não é inventada uma autoria para alterações anteriores. As fotos e os PDFs antigos mantêm seus caminhos.

A lista sincroniza a cada 20 segundos enquanto o aplicativo está visível e online, e ao retornar à janela, sem substituir um formulário em edição. Também é possível tocar no botão de sincronização. A edição de um registro usa sua revisão: se um colega tiver salvado uma alteração, o aplicativo preserva o rascunho local e pede para recarregar, sem sobrescrever silenciosamente. A recuperação de rascunhos locais continua disponível sem conexão; salvar requer rede.

Remover acesso não apaga os registros da pessoa. O banco e o Storage recusam novas consultas imediatamente após a revogação. Fotos já abertas, arquivos já baixados e URLs assinadas ainda válidas não podem ser recolhidos; novas URLs de fotos expiram em 60 segundos.

A migração `supabase/migrations/20260923103621_pente_fino_equipes.sql` **já foi aplicada em 23/09/2026** ao projeto conectado, registrada como `20260923105248_pente_fino_equipes`. Não reaplicar. Cria membros, autorizações de e-mail e atividades, adiciona autoria/revisão e substitui o isolamento exclusivamente por autor pelo acesso explícito por obra. As dez tabelas mantêm RLS, os dois buckets permanecem privados e nenhum colega foi autorizado automaticamente.

## Uso

1. Entrar com e-mail e senha.
2. Selecionar ou criar a obra.
3. Cadastrar apartamentos por pavimento.
4. Cadastrar ambientes e serviços em Ajustes.
5. Abrir apartamento e classificar Conforme ou criar registro fotográfico.
6. Escolher ambiente/serviço, tirar foto ou usar Galeria, conferir preview e salvar.
7. Reabrir registro, adicionar foto depois e atualizar status.
8. Em Relatórios, gerar, visualizar, salvar e compartilhar PDF.

## Estado da entrega

A versão anterior está publicada em https://cauacassarolli-hub.github.io/CHECKLIST/ pela branch `main` de `cauacassarolli-hub/CHECKLIST`. A versão 1.3.0 inclui a revisão 1.1.0, o compartilhamento por equipe da 1.2.0 e o convite por Supabase Auth. O frontend ainda não foi publicado: o envio anterior foi bloqueado pela revisão automática de autorização em 23/09/2026, aguardando autorização explícita para o repositório público. Consulte `docs/VALIDACAO.md` para evidências e testes pendentes; a validação física em iPhone ainda é necessária. Os PDFs incorporam imagens e fontes DejaVu (licença em `public/fonts/LICENSE.txt`).

## Convites Auth — versão 1.3.0

Migração `20260924094954_pente_fino_convites_auth.sql` aplicada ao projeto conectado em 24/09/2026, com versão remota `20260924095701`. Não reaplicar. Acrescenta somente estados e tentativas de envio às autorizações e funções para preparar/finalizar o envio. Não altera dados de vistoria.

A Edge Function `convidar-colega` está implantada. O gateway usa `verify_jwt=false` porque a própria função valida **todas** as requisições de envio com `auth.getUser(token)`; não aceita chamadas anônimas. A autorização da obra e o intervalo de reenvio são conferidos no banco com o JWT do solicitante. Somente a credencial interna do servidor pode confirmar o resultado de entrega. Chaves administrativas são lidas das variáveis de ambiente da Edge Function e nunca integram o build do site.

O callback aceita o link padrão de convite do Auth e recuperação de senha, remove tokens da URL, valida a sessão e mostra o e-mail de quem está definindo a senha. O service worker não armazena `auth.html` nem URLs com parâmetros. A tela de senha é retomada por uma marca de sessão vinculada ao ID do próprio usuário; a senha não é salva em rascunhos ou logs. Links inválidos não utilizam uma sessão antiga para abrir a tela de senha.

Os testes SQL históricos de equipe são executados antes da migração de convites no roteiro local; `tests/invites.sql` é o roteiro da versão atual para o Supabase conectado. Todos usam rollback. O teste de envio da função é simulado; nenhum e-mail real foi enviado nesta entrega.
