# Validação do aplicativo

## Atualização 2026-09-24 — versão 1.3.0, convite por Supabase Auth

- Modelo de permissões aprovado pelo usuário antes deste complemento. Preservada a migração de equipe e os registros anteriores.
- Migração `pente_fino_convites_auth` aplicada no projeto conectado, versão remota `20260924095701`; Edge Function `convidar-colega` implantada, versão 1.
- 47/47 testes automatizados e build aprovados. Incluem callback de convite/recuperação, URL sem tokens após consumo, link expirado, proteção contra sessão anterior, senha inválida, remetente sem sessão, solicitante sem propriedade, falha do provedor, conta existente, cancelamento durante envio e origem não autorizada.
- Roteiros PostgreSQL locais aprovados, incluindo regressões de equipe e customização. `tests/invites.sql` também aprovado no Supabase real: preparação restrita ao proprietário, intervalo de reenvio, confirmação restrita ao servidor, falha sem ativação, tentativa obsoleta rejeitada, aceite idempotente e cancelamento durante envio. Fixtures totalmente revertidas.
- Contagens reais preservadas: 2 obras, 213 apartamentos, 3 itens, 1 relatório e 2 contas Auth. Nenhum convite ou membro real criado. Não foi disparado nenhum e-mail real.
- O endpoint implantado rejeita chamadas sem token ou com token inválido. A verificação de identidade fica no corpo da função (`getUser`), mesmo com a verificação de gateway desativada. Chave administrativa exclusivamente no ambiente do servidor.
- Security Advisor mantém somente os avisos preexistentes, com os links de correção documentados abaixo.
- Ainda pendentes: confirmação de URLs permitidas e configuração de e-mail no painel Auth, convite real a destinatário autorizado e teste em duas sessões/dispositivos. A conexão disponível não oferece ferramenta para inspecionar/editar essas configurações Auth. Não presumir que SMTP ou redirecionamentos já estejam corretos.
- Publicação autorizada explicitamente e concluída em 24/09/2026, commit `e0845c3912a6e2f587b3da58a2e8dadd5e4ea045`. CI `35998189788` e Pages `35998188704` aprovados. Navegador confirmou o novo bundle e a rejeição de callback sem token. Painel Supabase bloqueado por login, sem alterações de configuração Auth. Os testes físicos de iPhone listados abaixo continuam pendentes.


## Atualização 2026-09-23 — versão 1.2.0, equipes por obra

