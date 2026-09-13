# Fluxo IA

## Experiência
- Remover somente a seção visual e os cálculos de “Comparação com meses anteriores” da tela Início.
- Adicionar nas telas autenticadas um botão flutuante discreto acima da navegação, sem conflitar com o botão central de novo lançamento.
- Abrir uma central responsiva “Fluxo IA” com saudação, sugestões rápidas, histórico apenas da sessão, mensagens em Markdown, campo de texto, envio, microfone e leitura em voz alta.
- Usar reconhecimento e síntese de voz nativos quando disponíveis, com estados claros para ouvir, parar, cancelar e indisponibilidade.

## Inteligência e dados
- Criar uma camada financeira reutilizável que consulte somente os dados do usuário autenticado: lançamentos, categorias, cartões, faturas, parcelas, metas, patrimônio, reserva e orçamentos.
- Reutilizar os cálculos existentes de ciclos de cartão, parcelas e `invoice_payment_id`; pagamentos automáticos de fatura serão excluídos das análises para não duplicar despesas.
- Calcular respostas seguras para saldo do mês, ritmo diário, projeção até o fim do mês, maiores gastos, categorias, mudanças históricas, faturas, compromissos e cenários de metas.
- Integrar o chat ao Lovable AI pelo servidor, usando o modelo padrão suportado, histórico completo da sessão e respostas curtas em português. Se a chamada estiver indisponível, manter análises determinísticas úteis e mostrar o erro real sem quebrar a central.

## Ações confirmadas
- Interpretar propostas estruturadas para receita, despesa, compra parcelada, criação de meta e ajuste de meta.
- Resolver nomes existentes de categorias, cartões e metas sem inventar registros; pedir os dados essenciais que faltarem.
- Mostrar uma prévia visual e só executar após confirmação explícita do usuário.
- Executar cada ação em função autenticada e validada no servidor, sem SQL livre e sem confiar em IDs enviados pelo navegador; reutilizar os mesmos campos e regras dos formulários atuais.
- Evitar reenvio acidental da mesma confirmação durante a sessão e atualizar imediatamente as consultas afetadas.

## Arquivos previstos
- `src/routes/_authenticated/route.tsx`: botão global e abertura da central.
- `src/routes/_authenticated/inicio.tsx`: remoção exclusiva da comparação mensal.
- Novos componentes em `src/components/fluxo-ai/`: botão, central, mensagens, prévia de ação e controles de voz.
- Novos módulos em `src/lib/fluxo-ai*`: tipos, análises financeiras, interpretação e funções autenticadas de chat/execução.
- `src/styles.css`: somente a animação sutil e os ajustes de tela segura necessários.
- `package.json`: dependências oficiais do chat/Markdown, caso ainda não existam.

## Validação
- Testar perguntas financeiras, dados insuficientes, exclusão de pagamentos de fatura, proposta incompleta, confirmação e cancelamento de receita/despesa/parcelamento/meta.
- Testar voz suportada e indisponível, leitura/parada da resposta, iPhone/PWA e desktop sem sobreposição com a navegação.
- Validar rota autenticada, TypeScript, build e erros de execução.

## Premissas e limites
- O histórico ficará somente na sessão, como solicitado; nenhuma nova tabela de conversas será criada.
- “Próximo salário” só terá data exata se houver lançamento/histórico suficiente para inferi-la; caso contrário, a IA pedirá essa informação.
- Reconhecimento de voz depende do suporte e da permissão do navegador; não será prometido funcionamento em segundo plano.
- Nenhuma publicação será feita nesta etapa.
