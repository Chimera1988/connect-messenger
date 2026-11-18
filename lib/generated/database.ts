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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      connect_account_file_deletion_jobs: {
        Row: {
          account_id: string
          bucket_id: string
          path: string
          queued_at: string
        }
        Insert: {
          account_id: string
          bucket_id: string
          path: string
          queued_at?: string
        }
        Update: {
          account_id?: string
          bucket_id?: string
          path?: string
          queued_at?: string
        }
        Relationships: []
      }
      connect_call_ice: {
        Row: {
          call_id: string
          candidate: Json
          created_at: string
          id: number
          sender_id: string
        }
        Insert: {
          call_id: string
          candidate: Json
          created_at?: string
          id?: never
          sender_id: string
        }
        Update: {
          call_id?: string
          candidate?: Json
          created_at?: string
          id?: never
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connect_call_ice_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "connect_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      connect_call_journal_settings: {
        Row: {
          cleared_before: string | null
          hidden_ids: string[]
          owner_id: string
          updated_at: string
        }
        Insert: {
          cleared_before?: string | null
          hidden_ids?: string[]
          owner_id: string
          updated_at?: string
        }
        Update: {
          cleared_before?: string | null
          hidden_ids?: string[]
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connect_call_journal_settings_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      connect_call_push_log: {
        Row: {
          call_id: string
          created_at: string
        }
        Insert: {
          call_id: string
          created_at?: string
        }
        Update: {
          call_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connect_call_push_log_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: true
            referencedRelation: "connect_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      connect_calls: {
        Row: {
          answer: Json | null
          answered_at: string | null
          callee_id: string
          caller_id: string
          conversation_id: string
          created_at: string
          ended_at: string | null
          id: string
          offer: Json
          status: string
        }
        Insert: {
          answer?: Json | null
          answered_at?: string | null
          callee_id: string
          caller_id: string
          conversation_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          offer: Json
          status?: string
        }
        Update: {
          answer?: Json | null
          answered_at?: string | null
          callee_id?: string
          caller_id?: string
          conversation_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          offer?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "connect_calls_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      connect_hidden_members: {
        Row: {
          admin_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      connect_invitation_codes: {
        Row: {
          code_hash: string
          created_at: string
          created_by: string
          email: string
          expires_at: string
          id: string
          invite_type: string
          redeemed_at: string | null
          redeemed_by: string | null
          revoked_at: string | null
        }
        Insert: {
          code_hash: string
          created_at?: string
          created_by: string
          email: string
          expires_at?: string
          id?: string
          invite_type?: string
          redeemed_at?: string | null
          redeemed_by?: string | null
          revoked_at?: string | null
        }
        Update: {
          code_hash?: string
          created_at?: string
          created_by?: string
          email?: string
          expires_at?: string
          id?: string
          invite_type?: string
          redeemed_at?: string | null
          redeemed_by?: string | null
          revoked_at?: string | null
        }
        Relationships: []
      }
      connect_media_deletion_jobs: {
        Row: {
          conversation_id: string
          message_id: string
          path: string
          queued_at: string
          sender_id: string
        }
        Insert: {
          conversation_id: string
          message_id: string
          path: string
          queued_at?: string
          sender_id: string
        }
        Update: {
          conversation_id?: string
          message_id?: string
          path?: string
          queued_at?: string
          sender_id?: string
        }
        Relationships: []
      }
      connect_message_tombstones: {
        Row: {
          conversation_id: string
          deleted_at: string
          message_id: string
        }
        Insert: {
          conversation_id: string
          deleted_at?: string
          message_id: string
        }
        Update: {
          conversation_id?: string
          deleted_at?: string
          message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connect_message_tombstones_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      connect_music_presence: {
        Row: {
          is_playing: boolean
          is_public: boolean
          owner_id: string
          track_name: string
          updated_at: string
        }
        Insert: {
          is_playing?: boolean
          is_public?: boolean
          owner_id: string
          track_name?: string
          updated_at?: string
        }
        Update: {
          is_playing?: boolean
          is_public?: boolean
          owner_id?: string
          track_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connect_music_presence_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      connect_orphan_storage_deletion_jobs: {
        Row: {
          bucket_id: string
          not_before: string
          path: string
          queued_at: string
          reason: string
        }
        Insert: {
          bucket_id: string
          not_before: string
          path: string
          queued_at?: string
          reason: string
        }
        Update: {
          bucket_id?: string
          not_before?: string
          path?: string
          queued_at?: string
          reason?: string
        }
        Relationships: []
      }
      connect_sticker_deletion_jobs: {
        Row: {
          path: string
          queued_at: string
        }
        Insert: {
          path: string
          queued_at?: string
        }
        Update: {
          path?: string
          queued_at?: string
        }
        Relationships: []
      }
      connect_sticker_packs: {
        Row: {
          created_at: string
          emoji: string
          id: string
          is_public: boolean
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          emoji?: string
          id?: string
          is_public?: boolean
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          is_public?: boolean
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
      connect_stickers: {
        Row: {
          created_at: string
          id: string
          name: string
          pack_id: string
          position: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          pack_id: string
          position?: number
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          pack_id?: string
          position?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "connect_stickers_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "connect_sticker_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_user_state: {
        Row: {
          activity_kind: string | null
          activity_until: string | null
          conversation_id: string
          last_delivered_at: string | null
          last_read_at: string
          recording_until: string | null
          typing_until: string | null
          user_id: string
        }
        Insert: {
          activity_kind?: string | null
          activity_until?: string | null
          conversation_id: string
          last_delivered_at?: string | null
          last_read_at?: string
          recording_until?: string | null
          typing_until?: string | null
          user_id: string
        }
        Update: {
          activity_kind?: string | null
          activity_until?: string | null
          conversation_id?: string
          last_delivered_at?: string | null
          last_read_at?: string
          recording_until?: string | null
          typing_until?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_user_state_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          user_a: string
          user_b: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_a: string
          user_b: string
        }
        Update: {
          created_at?: string
          id?: string
          user_a?: string
          user_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_user_a_fkey"
            columns: ["user_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_user_b_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_kind: string | null
          attachment_name: string | null
          attachment_path: string | null
          attachment_size: number | null
          attachment_type: string | null
          body: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          deleted_for_sender: boolean
          edited_at: string | null
          id: string
          reply_to: string | null
          sender_id: string
        }
        Insert: {
          attachment_kind?: string | null
          attachment_name?: string | null
          attachment_path?: string | null
          attachment_size?: number | null
          attachment_type?: string | null
          body: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          deleted_for_sender?: boolean
          edited_at?: string | null
          id?: string
          reply_to?: string | null
          sender_id: string
        }
        Update: {
          attachment_kind?: string | null
          attachment_name?: string | null
          attachment_path?: string | null
          attachment_size?: number | null
          attachment_type?: string | null
          body?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          deleted_for_sender?: boolean
          edited_at?: string | null
          id?: string
          reply_to?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          enabled: boolean
          sound: string
          updated_at: string
          user_id: string
          vibrate: boolean
        }
        Insert: {
          enabled?: boolean
          sound?: string
          updated_at?: string
          user_id: string
          vibrate?: boolean
        }
        Update: {
          enabled?: boolean
          sound?: string
          updated_at?: string
          user_id?: string
          vibrate?: boolean
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_path: string | null
          bio: string
          created_at: string
          display_name: string
          id: string
          is_blocked: boolean
          last_seen_at: string | null
          online_until: string | null
        }
        Insert: {
          avatar_path?: string | null
          bio?: string
          created_at?: string
          display_name: string
          id: string
          is_blocked?: boolean
          last_seen_at?: string | null
          online_until?: string | null
        }
        Update: {
          avatar_path?: string | null
          bio?: string
          created_at?: string
          display_name?: string
          id?: string
          is_blocked?: boolean
          last_seen_at?: string | null
          online_until?: string | null
        }
        Relationships: []
      }
      push_devices: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          needs_push_refresh: boolean
          platform: string
          subscription: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          needs_push_refresh?: boolean
          platform: string
          subscription?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          needs_push_refresh?: boolean
          platform?: string
          subscription?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      connect_account_file_gc_is_safe: {
        Args: { p_account: string; p_bucket: string; p_path: string }
        Returns: boolean
      }
      connect_admin_usage_snapshot: {
        Args: { p_session_id: string; p_user_id: string }
        Returns: Json
      }
      connect_answer_audio_call: {
        Args: { p_answer: Json; p_call_id: string }
        Returns: {
          answer: Json | null
          answered_at: string | null
          callee_id: string
          caller_id: string
          conversation_id: string
          created_at: string
          ended_at: string | null
          id: string
          offer: Json
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "connect_calls"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      connect_auth_session_active: {
        Args: { p_session_id: string; p_user_id: string }
        Returns: boolean
      }
      connect_delete_message: {
        Args: { p_message_id: string }
        Returns: undefined
      }
      connect_deleted_since: {
        Args: { p_after?: string; p_id?: string; p_limit?: number }
        Returns: {
          conversation_id: string
          deleted_at: string
          message_id: string
        }[]
      }
      connect_finish_audio_call: {
        Args: { p_call_id: string; p_reason?: string }
        Returns: {
          answer: Json | null
          answered_at: string | null
          callee_id: string
          caller_id: string
          conversation_id: string
          created_at: string
          ended_at: string | null
          id: string
          offer: Json
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "connect_calls"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      connect_finish_owned_audio_call: {
        Args: { p_answer_sha256?: string; p_call_id: string; p_reason: string }
        Returns: {
          answer: Json | null
          answered_at: string | null
          callee_id: string
          caller_id: string
          conversation_id: string
          created_at: string
          ended_at: string | null
          id: string
          offer: Json
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "connect_calls"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      connect_has_live_session: { Args: never; Returns: boolean }
      connect_media_gc_authorized: {
        Args: { p_token: string }
        Returns: boolean
      }
      connect_media_gc_is_unreferenced: {
        Args: { p_path: string }
        Returns: boolean
      }
      connect_neon_media_mirror_candidates: {
        Args: { p_limit?: number }
        Returns: {
          bucket_id: string
          mime_type: string
          path: string
          source_etag: string
          source_size: number
        }[]
      }
      connect_neon_media_mirror_confirm: {
        Args: {
          p_bucket: string
          p_etag: string
          p_path: string
          p_sha256: string
          p_size: number
        }
        Returns: boolean
      }
      connect_neon_media_mirror_confirm_deleted: {
        Args: { p_bucket: string; p_etag: string; p_path: string }
        Returns: boolean
      }
      connect_neon_media_mirror_current_avatars: {
        Args: never
        Returns: {
          byte_size: number
          mime_type: string
          path: string
          sha256: string
          user_id: string
        }[]
      }
      connect_neon_media_mirror_failed: {
        Args: { p_bucket: string; p_etag: string; p_path: string }
        Returns: boolean
      }
      connect_neon_media_mirror_stale: {
        Args: { p_limit?: number }
        Returns: {
          bucket_id: string
          path: string
          source_etag: string
        }[]
      }
      connect_neon_media_mirror_stats: { Args: never; Returns: Json }
      connect_orphan_storage_gc_candidates: {
        Args: { p_limit?: number }
        Returns: {
          bucket_id: string
          path: string
        }[]
      }
      connect_start_audio_call: {
        Args: { p_conversation_id: string; p_offer: Json }
        Returns: {
          answer: Json | null
          answered_at: string | null
          callee_id: string
          caller_id: string
          conversation_id: string
          created_at: string
          ended_at: string | null
          id: string
          offer: Json
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "connect_calls"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      connect_unified_capabilities: { Args: never; Returns: Json }
      postgres_fdw_disconnect: { Args: { "": string }; Returns: boolean }
      postgres_fdw_disconnect_all: { Args: never; Returns: boolean }
      postgres_fdw_get_connections: {
        Args: never
        Returns: Record<string, unknown>[]
      }
      postgres_fdw_handler: { Args: never; Returns: unknown }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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

