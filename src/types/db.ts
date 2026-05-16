export interface User {
  id: string;
  email: string | null;
  name: string | null;
  onboarding_complete: boolean;
  onboarding_summary: string | null;
  onboarding_task: string | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}
