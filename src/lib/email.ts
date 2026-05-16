// Server-side email module. Wraps the Resend SDK and provides three Reid-
// voiced templates: task-overdue, goal-near, weekly-review.
//
// Sender note: during Sprint 5 we use the Resend sandbox sender
// `onboarding@resend.dev`. The sandbox only delivers to the Resend account
// owner's email (theodoretb10@gmail.com). Swap once a verified domain exists.
//
// All three templates render the same chromeless wrapper — accent red, deep
// navy bg, warm white text — and a single CTA back into the app. The CTA host
// is read from NEXT_PUBLIC_APP_URL with a fall-back to the production URL so
// dev previews and prod links both work without code changes.

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = "Reid <onboarding@resend.dev>";

/** Base URL for CTA links. Read once at module load so every template sees
 *  the same value. NEXT_PUBLIC_APP_URL is set in Vercel and `.env.local`;
 *  the fallback is the production deployment. */
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://reid-app.vercel.app";

// ----- design tokens ------------------------------------------------------
const COLOUR_ACCENT = "#B91C1C";
const COLOUR_WARM_WHITE = "#F2EDE3";
const COLOUR_DIM = "#7A90A8";
const COLOUR_BG_DEEP = "#0A1628";

// Email clients lack Playfair Display, so the brief calls for a serif
// fallback for italic body lines. Use Georgia, then Times New Roman.
const FONT_SERIF = "Georgia, 'Times New Roman', serif";
const FONT_SANS =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

// ----- shared chrome ------------------------------------------------------

/** Inline-styled wrapper used by every template. Email clients strip
 *  external CSS, so all styles must be inline. Width capped at 560px. */
function wrap(opts: {
  preheader: string;
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  signature?: string;
}): string {
  const { preheader, title, body, ctaLabel, ctaHref, signature } = opts;
  const sig = signature ?? "— Reid";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:${COLOUR_BG_DEEP};font-family:${FONT_SANS};">
    <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">
      ${escapeHtml(preheader)}
    </span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOUR_BG_DEEP};padding:48px 24px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${COLOUR_BG_DEEP};">
            <tr>
              <td style="padding-bottom:32px;">
                <span style="font-family:${FONT_SERIF};font-style:italic;font-size:22px;color:${COLOUR_WARM_WHITE};letter-spacing:-0.01em;">
                  Reid
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:20px;">
                <h1 style="margin:0;font-family:${FONT_SERIF};font-weight:500;font-size:28px;line-height:1.2;color:${COLOUR_WARM_WHITE};letter-spacing:-0.02em;">
                  ${title}
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:32px;">
                ${body}
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:32px;">
                <a href="${ctaHref}" style="display:inline-block;background:${COLOUR_ACCENT};color:${COLOUR_WARM_WHITE};font-family:${FONT_SANS};font-weight:500;font-size:14px;letter-spacing:0.04em;text-decoration:none;padding:14px 24px;border-radius:9px;">
                  ${escapeHtml(ctaLabel)}
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding-top:24px;border-top:1px solid rgba(242,237,232,0.08);">
                <p style="margin:0;font-family:${FONT_SERIF};font-style:italic;font-size:15px;color:${COLOUR_DIM};line-height:1.6;">
                  ${escapeHtml(sig)}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Minimal HTML escape — sufficient for the small set of attacker-supplied
 *  strings we pass through (names, task text, goal titles). */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ----- templates ----------------------------------------------------------

/** Renders the "you went dark on the task" email. `task` is the concrete
 *  action Reid set them at the end of their last session. */
export function taskOverdueEmail(
  name: string | null,
  task: string,
): { subject: string; html: string } {
  const who = (name ?? "").trim() || "Founder";
  const subject = "You went quiet.";
  const body = `
    <p style="margin:0 0 16px;font-family:${FONT_SERIF};font-style:italic;font-size:18px;line-height:1.55;color:${COLOUR_WARM_WHITE};">
      ${escapeHtml(who)} — it's been two days. The task we set hasn't moved.
    </p>
    <p style="margin:0 0 16px;font-family:${FONT_SERIF};font-style:italic;font-size:18px;line-height:1.55;color:${COLOUR_WARM_WHITE};">
      "${escapeHtml(task)}"
    </p>
    <p style="margin:0;font-family:${FONT_SANS};font-size:15px;line-height:1.55;color:${COLOUR_DIM};">
      Either it's done and you forgot to tell me, or you're avoiding it. Both
      are conversations worth having.
    </p>`;
  const html = wrap({
    preheader: "Two days since your last session. The task hasn't moved.",
    title: "You went quiet.",
    body,
    ctaLabel: "Open Reid",
    ctaHref: `${APP_URL}/chat`,
  });
  return { subject, html };
}

/** Renders the "you're close — finish it" email. The goal value rendering
 *  respects unit_prefix so '£500 away' and '5 clients away' both look right. */
