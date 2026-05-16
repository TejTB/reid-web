export interface User {
  id: string;
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
  target_value: number;
  current_value: number;
  unit: string;
  unit_prefix: string | null;
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
  type: "nudge" | "review" | "goal_milestone" | "task_reminder";
  channel: "push" | "in_app";
  title: string;
  body: string | null;
  payload: unknown;
  scheduled_for: string | null;
  sent_at: string | null;
  read_at: string | null;
  created_at: string;
}
