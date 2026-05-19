export type SubscriptionStatus = "free" | "pro" | "cancelled" | "past_due";

export interface User {
  id: string;
  auth_id: string | null;
  email: string | null;
  name: string | null;
  onboarding_complete: boolean;
  onboarding_summary: string | null;
  onboarding_task: string | null;
  onboarding_goals: unknown;
  push_enabled: boolean;
  last_session_at: string | null;
  last_review_at: string | null;
  session_count: number;
  streak_days: number;
  created_at: string;
  stripe_customer_id: string | null;
  subscription_status: SubscriptionStatus;
  subscription_id: string | null;
  subscribed_at: string | null;
  subscription_period_end: string | null;
  last_reengage_email_at: string | null;
  onboarding_task_completed_at: string | null;
  avatar_url: string | null;
  push_message: string | null;
  push_message_date: string | null;
  last_session_date: string | null;
  /** Sessions consumed in the current calendar month. Reset to 0 at the start
   *  of each month by the gate in /api/reid. Drives the 5-of-5 paywall. */
  sessions_used_this_month: number;
  /** UTC timestamp of the first day of the month the counter belongs to. */
  sessions_month_start: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
  task_set: string | null;
  message_count: number;
  /** Set by /api/session-recap once the session has ended. 3-6 word title. */
  title: string | null;
  /** One-sentence Reid voice line written into the recap. */
  reid_note: string | null;
  /** True once we've detected a "productive outcome" — used to allow soft
   *  early-end without waiting to message 20. */
  outcome_captured: boolean;
}

export interface Message {
  id: string;
  session_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface Goal {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  target_value: number;
  current_value: number;
  unit: string;
  unit_prefix: boolean;
  deadline: string | null;
  is_primary: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GoalEvent {
  id: string;
  goal_id: string;
  user_id: string;
  session_id: string | null;
  delta: number;
  note: string | null;
  created_at: string;
}

export interface PushSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type:
    | "task_overdue"
    | "goal_stagnant"
    | "goal_near"
    | "weekly_review"
    | "goal_complete";
  channel: "email" | "push" | "in_app";
  payload: unknown;
  sent_at: string;
}

export type ObservationConfidence = "low" | "medium" | "high";

export type ObservationCategory =
  | "avoidance"
  | "pattern"
  | "contradiction"
  | "strength";

export interface Observation {
  id: string;
  user_id: string;
  session_id: string | null;
  text: string;
  /** Legacy field used by [OBSERVATION] sentinel rows from /api/reid. New
   *  rows written by /api/observe omit this in favour of `category`. */
  confidence: ObservationConfidence | null;
  /** Diagnostic label set by /api/observe. Null on legacy rows. */
  category: ObservationCategory | null;
  created_at: string;
}
