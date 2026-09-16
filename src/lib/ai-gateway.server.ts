const RUN_ID_HEADER = "X-Lovable-AIG-Run-ID";

export function createLovableAiRunFetch(initialRunId?: string | null) {
  let runId = initialRunId?.trim() || undefined;
  let resolveRunId: (value: string | undefined) => void = () => {};
  let resolved = false;
  const ready = new Promise<string | undefined>((resolve) => {
    resolveRunId = resolve;
  });
  const publish = (value?: string) => {
    if (!runId && value?.trim()) runId = value.trim();
    if (!resolved) {
      resolved = true;
      resolveRunId(runId);
    }
  };
  if (runId) publish(runId);
  const wrappedFetch: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    if (runId && !headers.has(RUN_ID_HEADER)) headers.set(RUN_ID_HEADER, runId);
    try {
      const response = await fetch(input, { ...init, headers });
      publish(response.headers.get(RUN_ID_HEADER) ?? undefined);
      return response;
    } catch (error) {
      publish();
      throw error;
    }
  };
  return { fetch: wrappedFetch, getRunId: () => runId, waitForRunId: () => (runId ? Promise.resolve(runId) : ready) };
}

export async function withLovableRunId(response: Response, run: ReturnType<typeof createLovableAiRunFetch>) {
  if (!response.body) return response;
  const reader = response.body.getReader();
  const firstChunk = reader.read();
  const runId = await run.waitForRunId();
  const headers = new Headers(response.headers);
  if (runId) headers.set(RUN_ID_HEADER, runId);
  headers.set("Access-Control-Expose-Headers", RUN_ID_HEADER);
  const body = new ReadableStream({
    async start(controller) {
      try {
        const first = await firstChunk;
        if (!first.done) controller.enqueue(first.value);
        while (!first.done) {
          const chunk = await reader.read();
          if (chunk.done) break;
          controller.enqueue(chunk.value);
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}