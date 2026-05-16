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

export interface Observation {
  id: string;
  user_id: string;
  session_id: string | null;
  text: string;
  confidence: ObservationConfidence;
  created_at: string;
}
