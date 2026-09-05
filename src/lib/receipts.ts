import { supabase } from "@/integrations/supabase/client";

export const RECEIPT_BUCKET = "receipts";
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_MAX_SIDE = 1600;
const IMAGE_QUALITY = 0.72;

export type ReceiptRef = { path: string; mime: string };

function extFor(mime: string, fallbackName: string) {
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime.startsWith("image/")) return "jpg";
  const dot = fallbackName.lastIndexOf(".");
  return dot > -1 ? fallbackName.slice(dot + 1).toLowerCase() : "bin";
}

export function isReceiptTypeAllowed(file: File) {
  return file.type === "application/pdf" || file.type.startsWith("image/");
}

/** Downscale images in the browser so uploads stay small. PDFs pass through. */
export async function compressReceipt(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || typeof document === "undefined") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 600 * 1024) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", IMAGE_QUALITY),
    );
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

/** Uploads a receipt into the signed-in user's folder and returns its reference. */
export async function uploadReceipt(file: File): Promise<ReceiptRef> {
  if (!isReceiptTypeAllowed(file)) throw new Error("Formato não suportado. Use imagem ou PDF.");
  if (file.size > RECEIPT_MAX_BYTES) throw new Error("Arquivo muito grande (máx. 10 MB).");

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Sessão expirada");

  const blob = await compressReceipt(file);
  const mime = blob.type || file.type || "application/octet-stream";
  const path = `${auth.user.id}/${crypto.randomUUID()}.${extFor(mime, file.name)}`;

  const { error } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .upload(path, blob, { contentType: mime, upsert: false });
  if (error) throw new Error(error.message);
  return { path, mime };
}

export async function removeReceipt(path: string | null | undefined) {
  if (!path) return;
  await supabase.storage.from(RECEIPT_BUCKET).remove([path]);
}

export async function receiptUrl(path: string) {
  const { data, error } = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrl(path, 3600);
  if (error || !data) throw new Error(error?.message ?? "Não foi possível abrir o comprovante");
  return data.signedUrl;
}

export function isPdfReceipt(mime: string | null | undefined, path?: string | null) {
  return mime === "application/pdf" || Boolean(path?.toLowerCase().endsWith(".pdf"));
}
