import type { ReidRequest } from "@/types/chat";

export interface StreamReidOptions {
  /** Called once with the resolved server-side sessionId, taken from the
   *  X-Reid-Session-Id response header, BEFORE the first chunk is yielded. */
  onSession?: (sessionId: string) => void;
  /** Optional AbortSignal for cancellation. */
  signal?: AbortSignal;
}

export async function* streamReid(
  req: ReidRequest,
  options: StreamReidOptions = {},
): AsyncGenerator<string> {
  const res = await fetch("/api/reid", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal: options.signal,
  });
  if (!res.ok || !res.body) throw new Error(`reid ${res.status}`);

  const sessionId = res.headers.get("X-Reid-Session-Id");
  if (sessionId && options.onSession) {
    options.onSession(sessionId);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) yield decoder.decode(value, { stream: true });
  }
}
