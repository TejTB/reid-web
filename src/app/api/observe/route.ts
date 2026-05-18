// POST /api/observe
//
// Sprint 7 Agent 3 — Reid's post-session observation pass.
//
// Given a `sessionId`, this endpoint pulls every message in that session,
// hands them to Anthropic with a clinical-notes system prompt, parses the
// JSON response, and writes 1–2 categorised observations into
// public.observations.
//
// Triggering: lazy. The /observations page checks for observations on the
// most recently ended session before rendering; if none exist, it POSTs here
// first. There is no inline trigger inside /api/reid because that route is
// off-limits to Agent 3.
//
// Auth: reuses `getAuthedUser` so RLS on `observations` and `messages`
// evaluates against the signed-in user. No service-role bypass.

import type { NextRequest } from "next/server";
import { z } from "zod";
import { anthropic, REID_MODEL } from "@/lib/anthropic";
import { getAuthedUser } from "@/lib/supabase-auth";
import type { ObservationCategory } from "@/types/db";

const observeRequestSchema = z.object({
  sessionId: z.string().uuid(),
});

const OBSERVE_SYSTEM_PROMPT = `You are Reid. Brutally observant. You notice patterns people don't see in themselves. After each session you write private clinical notes.
1-2 observations max. Sharp and specific. Not therapeutic — diagnostic.
Return JSON only, no markdown:
{ "observations": [ { "text": "...", "category": "avoidance" | "pattern" | "contradiction" | "strength" } ] }`;

const observationItemSchema = z.object({
  text: z.string().min(1).max(400),
  category: z.enum(["avoidance", "pattern", "contradiction", "strength"]),
});

const modelResponseSchema = z.object({
  observations: z.array(observationItemSchema).max(2),
});

interface InsertResult {
  inserted: number;
  skipped: number;
}

/** Extracts the first balanced JSON object from a string. Anthropic
 *  occasionally wraps the JSON in prose or a single ```json fence even when
 *  asked not to; this peels both. Returns null if no object is found. */
function extractJsonObject(raw: string): string | null {
  const fenceStripped = raw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");
  const firstBrace = fenceStripped.indexOf("{");
  if (firstBrace === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = firstBrace; i < fenceStripped.length; i++) {
    const ch = fenceStripped[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return fenceStripped.slice(firstBrace, i + 1);
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  const authed = await getAuthedUser(req);
  if (!authed) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = authed.supabase;
  const authUser = authed.user;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const parsedBody = observeRequestSchema.safeParse(body);
  if (!parsedBody.success) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const { sessionId } = parsedBody.data;

  const { data: meRow } = await db
    .from("users")
    .select("id")
    .eq("auth_id", authUser.id)
    .maybeSingle();
  if (!meRow?.id) {
    return Response.json({ error: "user not provisioned" }, { status: 401 });
  }
  const userId = meRow.id as string;

  // Confirm the session belongs to this user before doing any LLM work.
  const { data: sessionRow } = await db
    .from("sessions")
    .select("id, user_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!sessionRow || sessionRow.user_id !== userId) {
    return Response.json({ error: "session not found" }, { status: 404 });
  }

  // Short-circuit if observations already exist for this session — the page
  // calls /api/observe lazily and we never want duplicates.
  const { count: existingCount } = await db
    .from("observations")
    .select("id", { head: true, count: "exact" })
    .eq("user_id", userId)
    .eq("session_id", sessionId);
  if ((existingCount ?? 0) > 0) {
    return Response.json({ inserted: 0, skipped: existingCount ?? 0, reused: true });
  }

  const { data: messageRows } = await db
    .from("messages")
    .select("role, content, created_at")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  const messages = (messageRows ?? []) as Array<{
    role: "user" | "assistant";
    content: string;
  }>;

  // Need at least one of each side for the model to have anything diagnostic
  // to say. Sub-threshold sessions return cleanly with nothing inserted.
  if (messages.length < 4) {
    return Response.json({ inserted: 0, skipped: 0, tooShort: true });
  }

  // Flatten the session into a single user turn so the system prompt does the
  // role-play and the model treats the transcript as the data to analyse.
  const transcript = messages
    .map(
      (m) =>
        `${m.role === "assistant" ? "Reid" : "Founder"}: ${m.content.replace(/\s+/g, " ").trim()}`,
    )
    .join("\n");

  let rawText: string;
  try {
    const response = await anthropic.messages.create({
      model: REID_MODEL,
      max_tokens: 512,
      system: OBSERVE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Session transcript follows. Write your observations.\n\n${transcript}`,
        },
      ],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return Response.json({ error: "no text response" }, { status: 502 });
    }
    rawText = textBlock.text;
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[api/observe] anthropic failed:", message);
    return Response.json(
      { error: "service_unavailable" },
      { status: 502 },
    );
  }

  const jsonSlice = extractJsonObject(rawText);
  if (!jsonSlice) {
    return Response.json({ error: "no_json", inserted: 0 }, { status: 502 });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(jsonSlice);
  } catch {
    return Response.json({ error: "bad_json", inserted: 0 }, { status: 502 });
  }

  const validated = modelResponseSchema.safeParse(parsedJson);
  if (!validated.success) {
    return Response.json(
      { error: "schema_invalid", inserted: 0 },
      { status: 502 },
    );
  }

  const result: InsertResult = { inserted: 0, skipped: 0 };
  for (const obs of validated.data.observations) {
    const text = obs.text.trim();
    if (!text) {
      result.skipped += 1;
      continue;
    }
    const category: ObservationCategory = obs.category;
    const { error } = await db.from("observations").insert({
      user_id: userId,
      session_id: sessionId,
      text,
      category,
    });
    if (error) {
      result.skipped += 1;
      continue;
    }
    result.inserted += 1;
  }

  return Response.json({
    inserted: result.inserted,
    skipped: result.skipped,
  });
}
