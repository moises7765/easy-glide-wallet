import { Camera, Image as ImageIcon, Loader2, Paperclip, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { ReceiptViewer } from "@/components/ReceiptViewer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { isPdfReceipt, removeReceipt, uploadReceipt, type ReceiptRef } from "@/lib/receipts";

export function ReceiptField({
  value,
  onChange,
}: {
  value: ReceiptRef | null;
  onChange: (value: ReceiptRef | null) => void;
}) {
  const pickRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(false);

  async function handleFile(file: File | undefined | null) {
    if (!file) return;
    setBusy(true);
    try {
      const uploaded = await uploadReceipt(file);
      if (value) await removeReceipt(value.path);
      onChange(uploaded);
      toast.success("Comprovante anexado");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (!value) return;
    setBusy(true);
    try {
      await removeReceipt(value.path);
      onChange(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Label className="text-xs text-muted-foreground">Comprovante</Label>

      <input
        ref={pickRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {value ? (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewing(true)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-border px-3 py-2 text-left text-sm"
          >
            <Paperclip className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">
              {isPdfReceipt(value.mime, value.path) ? "PDF anexado" : "Imagem anexada"}
            </span>
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">Ver</span>
          </button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 rounded-full"
            disabled={busy}
            onClick={() => pickRef.current?.click()}
            aria-label="Substituir comprovante"
          >
            <ImageIcon className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 rounded-full text-destructive"
            disabled={busy}
            onClick={() => void clear()}
            aria-label="Remover comprovante"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="mt-2 flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-10 flex-1 rounded-full text-sm"
            disabled={busy}
            onClick={() => pickRef.current?.click()}
          >
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="mr-2 h-4 w-4" />
            )}
            Anexar comprovante
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 rounded-full"
            disabled={busy}
            onClick={() => cameraRef.current?.click()}
            aria-label="Tirar foto do comprovante"
          >
            <Camera className="h-4 w-4" />
          </Button>
        </div>
      )}

      <ReceiptViewer
        path={viewing && value ? value.path : null}
        mime={value?.mime}
        onClose={() => setViewing(false)}
      />
    </div>
  );
}
