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
    const positioned: { x: number; y: number; height: number; text: string }[] = [];

    for (const item of content.items as Array<{ str?: string; transform?: number[] }>) {
      const text = item.str ?? "";
      if (!text.trim()) continue;
      const tr = item.transform ?? [];
      const x = Number(tr[4] ?? 0);
      const y = Number(tr[5] ?? 0);
      const height = Math.max(Math.abs(Number(tr[3] ?? 0)), Math.abs(Number(tr[0] ?? 0)), 8);
      positioned.push({ x, y, height, text });
    }

    // PDF text baselines frequently differ by a few fractional points even for
    // cells in the same visual row. Cluster by proximity instead of rounding,
    // which could put adjacent columns into different lines at bucket edges.
    const visualLines: { y: number; tolerance: number; items: { x: number; text: string }[] }[] = [];
    for (const item of positioned.sort((a, b) => b.y - a.y || a.x - b.x)) {
      const tolerance = Math.max(2.5, Math.min(6, item.height * 0.45));
      const line = visualLines.find((candidate) => Math.abs(candidate.y - item.y) <= Math.max(candidate.tolerance, tolerance));
      if (line) {
        line.items.push({ x: item.x, text: item.text });
        line.y = (line.y * (line.items.length - 1) + item.y) / line.items.length;
        line.tolerance = Math.max(line.tolerance, tolerance);
      } else {
        visualLines.push({ y: item.y, tolerance, items: [{ x: item.x, text: item.text }] });
      }
    }

    for (const { items } of visualLines.sort((a, b) => b.y - a.y)) {
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
