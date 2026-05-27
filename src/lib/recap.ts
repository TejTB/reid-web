export type RecapPayload = {
  title: string;
  summary: string;
  commitments: string[];
  reid_note: string;
  avoiding: string;
  mood: string;
};

// Loosely validate the model's JSON output — clamp lengths so a hallucination
// can't blow up the recap overlay. The recap is always best-effort: a partial
// recap is still better than no recap.
export function clampRecap(raw: unknown): RecapPayload {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const str = (v: unknown, max: number): string =>
    typeof v === "string" ? v.trim().slice(0, max) : "";
  const commitments = Array.isArray(obj.commitments)
    ? obj.commitments
        .filter((c): c is string => typeof c === "string")
        .map((c) => c.trim().slice(0, 160))
        .filter((c) => c.length > 0)
        .slice(0, 6)
    : [];
  return {
    title: str(obj.title, 60),
    summary: str(obj.summary, 400),
    commitments,
    reid_note: str(obj.reid_note, 200),
    avoiding: str(obj.avoiding, 200),
    mood: str(obj.mood, 40),
  };
}
