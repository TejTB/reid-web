# B1 Verification Smoke Test — Results

- **Date:** 2026-06-11 (~14:09–14:51 UTC)
- **Target:** http://localhost:3000 (local dev), TEXT input only
- **Account:** phaseb-p3@reidtest.dev (Maya, Lumora habit app founder; onboarding complete; free tier, session 2 of 2)
- **Supabase project:** wzmoeutpxndeqgfsnfci (SELECT-only)

## Verdict summary

| Check | Result |
|---|---|
| fresh-opener-no-resume | **PASS** |
| recap-close-clears + new-opener | **PASS** |
| localStorage-cleared | **PASS** |
| summary + commitments + key_points persisted | **PASS** |
| stale-id-refused-server-side | **PASS (with caveat — 402 entitlement gate intercepted before new-session allocation)** |
| no-sentinel-leaks | **PASS** |
| opener-unquoted | **PASS** |
| console-clean | **FAIL (3× 401 on /api/sessions/summarise; 1× expected 402 on /api/reid)** |

---

## 1. Sign-in
Signed in (not up) at /login → redirected to /home → navigated to /chat. Sidebar showed name **Maya** (never "Unknown").

## 2. Fresh opener, no resume — PASS
- Account's last session ended 2026-06-11 00:07 UTC (>14h old → idle-closed). Header showed "Last session: Today 1:07am".
- /chat showed a "thinking." placeholder, then streamed a **fresh opener** — no prior messages were resumed into the conversation.
- **Opener 1 text:** `The three outreach messages are still unsent. What got in the way this time?`
  - References the prior (summarised) session's commitments → summarise-at-next-start / summary callback working.
  - NOT wrapped in literal quotes. No sentinel tokens.
- **Timing:** navigation at 14:09:49 → opener visible ~14:10:00 ≈ **8–11s, noticeably long (>5s)**, consistent with the now-buffered opening route.

## 3. Session ID after first send
`localStorage["reid:chatSessionId"]` = **`12b5e6d1-db8f-4f17-9df6-60166fd8bf33`**

## 4. Conversation (as Maya)
4 user messages about churned-user outreach for Lumora (sent 3 messages, one churned user replied that the streak reset felt punishing, grace-day idea, commitment to reply tonight), ending with "ok i need to go, lets wrap this session up". **Reid emitted its close on the first wrap request** (no second "yes, wrap it up" needed):
> "Before you go — the grace day question to her tonight, and you've still got two other users who haven't replied yet. Keep that thread open."

The **SESSION RECAP overlay** appeared immediately after:
- Title: "Lumora churn outreach. First reply in."
- Summary paragraph + 2 commitment bullets + closing nudge + "Back to home →" button.
- **Screenshot:** `diagnostics/b1-recap-overlay.jpeg`
- Note: Playwright's standard screenshot tooling timed out repeatedly on this page ("waiting for fonts to load… fonts loaded" then hang, even with animations disabled) — capture was done via raw CDP `Page.captureScreenshot`. Possibly worth a look (infinite animation / compositor stall), not a B1 assertion.

## 5. Recap close — PASS
Clicked "Back to home →" (navigates to /home):
- (c) `localStorage["reid:chatSessionId"]` → **null** immediately after close. **PASS**
- Returned to /chat: (a) conversation was **cleared** (no prior messages), (b) a **NEW opener streamed**. **PASS**
- **Opener 2 text:** `The churned user is still waiting. Did you reply?`
  - References the just-closed session's commitment → the new summary was persisted and consumed. Unquoted, no sentinels.
- sessionId remained null after the opener (only set on first send).

## 6. DB verification — PASS (key B1.3 flip)
Query (run twice — after recap close at ~14:47 and again after the stale-id test at ~14:50; results identical):

```sql
SELECT id, mode, started_at, ended_at, summary IS NOT NULL AS has_summary,
       commitments, key_points, message_count
FROM sessions
WHERE user_id = (SELECT id FROM users WHERE email='phaseb-p3@reidtest.dev')
ORDER BY started_at DESC LIMIT 5;
```

Rows verbatim (3 rows exist):

