<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Home "Saldo do mês" and the flow chart are cash flow (all expenses, including invoice payments); consumption metrics (category spending, savings rate) use `isConsumptionExpense` in `src/lib/savings.ts`, which excludes `invoice_payment_id` rows — card purchases already count when made, so this avoids double counting.
