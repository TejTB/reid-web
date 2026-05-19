import type { NextRequest } from "next/server";
import { anthropic, REID_MODEL, buildSystemPrompt } from "@/lib/anthropic";
import { getAuthedUser } from "@/lib/supabase-auth";
import { extractName } from "@/lib/reid-summary";
import { getReidContext } from "@/lib/reid-context";
import {
  parseSentinels,
  processSentinels,
  SENTINEL_PREFIXES,
  MAX_SENTINEL_PREFIX_LEN,
} from "@/lib/reid-sentinels";
import {
  createSession,
  sessionBelongsTo,
  appendMessages,
  endSession,
  createGoalsFromOnboarding,
} from "@/lib/session-server";
import { reidRequestSchema } from "@/lib/validation";
import { checkDailyMessageLimit, checkReidMinuteLimit } from "@/lib/ratelimit";
import { FREE_SESSIONS } from "@/lib/session-shared";

// ----- SentinelStripper ---------------------------------------------------
//
// Removes every Reid sentinel from a token stream BEFORE it reaches the
// client. Sentinels can land mid-stream, so we cannot wait for the model to
// finish before emitting -- we'd lose the typewriter UX. Instead we keep a
// lookahead buffer big enough to spot the start of any sentinel prefix.
//
// Algorithm: maintain a `pending` string. On each push of new tokens:
//   1. While not currently inside a sentinel, scan `pending` for `[`.
//   2. Everything before the next `[` is safe to emit.
//   3. Once we see `[`, decide:
//        - exact match against a known sentinel prefix => enter sentinel mode
//        - the `[...]` could still grow into a known prefix => hold and wait
//        - definitely not a known prefix => emit the `[` and continue scanning
//   4. While inside a sentinel, accumulate until we can either match a
//      terminating pattern (closing quote, closing bracket, newline) or the
//      sentinel grows past a hard cap. Drop the whole thing on terminate.
//
// On flush() at end-of-stream we make one last regex pass over whatever is
// still pending to guarantee no malformed sentinel slips through.

const SENTINEL_HARD_CAP = 4096;
// Final-pass regexes -- mirror reid-sentinels.ts so flush() catches anything
// the streaming filter missed (malformed or truncated sentinels).
const FLUSH_SENTINEL_LINE_RE =
  /\[(GOAL_UPDATE|SESSION_COMPLETE|ONBOARDING_COMPLETE|EMAIL_CAPTURED|NAME_CAPTURED|OBSERVATION)\][^\n]*/g;
const FLUSH_ONBOARDING_BLOCK_RE =
  /\[ONBOARDING_COMPLETE\][\s\S]*?goals=\[[\s\S]*?\]/g;

/** Returns true iff `s` is a strict prefix (not equal to) any sentinel. */
function isPartialPrefix(s: string): boolean {
  for (const prefix of SENTINEL_PREFIXES) {
    if (prefix.startsWith(s) && prefix.length > s.length) return true;
  }
  return false;
}

/** Returns true iff `s` starts with a complete sentinel prefix. */
function startsWithSentinel(s: string): string | null {
  for (const prefix of SENTINEL_PREFIXES) {
    if (s.startsWith(prefix)) return prefix;
  }
  return null;
}

class SentinelStripper {
  private pending = "";
  private inSentinel: string | null = null; // which sentinel prefix we are inside
  private sentinelBuffer = "";

