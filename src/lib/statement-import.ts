import { parseDate, toISODate } from "@/lib/finance";
import type { Transaction, Category } from "@/lib/finance";

export type RowFlow = "income" | "expense" | "transfer" | "investment";

export type ParsedRow = {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: "expense" | "income";
  flow: RowFlow;
  categoryId: string | null;
  cardId: string | null;
  paymentMethod: string;
  selected: boolean;
  duplicate: boolean;
  fitid?: string | null;
};

let seq = 0;
const nextId = () => `row-${Date.now()}-${seq++}`;

/** Number parsing tolerant to "1.234,56" and "1,234.56". */
export function parseAmount(raw: string): number {
  const s = String(raw ?? "")
    .replace(/\s/g, "")
    .replace(/[R$\u00a0]/gi, "")
    .trim();
  if (!s) return NaN;
  const negative = /^\(.*\)$/.test(s) || s.startsWith("-");
  const cleaned = s.replace(/[()\-+]/g, "");
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized = cleaned;
  if (lastComma > lastDot) normalized = cleaned.replace(/\./g, "").replace(",", ".");
  else normalized = cleaned.replace(/,/g, "");
  const value = Number(normalized);
  if (Number.isNaN(value)) return NaN;
  return negative ? -value : value;
}

/** Accepts YYYY-MM-DD, DD/MM/YYYY, YYYYMMDD, Excel serials and Date objects. */
export function parseAnyDate(raw: unknown): string | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return toISODate(raw);
  if (typeof raw === "number" && raw > 20000 && raw < 60000) {
    const d = new Date(Date.UTC(1899, 11, 30) + raw * 86400000);
    return toISODate(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  const s = String(raw ?? "").trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})[/.-](\d{2})[/.-](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = /^(\d{2})[/.-](\d{2})[/.-](\d{2})$/.exec(s);
  if (m) return `20${m[3]}-${m[2]}-${m[1]}`;
  m = /^(\d{4})(\d{2})(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : toISODate(d);
}

const stripAccents = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const TRANSFER_HINTS = [
  "dinheiro reservado",
  "dinheiro retirado",
  "separar dinheiro",
  "guardar dinheiro",
  "reserva de emergencia",
  "reserva emergencia",
  "cofrinho",
  "caixinha",
  "transferencia entre contas",
  "transferencia entre saldos",
  "entre suas contas",
  "saldo em conta",
  "movimentacao entre saldos",
  "retirada da reserva",
  "aporte na reserva",
];

const INVESTMENT_HINTS = [
  "investimento",
  "aplicacao",
  "aplicado",
  "resgate",
  "rendimento",
  "rendimentos",
  "cdb",
  "tesouro",
  "fundo",
  "renda fixa",
  "acoes",
];

/** Classifies a statement line into a real income/expense, an internal transfer or an investment move. */
export function classifyFlow(description: string, amount: number): RowFlow {
  const d = stripAccents(description);
  if (TRANSFER_HINTS.some((h) => d.includes(h))) return "transfer";
  if (INVESTMENT_HINTS.some((h) => d.includes(h))) return "investment";
  return amount < 0 ? "expense" : "income";
}

export const FLOW_LABEL: Record<RowFlow, string> = {
  income: "Receita",
  expense: "Despesa",
  transfer: "Transferência interna",
  investment: "Investimento",
};

function makeRow(date: string, description: string, amount: number, fitid?: string | null): ParsedRow {
  const desc = description.replace(/\s+/g, " ").trim() || "Lançamento importado";
  const flow = classifyFlow(desc, amount);
  return {
    id: nextId(),
    date,
    description: desc,
    amount: Math.abs(amount),
    type: amount < 0 ? "expense" : "income",
    flow,
    categoryId: null,
    cardId: null,
    paymentMethod: "transferencia",
    selected: flow !== "transfer",
    duplicate: false,
    fitid: fitid ?? null,
  };
}

/* ---------------- OFX ---------------- */

export function parseOFX(text: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  const blocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];
  const tag = (block: string, name: string) => {
    const m = new RegExp(`<${name}>([^<\r\n]*)`, "i").exec(block);
    return m?.[1] ? m[1].trim() : "";
  };
  for (const block of blocks) {
    const date = parseAnyDate(tag(block, "DTPOSTED"));
    const amount = parseAmount(tag(block, "TRNAMT"));
    if (!date || Number.isNaN(amount) || amount === 0) continue;
    const desc = tag(block, "MEMO") || tag(block, "NAME") || tag(block, "TRNTYPE");
    rows.push(makeRow(date, desc, amount, tag(block, "FITID") || null));
  }
  return rows;
}

/* ---------------- CSV ---------------- */

