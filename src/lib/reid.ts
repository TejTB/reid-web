import type { ReidRequest } from "@/types/chat";

export interface StreamReidOptions {
  /** Called once with the resolved server-side sessionId, taken from the
   *  X-Reid-Session-Id response header, BEFORE the first chunk is yielded. */
  onSession?: (sessionId: string) => void;
  /** Optional AbortSignal for cancellation. */
  signal?: AbortSignal;
}

/** Thrown when /api/reid returns 429 with `error: "daily_limit_exceeded"`.
 *  Lets the chat UI distinguish the paywall trigger from a transient blip
 *  so it can open the paywall modal instead of showing "Give me a moment." */
export class DailyLimitError extends Error {
  readonly remaining: number;
  constructor(remaining: number) {
    super("daily_limit_exceeded");
    this.name = "DailyLimitError";
    this.remaining = remaining;
  }
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
  if (res.status === 429) {
    let remaining = 0;
    try {
      const body = (await res.json()) as {
        error?: string;
        remaining?: number;
      };
      remaining = typeof body.remaining === "number" ? body.remaining : 0;
      if (body.error === "daily_limit_exceeded") {
        throw new DailyLimitError(remaining);
      }
    } catch (err) {
      if (err instanceof DailyLimitError) throw err;
      // Body wasn't JSON — fall through to the generic error.
    }
    throw new Error(`reid 429`);
  }
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
