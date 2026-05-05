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
      funnel_steps: {
        Row: {
          caption: string | null
          content: string
          created_at: string
          delay_fixed: number | null
          delay_max: number | null
          delay_min: number | null
          delay_type: string
          file_name: string | null
          funnel_id: string
          id: string
          media_url: string | null
          mimetype: string | null
          order_index: number
          type: string
          updated_at: string
        }
        Insert: {
          caption?: string | null
          content?: string
          created_at?: string
          delay_fixed?: number | null
          delay_max?: number | null
          delay_min?: number | null
          delay_type?: string
          file_name?: string | null
          funnel_id: string
          id?: string
          media_url?: string | null
          mimetype?: string | null
          order_index: number
          type?: string
          updated_at?: string
        }
        Update: {
          caption?: string | null
          content?: string
          created_at?: string
          delay_fixed?: number | null
          delay_max?: number | null
          delay_min?: number | null
          delay_type?: string
          file_name?: string | null
          funnel_id?: string
          id?: string
          media_url?: string | null
          mimetype?: string | null
          order_index?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "funnel_steps_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "funnels"
            referencedColumns: ["id"]
          },
        ]
      }
      funnels: {
        Row: {
          channels: string[]
          consecutive: boolean
          created_at: string
          envios: number
          id: string
          internal_id: string
          name: string
          position: number
          respostas: number
          start_max: number
          start_min: number
          updated_at: string
          window_end: string
          window_start: string
        }
        Insert: {
          channels?: string[]
          consecutive?: boolean
          created_at?: string
          envios?: number
          id?: string
          internal_id: string
          name: string
          position?: number
          respostas?: number
          start_max?: number
          start_min?: number
          updated_at?: string
          window_end?: string
          window_start?: string
        }
        Update: {
          channels?: string[]
          consecutive?: boolean
          created_at?: string
          envios?: number
          id?: string
          internal_id?: string
          name?: string
          position?: number
          respostas?: number
          start_max?: number
          start_min?: number
          updated_at?: string
          window_end?: string
          window_start?: string
        }
        Relationships: []
      }
      instances: {
        Row: {
          api_key: string
          base_url: string
          created_at: string
          id: string
          instance_id: string | null
          instance_name: string
          qr_code: string | null
          status: string
          updated_at: string
        }
        Insert: {
          api_key: string
          base_url: string
          created_at?: string
          id?: string
          instance_id?: string | null
          instance_name: string
          qr_code?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          api_key?: string
          base_url?: string
          created_at?: string
          id?: string
          instance_id?: string | null
          instance_name?: string
          qr_code?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      lead_funnel_states: {
        Row: {
          completed_at: string | null
          funnel_id: string | null
          id: string
          lead_id: string | null
          started_at: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          funnel_id?: string | null
          id?: string
          lead_id?: string | null
          started_at?: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          funnel_id?: string | null
          id?: string
          lead_id?: string | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_funnel_states_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "funnels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_funnel_states_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          created_at: string
          first_contact_at: string | null
          id: string
          instance_name: string | null
          is_new_lead: boolean
          last_interaction_at: string | null
          name: string | null
          push_name: string | null
          remote_jid: string | null
          status: string
          tags: string[]
          updated_at: string
          whatsapp_number: string
        }
        Insert: {
          created_at?: string
          first_contact_at?: string | null
          id?: string
          instance_name?: string | null
          is_new_lead?: boolean
          last_interaction_at?: string | null
          name?: string | null
          push_name?: string | null
          remote_jid?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
          whatsapp_number: string
        }
        Update: {
          created_at?: string
          first_contact_at?: string | null
          id?: string
          instance_name?: string | null
          is_new_lead?: boolean
          last_interaction_at?: string | null
          name?: string | null
          push_name?: string | null
          remote_jid?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
          whatsapp_number?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string | null
          created_at: string
          direction: string
          evolution_message_id: string | null
          file_name: string | null
          id: string
          is_ai: boolean
          lead_id: string | null
          media_url: string | null
          sent_at: string
          sent_by: string
          type: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          direction: string
          evolution_message_id?: string | null
          file_name?: string | null
          id?: string
          is_ai?: boolean
          lead_id?: string | null
          media_url?: string | null
          sent_at?: string
          sent_by?: string
          type: string
        }
        Update: {
          content?: string | null
          created_at?: string
          direction?: string
          evolution_message_id?: string | null
          file_name?: string | null
          id?: string
          is_ai?: boolean
          lead_id?: string | null
          media_url?: string | null
          sent_at?: string
          sent_by?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_messages: {
        Row: {
          attempts: number
          caption: string | null
          content: string | null
          created_at: string
          error_message: string | null
          evolution_message_id: string | null
          file_name: string | null
          funnel_id: string | null
          id: string
          instance_name: string
          lead_id: string | null
          media_url: string | null
          message_type: string
          mimetype: string | null
          send_at: string
          status: string
          step_id: string | null
          whatsapp_number: string
        }
        Insert: {
          attempts?: number
          caption?: string | null
          content?: string | null
          created_at?: string
          error_message?: string | null
          evolution_message_id?: string | null
          file_name?: string | null
          funnel_id?: string | null
          id?: string
          instance_name: string
          lead_id?: string | null
          media_url?: string | null
          message_type: string
          mimetype?: string | null
          send_at: string
          status?: string
          step_id?: string | null
          whatsapp_number: string
        }
        Update: {
          attempts?: number
          caption?: string | null
          content?: string | null
          created_at?: string
          error_message?: string | null
          evolution_message_id?: string | null
          file_name?: string | null
          funnel_id?: string | null
          id?: string
          instance_name?: string
          lead_id?: string | null
          media_url?: string | null
          message_type?: string
          mimetype?: string | null
          send_at?: string
          status?: string
          step_id?: string | null
          whatsapp_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_messages_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "funnels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "funnel_steps"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_completed_funnels: { Args: never; Returns: undefined }
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