function splitCsvLine(line: string, delimiter: string) {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

const DATE_KEYS = ["data", "date", "data lancamento", "data movimento", "posted"];
const DESC_KEYS = ["descricao", "descrição", "historico", "histórico", "description", "memo", "lancamento", "estabelecimento", "titulo"];
const AMOUNT_KEYS = ["valor", "amount", "value", "montante", "quantia"];
const DEBIT_KEYS = ["debito", "débito", "saida", "saída", "despesa"];
const CREDIT_KEYS = ["credito", "crédito", "entrada", "receita"];
const TYPE_KEYS = ["tipo", "type", "natureza", "d/c"];

const norm = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

function pickIndex(headers: string[], keys: string[]) {
  const normalized = headers.map(norm);
  for (const key of keys) {
    const i = normalized.findIndex((h) => h === norm(key));
    if (i >= 0) return i;
  }
  for (const key of keys) {
    const i = normalized.findIndex((h) => h.includes(norm(key)));
    if (i >= 0) return i;
  }
  return -1;
}

export function rowsFromTable(table: unknown[][]): ParsedRow[] {
  const clean = table.filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
  if (clean.length === 0) return [];

  // find header row within the first 10 lines
  let headerIndex = 0;
  for (let i = 0; i < Math.min(10, clean.length); i++) {
    const cells = (clean[i] ?? []).map(norm);
    if (cells.some((c) => DATE_KEYS.includes(c) || c.startsWith("data")) &&
        cells.some((c) => AMOUNT_KEYS.some((k) => c.includes(k)) || DEBIT_KEYS.some((k) => c.includes(k)))) {
      headerIndex = i;
      break;
    }
  }
  const headers = (clean[headerIndex] ?? []).map((c) => String(c ?? ""));
  const iDate = pickIndex(headers, DATE_KEYS);
  const iDesc = pickIndex(headers, DESC_KEYS);
  const iAmount = pickIndex(headers, AMOUNT_KEYS);
  const iDebit = pickIndex(headers, DEBIT_KEYS);
  const iCredit = pickIndex(headers, CREDIT_KEYS);
  const iType = pickIndex(headers, TYPE_KEYS);

  const rows: ParsedRow[] = [];
  for (const raw of clean.slice(headerIndex + 1)) {
    const date = parseAnyDate(iDate >= 0 ? raw[iDate] : raw[0]);
    if (!date) continue;

    let amount = NaN;
    if (iAmount >= 0) amount = parseAmount(String(raw[iAmount] ?? ""));
    if (Number.isNaN(amount) && iDebit >= 0) {
      const debit = parseAmount(String(raw[iDebit] ?? ""));
      if (!Number.isNaN(debit) && debit !== 0) amount = -Math.abs(debit);
    }
    if (Number.isNaN(amount) && iCredit >= 0) {
      const credit = parseAmount(String(raw[iCredit] ?? ""));
      if (!Number.isNaN(credit) && credit !== 0) amount = Math.abs(credit);
    }
    if (Number.isNaN(amount) || amount === 0) continue;

    if (iType >= 0) {
      const t = norm(raw[iType]);
      if (t.startsWith("d") || DEBIT_KEYS.some((k) => t.includes(norm(k)))) amount = -Math.abs(amount);
      else if (t.startsWith("c") || CREDIT_KEYS.some((k) => t.includes(norm(k)))) amount = Math.abs(amount);
    }

    const description = iDesc >= 0 ? String(raw[iDesc] ?? "") : "";
    rows.push(makeRow(date, description, amount));
  }
  return rows;
}

export function parseCSV(text: string): ParsedRow[] {
  const content = text.replace(/^\uFEFF/, "");
  const lines = content.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];
  const sample = lines.slice(0, 5).join("\n");
  const delimiter = [";", ",", "\t", "|"]
    .map((d) => ({ d, n: sample.split(d).length }))
    .sort((a, b) => b.n - a.n)[0]!.d;
  return rowsFromTable(lines.map((l) => splitCsvLine(l, delimiter)));
}

/* ---------------- categorização + duplicados ---------------- */

const CATEGORY_HINTS: Record<string, string[]> = {
  mercado: ["mercado", "supermerc", "atacad", "hortifruti", "padaria", "carrefour", "assai", "pao de acucar"],
  alimentacao: ["restaurante", "ifood", "lanche", "burger", "pizza", "cafe", "bar "],
  transporte: ["uber", "99", "combustivel", "posto", "gasolina", "estacion", "metro", "onibus"],
  moradia: ["aluguel", "condominio", "energia", "luz", "agua", "gas", "internet"],
  saude: ["farmacia", "drogaria", "hospital", "clinica", "plano de saude", "odonto"],
  lazer: ["netflix", "spotify", "cinema", "steam", "disney", "hbo"],
  educacao: ["escola", "faculdade", "curso", "udemy", "livraria"],
  salario: ["salario", "pagamento", "provento", "rendimento"],
};

export function suggestCategory(description: string, type: "expense" | "income", categories: Category[]) {
  const d = norm(description);
  const pool = categories.filter((c) => c.kind === type);
  if (pool.length === 0) return null;
  // direct name match
  const direct = pool.find((c) => norm(c.name).length > 2 && d.includes(norm(c.name)));
  if (direct) return direct.id;
  for (const [key, hints] of Object.entries(CATEGORY_HINTS)) {
    if (!hints.some((h) => d.includes(h))) continue;
    const match = pool.find((c) => norm(c.name).includes(key) || key.includes(norm(c.name)));
    if (match) return match.id;
  }
  return null;
}

export function suggestCard(description: string, cards: { id: string; name: string }[]) {
  const d = norm(description);
  const match = cards.find((c) => norm(c.name).length > 2 && d.includes(norm(c.name)));
  return match?.id ?? null;
}

const dupKey = (date: string, amount: number, type: string) =>
  `${date}|${type}|${Math.round(Math.abs(amount) * 100)}`;

/** Marks rows that already exist in the history (same date, value and type) or repeat inside the file. */
export function markDuplicates(rows: ParsedRow[], existing: Transaction[]): ParsedRow[] {
  const known = new Set(existing.map((t) => dupKey(t.date.slice(0, 10), Number(t.amount), t.type)));
  const seen = new Set<string>();
  return rows.map((r) => {
    const key = dupKey(r.date, r.amount, r.type);
    const duplicate = known.has(key) || seen.has(key);
    seen.add(key);
    return { ...r, duplicate, selected: !duplicate };
  });
}

export function sortRows(rows: ParsedRow[]) {
  return [...rows].sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime());
}
