# Validação do aplicativo

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

Migração executada: `pente_fino_pdf_integrity`, arquivo `supabase/migrations/20260915161027_pente_fino_pdf_integrity.sql`. Inclui metadados de PDF, bucket privado de relatórios, políticas por usuário, índices e proteções de integridade/status. Nenhuma migração adicional foi necessária nesta revisão.

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
