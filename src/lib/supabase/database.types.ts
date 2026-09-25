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
      quote_attachments: {
        Row: { id: string; quote_id: string; user_id: string; path: string; name: string; content_type: string; created_at: string; deleted_at: string | null }
        Insert: { id?: string; quote_id: string; user_id: string; path: string; name: string; content_type: string; created_at?: string; deleted_at?: string | null }
        Update: { deleted_at?: string | null }
        Relationships: []
      }
      quote_requests: {
        Row: { id: string; user_id: string; quote_id: string | null; client_id: string | null; client_name: string; client_email: string | null; client_phone: string | null; site_address: string | null; description: string; status: string; error_message: string | null; source_ip: string | null; user_agent: string | null; created_at: string; generated_at: string | null; seen_at: string | null }
        Insert: { id?: string; user_id: string; quote_id?: string | null; client_id?: string | null; client_name: string; client_email?: string | null; client_phone?: string | null; site_address?: string | null; description: string; status?: string; error_message?: string | null; source_ip?: string | null; user_agent?: string | null; created_at?: string; generated_at?: string | null; seen_at?: string | null }
        Update: { quote_id?: string | null; client_id?: string | null; status?: string; error_message?: string | null; generated_at?: string | null; seen_at?: string | null }
        Relationships: []
      }
      quote_videos: {
        Row: { id: string; quote_id: string; user_id: string; quote_version: number; status: "queued" | "rendering" | "ready" | "failed"; storage_path: string | null; poster_path: string | null; error: string | null; attempts: number; created_at: string; updated_at: string; rendered_at: string | null }
        Insert: { id?: string; quote_id: string; user_id: string; quote_version: number; status: "queued" | "rendering" | "ready" | "failed"; storage_path?: string | null; poster_path?: string | null; error?: string | null; attempts?: number; created_at?: string; updated_at?: string; rendered_at?: string | null }
        Update: { status?: "queued" | "rendering" | "ready" | "failed"; storage_path?: string | null; poster_path?: string | null; error?: string | null; attempts?: number; updated_at?: string; rendered_at?: string | null }
        Relationships: []
      }
      quote_video_requests: {
        Row: { id: number; user_id: string; requested_at: string }
        Insert: { user_id: string; requested_at?: string }
        Update: { requested_at?: string }
        Relationships: []
      }

      agent_events: {
        Row: {
          agent_name: string
          created_at: string
          event_type: string
          handoff_from: string | null
          handoff_to: string | null
          id: string
          message: string | null
          metadata: Json | null
          progress_pct: number | null
          quote_id: string | null
          run_id: string | null
          status: string
          step: string | null
          user_id: string | null
        }
        Insert: {
          agent_name: string
          created_at?: string
          event_type: string
          handoff_from?: string | null
          handoff_to?: string | null
          id?: string
          message?: string | null
          metadata?: Json | null
          progress_pct?: number | null
          quote_id?: string | null
          run_id?: string | null
          status: string
          step?: string | null
          user_id?: string | null
        }
        Update: {
          agent_name?: string
          created_at?: string
          event_type?: string
          handoff_from?: string | null
          handoff_to?: string | null
          id?: string
          message?: string | null
          metadata?: Json | null
          progress_pct?: number | null
          quote_id?: string | null
          run_id?: string | null
          status?: string
          step?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      agent_runs: {
        Row: {
          agent_name: string
          approval_required: boolean
          duration_ms: number | null
          error_message: string | null
          finished_at: string | null
          handoff_from: string | null
          handoff_to: string | null
          id: string
          last_message: string | null
          last_step: string | null
          quote_id: string | null
          run_id: string
          started_at: string
          status: string
          user_id: string | null
        }
        Insert: {
          agent_name: string
          approval_required?: boolean
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          handoff_from?: string | null
          handoff_to?: string | null
          id?: string
          last_message?: string | null
          last_step?: string | null
          quote_id?: string | null
          run_id: string
          started_at?: string
          status: string
          user_id?: string | null
        }
        Update: {
          agent_name?: string
          approval_required?: boolean
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          handoff_from?: string | null
          handoff_to?: string | null
          id?: string
          last_message?: string | null
          last_step?: string | null
          quote_id?: string | null
          run_id?: string
          started_at?: string
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      ai_recommendations: {
        Row: {
          agent: string
          assessment_id: string | null
          created_at: string
          id: string
          model: string | null
          output: Json
          quote_id: string
          user_id: string
        }
        Insert: {
          agent?: string
          assessment_id?: string | null
          created_at?: string
          id?: string
          model?: string | null
          output: Json
          quote_id: string
          user_id: string
        }
        Update: {
          agent?: string
          assessment_id?: string | null
          created_at?: string
          id?: string
          model?: string | null
          output?: Json
          quote_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_recommendations_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "job_weather_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_recommendations_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      app_waitlist: {
        Row: {
          created_at: string
          email: string
          id: string
          source: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          source?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          source?: string
        }
        Relationships: []
      }
      beta_feedback: {
        Row: {
          app_version: string | null
          created_at: string
          id: string
          user_id: string
          what_confusing: string | null
          what_worked: string | null
          would_pay: string | null
          wrong_number: string | null
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          id?: string
          user_id: string
          what_confusing?: string | null
          what_worked?: string | null
          would_pay?: string | null
          wrong_number?: string | null
        }
        Update: {
          app_version?: string | null
          created_at?: string
          id?: string
          user_id?: string
          what_confusing?: string | null
          what_worked?: string | null
          would_pay?: string | null
          wrong_number?: string | null
        }
        Relationships: []
      }
      chat_reports: {
        Row: {
          created_at: string
          id: string
          message_index: number | null
          message_preview: string | null
          quote_id: string
          reason: string | null
          reporter: string
          resolved_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message_index?: number | null
          message_preview?: string | null
          quote_id: string
          reason?: string | null
          reporter: string
          resolved_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message_index?: number | null
          message_preview?: string | null
          quote_id?: string
          reason?: string | null
          reporter?: string
          resolved_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_reports_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_notes: {
        Row: {
          body: string
          created_at: string
          id: string
          note_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          note_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          note_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          user_id?: string
        }
        Relationships: []
      }
      customer_message_drafts: {
        Row: {
          assessment_id: string | null
          channel: string
          confidence: string | null
          created_at: string
          id: string
          internal_note: string | null
          message: string | null
          model: string | null
          quote_id: string
          reason: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assessment_id?: string | null
          channel?: string
          confidence?: string | null
          created_at?: string
          id?: string
          internal_note?: string | null
          message?: string | null
          model?: string | null
          quote_id: string
          reason?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assessment_id?: string | null
          channel?: string
          confidence?: string | null
          created_at?: string
          id?: string
          internal_note?: string | null
          message?: string | null
          model?: string | null
          quote_id?: string
          reason?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_message_drafts_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "job_weather_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_message_drafts_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_settings: {
        Row: {
          auto_followup_enabled: boolean
          auto_review_enabled: boolean
          created_at: string
          google_review_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_followup_enabled?: boolean
          auto_review_enabled?: boolean
          created_at?: string
          google_review_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_followup_enabled?: boolean
          auto_review_enabled?: boolean
          created_at?: string
          google_review_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          created_at: string
          currency: string
          deleted_at: string | null
          due_date: string
          id: string
          invoice_data: Json
          invoice_number: string
          paid_at: string | null
          quote_id: string
          sent_at: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          tax_amount: number
          total_amount: number
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          deleted_at?: string | null
          due_date: string
          id?: string
          invoice_data: Json
          invoice_number: string
          paid_at?: string | null
          quote_id: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          tax_amount?: number
          total_amount: number
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          deleted_at?: string | null
          due_date?: string
          id?: string
          invoice_data?: Json
          invoice_number?: string
          paid_at?: string | null
          quote_id?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      job_type_rules: {
        Row: {
          created_at: string
          default_actions: Json
          display_name: string
          is_system: boolean
          job_type: string
          outdoor: boolean
          risk_thresholds: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_actions?: Json
          display_name: string
          is_system?: boolean
          job_type: string
          outdoor?: boolean
          risk_thresholds: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_actions?: Json
          display_name?: string
          is_system?: boolean
          job_type?: string
          outdoor?: boolean
          risk_thresholds?: Json
          updated_at?: string
        }
        Relationships: []
      }
      job_weather_assessments: {
        Row: {
          created_at: string
          customer_comms_needed: boolean
          forecast_snapshot: Json | null
          generated_at: string
          id: string
          job_type: string | null
          pat_should_run: boolean
          provider: string
          quote_id: string
          recommended_action: string | null
          risk_level: string
          risk_types: Json
          summary: string | null
          trigger_source: string
          triggers_fired: Json
          user_id: string
          willa_should_run: boolean
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          created_at?: string
          customer_comms_needed?: boolean
          forecast_snapshot?: Json | null
          generated_at?: string
          id?: string
          job_type?: string | null
          pat_should_run?: boolean
          provider?: string
          quote_id: string
          recommended_action?: string | null
          risk_level?: string
          risk_types?: Json
          summary?: string | null
          trigger_source?: string
          triggers_fired?: Json
          user_id: string
          willa_should_run?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          created_at?: string
          customer_comms_needed?: boolean
          forecast_snapshot?: Json | null
          generated_at?: string
          id?: string
          job_type?: string | null
          pat_should_run?: boolean
          provider?: string
          quote_id?: string
          recommended_action?: string | null
          risk_level?: string
          risk_types?: Json
          summary?: string | null
          trigger_source?: string
          triggers_fired?: Json
          user_id?: string
          willa_should_run?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_weather_assessments_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      kit_items: {
        Row: {
          created_at: string
          description: string
          id: string
          kit_id: string
          position: number
          quantity: number
          type: string
          unit: string | null
          unit_price: number
          user_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          kit_id: string
          position?: number
          quantity?: number
          type?: string
          unit?: string | null
          unit_price?: number
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          kit_id?: string
          position?: number
          quantity?: number
          type?: string
          unit?: string | null
          unit_price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kit_items_kit_id_fkey"
            columns: ["kit_id"]
            isOneToOne: false
            referencedRelation: "kits"
            referencedColumns: ["id"]
          },
        ]
      }
      kits: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          trade: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          trade?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          trade?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lifecycle_emails: {
        Row: {
          id: string
          kind: string
          provider_message_id: string | null
          sent_at: string
          user_id: string
        }
        Insert: {
          id?: string
          kind: string
          provider_message_id?: string | null
          sent_at?: string
          user_id: string
        }
        Update: {
          id?: string
          kind?: string
          provider_message_id?: string | null
          sent_at?: string
          user_id?: string
        }
        Relationships: []
      }
      material_aliases: {
        Row: {
          alias: string
          confidence: string | null
          created_at: string
          id: string
          material_id: string
          normalized_alias: string
          source: string
        }
        Insert: {
          alias: string
          confidence?: string | null
          created_at?: string
          id?: string
          material_id: string
          normalized_alias: string
          source: string
        }
        Update: {
          alias?: string
          confidence?: string | null
          created_at?: string
          id?: string
          material_id?: string
          normalized_alias?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_aliases_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          active: boolean
          attributes: Json
          barcode: string | null
          brand: string | null
          category: string | null
          compliance_notes: string | null
          country: string
          created_at: string
          default_unit_price: number | null
          gst_included: boolean
          id: string
          internal_notes: string | null
          is_ai_estimated: boolean
          last_used_at: string | null
          name: string
          normalized_name: string | null
          notes: string | null
          price_confidence: string | null
          price_last_checked_at: string | null
          price_source: string | null
          sku: string | null
          supplier: string | null
          supplier_url: string | null
          trade_name: string | null
          unit: string | null
          updated_at: string
          usage_count: number
          user_id: string | null
        }
        Insert: {
          active?: boolean
          attributes?: Json
          barcode?: string | null
          brand?: string | null
          category?: string | null
          compliance_notes?: string | null
          country?: string
          created_at?: string
          default_unit_price?: number | null
          gst_included?: boolean
          id?: string
          internal_notes?: string | null
          is_ai_estimated?: boolean
          last_used_at?: string | null
          name: string
          normalized_name?: string | null
          notes?: string | null
          price_confidence?: string | null
          price_last_checked_at?: string | null
          price_source?: string | null
          sku?: string | null
          supplier?: string | null
          supplier_url?: string | null
          trade_name?: string | null
          unit?: string | null
          updated_at?: string
          usage_count?: number
          user_id?: string | null
        }
        Update: {
          active?: boolean
          attributes?: Json
          barcode?: string | null
          brand?: string | null
          category?: string | null
          compliance_notes?: string | null
          country?: string
          created_at?: string
          default_unit_price?: number | null
          gst_included?: boolean
          id?: string
          internal_notes?: string | null
          is_ai_estimated?: boolean
          last_used_at?: string | null
          name?: string
          normalized_name?: string | null
          notes?: string | null
          price_confidence?: string | null
          price_last_checked_at?: string | null
          price_source?: string | null
          sku?: string | null
          supplier?: string | null
          supplier_url?: string | null
          trade_name?: string | null
          unit?: string | null
          updated_at?: string
          usage_count?: number
          user_id?: string | null
        }
        Relationships: []
      }
      payment_accounts: {
        Row: {
          charges_enabled: boolean
          created_at: string
          deposit_pct: number
          details_submitted: boolean
          stripe_account_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          charges_enabled?: boolean
          created_at?: string
          deposit_pct?: number
          details_submitted?: boolean
          stripe_account_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          charges_enabled?: boolean
          created_at?: string
          deposit_pct?: number
          details_submitted?: boolean
          stripe_account_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          id: string
          paid_at: string | null
          quote_id: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency: string
          id?: string
          paid_at?: string | null
          quote_id?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string | null
          quote_id?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_files: {
        Row: {
          byte_size: number
          id: string
          mime: string
          original_filename: string
          page_count: number
          project_id: string | null
          quote_id: string | null
          status: string
          storage_path: string
          uploaded_at: string
          user_id: string
        }
        Insert: {
          byte_size: number
          id?: string
          mime: string
          original_filename: string
          page_count?: number
          project_id?: string | null
          quote_id?: string | null
          status?: string
          storage_path: string
          uploaded_at?: string
          user_id: string
        }
        Update: {
          byte_size?: number
          id?: string
          mime?: string
          original_filename?: string
          page_count?: number
          project_id?: string | null
          quote_id?: string | null
          status?: string
          storage_path?: string
          uploaded_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_files_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_sheets: {
        Row: {
          classification_basis: Json
          classification_confidence: number
          created_at: string
          extraction: Json | null
          file_id: string
          id: string
          image_path: string
          review_reasons: Json
          review_required: boolean
          sheet_label: string | null
          sheet_number: number
          sheet_type: string
          status: string
          user_id: string
        }
        Insert: {
          classification_basis?: Json
          classification_confidence?: number
          created_at?: string
          extraction?: Json | null
          file_id: string
          id?: string
          image_path: string
          review_reasons?: Json
          review_required?: boolean
          sheet_label?: string | null
          sheet_number: number
          sheet_type?: string
          status?: string
          user_id: string
        }
        Update: {
          classification_basis?: Json
          classification_confidence?: number
          created_at?: string
          extraction?: Json | null
          file_id?: string
          id?: string
          image_path?: string
          review_reasons?: Json
          review_required?: boolean
          sheet_label?: string | null
          sheet_number?: number
          sheet_type?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_sheets_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "plan_files"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          request_slug: string | null
          address: string | null
          avatar_url: string | null
          ai_consent_at: string | null
          ai_consent_version: string | null
          business_name: string | null
          country: string | null
          created_at: string
          currency: string | null
          default_labour_rate: number | null
          default_markup_pct: number | null
          email: string | null
          gst_number: string | null
          id: string
          logo_url: string | null
          min_margin_percent: number | null
          phone: string | null
          tax_label: string | null
          tax_rate: number | null
          trial_started_at: string | null
          ui_new_look: boolean | null
          updated_at: string
        }
        Insert: {
          request_slug?: string | null
          address?: string | null
          avatar_url?: string | null
          ai_consent_at?: string | null
          ai_consent_version?: string | null
          business_name?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          default_labour_rate?: number | null
          default_markup_pct?: number | null
          email?: string | null
          gst_number?: string | null
          id: string
          logo_url?: string | null
          min_margin_percent?: number | null
          phone?: string | null
          tax_label?: string | null
          tax_rate?: number | null
          trial_started_at?: string | null
          ui_new_look?: boolean | null
          updated_at?: string
        }
        Update: {
          request_slug?: string | null
          address?: string | null
          avatar_url?: string | null
          ai_consent_at?: string | null
          ai_consent_version?: string | null
          business_name?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          default_labour_rate?: number | null
          default_markup_pct?: number | null
          email?: string | null
          gst_number?: string | null
          id?: string
          logo_url?: string | null
          min_margin_percent?: number | null
          phone?: string | null
          tax_label?: string | null
          tax_rate?: number | null
          trial_started_at?: string | null
          ui_new_look?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      quote_edit_events: {
        Row: {
          created_at: string
          diff: Json
          edited_data: Json
          id: string
          quote_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          diff: Json
          edited_data: Json
          id?: string
          quote_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          diff?: Json
          edited_data?: Json
          id?: string
          quote_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_edit_events_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_events: {
        Row: {
          created_at: string
          id: string
          metadata: Json | null
          quote_id: string
          type: Database["public"]["Enums"]["quote_event_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json | null
          quote_id: string
          type: Database["public"]["Enums"]["quote_event_type"]
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json | null
          quote_id?: string
          type?: Database["public"]["Enums"]["quote_event_type"]
        }
        Relationships: [
          {
            foreignKeyName: "quote_events_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_followups: {
        Row: {
          channel: string
          id: string
          quote_id: string
          sent_at: string
          step: number
          user_id: string
        }
        Insert: {
          channel?: string
          id?: string
          quote_id: string
          sent_at?: string
          step: number
          user_id: string
        }
        Update: {
          channel?: string
          id?: string
          quote_id?: string
          sent_at?: string
          step?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_followups_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          description: string
          id: string
          line_total: number | null
          quantity: number | null
          quote_id: string
          type: Database["public"]["Enums"]["quote_item_type"]
          unit: string | null
          unit_price: number | null
        }
        Insert: {
          description: string
          id?: string
          line_total?: number | null
          quantity?: number | null
          quote_id: string
          type: Database["public"]["Enums"]["quote_item_type"]
          unit?: string | null
          unit_price?: number | null
        }
        Update: {
          description?: string
          id?: string
          line_total?: number | null
          quantity?: number | null
          quote_id?: string
          type?: Database["public"]["Enums"]["quote_item_type"]
          unit?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_site_context: {
        Row: {
          created_at: string
          geocoded_address: string | null
          indoor_outdoor: string
          job_type: string | null
          latitude: number | null
          longitude: number | null
          quote_id: string
          timezone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          geocoded_address?: string | null
          indoor_outdoor?: string
          job_type?: string | null
          latitude?: number | null
          longitude?: number | null
          quote_id: string
          timezone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          geocoded_address?: string | null
          indoor_outdoor?: string
          job_type?: string | null
          latitude?: number | null
          longitude?: number | null
          quote_id?: string
          timezone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_site_context_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: true
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          accepted_at: string | null
          accepted_email: string | null
          accepted_ip: string | null
          accepted_name: string | null
          accepted_quote_version: number
          accepted_total: number | null
          accepted_user_agent: string | null
          ai_snapshot: Json | null
          archived_at: string | null
          chat_disabled: boolean
          client_id: string | null
          completed_at: string | null
          created_at: string
          currency: string | null
          declined_at: string | null
          deleted_at: string | null
          expires_at: string | null
          follow_up_sent_at: string | null
          generation_started_at: string | null
          id: string
          pdf_path: string | null
          pdf_version: number | null
          public_token: string | null
          quote_data: Json | null
          scheduled_for: string | null
          sent_at: string | null
          signature_path: string | null
          signed_at: string | null
          signed_name: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["quote_status"]
          total_amount: number | null
          user_id: string
          version: number
          viewed_at: string | null
          voice_transcript: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_email?: string | null
          accepted_ip?: string | null
          accepted_name?: string | null
          accepted_quote_version?: number
          accepted_total?: number | null
          accepted_user_agent?: string | null
          ai_snapshot?: Json | null
          archived_at?: string | null
          chat_disabled?: boolean
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          currency?: string | null
          declined_at?: string | null
          deleted_at?: string | null
          expires_at?: string | null
          follow_up_sent_at?: string | null
          generation_started_at?: string | null
          id?: string
          pdf_path?: string | null
          pdf_version?: number | null
          public_token?: string | null
          quote_data?: Json | null
          scheduled_for?: string | null
          sent_at?: string | null
          signature_path?: string | null
          signed_at?: string | null
          signed_name?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          total_amount?: number | null
          user_id: string
          version?: number
          viewed_at?: string | null
          voice_transcript?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_email?: string | null
          accepted_ip?: string | null
          accepted_name?: string | null
          accepted_quote_version?: number
          accepted_total?: number | null
          accepted_user_agent?: string | null
          ai_snapshot?: Json | null
          archived_at?: string | null
          chat_disabled?: boolean
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          currency?: string | null
          declined_at?: string | null
          deleted_at?: string | null
          expires_at?: string | null
          follow_up_sent_at?: string | null
          generation_started_at?: string | null
          id?: string
          pdf_path?: string | null
          pdf_version?: number | null
          public_token?: string | null
          quote_data?: Json | null
          scheduled_for?: string | null
          sent_at?: string | null
          signature_path?: string | null
          signed_at?: string | null
          signed_name?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          total_amount?: number | null
          user_id?: string
          version?: number
          viewed_at?: string | null
          voice_transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      review_requests: {
        Row: {
          channel: string
          id: string
          quote_id: string
          sent_at: string
          status: string
          user_id: string
        }
        Insert: {
          channel?: string
          id?: string
          quote_id: string
          sent_at?: string
          status?: string
          user_id: string
        }
        Update: {
          channel?: string
          id?: string
          quote_id?: string
          sent_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_requests_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: true
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_webhook_events: {
        Row: {
          event_id: string
          received_at: string
          type: string | null
        }
        Insert: {
          event_id: string
          received_at?: string
          type?: string | null
        }
        Update: {
          event_id?: string
          received_at?: string
          type?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          id: string
          plan: string | null
          status: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tradie_memories: {
        Row: {
          created_at: string
          first_seen_at: string
          id: string
          last_seen_at: string
          last_used_at: string | null
          memory_key: string
          memory_type: string
          provenance: Json
          source: string
          status: string
          strength: number
          updated_at: string
          user_id: string
          value: Json
        }
        Insert: {
          created_at?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          last_used_at?: string | null
          memory_key: string
          memory_type: string
          provenance?: Json
          source: string
          status?: string
          strength?: number
          updated_at?: string
          user_id: string
          value?: Json
        }
        Update: {
          created_at?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          last_used_at?: string | null
          memory_key?: string
          memory_type?: string
          provenance?: Json
          source?: string
          status?: string
          strength?: number
          updated_at?: string
          user_id?: string
          value?: Json
        }
        Relationships: []
      }
      weather_alerts_cache: {
        Row: {
          alerts: Json
          expires_at: string
          generated_at: string
          id: string
          latitude: number
          location_key: string
          longitude: number
          provider: string
        }
        Insert: {
          alerts?: Json
          expires_at: string
          generated_at?: string
          id?: string
          latitude: number
          location_key: string
          longitude: number
          provider?: string
        }
        Update: {
          alerts?: Json
          expires_at?: string
          generated_at?: string
          id?: string
          latitude?: number
          location_key?: string
          longitude?: number
          provider?: string
        }
        Relationships: []
      }
      weather_forecasts_cache: {
        Row: {
          alerts: Json
          expires_at: string
          generated_at: string
          hourly: Json
          id: string
          latitude: number
          location_key: string
          longitude: number
          provider: string
          window_end: string
          window_start: string
        }
        Insert: {
          alerts?: Json
          expires_at: string
          generated_at?: string
          hourly?: Json
          id?: string
          latitude: number
          location_key: string
          longitude: number
          provider?: string
          window_end: string
          window_start: string
        }
        Update: {
          alerts?: Json
          expires_at?: string
          generated_at?: string
          hourly?: Json
          id?: string
          latitude?: number
          location_key?: string
          longitude?: number
          provider?: string
          window_end?: string
          window_start?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      issue_team_code: { Args: { p_user: string; p_token_hash: string; p_code_hash: string }; Returns: Json }
      sync_stripe_subscription: { Args: { p_data: Json }; Returns: undefined }
      register_quote_photo: { Args: { p_data: Json }; Returns: Json }
      request_quote_video: { Args: { p_quote_id: string }; Returns: Json }
      claim_quote_video_job: { Args: never; Returns: Database["public"]["Tables"]["quote_videos"]["Row"][] }
      remove_quote_photo: { Args: { p_id: string; p_user: string }; Returns: undefined }
      accept_quote: {
        Args: {
          p_email: string
          p_ip: string
          p_name: string
          p_signature_path: string
          p_token: string
          p_total: number
          p_user_agent: string
          p_version: number
        }
        Returns: Json
      }
      append_quote_chat_messages: {
        Args: { p_messages: Json; p_quote_id: string }
        Returns: undefined
      }
      create_invoice_from_quote: {
        Args: { p_quote_id: string }
        Returns: string
      }
      get_quote_by_token: { Args: { p_token: string }; Returns: Json }
      mark_quote_viewed: { Args: { p_token: string }; Returns: undefined }
      search_materials: {
        Args: {
          p_brand?: string
          p_category?: string
          p_country?: string
          p_limit?: number
          p_query: string
          p_supplier?: string
          p_treatment_class?: string
        }
        Returns: {
          attributes: Json
          brand: string
          category: string
          id: string
          match_score: number
          match_source: string
          name: string
          price: number
          tier_rank: number
          unit: string
          user_id: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      transition_quote_lifecycle: {
        Args: {
          p_metadata?: Json
          p_quote_id: string
          p_target: Database["public"]["Enums"]["quote_status"]
        }
        Returns: Database["public"]["Enums"]["quote_status"]
      }
    }
    Enums: {
      invoice_status: "draft" | "sent" | "paid" | "overdue" | "cancelled"
      quote_event_type:
        | "sent"
        | "viewed"
        | "accepted"
        | "declined"
        | "expired"
        | "scheduled"
        | "in_progress"
        | "completed"
        | "follow_up_sent"
        | "sms_sent"
        | "invoice_sent"
      quote_item_type: "material" | "labour" | "other"
      quote_status:
        | "draft"
        | "sent"
        | "viewed"
        | "accepted"
        | "declined"
        | "expired"
        | "scheduled"
        | "in_progress"
        | "completed"
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
    Enums: {
      invoice_status: ["draft", "sent", "paid", "overdue", "cancelled"],
      quote_event_type: [
        "sent",
        "viewed",
        "accepted",
        "declined",
        "expired",
        "scheduled",
        "in_progress",
        "completed",
        "follow_up_sent",
        "sms_sent",
        "invoice_sent",
      ],
      quote_item_type: ["material", "labour", "other"],
      quote_status: [
        "draft",
        "sent",
        "viewed",
        "accepted",
        "declined",
        "expired",
        "scheduled",
        "in_progress",
        "completed",
      ],
    },
  },
} as const
