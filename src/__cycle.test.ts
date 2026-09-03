import { describe, it, expect } from "vitest";
import { buildCardInvoices, invoiceKeyForDate, pendingInvoices, currentInvoice, cardUsed } from "@/lib/finance";
import { alertsForInvoice } from "@/lib/invoice-notifications";

const card: any = { id: "c1", name: "Nubank", closing_day: 1, due_day: 8, limit_total: 5000, color: "#000", brand: "M" };
const tx = (id: string, date: string, amount: number) => ({ id, card_id: "c1", type: "expense", amount, date } as any);

describe("ciclo de fatura", () => {
  it("compras de agosto pertencem à fatura de 08/09", () => {
    expect(invoiceKeyForDate(card, "2026-08-15")).toBe("2026-09");
    expect(invoiceKeyForDate(card, "2026-09-01")).toBe("2026-09"); // no fechamento
    expect(invoiceKeyForDate(card, "2026-09-02")).toBe("2026-10"); // após fechamento -> próxima
  });

  it("virada do dia 1 não faz a fatura sumir", () => {
    const txs = [tx("t1", "2026-08-20", 100)];
    const before = buildCardInvoices(card, txs, [], [], new Date(2026, 7, 31));
    const after = buildCardInvoices(card, txs, [], [], new Date(2026, 8, 1));
    expect(currentInvoice(before, new Date(2026,7,31))!.key).toBe("2026-09");
    const p = pendingInvoices(after);
    expect(p[0]!.key).toBe("2026-09");
    expect(p[0]!.amount).toBe(100);
    expect(p[0]!.paid).toBe(false);
  });

  it("marcar como paga remove de pendentes e não volta", () => {
    const txs = [tx("t1", "2026-08-20", 100)];
    const pay = [{ card_id: "c1", invoice_key: "2026-09", paid_at: "2026-09-08" }];
    const inv = buildCardInvoices(card, txs, [], pay, new Date(2026, 8, 10));
    expect(pendingInvoices(inv)).toHaveLength(0);
    expect(inv.find(i => i.key === "2026-09")!.status).toBe("paga");
  });

  it("parcelas futuras caem nas faturas futuras", () => {
    const purchase: any = { id: "p1", card_id: "c1", total_amount: 300, installments_count: 3, installments_paid: 0, first_due_date: "2026-09-08" };
    const inv = buildCardInvoices(card, [], [purchase], [], new Date(2026, 8, 2));
    const m = (k: string) => inv.find(i => i.key === k)!.amount;
    expect(m("2026-09")).toBe(100); expect(m("2026-10")).toBe(100); expect(m("2026-11")).toBe(100);
  });

  it("comprometido: parcelas + faturas não pagas", () => {
    const purchase: any = { id: "p1", card_id: "c1", total_amount: 300, installments_count: 3, installments_paid: 1, first_due_date: "2026-08-08" };
    const txs = [tx("t1", "2026-08-20", 100)];
    expect(cardUsed("c1", txs, [purchase], card, [])).toBe(300);
    expect(cardUsed("c1", txs, [purchase], card, [{ card_id: "c1", invoice_key: "2026-09", paid_at: "x" }])).toBe(200);
  });
});

describe("notificações", () => {
  const inv = (over: any) => buildCardInvoices(card, [tx("t1","2026-08-20",100)], [], over.pay ?? [], over.now)[0 as any];
  it("avisa 5, 1 e no dia; nunca depois de paga", () => {
    const at = (d: Date) => buildCardInvoices(card, [tx("t1","2026-08-20",100)], [], [], d).find(i=>i.key==="2026-09")!;
    expect(alertsForInvoice("c1","Nubank", at(new Date(2026,8,1)))).toHaveLength(0);
    expect(alertsForInvoice("c1","Nubank", at(new Date(2026,8,3)))[0]!.id).toBe("c1:2026-09:5");
    expect(alertsForInvoice("c1","Nubank", at(new Date(2026,8,7)))[0]!.id).toBe("c1:2026-09:1");
    expect(alertsForInvoice("c1","Nubank", at(new Date(2026,8,8)))[0]!.id).toBe("c1:2026-09:0");
    const paid = buildCardInvoices(card, [tx("t1","2026-08-20",100)], [], [{card_id:"c1",invoice_key:"2026-09",paid_at:"x"}], new Date(2026,8,8)).find(i=>i.key==="2026-09")!;
    expect(alertsForInvoice("c1","Nubank", paid)).toHaveLength(0);
  });
  void inv;
});
