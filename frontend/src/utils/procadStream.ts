export type ProcadStreamEvent = {
  type: string;
  message?: string;
  step?: number;
  stepName?: string;
  iteration?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  trace?: string;
  steps?: string[];
  questions?: string[];
  answers?: string[];
  drawingSpec?: Record<string, unknown>;
};

export async function consumeProcadStream(
  url: string,
  body: Record<string, unknown>,
  onEvent: (event: ProcadStreamEvent) => void
): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      text.includes("Cannot POST")
        ? `API ${url} is unavailable (service may be outdated). Please restart the frontend.`
        : text || `Stream request failed (${response.status})`
    );
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    const text = await response.text();
    throw new Error(
      text.slice(0, 200) || `Unexpected response type: ${contentType}`
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body for stream");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";

    for (const chunk of chunks) {
      const line = chunk
        .split("\n")
        .find((l) => l.startsWith("data: "));
      if (!line) continue;
      try {
        const payload = JSON.parse(line.slice(6)) as ProcadStreamEvent;
        onEvent(payload);
      } catch {
        // ignore malformed chunks
      }
    }
  }
}
