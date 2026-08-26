# Gráfico de fluxo: meses de janeiro a dezembro

## Situação atual
Os rótulos do eixo X mostram os 12 meses corridos terminando no mês atual. Hoje isso resulta em: SET OUT NOV DEZ JAN FEV MAR ABR MAI JUN JUL AGO — ou seja, não está em ordem de janeiro a dezembro.

## Alteração
Passar o gráfico da página Início a exibir o ano civil atual, de JAN a DEZ:
- Os 12 pontos passam a ser janeiro..dezembro do ano corrente.
- Meses futuros ficam com valor zero (linha sem movimento até serem preenchidos).
- Rótulos: JAN, FEV, MAR, ABR, MAI, JUN, JUL, AGO, SET, OUT, NOV, DEZ.

## Escopo preservado
- Mesmo gráfico de linha/área, mesmas cores, tamanho, tooltip e título ("Fluxo dos últimos 12 meses" permanece, ou pode ser ajustado se você preferir "Fluxo do ano").
- Nenhuma outra página, dado, autenticação, banco ou configuração é alterada.

## Detalhes técnicos
- `src/routes/_authenticated/inicio.tsx`: no `useMemo` do `flow`, gerar as chaves como `${ano}-${mês}` para os 12 meses do ano corrente em vez de usar `addMonths(new Date(), i - 11)`.
- `monthInitialUpper` em `src/lib/finance.ts` continua sendo usada para os rótulos, sem mudanças.

## Validação
- Typecheck e build.
- Conferir no preview que os rótulos aparecem de JAN a DEZ.
