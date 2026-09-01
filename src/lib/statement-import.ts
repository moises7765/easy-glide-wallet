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
  "pagar cartao",
  "acompanhar evolucao",
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

const dupKey = (date: string, amount: number, type: string, description?: string | null) =>
  `${date}|${type}|${Math.round(Math.abs(amount) * 100)}|${stripAccents(String(description ?? "")).slice(0, 24)}`;

/** Marks rows that already exist in the history (same date, value, type and description) or repeat inside the file. */
export function markDuplicates(rows: ParsedRow[], existing: Transaction[]): ParsedRow[] {
  const known = new Set(
    existing.map((t) => dupKey(t.date.slice(0, 10), Number(t.amount), t.type, t.description)),
  );
  const loose = new Set(existing.map((t) => dupKey(t.date.slice(0, 10), Number(t.amount), t.type)));
  const seen = new Set<string>();
  return rows.map((r) => {
    const key = dupKey(r.date, r.amount, r.type, r.description);
    const duplicate = known.has(key) || seen.has(key) || loose.has(dupKey(r.date, r.amount, r.type));
    seen.add(key);
    return { ...r, duplicate, selected: !duplicate && r.flow !== "transfer" };
  });
}

export function sortRows(rows: ParsedRow[]) {
  return [...rows].sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime());
}

/* ---------------- PDF (extrato Mercado Pago e similares) ---------------- */

const MONTHS_PT: Record<string, string> = {
  jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
  jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
};

const MONEY_RE = /(?:-\s*)?(?:R\s*\$\s*)?(?:-\s*)?\d[\d\s.]*(?:,\s*\d{2})(?!\d)/gi;

