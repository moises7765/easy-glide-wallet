# Diagnóstico: /auth quebra no site publicado (e no iPhone), mas funciona no Preview

## Evidência coletada agora (sem alterar código)

- `GET https://easy-glide-wallet.lovable.app/auth` responde **200** e o HTML do servidor está correto (título "Entrar — Fluxo Finanças", CSS e metadados certos). Ou seja, **não é problema de roteamento nem de publicação da rota**.
- O HTML publicado carrega o pacote `/assets/index-BYCnlHYJ.js`.
- Dentro desse pacote publicado, o trecho que lê as credenciais aparece assim:

```text
...PUBLISHABLE_KEY|| {}.SUPABASE_PUBLISHABLE_KEY; if(!e||!t){ ... `Missing Supabase environment variable(s)` ...
```

O `{}` é literal: no build de publicação, `import.meta.env` foi substituído por um **objeto vazio**. Não há URL do backend nem chave pública embutidas no arquivo.

## Causa exata

O `vite.config.ts` faz `define: { "import.meta.env": JSON.stringify(supabaseClientEnv) }`.
Esse objeto é montado a partir de `process.env` / do arquivo `.env` **no momento em que a config é avaliada**. No build de publicação essas variáveis não estão presentes nesse momento, então `supabaseClientEnv` fica `{}` e o build substitui **todo** `import.meta.env` por `{}` — apagando inclusive `MODE`, `DEV`, `BASE_URL` e as `VITE_*` que o próprio Lovable Cloud injeta normalmente.

Isso explica o padrão observado:

- **Home publicada funciona**: a landing não instancia o cliente do backend.
- **/auth publicada falha**: é a primeira rota que cria o cliente e, sem URL/chave, lança o erro na hidratação — a tela some logo depois de aparecer.
- **Preview funciona**: ali as variáveis existem no ambiente, então o mesmo `define` produz um objeto preenchido.
- **iPhone**: mesmo comportamento do desktop no link publicado; não é cache nem Safari.

## Solução mais segura

1. **Remover o `define` de `import.meta.env` inteiro** do `vite.config.ts`. Substituir tudo de uma vez é o que causa o apagamento; a config oficial do Lovable já injeta as variáveis `VITE_*` no bundle do cliente.
2. Se ainda for preciso a ponte entre os nomes de runtime (`SUPABASE_URL`) e os públicos (`VITE_SUPABASE_URL`), fazê-la com `define` de **chaves individuais** (`"import.meta.env.VITE_SUPABASE_URL": ...`) e resolver o valor com `loadEnv` do Vite (que lê o `.env` no momento certo do build), nunca substituindo o objeto inteiro.
3. Ajustar o cliente para usar acesso direto por ponto (`import.meta.env.VITE_SUPABASE_URL`), que é o que o Vite reescreve de forma confiável — se o arquivo gerado não permitir edição, ler o valor por um pequeno módulo próprio que faça esse acesso direto.
4. Adicionar uma **verificação de build**: se a URL ou a chave pública não forem resolvidas, o build falha com mensagem clara, em vez de publicar um pacote quebrado.
5. Republicar e validar `/auth` no link publicado (desktop e user agent de iPhone), conferindo que o novo pacote contém a URL do backend e que login por e-mail, Google e recuperação de senha continuam funcionando.

## Fora de escopo

Nenhuma mudança de design, de autenticação ou de funcionalidades. Nada relacionado a Capacitor será alterado.
