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
      agents: {
        Row: {
          created_at: string
          exit_condition: string | null
          exit_tags: string[]
          id: string
          is_active: boolean
          llm_connection_id: string | null
          max_turns: number
          name: string
          objective: string | null
          operation_id: string
          product: string | null
          prompt: string | null
          tone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          exit_condition?: string | null
          exit_tags?: string[]
          id?: string
          is_active?: boolean
          llm_connection_id?: string | null
          max_turns?: number
          name: string
          objective?: string | null
          operation_id?: string
          product?: string | null
          prompt?: string | null
          tone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          exit_condition?: string | null
          exit_tags?: string[]
          id?: string
          is_active?: boolean
          llm_connection_id?: string | null
          max_turns?: number
          name?: string
          objective?: string | null
          operation_id?: string
          product?: string | null
          prompt?: string | null
          tone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agents_llm_connection_id_fkey"
            columns: ["llm_connection_id"]
            isOneToOne: false
            referencedRelation: "llm_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_targets: {
        Row: {
          broadcast_id: string
          created_at: string
          error_message: string | null
          id: string
          lead_id: string
          processed_at: string | null
          scheduled_at: string
          status: string
        }
        Insert: {
          broadcast_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          lead_id: string
          processed_at?: string | null
          scheduled_at: string
          status?: string
        }
        Update: {
          broadcast_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          lead_id?: string
          processed_at?: string | null
          scheduled_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_targets_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcasts: {
        Row: {
          completed_at: string | null
          created_at: string
          flow_id: string
          id: string
          max_interval_seconds: number
          min_interval_seconds: number
          name: string
          operation_id: string
          started_at: string | null
          status: string
          tag_id: string
          total_leads: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          flow_id: string
          id?: string
          max_interval_seconds?: number
          min_interval_seconds?: number
          name?: string
          operation_id?: string
          started_at?: string | null
          status?: string
          tag_id: string
          total_leads?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          flow_id?: string
          id?: string
          max_interval_seconds?: number
          min_interval_seconds?: number
          name?: string
          operation_id?: string
          started_at?: string | null
          status?: string
          tag_id?: string
          total_leads?: number
        }
        Relationships: [
          {
            foreignKeyName: "broadcasts_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_blocks: {
        Row: {
          block_type: string
          branch_no_block_id: string | null
          branch_yes_block_id: string | null
          condition_type: string | null
          condition_value: string | null
          created_at: string
          flow_id: string
          id: string
          order_index: number
          reference_id: string | null
          wait_minutes: number
        }
        Insert: {
          block_type: string
          branch_no_block_id?: string | null
          branch_yes_block_id?: string | null
          condition_type?: string | null
          condition_value?: string | null
          created_at?: string
          flow_id: string
          id?: string
          order_index: number
          reference_id?: string | null
          wait_minutes?: number
        }
        Update: {
          block_type?: string
          branch_no_block_id?: string | null
          branch_yes_block_id?: string | null
          condition_type?: string | null
          condition_value?: string | null
          created_at?: string
          flow_id?: string
          id?: string
          order_index?: number
          reference_id?: string | null
          wait_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "flow_blocks_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
        ]
      }
      flows: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          operation_id: string
          trigger_type: string
          trigger_value: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          operation_id?: string
          trigger_type?: string
          trigger_value?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          operation_id?: string
          trigger_type?: string
          trigger_value?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "flows_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
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
          tag_id: string | null
          tag_operation: string | null
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
          tag_id?: string | null
          tag_operation?: string | null
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
          tag_id?: string | null
          tag_operation?: string | null
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
          {
            foreignKeyName: "funnel_steps_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
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
          operation_id: string
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
          operation_id?: string
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
          operation_id?: string
          position?: number
          respostas?: number
          start_max?: number
          start_min?: number
          updated_at?: string
          window_end?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "funnels_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      instances: {
        Row: {
          api_key: string
          base_url: string
          created_at: string
          id: string
          instance_id: string | null
          instance_name: string
          operation_id: string
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
          operation_id?: string
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
          operation_id?: string
          qr_code?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instances_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "lead_funnel_states_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_with_last_message"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_tags: {
        Row: {
          assigned_at: string | null
          assigned_by: string
          id: string
          lead_id: string
          tag_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string
          id?: string
          lead_id: string
          tag_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string
          id?: string
          lead_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_tags_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_tags_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_with_last_message"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          created_at: string
          current_agent_id: string | null
          first_contact_at: string | null
          ia_paused: boolean
          id: string
          instance_name: string | null
          is_new_lead: boolean
          last_interaction_at: string | null
          name: string | null
          operation_id: string
          push_name: string | null
          remote_jid: string | null
          status: string
          tags: string[]
          updated_at: string
          whatsapp_number: string
        }
        Insert: {
          created_at?: string
          current_agent_id?: string | null
          first_contact_at?: string | null
          ia_paused?: boolean
          id?: string
          instance_name?: string | null
          is_new_lead?: boolean
          last_interaction_at?: string | null
          name?: string | null
          operation_id?: string
          push_name?: string | null
          remote_jid?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
          whatsapp_number: string
        }
        Update: {
          created_at?: string
          current_agent_id?: string | null
          first_contact_at?: string | null
          ia_paused?: boolean
          id?: string
          instance_name?: string | null
          is_new_lead?: boolean
          last_interaction_at?: string | null
          name?: string | null
          operation_id?: string
          push_name?: string | null
          remote_jid?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
          whatsapp_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_connections: {
        Row: {
          api_key: string
          created_at: string
          id: string
          is_active: boolean
          max_tokens: number
          model: string
          name: string
          operation_id: string
          provider: string
          temperature: number
        }
        Insert: {
          api_key: string
          created_at?: string
          id?: string
          is_active?: boolean
          max_tokens?: number
          model: string
          name: string
          operation_id: string
          provider: string
          temperature?: number
        }
        Update: {
          api_key?: string
          created_at?: string
          id?: string
          is_active?: boolean
          max_tokens?: number
          model?: string
          name?: string
          operation_id?: string
          provider?: string
          temperature?: number
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
          {
            foreignKeyName: "messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_with_last_message"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          operation_id: string
          pix_key: string | null
          price: number
          product_name: string | null
          recipient: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          operation_id?: string
          pix_key?: string | null
          price: number
          product_name?: string | null
          recipient?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          operation_id?: string
          pix_key?: string | null
          price?: number
          product_name?: string | null
          recipient?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offers_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      operations: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          instance_name: string | null
          is_active: boolean
          name: string
          slug: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          instance_name?: string | null
          is_active?: boolean
          name: string
          slug: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          instance_name?: string | null
          is_active?: boolean
          name?: string
          slug?: string
        }
        Relationships: []
      }
      sales: {
        Row: {
          amount: number
          created_at: string
          id: string
          lead_id: string
          notes: string | null
          offer_id: string
          operation_id: string
          sale_date: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          lead_id: string
          notes?: string | null
          offer_id: string
          operation_id: string
          sale_date: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          lead_id?: string
          notes?: string | null
          offer_id?: string
          operation_id?: string
          sale_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_with_last_message"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
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
          dispatch_started_at: string | null
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
          dispatch_started_at?: string | null
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
          dispatch_started_at?: string | null
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
            foreignKeyName: "scheduled_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_with_last_message"
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
      tags: {
        Row: {
          color: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          operation_id: string
        }
        Insert: {
          color?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          operation_id?: string
        }
        Update: {
          color?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          operation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          role: string
          status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          role?: string
          status?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          role?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      leads_with_last_message: {
        Row: {
          created_at: string | null
          first_contact_at: string | null
          ia_paused: boolean | null
          id: string | null
          instance_name: string | null
          is_new_lead: boolean | null
          last_interaction_at: string | null
          last_message_at: string | null
          last_message_content: string | null
          last_message_direction: string | null
          last_message_type: string | null
          name: string | null
          push_name: string | null
          remote_jid: string | null
          status: string | null
          tags: string[] | null
          tags_data: Json | null
          updated_at: string | null
          whatsapp_number: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      check_completed_funnels: { Args: never; Returns: undefined }
      claim_broadcast_targets: {
        Args: { p_limit?: number }
        Returns: {
          broadcast_id: string
          created_at: string
          error_message: string | null
          id: string
          lead_id: string
          processed_at: string | null
          scheduled_at: string
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "broadcast_targets"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_scheduled_messages: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          caption: string | null
          content: string | null
          created_at: string
          dispatch_started_at: string | null
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
        }[]
        SetofOptions: {
          from: "*"
          to: "scheduled_messages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      current_user_role: { Args: never; Returns: string }
      current_user_status: { Args: never; Returns: string }
      is_admin: { Args: { _uid: string }; Returns: boolean }
      leads_per_day: {
        Args: { op_id: string }
        Returns: {
          day: string
          new_leads: number
          total: number
        }[]
      }
      leads_per_day_by_tag: {
        Args: { op_id: string }
        Returns: {
          day: string
          tag_color: string
          tag_id: string
          tag_name: string
          total: number
        }[]
      }
      requeue_stuck_dispatching: {
        Args: { p_older_than_seconds?: number }
        Returns: number
      }
      sales_summary: {
        Args: { date_from: string; date_to: string; op_id: string }
        Returns: Json
      }
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
