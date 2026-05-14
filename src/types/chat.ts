export type Role = "user" | "assistant";

export interface Message {
  role: Role;
  content: string;
}

export interface ReidRequest {
  userId: string;
  mode: "onboarding" | "chat";
  messages: Message[];
}