  /** Pushes new model tokens through the stripper and returns the text safe
   *  to emit to the client (may be empty). */
  push(chunk: string): string {
    this.pending += chunk;
    let out = "";

    // Outer loop: keep processing until nothing left to decide on this push.
    while (this.pending.length > 0) {
      if (this.inSentinel) {
        // Accumulate into the sentinel buffer until we can terminate.
        this.sentinelBuffer += this.pending;
        this.pending = "";
        const terminated = this.tryTerminateSentinel();
        if (terminated) {
          // Anything after the sentinel goes back into pending for the next
          // pass.
          this.pending = terminated.leftover;
          this.inSentinel = null;
          this.sentinelBuffer = "";
          continue;
        }
        // Sentinel still open; nothing to emit this round.
        break;
      }

      // Not inside a sentinel. Look for the next `[`.
      const bracketIdx = this.pending.indexOf("[");
      if (bracketIdx === -1) {
        // No `[` in pending. We can emit almost everything -- except a
        // trailing chunk small enough to still grow into a `[`.
        // (`[` is a single char, but a sentinel prefix could only start with
        //  `[`, so without a `[` we can flush everything except... actually
        //  nothing -- the next token might start with `[`. But we don't need
        //  to hold for that; we'd detect it on the next push.)
        out += this.pending;
        this.pending = "";
        break;
      }

      // Emit everything before the bracket.
      if (bracketIdx > 0) {
        out += this.pending.slice(0, bracketIdx);
        this.pending = this.pending.slice(bracketIdx);
      }

      // pending now starts with `[`. Check if it's a known sentinel.
      const full = startsWithSentinel(this.pending);
      if (full) {
        this.inSentinel = full;
        this.sentinelBuffer = this.pending.slice(0, full.length);
        this.pending = this.pending.slice(full.length);
        continue;
      }

      // Could pending GROW into a known sentinel? Take everything up to the
      // first non-[A-Z_]] char and ask.
      const tag = this.pending.match(/^\[[A-Z_]*/);
      const head = tag ? tag[0] : this.pending;
      // If pending has more chars AFTER the uppercase run, those chars
      // disprove the partial-prefix hypothesis — no sentinel uses lowercase
      // letters or digits in its prefix, and the closing `]` would have
      // already been consumed by startsWithSentinel above.
      const hasDisprovingTrailer =
        tag !== null && this.pending.length > head.length;
      if (
        !hasDisprovingTrailer &&
        isPartialPrefix(head) &&
        head.length < MAX_SENTINEL_PREFIX_LEN
      ) {
        // Need more tokens. Hold the bracket portion in pending and stop.
        break;
      }

      // Not a sentinel start; emit the bracket and keep scanning.
      out += this.pending.charAt(0);
      this.pending = this.pending.slice(1);
    }

    return out;
  }

  /** Tries to find the end of the currently-open sentinel inside
   *  `sentinelBuffer`. On success returns the leftover string that comes
   *  after the sentinel. On failure returns null. Also enforces the hard
   *  cap: if the buffer grows past it, the sentinel is treated as malformed
   *  and dropped up to the next newline.
   *
   *  Termination strategy: each sentinel has a known shape ending in either
   *  `]` (ONBOARDING_COMPLETE's goals array) or `"` (the others). We need to
   *  find the LAST close of that shape, not the first -- the model may have
   *  emitted enough chars after the sentinel to prove it's done, or might
   *  still be writing it. The safe rule:
   *
   *    1. Run the matching regex against `buf`.
   *    2. If it matches, slice off the matched range and return the rest as
   *       leftover.
   *    3. Otherwise hold.
   *
   *  But the regex requires the full final structure. For partial buffers,
   *  the regex won't match. We additionally accept termination when we see
   *  a clear out-of-sentinel character (`\n` for line-terminated sentinels)
   *  after at least the minimal required attributes are present.
   */
  private tryTerminateSentinel(): { leftover: string } | null {
    if (!this.inSentinel) return null;
    const buf = this.sentinelBuffer;

    if (this.inSentinel === "[ONBOARDING_COMPLETE]") {
      // Terminated by the balanced closing `]` of the goals array.
      const goalsIdx = buf.indexOf("goals=[");
      if (goalsIdx !== -1) {
        const openIdx = goalsIdx + "goals=".length;
        let depth = 0;
        let endIdx = -1;
        let inString = false;
        let escape = false;
        for (let i = openIdx; i < buf.length; i++) {
          const ch = buf[i];
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
          if (ch === "[") depth++;
          else if (ch === "]") {
            depth--;
            if (depth === 0) {
              endIdx = i;
              break;
            }
          }
        }
        if (endIdx !== -1) {
          return { leftover: buf.slice(endIdx + 1) };
        }
      }
    } else {
      // The three single-line sentinels end at a `\n` after at least one
      // quoted attribute pair has closed. Detection rule: look for the
      // FIRST `\n` whose position is past the final closing `"` of the last
      // recognised attribute. If no newline yet, hold and wait -- the model
      // is still writing.
      const newlineIdx = buf.indexOf("\n");
      if (newlineIdx !== -1) {
        // Must have at least 2 quotes before the newline (one attribute
        // closed). If not, the newline came too early and we treat the
        // whole prefix-line as a malformed sentinel anyway.
        const upToNewline = buf.slice(0, newlineIdx);
        const quoteCount = (upToNewline.match(/"/g) ?? []).length;
        if (quoteCount >= 2 && quoteCount % 2 === 0) {
          return { leftover: buf.slice(newlineIdx + 1) };
        }
        // Malformed: a newline inside the sentinel before the first
        // attribute closed. Drop up to and including the newline.
        return { leftover: buf.slice(newlineIdx + 1) };
      }
      // No newline yet -- might still be mid-sentinel. Try the regex but be
      // careful about optional trailing attributes: a [GOAL_UPDATE] without
      // a note= clause looks identical to one whose note= clause hasn't
      // landed yet. We only terminate via regex when the trailing chars
      // cannot grow into the optional attribute.
      let re: RegExp | null = null;
      let optionalAttrStart: string | null = null;
      if (this.inSentinel === "[GOAL_UPDATE]") {
        re =
          /^\[GOAL_UPDATE\]\s*goalTitle="[^"]*"\s+delta=-?\d+(?:\.\d+)?\s*(?:note="[^"]*")?/;
        optionalAttrStart = "note=";
      } else if (this.inSentinel === "[SESSION_COMPLETE]") {
        re = /^\[SESSION_COMPLETE\]\s*summary="[^"]*"\s*(?:task="[^"]*")?/;
        optionalAttrStart = "task=";
      } else if (this.inSentinel === "[EMAIL_CAPTURED]") {
        re = /^\[EMAIL_CAPTURED\]\s*email="[^"]+"/;
        optionalAttrStart = null;
      } else if (this.inSentinel === "[NAME_CAPTURED]") {
        re = /^\[NAME_CAPTURED\]\s*name="[^"]+"/;
        optionalAttrStart = null;
      }
      if (re) {
        const m = buf.match(re);
        if (m) {
          const matchedLen = m[0].length;
          // If the regex matched the FULL buf, we can't tell yet whether
          // there's more (optional attr) coming. Hold.
          if (buf.length > matchedLen) {
            const trailing = buf.slice(matchedLen);
            // If we still have an optional attr that hasn't fired and the
            // trailing chars could grow into it, hold. The check: trailing
            // starts with whitespace followed by a (prefix of) the optional
            // attr name. Examples we must hold: ` `, `  `, ` n`, ` no`,
            // ` note`, ` note=`, ` note="x` -- the regex above already
            // matched the FULL optional form when it was complete, so if
            // we're here with trailing starting with a (prefix of) the
            // optional name, it's mid-emit.
            let couldExtend = false;
            if (optionalAttrStart) {
              // Check if matched form already includes optional attr; if so
              // no further extension possible.
              const matched = m[0];
              const alreadyHasAttr = matched.includes(optionalAttrStart);
              if (!alreadyHasAttr) {
                // trailing must be: (optional whitespace)(prefix of optionalAttrStart)
                // -- e.g. ` n`, ` no`, ` not`, ` note`, ` note=`, ` note="`,
                // ` note="value`. We test by stripping leading whitespace
                // and asking whether the rest is a prefix of the attr name
                // OR starts with the attr name and an open `"`.
                const lead = trailing.replace(/^\s*/, "");
                if (lead.length === 0) {
                  couldExtend = true;
                } else if (
                  optionalAttrStart.startsWith(lead) ||
                  lead.startsWith(optionalAttrStart)
                ) {
                  couldExtend = true;
                }
              }
            }
            if (!couldExtend) {
              return { leftover: trailing };
            }
          }
        }
      }
    }