```json
[
  {
    "id": "12b5e6d1-db8f-4f17-9df6-60166fd8bf33",
    "mode": "chat",
    "started_at": "2026-06-11 14:10:21.617617+00",
    "ended_at": "2026-06-11 14:12:18.068+00",
    "has_summary": true,
    "commitments": [
      "Reply to churned user tonight asking if a grace day feature would have kept her around",
      "Keep threads open waiting for replies from two other outreach targets"
    ],
    "key_points": [
      "Lumora's streak reset after one missed day is causing churn — users feel punished",
      "Potential fix: grace day (one missed day doesn't reset streak)",
      "Live user feedback loop in motion — reply speed matters"
    ],
    "message_count": 8
  },
  {
    "id": "2deb16e5-4edd-4d25-b7fd-558acb4be558",
    "mode": "chat",
    "started_at": "2026-06-11 00:00:54.144335+00",
    "ended_at": "2026-06-11 00:07:10.274+00",
    "has_summary": true,
    "commitments": null,
    "key_points": null,
    "message_count": 20
  },
  {
    "id": "462e790f-7239-4849-987b-e2a799035b32",
    "mode": "onboarding",
    "started_at": "2026-06-10 23:54:32.475352+00",
    "ended_at": "2026-06-11 00:00:03.303+00",
    "has_summary": false,
    "commitments": null,
    "key_points": null,
    "message_count": 21
  }
]
```

- Just-closed session `12b5e6d1`: **has_summary=true, commitments non-empty (2), key_points non-empty (3)** → **B1.3 PASS**.
- Prior session `2deb16e5` (pre-B1 close path) has has_summary=true but null commitments/key_points — historical row, predates the B1 writer.

## 7. Stale-ID resume test — PASS (server-side refusal), with caveat
- Set `localStorage["reid:chatSessionId"]` back to closed id `12b5e6d1-...`, reloaded /chat.
- **UI on reload:** the closed session's full 8-message history **rendered from history** (client restores by stored id; the streak banner read "Session 2 of 2"). Documented as expected client behaviour — server is the assertion.
- Sent "quick thought" → **request to `/api/reid` returned 402 Payment Required**; no message rendered; the "That's your 2 free sessions" paywall dialog appeared.
- **DB re-check:** closed session `12b5e6d1` `message_count` **unchanged at 8** → the closed session did NOT accept the turn. **Server-side refusal confirmed.**
- **Caveat:** no new session row was created. The server treated the turn as requiring a **new** session (which is itself evidence it refused to resume the closed one) but the free-session entitlement gate (2 of 2 used) returned 402 before a new session/message could be written. The "new session row holds the new message" assertion could not be observed on this capped free account — re-running step 7 on a Pro (or fresh-entitlement) account would close that gap.

## 8. Sentinel / format checks — PASS
Programmatic `document.body.innerText` scan plus visual review of every snapshot:
- `[SESSION_COMPLETE]` visible: **no**
- `[OBSERVATION]` visible: **no**
- `\x1e` (RS) characters: **no**
- Openers wrapped in literal quotes: **no** (both openers)
- Name: **"Maya"** present throughout; "Unknown" never appeared.

## 9. Console — FAIL (non-blocking findings)
Full-session console errors (no /api/tts 503s occurred):

```
[ERROR] 401 (Unauthorized)    @ http://localhost:3000/api/sessions/summarise   (x2, during the session)
[ERROR] 402 (Payment Required) @ http://localhost:3000/api/reid                (expected — stale-id turn on capped free account)
[ERROR] 401 (Unauthorized)    @ http://localhost:3000/api/sessions/summarise   (x1, fired at/after logout)
```

- The 402 is the expected outcome of step 7 on this account; not a defect.
- The **3× 401 on `/api/sessions/summarise`** are a real finding: a client-side summarise call is firing without (or after losing) auth — including once after logout. The summary itself still persisted correctly (server-side writer succeeded, see §6), so this looks like a redundant/unauthenticated client call rather than a data-loss bug. Worth triage.

## Wrap-up
Signed out via account menu (after dismissing the paywall dialog), browser parked at about:blank.

## Artifacts
- `diagnostics/b1-recap-overlay.jpeg` — SESSION RECAP overlay (desktop)
- `diagnostics/b1-smoke-results.md` — this report
