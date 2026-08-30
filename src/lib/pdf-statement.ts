/**
 * Local PDF text extraction (runs entirely in the browser, nothing is uploaded).
 * Returns one string per visual line, in reading order, across all pages.
 */
export async function extractPdfLines(data: ArrayBuffer): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const doc = await pdfjs.getDocument({ data }).promise;
  const lines: string[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const buckets = new Map<number, { x: number; text: string }[]>();

    for (const item of content.items as Array<{ str?: string; transform?: number[] }>) {
      const text = item.str ?? "";
      if (!text.trim()) continue;
      const tr = item.transform ?? [];
      const x = Number(tr[4] ?? 0);
      const y = Math.round(Number(tr[5] ?? 0) / 3) * 3; // tolerate small baseline jitter
      const bucket = buckets.get(y) ?? [];
      bucket.push({ x, text });
      buckets.set(y, bucket);
    }

    const ordered = [...buckets.entries()].sort((a, b) => b[0] - a[0]);
    for (const [, items] of ordered) {
      const line = items
        .sort((a, b) => a.x - b.x)
        .map((i) => i.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (line) lines.push(line);
    }
    page.cleanup();
  }

  await doc.cleanup();
  return lines;
}
