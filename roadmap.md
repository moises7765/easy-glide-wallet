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
- [ ] Local module: "Posso comprar?" (Cabe / Cabe com cuidado / Melhor esperar), asks only missing price/payment, card limit ≠ money, no entry created.
- [ ] Local module: savings opportunities (non-essential only, monthly/annual estimates), goal scenarios, "e se eu economizar R$ X" simulation.
- [ ] Chat: new chips, routing before launch parsing, "comprei" after a simulation registers it.
- [ ] Unit tests, type check, build, mocked chat check, publish.
