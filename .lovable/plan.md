# Corrigir a configuração do backend no bundle publicado

## Diagnóstico confirmado

- O iPhone/Safari e o desktop recebem o mesmo bundle novo: `index-BYCnlHYJ.js`.
- Nos dois ambientes, `/auth` termina na tela de erro com a mesma exceção de configuração.
- O bundle publicado **não contém** a URL real nem a chave pública real do backend.
- O ambiente de build atual possui `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e suas versões `VITE_*`; portanto, a conexão do projeto com o backend existe.
- O problema está na substituição durante o build: `vite.config.ts` define acessos em formato de ponto (`import.meta.env.VITE_SUPABASE_URL`), enquanto o cliente usa formato computado (`import.meta.env['VITE_SUPABASE_URL']`). Esse formato ficou literalmente no JavaScript publicado e retorna vazio em runtime. O fallback `process.env[...]` também não fornece variáveis ao navegador.
- Não há evidência de falha de rede, service worker, Capacitor, viewport, safe area ou API incompatível com Safari. O crash também foi reproduzido no desktop publicado.

## Alteração necessária

1. Ajustar somente a etapa de transformação em `vite.config.ts` para que os dois valores públicos sejam incorporados mesmo quando o arquivo cliente usa acesso computado, sem editar o cliente auto-gerado e sem expor nenhuma credencial privada.
2. Manter intactos autenticação por Google/e-mail, recuperação de senha, Capacitor e design.
3. Republicar, pois o bundle hospedado só muda após uma nova publicação.

## Validação após a alteração

- Confirmar que o novo bundle contém exatamente a URL e a chave pública esperadas, sem registrar seus valores.
- Abrir `/auth` por pelo menos 12 segundos em WebKit com user agent/viewport de iPhone e em desktop.
- Verificar ausência da exceção, ausência de respostas HTTP com erro e permanência da tela de login.
- Validar que os botões e fluxos existentes de e-mail, Google e recuperação continuam disponíveis, sem executar alterações destrutivas em contas.