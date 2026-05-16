export interface User {
  id: string;
  email: string | null;
  name: string | null;
  onboarding_complete: boolean;
  onboarding_summary: string | null;
  onboarding_task: string | null;
  last_session_at: string | null;
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
