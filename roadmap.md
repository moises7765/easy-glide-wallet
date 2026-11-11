# Savings rate
- [x] Replace only the Home net worth card with a compact savings rate and on-demand details.
- [x] Add real 12-month history with chart and table, including missing-data states.
- [x] Verify calculations and desktop/mobile interaction without creating transactions.
# Fluxo IA fixes
- [x] Fix the 4 failing chat tests (BRL non-breaking space in assertions).
- [x] Full Portuguese month in chat summaries ("outubro de 2026").
- [x] Local fallback in Portuguese when the AI is unavailable; questions never create entries.
- [x] Tests, type check, browser check, publish.
# Fluxo IA planning (purchase check + savings/goals)
- [x] Local module: "Posso comprar?" (Cabe / Cabe com cuidado / Melhor esperar), asks only missing price/payment, card limit ≠ money, no entry created.
- [x] Local module: savings opportunities (non-essential only, monthly/annual estimates), goal scenarios, "e se eu economizar R$ X" simulation.
- [x] Chat: new chips, routing before launch parsing, "comprei" after a simulation registers it.
- [x] Unit tests, type check.
- [x] Build and mocked fixed-expense chat integration verified; purchase/savings unit tests pass.
- [ ] Dedicated purchase/savings browser check and publication (deferred; this request does not authorize automatic publication).
# Gastos fixos
- [x] Persistência protegida, pagamentos por período e integração com Fluxo IA.
- [x] Tela, navegação, formulário e pagamentos sem criar despesas automaticamente.
- [x] Sugestões de recorrência com adicionar/ignorar e histórico de pagamentos.
- [x] 80 testes sintéticos; CRUD/pagamento e dinheiro livre no chat mockados no celular/computador; TypeScript/build OK.
- [x] RLS e permissões verificadas em leitura; acesso anônimo removido e categoria restrita ao proprietário.
- [ ] Verificação com sessão real e isolamento entre duas contas: requer login no preview (sessão automática indisponível).
- [x] Mantido apenas no preview, sem publicação automática.

# Bottom navigation
- [x] Remove "Metas" from the bottom bar; bar is Início | Lançamentos | Cartões | Gastos fixos | Mais.
- [x] Metas route untouched and still reachable from "Mais"; type check, build and mobile browser check passed; published.

# Invoice installment settlement
- [ ] Persist invoice-linked installment settlement, preserve manual progress and undo, and update all remaining/limit calculations.
- [ ] Synthetic regression tests and iPhone-size mocked payment/reload flow; verify compilation before publishing.

