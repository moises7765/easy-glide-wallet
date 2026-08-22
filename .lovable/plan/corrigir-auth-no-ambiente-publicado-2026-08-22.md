# Corrigir `/auth` no ambiente publicado

## Implementação
- Remover integralmente do `vite.config.ts` o plugin `lovable-inline-public-supabase-env` e seus leitores manuais de `process.env`/`.env`, preservando somente a configuração TanStack/SSR existente.
- Trocar no cliente do backend apenas os dois acessos computados por `import.meta.env.VITE_SUPABASE_URL` e `import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY`; manter os fallbacks SSR atuais.
- Não alterar layout, rotas, fluxo de autenticação ou design.

## Validação
- Confirmar que o build completo passa sem warning/erro de credenciais.
- Testar `/` e `/auth` localmente em navegador com viewport de iPhone, aguardando a hidratação e verificando console/runtime.
- Publicar a versão corrigida e testar diretamente `https://easy-glide-wallet.lovable.app/auth`, incluindo carregamento pós-hidratação e ausência do erro de ambiente.