    // Hard cap: bail and drop up to the next newline (or all of it).
    if (buf.length > SENTINEL_HARD_CAP) {
      const nl = buf.indexOf("\n");
      const leftover = nl === -1 ? "" : buf.slice(nl + 1);
      return { leftover };
    }

    return null;
  }

  /** Flushes any remaining buffered text at end of stream. Runs a final
   *  regex pass over the leftover to strip any sentinel that the streaming
   *  filter didn't catch (truncated or malformed). */
  flush(): string {
    let remainder = "";
    if (this.inSentinel) {
      // Sentinel never terminated. Drop the lead-in entirely.
      this.inSentinel = null;
      this.sentinelBuffer = "";
    }
    remainder += this.pending;
    this.pending = "";

    // Final scrub: strip any complete sentinel that landed entirely in a
    // single chunk after the stripper already passed by.
    remainder = remainder.replace(FLUSH_ONBOARDING_BLOCK_RE, "");
    remainder = remainder.replace(FLUSH_SENTINEL_LINE_RE, "");

    // Also drop any trailing partial-sentinel-prefix we may have been
    // holding (e.g. `[GOAL_UPDA` if the stream truncated mid-prefix).
    remainder = remainder.replace(/\[[A-Z_]*$/, "");

    return remainder;
  }
}

