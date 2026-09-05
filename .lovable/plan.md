# Anexar comprovante às transações

Adicionar um anexo (foto, imagem da galeria ou PDF) por lançamento, com indicador discreto na lista e visualização em tela cheia ao tocar.

## Como vai funcionar

- No formulário de novo lançamento e na edição, aparece um botão "📎 Anexar comprovante".
- No iPhone, o toque abre as opções nativas (Câmera / Fotos / Arquivos). No desktop, abre o seletor de arquivos.
- Depois de anexado, o formulário mostra uma miniatura (ou o nome do PDF) com opções de trocar e remover.
- Na lista de Lançamentos, itens com comprovante ganham apenas um pequeno ícone de clipe ao lado da data — nada mais.
- Tocar no lançamento abre a edição, onde o comprovante pode ser aberto em tela cheia (imagem com zoom natural, PDF em nova aba).
- Um comprovante por lançamento; anexar outro substitui o anterior (o arquivo antigo é apagado para não ocupar espaço).
- Apagar o lançamento apaga o comprovante junto.

## Onde os arquivos ficam

Um espaço de armazenamento privado no próprio backend do projeto (já existente), com acesso restrito ao dono do arquivo. Cada arquivo é salvo em uma pasta com o identificador do usuário, e a visualização usa links temporários assinados. Imagens tiradas pela câmera são reduzidas antes do envio (lado maior ~1600px, JPEG de qualidade média) para economizar espaço; PDFs vão como estão, com limite de 10 MB.

## Detalhes técnicos

Migração:
- Criar bucket privado `receipts` (`storage.buckets`) e políticas de storage por `auth.uid()` no primeiro segmento do path (`select/insert/update/delete`).
- `ALTER TABLE public.transactions ADD COLUMN receipt_path text, ADD COLUMN receipt_mime text` (colunas anuláveis; nenhuma regra existente muda). Sem alteração de RLS/grants da tabela.
- Regenerar `src/integrations/supabase/types.ts`.

Novos arquivos:
- `src/lib/receipts.ts` — upload (`{userId}/{transactionId|uuid}-{ts}.{ext}`), compressão de imagem via canvas, remoção, `createSignedUrl`, validação de tipo/tamanho.
- `src/components/ReceiptField.tsx` — botão de anexo + preview + trocar/remover (usa `<input type="file" accept="image/*,application/pdf">` e um segundo input com `capture="environment"` para câmera em mobile).
- `src/components/ReceiptViewer.tsx` — visualização em `BottomSheet`/dialog com URL assinada.

Arquivos alterados:
- `src/components/QuickAdd.tsx` — anexo selecionado em memória e enviado após criar a transação, gravando `receipt_path`/`receipt_mime` num update subsequente.
- `src/routes/_authenticated/lancamentos.tsx` — ícone de clipe discreto no `subtitle`/`leading` da `Row`; no `EditTransaction`, campo de comprovante + limpeza do arquivo ao excluir.
- `src/routes/_authenticated/novo-gasto.tsx` — mesmo campo de anexo (opcional, para manter paridade).
- `src/lib/finance.ts` — apenas o tipo `Transaction` acompanha as novas colunas (vem dos tipos gerados).

Fora de escopo: Início, importador de extratos, cartões/faturas, notificações, categorias, metas — sem mudanças.

## Limitações

- No Preview dentro do Lovable a câmera pode não abrir; funciona no app instalado/publicado e no desktop.
- Sem funcionamento offline: o envio exige internet.
- Sem OCR agora — os campos `receipt_path`/`receipt_mime` já deixam o caminho pronto para adicionar leitura automática depois.
- Links de visualização expiram (assinados por ~1 hora) e são regerados a cada abertura.