function normalizePdfText(text: string) {
  return text
    .normalize("NFKC")
    .replace(/[−–—]/g, "-")
    .replace(/R\s*\$/gi, "R$")
    .replace(/(\d)\s*([,.])\s*(\d)/g, "$1$2$3")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePdfMoney(raw: string): number {
  return parseAmount(normalizePdfText(raw).replace(/-\s+/g, "-"));
}

function cleanPdfDescription(text: string) {
  return text
    .replace(/(?:data\s+)?descri[cç][aã]o\s+id\s+da\s+opera[cç][aã]o\s+valor\s+saldo/gi, " ")
    .replace(/\b(?:data|descri[cç][aã]o|id da opera[cç][aã]o|valor|saldo)\b/gi, " ")
    .replace(MONEY_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pdfDate(line: string): { iso: string; rest: string } | null {
  let m = /^(\d{2})[/.-](\d{2})[/.-](\d{4})/.exec(line);
  if (m) return { iso: `${m[3]}-${m[2]}-${m[1]}`, rest: line.slice(m[0].length) };
  m = /^(\d{1,2})\s+de\s+([a-zç]{3,})[a-zç.]*\.?\s+(?:de\s+)?(\d{4})/i.exec(stripAccents(line));
  if (m) {
    const mm = MONTHS_PT[stripAccents(m[2] ?? "").slice(0, 3)];
    if (mm) {
      return { iso: `${m[3]}-${mm}-${String(m[1]).padStart(2, "0")}`, rest: line.slice(m[0].length) };
    }
  }
  m = /^(\d{1,2})\s+([a-zç]{3})[a-zç.]*\.?\s+(\d{4})/i.exec(stripAccents(line));
  if (m) {
    const mm = MONTHS_PT[stripAccents(m[2] ?? "")];
    if (mm) return { iso: `${m[3]}-${mm}-${String(m[1]).padStart(2, "0")}`, rest: line.slice(m[0].length) };
  }
  return null;
}

const MP_DATE_RE = /(\d{2})\s*[-/.]\s*(\d{2})\s*[-/.]\s*(\d{4})/g;
const MP_ID_RE = /(?:\d[\s\u00ad]*){10,14}/g;

type MercadoPagoBlock = { date: string; parts: string[] };

function looksLikeMercadoPago(lines: string[]) {
  const text = stripAccents(lines.join(" ").replace(/\s+/g, " "));
  const hasHeader = text.includes("id da operacao") && text.includes("valor") && text.includes("saldo");
  const ids = text.match(/\b\d{10,14}\b/g) ?? [];
  const hasKnownMovement = /(dinheiro reservado|dinheiro retirado|pix recebido|pix enviado|pagamento com qr pix)/.test(text);
  return hasHeader || (ids.length > 0 && hasKnownMovement);
}

/**
 * Splits Mercado Pago text into stateful records. A date opens a transaction;
 * every subsequent physical PDF line belongs to it until the next date.
 */
function mercadoPagoBlocks(lines: string[]): MercadoPagoBlock[] {
  const blocks: MercadoPagoBlock[] = [];
  let current: MercadoPagoBlock | null = null;

  const flush = () => {
    if (current) blocks.push(current);
    current = null;
  };

  for (const raw of lines) {
    const line = raw.normalize("NFKC").replace(/[−–—]/g, "-").replace(/\u00ad/g, "").trim();
    if (!line) continue;

    MP_DATE_RE.lastIndex = 0;
    const dates = [...line.matchAll(MP_DATE_RE)];
    MP_DATE_RE.lastIndex = 0;
    if (dates.length === 0) {
      if (current) current.parts.push(line);
      continue;
    }

    const prefix = line.slice(0, dates[0]?.index ?? 0).trim();
    if (prefix && current) current.parts.push(prefix);

    for (let index = 0; index < dates.length; index++) {
      const match = dates[index];
      if (match.index === undefined) continue;
      flush();
      const day = match[1];
      const month = match[2];
      const year = match[3];
      if (!day || !month || !year) continue;
      current = { date: `${year}-${month}-${day}`, parts: [] };
      const nextStart = dates[index + 1]?.index ?? line.length;
      const rest = line.slice(match.index + match[0].length, nextStart).trim();
      if (rest) current.parts.push(rest);
    }
  }
  flush();
  return blocks;
}

function rowFromMercadoPagoBlock(block: MercadoPagoBlock, allowFallback: boolean): ParsedRow | null {
  const record = normalizePdfText(block.parts.join(" "));
  if (!record) return null;

  const idMatches = [...record.matchAll(MP_ID_RE)];
  MP_ID_RE.lastIndex = 0;
  const idMatch = idMatches.find((candidate) => {
    if (candidate.index === undefined) return false;
    const after = record.slice(candidate.index + candidate[0].length);
    const values = after.match(MONEY_RE) ?? [];
    MONEY_RE.lastIndex = 0;
    return values.length > 0;
  });
  if (!idMatch && !allowFallback) return null;

  const idStart = idMatch?.index;
  const idEnd = idStart === undefined ? undefined : idStart + idMatch[0].length;
  const valuesText = idEnd === undefined ? record : record.slice(idEnd);
  let money = valuesText.match(MONEY_RE) ?? [];
  MONEY_RE.lastIndex = 0;
  if (money.length === 0 && idMatch) {
    money = record.match(MONEY_RE) ?? [];
    MONEY_RE.lastIndex = 0;
  }
  if (money.length === 0) return null;

  // The last two monetary fields are Valor and Saldo. Never use Saldo as the
  // transaction amount when both columns survived PDF extraction.
  const valueToken = money.length >= 2 ? money[money.length - 2] : money[0];
  const amount = parsePdfMoney(valueToken ?? "");
  if (Number.isNaN(amount) || amount === 0) return null;

  const descriptionEnd = idStart ?? record.search(MONEY_RE);
  MONEY_RE.lastIndex = 0;
  const description = cleanPdfDescription(record.slice(0, descriptionEnd < 0 ? record.length : descriptionEnd));
  if (!description || /^(data|descricao|descrição|id da operacao|id da operação|valor|saldo)$/i.test(description)) return null;

  const fitid = idMatch?.[0].replace(/\D/g, "") || null;
  return makeRow(block.date, description, amount, fitid);
}

/** Parses Mercado Pago records without requiring date, description, ID and values on one line. */
export function rowsFromMercadoPagoText(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/);
  const detected = looksLikeMercadoPago(lines);
  if (!detected) return [];
  return mercadoPagoBlocks(lines)
    .map((block) => rowFromMercadoPagoBlock(block, detected))
    .filter((row): row is ParsedRow => row !== null);
}

/** Builds rows out of the text lines of a bank statement PDF. */
export function rowsFromPdfLines(lines: string[]): ParsedRow[] {
  const mp = rowsFromMercadoPagoText(lines.join("\n"));
  if (mp.length > 0) return mp;

  const rows: ParsedRow[] = [];
  let pending: { date: string; text: string } | null = null;

  const flush = () => {
    if (!pending) return;
    const money = pending.text.match(MONEY_RE) ?? [];
    if (money.length > 0) {
      // in Mercado Pago the last column is the running balance; the value comes right before it
      const valueToken = money.length >= 2 ? money[money.length - 2]! : money[0]!;
       const amount = parsePdfMoney(valueToken);
      let description = pending.text;
      for (const token of money) description = description.replace(token, " ");
      description = description
        .replace(/\b\d{8,}\b/g, " ") // operation id
        .replace(/\s+/g, " ")
        .trim();
      if (!Number.isNaN(amount) && amount !== 0) {
        rows.push(makeRow(pending.date, description, amount));
      }
    }
    pending = null;
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;
    const low = stripAccents(line);
    if (/^(data|descricao|saldo|detalhe|extrato|periodo|total)\b/.test(low) && !MONEY_RE.test(line)) {
      MONEY_RE.lastIndex = 0;
      continue;
    }
    MONEY_RE.lastIndex = 0;

    const parsed = pdfDate(line);
    if (parsed) {
      flush();
      pending = { date: parsed.iso, text: parsed.rest };
    } else if (pending) {
      pending = { date: pending.date, text: `${pending.text} ${line}` };
    }
  }
  flush();

  return rows;
}

