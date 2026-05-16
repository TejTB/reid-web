import { z } from "zod";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(8000),
});

export const reidRequestSchema = z.object({
  mode: z.enum(["onboarding", "chat"]),
  sessionId: z.string().uuid().optional().nullable(),
  messages: z.array(messageSchema).max(200),
});

export type ReidRequestInput = z.infer<typeof reidRequestSchema>;

export const pushSubscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
});

export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

export type PushUnsubscribeInput = z.infer<typeof pushUnsubscribeSchema>;
