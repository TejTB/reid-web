import type { ReidRequest } from "@/types/chat";

export async function* streamReid(req: ReidRequest): AsyncGenerator<string> {
  const res = await fetch("/api/reid", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok || !res.body) throw new Error(`reid ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) yield decoder.decode(value, { stream: true });
  }
}
