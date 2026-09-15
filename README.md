# Pente Fino de Apartamentos

Aplicativo privado com Supabase Auth, PostgreSQL e buckets privados. Cadastros de ambientes, serviços e registros exclusivamente manuais. Interface em português com inputs nativos de câmera/galeria, compressão JPEG, rascunhos locais, PDFs com imagens incorporadas e compartilhamento por arquivo.

## Desenvolvimento

Node 22 ou superior. Execute `npm ci`, `npm test`, `npm run build` e `npm run serve`. A pasta `dist` contém o site estático, com caminhos relativos para GitHub Pages em subdiretórios. `public/config.json` contém somente URL e chave publicável; nunca inserir chaves secretas. O workflow valida testes e build. A saída de `dist` também é versionada na raiz para manter a publicação GitHub Pages existente pela branch main. Ao atualizar, copiar o build para a raiz antes do commit.

## Banco

A migração `supabase/migrations/20260915161027_pente_fino_pdf_integrity.sql` já foi aplicada ao projeto conectado. Não reaplicar cegamente. Mantém os dados existentes, adiciona metadados de PDF, bucket privado de relatórios, políticas por usuário e proteções de integridade/status.

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

Ver `docs/VALIDACAO.md`. Repositório: cauacassarolli-hub/CHECKLIST. Integração e validação do deploy em andamento.
