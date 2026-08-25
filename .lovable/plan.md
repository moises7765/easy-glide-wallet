# Ajuste de rótulos do gráfico de fluxo

## Objetivo
Corrigir o título e simplificar os rótulos do eixo X do gráfico de linha/área "Fluxo dos últimos 6 meses" na página Início, sem alterar dados, cores, layout ou outras funcionalidades.

## Alterações

1. **Título do painel** em `src/routes/_authenticated/inicio.tsx`:
   - De: "Fluxo dos últimos 6 meses"
   - Para: "Fluxo dos últimos 12 meses"

2. **Rótulos dos meses** no eixo X do mesmo arquivo:
   - Atualmente exibem o resultado de `monthLabel(key)` (ex: "ago/26").
   - Passar a exibir as 3 primeiras letras do nome do mês em maiúsculas (JAN, FEV, MAR, ABR, MAI, JUN, JUL, AGO, SET, OUT, NOV, DEZ).
   - Implementar uma função auxiliar `monthInitialUpper(key: string)` em `src/lib/finance.ts` que retorne essa abreviação, usando `toLocaleDateString("pt-BR", { month: "long" })`.

3. **Período do gráfico**:
   - Manter o cálculo atual de últimos 12 meses corridos em ordem cronológica (`Array.from({ length: 12 }, ...)`), já ajustado previamente.

## Escopo preservado
- O gráfico continuará sendo o mesmo `AreaChart` de linha com as áreas de entrada/saída.
- Nenhuma outra página, componente, autenticação, banco, PWA/offline ou configuração será modificada.

## Validação
- Executar `bunx tsc --noEmit`.
- Executar `bun run build`.
- Verificar visualmente no preview se o título e os rótulos aparecem conforme solicitado.
