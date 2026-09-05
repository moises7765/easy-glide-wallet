import { useEffect, useState } from "react";

import { BottomSheet } from "@/components/finance-ui";
import { Button } from "@/components/ui/button";
import { isPdfReceipt, receiptUrl } from "@/lib/receipts";

export function ReceiptViewer({
  path,
  mime,
  onClose,
}: {
  path: string | null;
  mime?: string | null;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setUrl(null);
    setError(null);
    if (!path) return;
    receiptUrl(path)
      .then((u) => active && setUrl(u))
      .catch((e: Error) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [path]);

  const pdf = isPdfReceipt(mime, path);

  return (
    <BottomSheet open={Boolean(path)} onOpenChange={(v) => !v && onClose()} title="Comprovante">
      <div className="space-y-3">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {!url && !error ? <p className="text-sm text-muted-foreground">Carregando…</p> : null}
        {url && !pdf ? (
          <img
            src={url}
            alt="Comprovante do lançamento"
            className="max-h-[65vh] w-full rounded-2xl object-contain"
          />
        ) : null}
        {url ? (
          <Button
            variant="outline"
            className="h-11 w-full rounded-full"
            onClick={() => window.open(url, "_blank", "noopener")}
          >
            {pdf ? "Abrir PDF" : "Abrir em tela cheia"}
          </Button>
        ) : null}
      </div>
    </BottomSheet>
  );
}
