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
  /** True when the turn came from the voice loop. The server flags
   *  sessions.voice_used for voice entitlement counting (B1.8) — the web
   *  clients previously never sent this, so web voice was never counted. */
  voice?: boolean;
}
