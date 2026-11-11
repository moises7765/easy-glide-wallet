import { describe, expect, it } from "vitest";
import { buildCardInvoices, cardInvoice, cardUsed, installmentLines, remainingOf, type Card, type InstallmentPurchase, type InvoicePayment, type Transaction } from "./finance";

const purchase: InstallmentPurchase = {
  id: "scooter", user_id: "fixture-user", card_id: "card-a", category_id: null,
  description: "SCOOTER", total_amount: 1000, installments_count: 10,
  installments_paid: 1, manual_installments_paid: null, first_due_date: "2026-10-10",
  note: null, created_at: "2026-10-01", updated_at: "2026-10-01",
};
const card = { id: "card-a", closing_day: 3, due_day: 10 } as Card;
const payment: InvoicePayment = { card_id: "card-a", invoice_key: "2026-11", paid_at: "2026-11-11T12:00:00Z" };

describe("invoice-linked installment progress", () => {
  it("paying the current invoice advances 1 paid/9 left to 2 paid/8 left", () => {
    expect(remainingOf(purchase, [payment])).toMatchObject({ paid: 2, left: 8, total: 800 });
  });
  it("only settles the line belonging to the paid invoice, never future lines", () => {
    expect(installmentLines(purchase, [payment]).filter((l) => l.paid).map((l) => l.index)).toEqual([1, 2]);
  });
  it("preserves legacy manually paid installments", () => {
    expect(remainingOf(purchase)).toMatchObject({ paid: 1, left: 9 });
  });
  it("overlapping manual and invoice payments and repeated payment rows count once", () => {
    expect(remainingOf(purchase, [payment, payment, { ...payment, invoice_key: "2026-10" }])).paid).toBe(2);
  });
  it("out-of-order invoice payment does not settle intervening installments", () => {
    const persisted = { ...purchase, installments_paid: 2, manual_installments_paid: 1 };
    expect(installmentLines(persisted, [{ ...payment, invoice_key: "2027-01" }]).filter((l) => l.paid).map((l) => l.index)).toEqual([1, 4]);
  });
  it("undo restores only invoice-derived progress", () => {
    const persisted = { ...purchase, installments_paid: 2, manual_installments_paid: 1 };
    expect(remainingOf(persisted, [])).toMatchObject({ paid: 1, left: 9, total: 900 });
  });
  it("wrong card, wrong period and cardless purchases cannot match", () => {
    expect(remainingOf(purchase, [{ ...payment, card_id: "card-b" }]).paid).toBe(1);
    expect(remainingOf(purchase, [{ ...payment, invoice_key: "2028-11" }]).paid).toBe(1);
    expect(remainingOf({ ...purchase, card_id: null }, [payment]).paid).toBe(1);
  });
  it("releases installment credit without rebilling the invoice-payment expense", () => {
    const tx = { card_id: card.id, type: "expense", amount: 100, date: "2026-11-11", invoice_payment_id: "payment-id" } as Transaction;
    expect(cardUsed(card.id, [tx], [purchase], card, [payment])).toBe(800);
    expect(cardInvoice(card.id, "2026-11", [tx], [purchase], card)).toBe(100);
    expect(buildCardInvoices(card, [tx], [purchase], [payment]).find((i) => i.key === "2026-11")).toMatchObject({ paid: true, amount: 100 });
  });
  it("keeps month-end schedules stable across leap February and year boundaries", () => {
    const p = { ...purchase, first_due_date: "2023-12-31", installments_count: 4, installments_paid: 0 };
    expect(installmentLines(p, [{ ...payment, invoice_key: "2024-02" }]).map((l) => [l.dueDate.getDate(), l.paid])).toEqual([[31, false], [31, false], [29, true], [31, false]]);
  });
});