- Implementação sobre o código 1.1.0 revisado, preservando câmera nativa, rascunhos, cadastros manuais, prioridades históricas, prazos, progresso e PDFs.
- Migração de equipe gerada pela CLI Supabase em `20260923103621_pente_fino_equipes.sql` e aplicada no projeto conectado `arhjpncxmwunlnulpbhu`, registrada como `20260923105248_pente_fino_equipes`.
- Comparação por hash de todas as colunas anteriores: as sete tabelas preexistentes permaneceram idênticas. Contagens mantidas: 2 obras, 213 apartamentos, 5 ambientes, 1 serviço, 3 registros, 1 relatório e 0 prioridades.
- As três novas tabelas (`chk_membros_obra`, `chk_convites_obra`, `chk_atividades`) ficaram vazias. Permanecem 2 contas reais no Auth. Nenhuma conta, autorização ou registro de teste ficou gravado.
- `npm test`: 36/36 testes aprovados, incluindo lista de colegas sem filtro por autor, preservação de autoria, comparação de revisão, conflito de edição, resposta perdida, revisão ausente em rascunho antigo, permissões da interface, atualização ao retornar à janela, preservação de formulário aberto e recuperação de rascunho offline. Testes de interface usam DOM simulado; não substituem Safari/iOS.
- `npm run test:rls`: PostgreSQL local via PGlite, com esquema-base inspecionado e substitutos mínimos de Auth/Storage. Executa as regras reais de RLS, funções e triggers, a migração aditiva e os roteiros SQL de equipe e customização.
- `tests/teams.sql`: aprovado também no Supabase conectado, em uma única transação com rollback. Verifica proprietário, colega, pessoa externa e conta sem e-mail confirmado; normalização de e-mail; rejeição de claim de e-mail falsificado; aceite idempotente; compartilhamento nos dois sentidos; fotos/PDFs privados por obra; bloqueio de mudança de autoria; histórico; revisão; permissões de cadastro/exclusão; isolamento entre obras; revogação sem esperar expirar a sessão; rejeição anônima. As contas sintéticas existem somente durante a transação e não possuem login configurado.
- A proteção nativa de Storage bloqueou a tentativa de DELETE SQL no primeiro ensaio e a transação foi revertida. O teste aceita esse bloqueio adicional sem desativá-lo. A aplicação usa a API de Storage. O roteiro SQL verifica permissões/metadados, não upload e download reais por duas sessões Auth.
- Build aprovado, somente configuração publicável. Dez tabelas com RLS; `checklist-fotos` e `checklist-relatorios` privados. O Security Advisor não acrescentou avisos relativos à funcionalidade de equipe. Permanecem os avisos preexistentes de [execução anônima de rls_auto_enable](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [execução autenticada dessa função](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) e [proteção de senhas vazadas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- O frontend 1.2.0 está preparado localmente; a branch pública ainda está em `116f64e3eed6705d54d422a05cdd5f62fa1e06f3`. A rejeição anterior da revisão automática de autorização para publicar não foi contornada. O banco está preparado, mas a nova tela de equipe só aparece depois de publicar o pacote.

### Aceitação ainda necessária após publicação

1. Com duas contas reais, autorizar o e-mail do colega; entrar com a conta confirmada; selecionar a mesma obra; registrar e corrigir em ambos os sentidos.
2. Confirmar fotos e PDFs de outro autor usando download real, atualizar em outro aparelho e testar remoção do acesso. Não compartilhar senhas.
3. Validar o conjunto físico no iPhone: câmera no Safari e PWA, HEIC, interrupção de rede e rascunho, compartilhamento nativo de PDF, teclado e área segura. Esses testes não foram simulados como se fossem físicos.


## Atualização 2026-09-18 — versão 1.1.0

- Base: ZIP `CHECKLIST-atualizado.zip`; repositório remoto estava em `116f64e3eed6705d54d422a05cdd5f62fa1e06f3`.
- Migração `pente_fino_customizacao` aplicada em produção com sucesso e registrada como `20260918101515`.
- Comparação dos dados antes/depois: conteúdo das seis tabelas preexistentes preservado, descontadas somente as novas colunas `ativo`/`prazo`; 2 obras, 213 apartamentos, 5 ambientes, 1 serviço, 3 registros, 1 relatório. A tabela de prioridades foi criada vazia.
- Teste real `tests/customization.sql`: CRUD, ausência de seeds, prazos, inativação/reativação, preservação de histórico, bloqueio de falsa aprovação, proteção de propriedade e isolamento RLS nas sete tabelas e Storage. Transação totalmente revertida.
- Correções adicionais: editar registro com todos os cadastros inativos; filtrar relatórios por serviço inativo; preservar prioridades históricas; deixar prioridade opcional sem preenchimento forçado; proteger renomeação de prioridade em uso; mostrar progresso na tela do apartamento; distinguir ausência de registros de percentual de liberação.
- 26/26 testes automatizados aprovados. Build validado com chave publicável. Quatro PDFs gerados em testes com imagens e fontes incorporadas; páginas de resumo e antes/depois do PDF de finalização renderizadas e conferidas visualmente.
- Sete tabelas com RLS, dois buckets privados. O Security Advisor não apontou problemas nas novas tabelas/políticas; permanecem avisos globais preexistentes de `rls_auto_enable()` ([permissões da função](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)) e [proteção de senha vazada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), fora desta migração.
- O navegador remoto abriu a versão publicada, sem erro do aplicativo no console, mas a sessão exige autenticação. A navegação para o servidor local de teste foi bloqueada pela política do navegador (`ERR_BLOCKED_BY_CLIENT`); nenhum contorno foi tentado.
- Em 23/09/2026, a revisão automática de autorização bloqueou a criação da árvore Git no repositório público por considerar insuficiente a autorização de publicação. Nenhum commit remoto foi criado e a branch `main` permaneceu em `116f64e3eed6705d54d422a05cdd5f62fa1e06f3`. A revisão 1.1.0 está pronta localmente; deploy e testes autenticados desta versão permanecem pendentes de autorização explícita. A câmera física permanece pendente.

## Atualização 2026-09-17 — bug de câmera relatado no iPhone real

O usuário testou no Safari e no PWA (Adicionar à Tela de Início): tocar em "Tirar foto" não fazia nada em nenhum dos dois. Hipótese de incompatibilidade: o modal usava `<dialog>` nativo (`showModal()`). A causa exata não foi comprovada em WebKit físico. Corrigido substituindo o `<dialog>` por um modal em `<div>` posicionado (com backdrop, trap de foco e Esc). **Este é o primeiro teste físico real de câmera no iPhone; o resultado anterior "não emulado" neste documento foi substituído por este achado.** A correção ainda precisa ser reconfirmada no iPhone físico antes de ser considerada validada.

Também foram adicionadas customizações (prioridades cadastráveis, ativar/inativar ambientes-serviços-prioridades, prazo de conclusão por registro, barra de progresso). Migração aditiva correspondente: `20260917234213_pente_fino_customizacao.sql`, **aplicada em 18/09/2026** ao projeto Supabase, antes da publicação desta revisão, sob a versão remota `20260918101515`.


Site: https://cauacassarolli-hub.github.io/CHECKLIST/

Repositório: `cauacassarolli-hub/CHECKLIST`, branch publicada `main`.

## Evidências verificadas

- Reconstrução publicada no commit `b370c863d1d53dc4874e3e0d4a15ac89c2d60b67`. GitHub Actions: Pages `35032677701` e testes/build `35032681336` concluídos com sucesso.
- Login real por e-mail/senha realizado no site publicado. Recarregar manteve a sessão. A última tentativa de iniciar outra sessão no navegador Work foi recusada por credenciais inválidas; isso não indica perda dos dados nem falha no teste anterior.
- Pela interface: criação da obra técnica **VALIDAÇÃO QA — Pente Fino**, inicialmente sem ambientes, serviços ou registros. Cadastro manual de Sala QA e Pintura QA com atualização imediata dos selects.
- Criação de três apartamentos no pavimento QA 13º; 1303 classificado Conforme sem registros e persistido no banco. Abertura com um toque.
- Apartamento 1301: foto antes e foto depois persistidas, registro marcado Corrigido. Apartamento 1302: registro Pendente com foto antes. Foram utilizadas imagens sintéticas de teste, não fotografias da obra real.
- Seleção por inputs nativos e Galeria, preview, compressão de 2400 × 1800 para 1800 × 1350, upload real e leitura privada comprovados. A foto antes enviada ocupou 54.578 bytes. Captura física por câmera iOS não foi emulada.
- Geração real do relatório fotográfico do pavimento com dois apartamentos contendo fotos e um Conforme sem registros. Blob preparado no app, aproximadamente 163 KB.
- Salvar no app enviou PDF para Storage e criou metadados: relatório `baef3ca8-2ce7-4ea4-8245-dd9a105d6db6`, 167.352 bytes, MIME `application/pdf`. Buckets privados confirmados.
- A execução do aplicativo e os fluxos acima não apresentaram erros próprios no console. Mensagens de extensões do navegador foram distinguidas das mensagens do app.
- 19 testes automatizados: filtros/status, bloqueio de falsa liberação, serviço manual, rejeição de chaves secretas, quatro tipos de PDF com imagens incorporadas, fontes incorporadas, paginação, aborto quando a foto falha, ordem upload/gravação e falhas/retry/idempotência. Os testes de repositório usam um cliente simulado; os uploads reais acima foram verificados separadamente.
- Após identificar espaçamento inconsistente em um leitor de PDF, o gerador passou a incorporar fontes DejaVu regular e negrito. Os PDFs locais usam fotos sintéticas grandes de antes/depois; a página renderizada foi inspecionada visualmente, com acentos, texto e imagens legíveis. O novo gerador ainda precisa de verificação autenticada no site após publicação.
- Os filtros de relatório agora permanecem selecionados ao gerar e salvar o PDF.

## Supabase e preservação

Migração executada: `pente_fino_pdf_integrity`, arquivo `supabase/migrations/20260915161027_pente_fino_pdf_integrity.sql`. Inclui metadados de PDF, bucket privado de relatórios, políticas por usuário, índices e proteções de integridade/status. A migração adicional de customização está documentada na atualização de 18/09/2026 abaixo.

Contagens originais preservadas durante a migração: 1 obra, 210 apartamentos, 4 ambientes, 0 serviços, 1 item, 0 relatórios. A obra QA e seus dados foram criados manualmente depois, exclusivamente para validação, e permanecem identificados para os testes restantes.

Teste SQL sob papel `authenticated` e claims de usuário, em transação revertida: CRUD, obra sem seed, Conforme sem registros, sincronização de pendências, bloqueio de Conforme com pendência, metadados de relatório e isolamento de outro usuário. Este teste não substitui Auth real; o login real está documentado acima. As seis tabelas usam RLS e ambos os buckets são privados. O frontend contém apenas URL e chave publicável.

## Pendências de aceitação — não declarar concluído

| Testes do roteiro | Situação |
| --- | --- |
| 1–9: login, cadastros manuais, apartamento Conforme e persistência | Validados no navegador e/ou conferidos no banco real. |
| 10, 12–14, 16: abrir registro, preview, salvar, reabrir, foto depois | Validados no navegador com arquivos sintéticos; captura real ainda exige iPhone. |
| 11 e 15: câmera/fototeca iOS | Inputs corretos inspecionados e seletor automatizado usado. Interface nativa física ainda pendente. |
| 17: rede ruim | Falhas/retry/idempotência cobertos por testes simulados. Interrupção real de rede e recuperação do rascunho ainda pendentes. |
| 18–19: relatório do pavimento com fotos | Geração e gravação reais comprovadas; quatro PDFs locais com imagens/fontes incorporadas e inspeção visual de página. Leitura do PDF gerado ao vivo limitada pelo navegador Work. |
| 20–22: serviço, pendências e finalização | Gerador e filtros aprovados em testes locais. Execução pela interface com dados reais ainda pendente. |
| 23: salvar no Storage e tabela | Aprovado com PDF real. |
| 24: abrir salvo após refresh/outro dispositivo | Ainda pendente. A linha e o objeto persistem no Supabase. |
| 25–27: compartilhar arquivo, Safari e PWA iPhone | Ainda exigem dispositivo físico. |
| 28: safe area | CSS inspecionado. Página auxiliar `tests/mobile.html` permite conferir largura de 390 px; não emula Safari nem safe area física. |
| 29–31: encoding, SVG e atualização imediata | Conferidos nos fluxos já executados. |
| 32–34: chaves, RLS e buckets | Verificados no código, SQL e configuração remota. |

Também falta validar a exclusão de um relatório QA pelo fluxo do app. A última sessão de login foi recusada; uma nova sessão válida é necessária para terminar os testes autenticados.

O navegador Work bloqueou a navegação para o PDF em URL `blob:`. Nenhuma tentativa de contornar essa restrição foi feita. O PDF local de teste foi gerado e renderizado de forma independente; não é o arquivo baixado do app. O bloqueio impede certificar a abertura/compartilhamento do PDF ao vivo neste ambiente.

## Testes físicos finais no iPhone

1. Safari e PWA: câmera traseira e Galeria, preview orientado corretamente, salvar/reabrir antes e depois (incluir foto HEIC da fototeca).
2. Interromper rede no upload, verificar erro e rascunho, retomar e salvar sem duplicação/perda.
3. Abrir PDF salvo, conferir fotos/acentos e compartilhar com o PDF anexado; repetir abertura em outro aparelho com o mesmo usuário.
4. Conferir safe area, teclado, rolagem e botões no Safari e em Adicionar à Tela de Início.