export function goalNearEmail(
  name: string | null,
  goalTitle: string,
  remaining: number,
  unit: string,
  unitPrefix: boolean,
): { subject: string; html: string } {
  const who = (name ?? "").trim() || "Founder";
  const nf = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });
  const valueStr = unitPrefix
    ? `${unit}${nf.format(remaining)}`
    : `${nf.format(remaining)} ${unit}`;
  const subject = `Almost there — ${goalTitle}.`;
  const body = `
    <p style="margin:0 0 16px;font-family:${FONT_SERIF};font-style:italic;font-size:18px;line-height:1.55;color:${COLOUR_WARM_WHITE};">
      ${escapeHtml(who)} — you're ${escapeHtml(valueStr)} away from ${escapeHtml(goalTitle)}.
    </p>
    <p style="margin:0;font-family:${FONT_SANS};font-size:15px;line-height:1.55;color:${COLOUR_DIM};">
      The last yard is the one most founders never cover. Don't be the one who
      stops at 80%.
    </p>`;
  const html = wrap({
    preheader: `${valueStr} from finishing ${goalTitle}.`,
    title: "Don't stall at the line.",
    body,
    ctaLabel: "Open Reid",
    ctaHref: `${APP_URL}/goals`,
  });
  return { subject, html };
}

/** Renders the Monday weekly-review email. `summary` is computed by the
 *  cron caller and includes session count, per-goal deltas, and whether the
 *  last task was completed. */
export interface WeeklyReviewSummary {
  sessionCount: number;
  taskCompleted: boolean;
  lastTask: string | null;
  goalDeltas: Array<{
    goalTitle: string;
    delta: number;
    unit: string;
    unitPrefix: boolean;
  }>;
}

export function weeklyReviewEmail(
  name: string | null,
  summary: WeeklyReviewSummary,
): { subject: string; html: string } {
  const who = (name ?? "").trim() || "Founder";
  const nf = new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: 2,
    signDisplay: "exceptZero",
  });
  const renderDelta = (
    g: WeeklyReviewSummary["goalDeltas"][number],
  ): string => {
    const formatted = nf.format(g.delta);
    return g.unitPrefix
      ? `${g.unit}${formatted}`
      : `${formatted} ${g.unit}`;
  };

  const sessionsLine =
    summary.sessionCount === 0
      ? "We didn't speak this week."
      : summary.sessionCount === 1
        ? "One session this week."
        : `${summary.sessionCount} sessions this week.`;

  const goalLines =
    summary.goalDeltas.length === 0
      ? `<li style="margin:0 0 6px;font-family:${FONT_SANS};font-size:15px;color:${COLOUR_DIM};">No goal movement.</li>`
      : summary.goalDeltas
          .map(
            (g) => `
              <li style="margin:0 0 6px;font-family:${FONT_SANS};font-size:15px;color:${COLOUR_WARM_WHITE};">
                <span style="color:${g.delta >= 0 ? "#4ADE80" : COLOUR_ACCENT};font-weight:500;">${escapeHtml(renderDelta(g))}</span>
                <span style="color:${COLOUR_DIM};"> · ${escapeHtml(g.goalTitle)}</span>
              </li>`,
          )
          .join("");

  const taskBlock = summary.lastTask
    ? `
      <p style="margin:24px 0 8px;font-family:${FONT_SANS};font-size:13px;letter-spacing:0.06em;color:${COLOUR_DIM};text-transform:uppercase;">
        Last task
      </p>
      <p style="margin:0;font-family:${FONT_SERIF};font-style:italic;font-size:17px;line-height:1.55;color:${COLOUR_WARM_WHITE};">
        "${escapeHtml(summary.lastTask)}"
        ${
          summary.taskCompleted
            ? `<span style="display:inline-block;margin-left:8px;color:#4ADE80;font-style:normal;font-family:${FONT_SANS};font-size:13px;">— done</span>`
            : `<span style="display:inline-block;margin-left:8px;color:${COLOUR_ACCENT};font-style:normal;font-family:${FONT_SANS};font-size:13px;">— still open</span>`
        }
      </p>`
    : "";

  const subject = "Your week, honestly.";
  const body = `
    <p style="margin:0 0 20px;font-family:${FONT_SERIF};font-style:italic;font-size:18px;line-height:1.55;color:${COLOUR_WARM_WHITE};">
      ${escapeHtml(who)} — here's what actually happened.
    </p>
    <p style="margin:0 0 12px;font-family:${FONT_SANS};font-size:13px;letter-spacing:0.06em;color:${COLOUR_DIM};text-transform:uppercase;">
      Sessions
    </p>
    <p style="margin:0 0 20px;font-family:${FONT_SANS};font-size:15px;color:${COLOUR_WARM_WHITE};">
      ${escapeHtml(sessionsLine)}
    </p>
    <p style="margin:0 0 12px;font-family:${FONT_SANS};font-size:13px;letter-spacing:0.06em;color:${COLOUR_DIM};text-transform:uppercase;">
      Goal movement
    </p>
    <ul style="margin:0;padding:0;list-style:none;">
      ${goalLines}
    </ul>
    ${taskBlock}`;
  const html = wrap({
    preheader: sessionsLine,
    title: "Your week, honestly.",
    body,
    ctaLabel: "Open Reid",
    ctaHref: `${APP_URL}/home`,
  });
  return { subject, html };
}

// ----- sender -------------------------------------------------------------

/** Sends a single email via Resend. Never throws — returns `false` on any
 *  failure so the cron pipeline can decide whether to retry / log without
 *  losing the rest of the loop. */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const { to, subject, html } = opts;
  if (!to || !subject || !html) return false;
  if (!process.env.RESEND_API_KEY) {
    console.error("[email] RESEND_API_KEY not set, skipping send");
    return false;
  }
  try {
    const result = await resend.emails.send({
      from: FROM,
      to,
      subject,
      html,
    });
    if (result.error) {
      console.error("[email] resend error:", result.error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] threw:", err);
    return false;
  }
}
