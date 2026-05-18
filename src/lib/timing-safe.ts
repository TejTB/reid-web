import { timingSafeEqual } from "node:crypto";

/** Constant-time string comparison. Returns false on length mismatch
 *  without timing leak. */
export function safeEqual(a: string | null | undefined, b: string): boolean {
  if (!a) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
