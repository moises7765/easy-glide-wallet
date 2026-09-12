# Comparação automática com meses anteriores

## Implementação
- Adicionar na tela Início uma seção compacta “Comparação com meses anteriores”, preservando os cards, o saldo atual e o gráfico existentes.
- Calcular entradas, saídas e saldo do mês atual até hoje e comparar com o mesmo intervalo de dias do mês anterior, limitando corretamente pelo último dia daquele mês.
- Excluir da comparação os lançamentos automáticos de pagamento de fatura identificados por `invoice_payment_id`, evitando duplicar a compra e a saída da quitação.
- Exibir para cada indicador os dois valores e a variação com seta/sinal; quando a base anterior for zero, mostrar um estado textual em vez de percentual inválido.
- Gerar uma frase curta priorizando a mudança mais útil entre gastos e entradas, ou informar amigavelmente quando não houver base suficiente.
- Quando houver movimentações em cada um dos três meses completos anteriores, mostrar as médias de entradas e saídas desses meses.

## Arquivos
- `src/routes/_authenticated/inicio.tsx`: cálculos, apresentação e estados sem dados.
- Um pequeno utilitário em `src/lib/finance.ts` somente se necessário para manter os cálculos testáveis e reutilizáveis.

## Validação
- Conferir casos de aumento, queda, valor anterior zero e histórico insuficiente.
- Rodar TypeScript e validar o build do projeto.
