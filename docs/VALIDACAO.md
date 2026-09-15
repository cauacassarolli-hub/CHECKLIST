# Validação — 15/09/2026

## Executado

- Build de produção concluído com configuração pública do Supabase.
- 19 testes Node aprovados: filtros/status, ausência de falsa liberação de pavimento, seleção manual de serviço, rejeição de chaves secretas, quatro tipos de PDF com streams de imagem incorporados, paginação, aborto de PDF quando imagem falha, upload antes da gravação, falhas/retry/idempotência.
- Testes do repositório utilizam cliente simulado, não comprovam upload real.
- PDFs de teste usam imagem mínima sintética: validam estrutura/incorporação, não legibilidade visual de fotos reais.
- Migração remota `pente_fino_pdf_integrity` aplicada. Contagens preservadas: 1 obra, 210 apartamentos, 4 ambientes, 0 serviços, 1 item, 0 relatórios.
- Teste SQL real sob papel authenticated e claims de usuário, em transação revertida: CRUD, cadastros vazios sem seed, Conforme sem registros, sincronização de pendências, bloqueio de Conforme com pendência, metadados de relatório e isolamento de outro usuário.
- Buckets checklist-fotos e checklist-relatorios privados; RLS e restrição de grants verificadas.

## Ainda pendente — não declarar concluído

- Identificar repositório correto, integrar preservando conteúdo, commit e deploy Pages.
- Abrir site publicado, conferir console e CRUD visual.
- Login real por e-mail/senha e persistência da sessão (teste SQL não equivale a login).
- Upload/download real de antes/depois e PDF no Storage e abertura após refresh/outro dispositivo.
- Renderização visual dos quatro relatórios com fotos reais e dois apartamentos.
- Testes físicos: captura e fototeca no Safari e PWA iPhone, retorno com preview, compartilhar File, safe area e retomada após interrupção de rede.

O navegador disponível bloqueou a URL localhost do ambiente. Nenhuma validação visual no navegador foi concluída; o build e os testes Node não substituem esses testes.