// ----- POST handler -------------------------------------------------------

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

  const parsedBody = reidRequestSchema.safeParse(body);
  if (!parsedBody.success) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const { mode, messages } = parsedBody.data;
  let sessionId: string | undefined =
    parsedBody.data.sessionId ?? undefined;

  // Resolve the public.users row for this auth user (created by the
  // on_auth_user_created trigger). Also read the subscription_status so we
  // can decide whether to rate-limit.
  const { data: meRow } = await db
    .from("users")
    .select("id, subscription_status, name")
    .eq("auth_id", authUser.id)
    .maybeSingle();
  if (!meRow?.id) {
    return Response.json({ error: "user not provisioned" }, { status: 401 });
  }
  const userId = meRow.id as string;
  const subscriptionStatus =
    (meRow.subscription_status as string | null) ?? "free";
  const existingName = (meRow.name as string | null) ?? null;

  if (!existingName) {
    const extracted = extractName(messages);
    if (extracted) {
      await db.from("users").update({ name: extracted }).eq("id", userId);
    }
  }

  // Resolve sessionId early so we can decide whether THIS request would
  // create a NEW session — that's what the free-tier session-limit gate
  // cares about. We honor the client-supplied id only if it belongs to this
  // user. We do NOT mint a fresh session yet; that happens below, after the
  // session-limit and daily-rate-limit checks have passed.
  let creatingNewSession = false;
  if (sessionId) {
    const ok = await sessionBelongsTo(db, sessionId, userId);
    if (!ok) {
      sessionId = undefined;
      creatingNewSession = true;
    }
  } else {
    creatingNewSession = true;
  }

  // Free-tier session-limit gate (402). Onboarding is exempt — it's the
  // founder's first interaction with Reid and must always be allowed.
  if (
    creatingNewSession &&
    mode === "chat" &&
    subscriptionStatus !== "pro"
  ) {
    const { count } = await db
      .from("sessions")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", userId)
      .eq("mode", "chat");
    const used = count ?? 0;
    if (used >= FREE_SESSIONS) {
      return Response.json(
        { error: "session_limit_reached", sessionsUsed: used },
        { status: 402 },
      );
    }
  }

  if (subscriptionStatus !== "pro") {
    const rate = await checkDailyMessageLimit(userId);
    if (!rate.allowed) {
      return Response.json(
        { error: "daily_limit_exceeded", remaining: rate.remaining },
        { status: 429 },
      );
    }
  }

  const minute = await checkReidMinuteLimit(userId);
  if (!minute.allowed) {
    return Response.json(
      {
        error: "rate_limit_exceeded",
        retryAfter: minute.retryAfter,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(minute.retryAfter),
          "X-RateLimit-Limit": "8",
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  if (!sessionId) {
    sessionId = await createSession(
      db,
      userId,
      mode === "onboarding" ? "onboarding" : "chat",
    );
  }

  // Legacy conversations table: keep writing the user turn so existing
  // history-loading code (chat page) continues to work during the migration.
  const lastMessage = messages[messages.length - 1];
  // The messages.content column is plain text — it can't hold base64.
  // When the user attached images, persist the text + "[image attached]"
  // marker so chat history readers know an image was sent.
  const lastMessageContentForPersist =
    lastMessage?.role === "user" &&
    lastMessage.images &&
    lastMessage.images.length > 0
      ? `${lastMessage.content} [image attached]`
      : lastMessage?.content ?? "";
  if (lastMessage?.role === "user") {
    await db.from("conversations").insert({
      user_id: userId,
      role: "user",
      content: lastMessageContentForPersist,
    });
  }

  // ----- Build the system prompt with FOUNDER CONTEXT ------------------
  const reidContext = await getReidContext(db, userId);
  const systemPrompt = buildSystemPrompt(reidContext);

  // Build the upstream Anthropic messages array. Only the LAST user message
  // packs in optional images (older messages were persisted text-only). Local
  // type alias keeps us off the SDK's deeply-nested type chain.
  type AnthropicMessageParam = Parameters<
    typeof anthropic.messages.stream
  >[0]["messages"][number];
  const sourceMessages =
    messages.length === 0
      ? [{ role: "user" as const, content: "Begin." }]
      : messages;
  const upstreamMessages: AnthropicMessageParam[] = sourceMessages.map(
    (m, i) => {
      const isLast = i === sourceMessages.length - 1;
      if (
        isLast &&
        m.role === "user" &&
        "images" in m &&
        m.images &&
        m.images.length > 0
      ) {
        const imageBlocks = m.images.map((dataUrl) => {
          const [header, data] = dataUrl.split(",");
          const mediaType = header.slice("data:".length).split(";")[0] as
            | "image/jpeg"
            | "image/png"
            | "image/webp"
            | "image/gif";
          return {
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: mediaType,
              data,
            },
          };
        });
        return {
          role: "user" as const,
          content: [...imageBlocks, { type: "text" as const, text: m.content }],
        };
      }
      return { role: m.role, content: m.content };
    },
  );

  const aStream = anthropic.messages.stream({
    model: REID_MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    messages: upstreamMessages,
  });

  const encoder = new TextEncoder();
  const resolvedSessionId = sessionId;
  const stripper = new SentinelStripper();
  let rawAssistantText = "";

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      aStream.on("text", (delta: string) => {
        if (closed) return;
        rawAssistantText += delta;
        const safe = stripper.push(delta);
        if (safe.length > 0) controller.enqueue(encoder.encode(safe));
      });
      aStream.on("error", (err: Error) => {
        if (closed) return;
        closed = true;
        controller.error(err);
      });
      aStream.on("end", async () => {
        try {
          const tail = stripper.flush();
          if (!closed && tail.length > 0) {
            controller.enqueue(encoder.encode(tail));
          }

          // Parse sentinels from the full raw assistant response.
          const parsed = parseSentinels(rawAssistantText);
          const cleanedAssistantText = parsed.cleanText;

          // Legacy conversations table: persist the assistant turn (clean
          // text) so existing readers keep working.
          await db.from("conversations").insert({
            user_id: userId,
            role: "assistant",
            content: cleanedAssistantText,
          });

          // New sessions/messages tables: append just this turn's new
          // messages -- the trailing user message (if any) and the
          // assistant's full clean reply.
          const newTurnMessages: {
            role: "user" | "assistant";
            content: string;
          }[] = [];
          if (lastMessage?.role === "user") {
            newTurnMessages.push({
              role: "user",
              content: lastMessageContentForPersist,
            });
          }
          newTurnMessages.push({
            role: "assistant",
            content: cleanedAssistantText,
          });
          await appendMessages(db, resolvedSessionId, userId, newTurnMessages);

          // Onboarding completion is handled here (not in processSentinels)
          // because we need the message history to extract the founder's
          // name.
          if (mode === "onboarding" && parsed.onboardingComplete) {
            const ob = parsed.onboardingComplete;
            // Onboarding row is intentionally bare: the summary/task live on
            // `users.onboarding_summary`/`onboarding_task` and the Plan
            // timeline filters out sessions without a summary, so the
            // onboarding row drops out naturally. `bumpUserCounters: false`
            // because onboarding must never count toward `users.session_count`
            // (the chat-session quota is tracked from `sessions.mode='chat'`
            // rows on [SESSION_COMPLETE], not here).
            await endSession(db, resolvedSessionId, {
              userId,
              summary: null,
              taskSet: null,
              messageCountDelta: newTurnMessages.length,
              bumpUserCounters: false,
            });

            const extracted = extractName(messages);
            const update: {
              onboarding_complete: boolean;
              onboarding_summary?: string | null;
              onboarding_task?: string | null;
              onboarding_goals?: unknown;
              name?: string;
            } = { onboarding_complete: true };
            if (ob.summary) update.onboarding_summary = ob.summary;
            if (ob.task) update.onboarding_task = ob.task;
            if (ob.goals.length > 0) update.onboarding_goals = ob.goals;
            if (extracted) {
              const { data: existing } = await db
                .from("users")
                .select("name")
                .eq("id", userId)
                .maybeSingle();
              if (!existing?.name) update.name = extracted;
            }
            await db.from("users").update(update).eq("id", userId);

            if (ob.goals.length > 0) {
              await createGoalsFromOnboarding(db, userId, ob.goals);
            }

            // Process remaining sentinels (goal updates, email) but skip
            // onboarding-complete (handled inline) AND session-complete:
            // the model often emits both at onboarding wrap-up, and the
            // SESSION_COMPLETE branch in processSentinels would bump
            // users.session_count to 1, pushing a new user to "1 of 3"
            // before their first real chat.
            await processSentinels(
              db,
              {
                ...parsed,
                onboardingComplete: null,
                sessionComplete: null,
              },
              userId,
              resolvedSessionId,
            );
          } else {
            // Non-onboarding turn (or onboarding without the close
            // sentinel): write goal/session/email sentinels via the shared
            // processor, then keep the session alive.
            await processSentinels(db, parsed, userId, resolvedSessionId);

            // If processSentinels handled SESSION_COMPLETE it already
            // wrapped endSession internally. Otherwise we still need to
            // bump message_count and refresh ended_at so the timeline
            // reflects this turn.
            if (!parsed.sessionComplete) {
              await endSession(db, resolvedSessionId, {
                userId,
                messageCountDelta: newTurnMessages.length,
                bumpUserCounters: false,
              });
            } else {
              // SESSION_COMPLETE path: still need to add this turn's
              // message_count, which processSentinels' endSession call did
              // not include. Apply the delta now.
              const { data: cur } = await db
                .from("sessions")
                .select("message_count")
                .eq("id", resolvedSessionId)
                .maybeSingle();
              await db
                .from("sessions")
                .update({
                  message_count:
                    (cur?.message_count ?? 0) + newTurnMessages.length,
                })
                .eq("id", resolvedSessionId);
            }
          }

          // Emit the trailing REID_ACTIONS marker so the client can render
          // action notifications (observation/goal/task). The unique
          // \x1e (record-separator) prefix keeps it distinct from any text
          // Reid might ever produce; the client splits on this marker after
          // stream end. Skip the marker entirely when there are no actions
          // so the existing reader path is untouched.
          const actionTypes: string[] = [];
          if (parsed.observations.length > 0)
            actionTypes.push("observation_created");
          if (parsed.goalUpdates.length > 0) actionTypes.push("goal_updated");
          if (parsed.sessionComplete) actionTypes.push("task_assigned");
          if (actionTypes.length > 0 && !closed) {
            const marker = `\x1eREID_ACTIONS:${JSON.stringify(actionTypes)}\n`;
            controller.enqueue(encoder.encode(marker));
          }
        } catch {
          // Already delivered to the client; persistence is best-effort.
        }
        if (!closed) {
          closed = true;
          controller.close();
        }
      });
    },
    cancel() {
      aStream.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "X-Reid-Session-Id": resolvedSessionId,
      "Cache-Control": "no-store",
    },
  });
}
