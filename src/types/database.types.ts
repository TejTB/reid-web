// GENERATED REFERENCE — do not edit by hand.
//
// Source: `supabase gen types typescript` against the LIVE production project
// (wzmoeutpxndeqgfsnfci), captured during Sprint 12 Build B. This file exists
// so the hand-written domain types in `./db.ts` can be reconciled against the
// real prod schema (the repo migrations have drifted). It is NOT wired into any
// Supabase client via a `<Database>` generic yet — adopting the generic across
// supabase.ts / supabase-server.ts / supabase-admin.ts is a separate fast-
// follow. Treat this as documentation of ground truth, nothing more.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      conversations: {
        Row: {
          content: string
          created_at: string | null
          id: string
          role: string
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          role: string
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          role?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_events: {
        Row: {
          created_at: string
          delta: number
          goal_id: string
          id: string
          note: string | null
          session_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          goal_id: string
          id?: string
          note?: string | null
          session_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          goal_id?: string
          id?: string
          note?: string | null
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_events_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          completed_at: string | null
          created_at: string
          current_value: number
          deadline: string | null
          description: string | null
          generated_take: string | null
          id: string
          is_primary: boolean
          target_value: number
          title: string
          unit: string
          unit_prefix: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_value?: number
          deadline?: string | null
          description?: string | null
          generated_take?: string | null
          id?: string
          is_primary?: boolean
          target_value: number
          title: string
          unit: string
          unit_prefix?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_value?: number
          deadline?: string | null
          description?: string | null
          generated_take?: string | null
          id?: string
          is_primary?: boolean
          target_value?: number
          title?: string
          unit?: string
          unit_prefix?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          session_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          session_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          channel: string
          id: string
          payload: Json | null
          sent_at: string
          type: string
          user_id: string
        }
        Insert: {
          channel: string
          id?: string
          payload?: Json | null
          sent_at?: string
          type: string
          user_id: string
        }
        Update: {
          channel?: string
          id?: string
          payload?: Json | null
          sent_at?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      observations: {
        Row: {
          category: string | null
          confidence: string | null
          created_at: string
          generated_take: string | null
          id: string
          session_id: string | null
          text: string
          user_id: string
        }
        Insert: {
          category?: string | null
          confidence?: string | null
          created_at?: string
          generated_take?: string | null
          id?: string
          session_id?: string | null
          text: string
          user_id: string
        }
        Update: {
          category?: string | null
          confidence?: string | null
          created_at?: string
          generated_take?: string | null
          id?: string
          session_id?: string | null
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "observations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          platform: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          platform?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          platform?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reid_waitlist: {
        Row: {
          created_at: string | null
          email: string
          id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          avoiding: string | null
          commitments: Json | null
          ended_at: string | null
          id: string
          key_points: Json | null
          message_count: number
          mode: string
          mood: string | null
          outcome_captured: boolean
          reid_note: string | null
          started_at: string
          summary: string | null
          task_set: string | null
          title: string | null
          user_id: string
          voice_used: boolean
        }
        Insert: {
          avoiding?: string | null
          commitments?: Json | null
          ended_at?: string | null
          id?: string
          key_points?: Json | null
          message_count?: number
          mode?: string
          mood?: string | null
          outcome_captured?: boolean
          reid_note?: string | null
          started_at?: string
          summary?: string | null
          task_set?: string | null
          title?: string | null
          user_id: string
          voice_used?: boolean
        }
        Update: {
          avoiding?: string | null
          commitments?: Json | null
          ended_at?: string | null
          id?: string
          key_points?: Json | null
          message_count?: number
          mode?: string
          mood?: string | null
          outcome_captured?: boolean
          reid_note?: string | null
          started_at?: string
          summary?: string | null
          task_set?: string | null
          title?: string | null
          user_id?: string
          voice_used?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          completed: boolean
          completed_at: string | null
          created_at: string
          description: string
          due_date: string | null
          generated_take: string | null
          id: string
          session_id: string | null
          user_id: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          description: string
          due_date?: string | null
          generated_take?: string | null
          id?: string
          session_id?: string | null
          user_id: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          description?: string
          due_date?: string | null
          generated_take?: string | null
          id?: string
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          auth_id: string | null
          avatar_url: string | null
          created_at: string | null
          email: string | null
          id: string
          last_reengage_email_at: string | null
          last_review_at: string | null
          last_session_at: string | null
          last_session_date: string | null
          name: string | null
          onboarding_complete: boolean | null
          onboarding_goals: Json | null
          onboarding_summary: string | null
          onboarding_task: string | null
          onboarding_task_completed_at: string | null
          push_enabled: boolean
          push_message: string | null
          push_message_date: string | null
          session_count: number
          sessions_month_start: string
          sessions_used_this_month: number
          streak_days: number
          stripe_customer_id: string | null
          subscribed_at: string | null
          subscription_id: string | null
          subscription_period_end: string | null
          subscription_status: string
        }
        Insert: {
          auth_id?: string | null
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          last_reengage_email_at?: string | null
          last_review_at?: string | null
          last_session_at?: string | null
          last_session_date?: string | null
          name?: string | null
          onboarding_complete?: boolean | null
          onboarding_goals?: Json | null
          onboarding_summary?: string | null
          onboarding_task?: string | null
          onboarding_task_completed_at?: string | null
          push_enabled?: boolean
          push_message?: string | null
          push_message_date?: string | null
          session_count?: number
          sessions_month_start?: string
          sessions_used_this_month?: number
          streak_days?: number
          stripe_customer_id?: string | null
          subscribed_at?: string | null
          subscription_id?: string | null
          subscription_period_end?: string | null
          subscription_status?: string
        }
        Update: {
          auth_id?: string | null
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          last_reengage_email_at?: string | null
          last_review_at?: string | null
          last_session_at?: string | null
          last_session_date?: string | null
          name?: string | null
          onboarding_complete?: boolean | null
          onboarding_goals?: Json | null
          onboarding_summary?: string | null
          onboarding_task?: string | null
          onboarding_task_completed_at?: string | null
          push_enabled?: boolean
          push_message?: string | null
          push_message_date?: string | null
          session_count?: number
          sessions_month_start?: string
          sessions_used_this_month?: number
          streak_days?: number
          stripe_customer_id?: string | null
          subscribed_at?: string | null
          subscription_id?: string | null
          subscription_period_end?: string | null
          subscription_status?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_user_id: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
