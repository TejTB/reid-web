export type Role = "user" | "assistant";

export interface Message {
  role: Role;
  content: string;
  images?: string[];
}

export interface ReidRequest {
  mode: "onboarding" | "chat";
  sessionId?: string | null;
  messages: Message[];
}
