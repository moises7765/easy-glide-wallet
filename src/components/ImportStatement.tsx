import { useMemo, useRef, useState } from "react";
import { AlertTriangle, FileUp, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { BottomSheet } from "@/components/finance-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { brl, PAYMENT_METHODS } from "@/lib/finance";
import { useImportTransactions, useRows } from "@/lib/queries";
import {
  markDuplicates,
  parseCSV,
  parseOFX,
  rowsFromTable,
  sortRows,
  suggestCard,
  suggestCategory,
  type ParsedRow,
} from "@/lib/statement-import";
import { cn } from "@/lib/utils";

export function ImportStatement({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: categories = [] } = useRows("categories");
  const { data: cards = [] } = useRows("cards");
  const { data: transactions = [] } = useRows("transactions");
  const importTx = useImportTransactions();

  const selected = useMemo(() => rows.filter((r) => r.selected), [rows]);
  const totals = useMemo(
    () => ({
      income: selected.filter((r) => r.type === "income").reduce((s, r) => s + r.amount, 0),
      expense: selected.filter((r) => r.type === "expense").reduce((s, r) => s + r.amount, 0),
      duplicates: rows.filter((r) => r.duplicate).length,
    }),
    [rows, selected],
  );

  function reset() {
    setRows([]);
    setFileName(null);
    setEditing(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  async function handleFile(file: File) {
    setLoading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      let parsed: ParsedRow[] = [];
      if (ext === "ofx" || ext === "qfx") {
        parsed = parseOFX(await file.text());
      } else if (ext === "csv" || ext === "txt") {
        parsed = parseCSV(await file.text());
      } else if (ext === "xlsx" || ext === "xls") {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const table = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });
        parsed = rowsFromTable(table);
      } else {
        toast.error("Formato não suportado. Use OFX, CSV ou XLSX.");
        return;
      }

      if (parsed.length === 0) {
        toast.error("Nenhuma transação encontrada no arquivo.");
        setFileName(file.name);
        setRows([]);
        return;
      }

      const enriched = markDuplicates(sortRows(parsed), transactions).map((r) => {
        const cardId = suggestCard(r.description, cards);
        return {
          ...r,
          categoryId: suggestCategory(r.description, r.type, categories),
          cardId,
          paymentMethod: cardId ? "credito" : r.paymentMethod,
        };
      });
      setRows(enriched);
      setFileName(file.name);
    } catch (e) {
      toast.error(`Não consegui ler o arquivo: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  function patch(id: string, values: Partial<ParsedRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...values } : r)));
  }

  async function confirm() {
    if (selected.length === 0) return;
    await importTx.mutateAsync(
      selected.map((r) => ({
        type: r.type,
        amount: r.amount,
        date: r.date,
        category_id: r.categoryId,
        card_id: r.paymentMethod === "credito" ? r.cardId : null,
        payment_method: r.paymentMethod,
        description: r.description,
        note: fileName ? `Importado de ${fileName}` : null,
      })),
    );
    close();
  }

  return (
    <BottomSheet open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())} title="Importar extrato">
      <div className="space-y-5">
        <input
          ref={inputRef}
          type="file"
          accept=".ofx,.qfx,.csv,.txt,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />

        {rows.length === 0 ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-4 py-8 text-center transition-colors active:bg-secondary/60"
            >
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              ) : (
                <FileUp className="h-6 w-6 text-primary" />
              )}
              <span className="text-sm font-medium">
                {loading ? "Lendo arquivo..." : "Selecionar arquivo"}
              </span>
              <span className="text-xs text-muted-foreground">OFX, CSV ou XLSX</span>
            </button>
            <p className="text-center text-xs text-muted-foreground">
              O arquivo é lido no próprio aparelho; nada é enviado para serviços externos.
            </p>
            {fileName && !loading ? (
              <p className="text-center text-xs text-muted-foreground">{fileName}: nenhuma transação lida.</p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl bg-secondary/60 px-4 py-3 text-sm">
              <p className="font-medium">{fileName}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {selected.length} de {rows.length} selecionados · entradas {brl(totals.income)} · saídas{" "}
                {brl(totals.expense)}
              </p>
              {totals.duplicates > 0 ? (
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <AlertTriangle className="h-3 w-3" /> {totals.duplicates} possível(is) duplicado(s)
                  desmarcado(s)
                </p>
              ) : null}
            </div>

            <div className="max-h-[42vh] space-y-2 overflow-y-auto pr-1">
              {rows.map((r) => (
                <div
                  key={r.id}
                  className={cn(
                    "rounded-2xl border border-border p-3 transition-colors",
                    r.selected ? "bg-card" : "bg-transparent opacity-60",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={r.selected}
                      onChange={(e) => patch(r.id, { selected: e.target.checked })}
                      className="h-4 w-4 accent-[hsl(var(--primary))]"
                      aria-label="Incluir lançamento"
                    />
                    <button
                      type="button"
                      onClick={() => setEditing(editing === r.id ? null : r.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-sm font-medium">{r.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.date.split("-").reverse().join("/")}
                        {r.duplicate ? " · possível duplicado" : ""}
                      </p>
                    </button>
                    <span
                      className={cn(
                        "text-sm tabular-nums",
                        r.type === "income" ? "text-primary" : "text-foreground",
                      )}
                    >
                      {r.type === "income" ? "+" : "-"}
                      {brl(r.amount)}
                    </span>
                  </div>

                  {editing === r.id ? (
                    <div className="mt-3 space-y-3 border-t border-border pt-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Data</Label>
                          <Input
                            type="date"
                            value={r.date}
                            onChange={(e) => patch(r.id, { date: e.target.value })}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Valor</Label>
                          <Input
                            inputMode="decimal"
                            value={String(r.amount)}
                            onChange={(e) =>
                              patch(r.id, { amount: Math.abs(Number(e.target.value.replace(",", "."))) || 0 })
                            }
                            className="mt-1"
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Descrição</Label>
                        <Input
                          value={r.description}
                          onChange={(e) => patch(r.id, { description: e.target.value })}
                          className="mt-1"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2 rounded-full bg-secondary p-1">
                        {(["expense", "income"] as const).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => patch(r.id, { type: t, categoryId: null })}
                            className={cn(
                              "rounded-full py-1.5 text-xs font-medium transition-colors",
                              r.type === t ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                            )}
                          >
                            {t === "expense" ? "Despesa" : "Receita"}
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {categories
                          .filter((c) => c.kind === r.type)
                          .map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => patch(r.id, { categoryId: r.categoryId === c.id ? null : c.id })}
                              className={cn(
                                "rounded-full border px-3 py-1.5 text-xs transition-colors",
                                r.categoryId === c.id
                                  ? "border-primary bg-primary/15 text-primary"
                                  : "border-border text-muted-foreground",
                              )}
                            >
                              {c.name}
                            </button>
                          ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {PAYMENT_METHODS.map((m) => (
                          <button
                            key={m.value}
                            type="button"
                            onClick={() => patch(r.id, { paymentMethod: m.value })}
                            className={cn(
                              "rounded-full border px-3 py-1.5 text-xs transition-colors",
                              r.paymentMethod === m.value
                                ? "border-foreground bg-accent text-foreground"
                                : "border-border text-muted-foreground",
                            )}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                      {r.paymentMethod === "credito" && cards.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {cards.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => patch(r.id, { cardId: r.cardId === c.id ? null : c.id })}
                              className={cn(
                                "rounded-full border px-3 py-1.5 text-xs",
                                r.cardId === c.id
                                  ? "border-transparent text-white"
                                  : "border-border text-muted-foreground",
                              )}
                              style={r.cardId === c.id ? { background: c.color } : undefined}
                            >
                              {c.name}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setRows((prev) => prev.filter((x) => x.id !== r.id))}
                        className="flex items-center gap-1 text-xs text-destructive"
                      >
                        <Trash2 className="h-3 w-3" /> Remover da importação
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={reset}
                className="h-12 flex-1 rounded-full"
                disabled={importTx.isPending}
              >
                Cancelar
              </Button>
              <Button
                onClick={confirm}
                disabled={selected.length === 0 || importTx.isPending}
                className="h-12 flex-1 rounded-full text-base font-semibold"
              >
                {importTx.isPending ? "Importando..." : `Importar ${selected.length}`}
              </Button>
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
