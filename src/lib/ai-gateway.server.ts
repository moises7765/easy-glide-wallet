export function createLovableAiRunFetch(initialRunId?: string | null) {
  let runId = initialRunId ?? null;
  const wrappedFetch: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    if (runId) headers.set("X-Lovable-AIG-Run-ID", runId);
    const response = await fetch(input, { ...init, headers });
    runId = response.headers.get("X-Lovable-AIG-Run-ID") ?? runId;
    return response;
  };
  return { fetch: wrappedFetch, getRunId: () => runId };
}