
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "brief_sources": {
                  Row: {
                    "brief_id": string,"created_at": string,"evidence_type": Database["public"]['Enums']["evidence_type"],"finding": string,"id": string,"is_repeat_coverage_of": string | null,"relevance": Database["public"]['Enums']["relevance"],"source_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "brief_id": string,"created_at"?: string,"evidence_type": Database["public"]['Enums']["evidence_type"],"finding": string,"id"?: string,"is_repeat_coverage_of"?: string | null,"relevance": Database["public"]['Enums']["relevance"],"source_id": string
                  }
                  Update: {
                    "brief_id"?: string,"created_at"?: string,"evidence_type"?: Database["public"]['Enums']["evidence_type"],"finding"?: string,"id"?: string,"is_repeat_coverage_of"?: string | null,"relevance"?: Database["public"]['Enums']["relevance"],"source_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "brief_sources_brief_id_fkey"
      columns: ["brief_id"]
isOneToOne: false
      referencedRelation: "briefs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "brief_sources_brief_id_fkey"
      columns: ["brief_id"]
isOneToOne: false
      referencedRelation: "latest_briefs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "brief_sources_is_repeat_coverage_of_fkey"
      columns: ["is_repeat_coverage_of"]
isOneToOne: false
      referencedRelation: "brief_sources"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "brief_sources_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    }
                  ]
                },"briefs": {
                  Row: {
                    "analysis": NonNullable<Json>,"analyzed_at": string,"company_id": string,"created_by": string | null,"discovery_run_id": string | null,"dismissed": boolean,"dismissed_at": string | null,"dismissed_by": string | null,"id": string,"model": string,"origin": Database["public"]['Enums']["brief_origin"],"rating": Database["public"]['Enums']["signal_rating"],"sector": Database["public"]['Enums']["sector"],"stage": Database["public"]['Enums']["opportunity_stage"],"trigger_query": string | null,"trigger_signal_id": string | null,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "analysis": NonNullable<Json>,"analyzed_at"?: string,"company_id": string,"created_by"?: string | null,"discovery_run_id"?: string | null,"dismissed"?: boolean,"dismissed_at"?: string | null,"dismissed_by"?: string | null,"id"?: string,"model": string,"origin": Database["public"]['Enums']["brief_origin"],"rating": Database["public"]['Enums']["signal_rating"],"sector"?: Database["public"]['Enums']["sector"],"stage"?: Database["public"]['Enums']["opportunity_stage"],"trigger_query"?: string | null,"trigger_signal_id"?: string | null,"version": number
                  }
                  Update: {
                    "analysis"?: NonNullable<Json>,"analyzed_at"?: string,"company_id"?: string,"created_by"?: string | null,"discovery_run_id"?: string | null,"dismissed"?: boolean,"dismissed_at"?: string | null,"dismissed_by"?: string | null,"id"?: string,"model"?: string,"origin"?: Database["public"]['Enums']["brief_origin"],"rating"?: Database["public"]['Enums']["signal_rating"],"sector"?: Database["public"]['Enums']["sector"],"stage"?: Database["public"]['Enums']["opportunity_stage"],"trigger_query"?: string | null,"trigger_signal_id"?: string | null,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "briefs_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "briefs_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "briefs_discovery_run_id_fkey"
      columns: ["discovery_run_id"]
isOneToOne: false
      referencedRelation: "discovery_runs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "briefs_dismissed_by_fkey"
      columns: ["dismissed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "briefs_trigger_signal_id_fkey"
      columns: ["trigger_signal_id"]
isOneToOne: false
      referencedRelation: "signals"
      referencedColumns: ["id"]
    }
                  ]
                },"companies": {
                  Row: {
                    "aliases": (string)[],"created_at": string,"display_name": string,"entity_verified": boolean,"id": string,"normalized_key": string,"ontario_connection": string | null,"parent_company_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "aliases"?: (string)[],"created_at"?: string,"display_name": string,"entity_verified"?: boolean,"id"?: string,"normalized_key": string,"ontario_connection"?: string | null,"parent_company_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "aliases"?: (string)[],"created_at"?: string,"display_name"?: string,"entity_verified"?: boolean,"id"?: string,"normalized_key"?: string,"ontario_connection"?: string | null,"parent_company_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "companies_parent_company_id_fkey"
      columns: ["parent_company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"discovery_runs": {
                  Row: {
                    "analyzed": number,"candidates": NonNullable<Json>,"candidates_found": number,"errors": NonNullable<Json>,"finished_at": string | null,"id": string,"outcomes": NonNullable<Json>,"progress": string | null,"sector": Database["public"]['Enums']["sector"],"settings": NonNullable<Json>,"skipped": NonNullable<Json>,"started_at": string,"started_by": string | null,"status": Database["public"]['Enums']["run_status"],"trigger": Database["public"]['Enums']["run_trigger"],"usage": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "analyzed"?: number,"candidates"?: NonNullable<Json>,"candidates_found"?: number,"errors"?: NonNullable<Json>,"finished_at"?: string | null,"id"?: string,"outcomes"?: NonNullable<Json>,"progress"?: string | null,"sector"?: Database["public"]['Enums']["sector"],"settings"?: NonNullable<Json>,"skipped"?: NonNullable<Json>,"started_at"?: string,"started_by"?: string | null,"status"?: Database["public"]['Enums']["run_status"],"trigger"?: Database["public"]['Enums']["run_trigger"],"usage"?: NonNullable<Json>
                  }
                  Update: {
                    "analyzed"?: number,"candidates"?: NonNullable<Json>,"candidates_found"?: number,"errors"?: NonNullable<Json>,"finished_at"?: string | null,"id"?: string,"outcomes"?: NonNullable<Json>,"progress"?: string | null,"sector"?: Database["public"]['Enums']["sector"],"settings"?: NonNullable<Json>,"skipped"?: NonNullable<Json>,"started_at"?: string,"started_by"?: string | null,"status"?: Database["public"]['Enums']["run_status"],"trigger"?: Database["public"]['Enums']["run_trigger"],"usage"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "discovery_runs_started_by_fkey"
      columns: ["started_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"email_outbox": {
                  Row: {
                    "body_html": string,"body_text": string,"created_at": string,"dedupe_key": string,"error": string | null,"id": string,"kind": string,"provider_message_id": string | null,"sent_at": string | null,"status": string,"subject": string,"to_address": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body_html": string,"body_text": string,"created_at"?: string,"dedupe_key": string,"error"?: string | null,"id"?: string,"kind": string,"provider_message_id"?: string | null,"sent_at"?: string | null,"status": string,"subject": string,"to_address": string,"user_id": string
                  }
                  Update: {
                    "body_html"?: string,"body_text"?: string,"created_at"?: string,"dedupe_key"?: string,"error"?: string | null,"id"?: string,"kind"?: string,"provider_message_id"?: string | null,"sent_at"?: string | null,"status"?: string,"subject"?: string,"to_address"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "email_outbox_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"email_preferences": {
                  Row: {
                    "discovery_runs": boolean,"enabled": boolean,"strong_signals": boolean,"updated_at": string,"user_id": string,"watchlist_briefs": boolean,"weekly_digest": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "discovery_runs"?: boolean,"enabled"?: boolean,"strong_signals"?: boolean,"updated_at"?: string,"user_id": string,"watchlist_briefs"?: boolean,"weekly_digest"?: boolean
                  }
                  Update: {
                    "discovery_runs"?: boolean,"enabled"?: boolean,"strong_signals"?: boolean,"updated_at"?: string,"user_id"?: string,"watchlist_briefs"?: boolean,"weekly_digest"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "email_preferences_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"ingestion_runs": {
                  Row: {
                    "errors": NonNullable<Json>,"fetched": number,"finished_at": string | null,"id": string,"inserted": number,"linked": number,"progress": string | null,"settings": NonNullable<Json>,"skip_reasons": NonNullable<Json>,"skipped": number,"source": Database["public"]['Enums']["signal_source_type"],"started_at": string,"started_by": string | null,"status": Database["public"]['Enums']["run_status"],"trigger": Database["public"]['Enums']["run_trigger"],"unchanged": number,"updated": number
                  }
                  ComputedFields: never
                  Insert: {
                    "errors"?: NonNullable<Json>,"fetched"?: number,"finished_at"?: string | null,"id"?: string,"inserted"?: number,"linked"?: number,"progress"?: string | null,"settings"?: NonNullable<Json>,"skip_reasons"?: NonNullable<Json>,"skipped"?: number,"source": Database["public"]['Enums']["signal_source_type"],"started_at"?: string,"started_by"?: string | null,"status"?: Database["public"]['Enums']["run_status"],"trigger"?: Database["public"]['Enums']["run_trigger"],"unchanged"?: number,"updated"?: number
                  }
                  Update: {
                    "errors"?: NonNullable<Json>,"fetched"?: number,"finished_at"?: string | null,"id"?: string,"inserted"?: number,"linked"?: number,"progress"?: string | null,"settings"?: NonNullable<Json>,"skip_reasons"?: NonNullable<Json>,"skipped"?: number,"source"?: Database["public"]['Enums']["signal_source_type"],"started_at"?: string,"started_by"?: string | null,"status"?: Database["public"]['Enums']["run_status"],"trigger"?: Database["public"]['Enums']["run_trigger"],"unchanged"?: number,"updated"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "ingestion_runs_started_by_fkey"
      columns: ["started_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_reads": {
                  Row: {
                    "notification_id": string,"read_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "notification_id": string,"read_at"?: string,"user_id": string
                  }
                  Update: {
                    "notification_id"?: string,"read_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_reads_notification_id_fkey"
      columns: ["notification_id"]
isOneToOne: false
      referencedRelation: "notifications"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_reads_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "body": string | null,"created_at": string,"discovery_run_id": string | null,"id": string,"kind": string,"link": string | null,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"discovery_run_id"?: string | null,"id"?: string,"kind": string,"link"?: string | null,"title": string
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"discovery_run_id"?: string | null,"id"?: string,"kind"?: string,"link"?: string | null,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_discovery_run_id_fkey"
      columns: ["discovery_run_id"]
isOneToOne: false
      referencedRelation: "discovery_runs"
      referencedColumns: ["id"]
    }
                  ]
                },"past_deals": {
                  Row: {
                    "clear_height_ft": number | null,"company_type": string | null,"created_at": string,"created_by": string | null,"deal_date": string | null,"deal_type": string | null,"id": string,"municipality": string | null,"notes": string | null,"occupier": string,"region": string | null,"size_sqft": number | null,"source": string,"source_file": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "clear_height_ft"?: number | null,"company_type"?: string | null,"created_at"?: string,"created_by"?: string | null,"deal_date"?: string | null,"deal_type"?: string | null,"id"?: string,"municipality"?: string | null,"notes"?: string | null,"occupier": string,"region"?: string | null,"size_sqft"?: number | null,"source"?: string,"source_file"?: string | null
                  }
                  Update: {
                    "clear_height_ft"?: number | null,"company_type"?: string | null,"created_at"?: string,"created_by"?: string | null,"deal_date"?: string | null,"deal_type"?: string | null,"id"?: string,"municipality"?: string | null,"notes"?: string | null,"occupier"?: string,"region"?: string | null,"size_sqft"?: number | null,"source"?: string,"source_file"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "past_deals_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"full_name": string | null,"id": string,"role": Database["public"]['Enums']["app_role"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"full_name"?: string | null,"id": string,"role"?: Database["public"]['Enums']["app_role"]
                  }
                  Update: {
                    "created_at"?: string,"full_name"?: string | null,"id"?: string,"role"?: Database["public"]['Enums']["app_role"]
                  }
                  Relationships: [
                    
                  ]
                },"research_sessions": {
                  Row: {
                    "analysis": Json | null,"analysis_errors": Json | null,"analysis_model": string | null,"brief_id": string | null,"company_id": string | null,"created_at": string,"created_by": string | null,"discovery_run_id": string | null,"error": string | null,"filters": Json | null,"id": string,"mode": Database["public"]['Enums']["research_mode"],"progress": string | null,"query": string,"sector": Database["public"]['Enums']["sector"],"source_ids": (string)[],"status": Database["public"]['Enums']["research_status"],"theme_results": NonNullable<Json>,"updated_at": string,"usage": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "analysis"?: Json | null,"analysis_errors"?: Json | null,"analysis_model"?: string | null,"brief_id"?: string | null,"company_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"discovery_run_id"?: string | null,"error"?: string | null,"filters"?: Json | null,"id"?: string,"mode": Database["public"]['Enums']["research_mode"],"progress"?: string | null,"query": string,"sector"?: Database["public"]['Enums']["sector"],"source_ids"?: (string)[],"status"?: Database["public"]['Enums']["research_status"],"theme_results"?: NonNullable<Json>,"updated_at"?: string,"usage"?: NonNullable<Json>
                  }
                  Update: {
                    "analysis"?: Json | null,"analysis_errors"?: Json | null,"analysis_model"?: string | null,"brief_id"?: string | null,"company_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"discovery_run_id"?: string | null,"error"?: string | null,"filters"?: Json | null,"id"?: string,"mode"?: Database["public"]['Enums']["research_mode"],"progress"?: string | null,"query"?: string,"sector"?: Database["public"]['Enums']["sector"],"source_ids"?: (string)[],"status"?: Database["public"]['Enums']["research_status"],"theme_results"?: NonNullable<Json>,"updated_at"?: string,"usage"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "research_sessions_brief_id_fkey"
      columns: ["brief_id"]
isOneToOne: false
      referencedRelation: "briefs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "research_sessions_brief_id_fkey"
      columns: ["brief_id"]
isOneToOne: false
      referencedRelation: "latest_briefs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "research_sessions_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "research_sessions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "research_sessions_discovery_run_id_fkey"
      columns: ["discovery_run_id"]
isOneToOne: false
      referencedRelation: "discovery_runs"
      referencedColumns: ["id"]
    }
                  ]
                },"settings": {
                  Row: {
                    "analysis_model": string | null,"canadabuys_min_value": number,"discovery_cap": number,"discovery_frequency": string,"discovery_month_day": number,"discovery_sector": Database["public"]['Enums']["sector"],"discovery_weekdays": (number)[],"firecrawl_monthly_budget": number,"grants_min_value": number,"id": boolean,"schedule_discovery_enabled": boolean,"schedule_ingestion_enabled": boolean,"screening_model": string | null,"skip_window_days": number,"sources_per_candidate": number,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "analysis_model"?: string | null,"canadabuys_min_value"?: number,"discovery_cap"?: number,"discovery_frequency"?: string,"discovery_month_day"?: number,"discovery_sector"?: Database["public"]['Enums']["sector"],"discovery_weekdays"?: (number)[],"firecrawl_monthly_budget"?: number,"grants_min_value"?: number,"id"?: boolean,"schedule_discovery_enabled"?: boolean,"schedule_ingestion_enabled"?: boolean,"screening_model"?: string | null,"skip_window_days"?: number,"sources_per_candidate"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "analysis_model"?: string | null,"canadabuys_min_value"?: number,"discovery_cap"?: number,"discovery_frequency"?: string,"discovery_month_day"?: number,"discovery_sector"?: Database["public"]['Enums']["sector"],"discovery_weekdays"?: (number)[],"firecrawl_monthly_budget"?: number,"grants_min_value"?: number,"id"?: boolean,"schedule_discovery_enabled"?: boolean,"schedule_ingestion_enabled"?: boolean,"screening_model"?: string | null,"skip_window_days"?: number,"sources_per_candidate"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"signals": {
                  Row: {
                    "company_id": string | null,"entity_key": string | null,"event_at": string | null,"id": string,"ingested_at": string,"location": string | null,"occupier_status": Database["public"]['Enums']["occupier_status"],"published_at": string | null,"raw": NonNullable<Json>,"raw_entity_name": string | null,"sector": Database["public"]['Enums']["sector"],"signal_strength": Database["public"]['Enums']["signal_strength"],"source_record_id": string,"source_type": Database["public"]['Enums']["signal_source_type"],"summary": string | null,"title": string | null,"url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string | null,"entity_key"?: string | null,"event_at"?: string | null,"id"?: string,"ingested_at"?: string,"location"?: string | null,"occupier_status"?: Database["public"]['Enums']["occupier_status"],"published_at"?: string | null,"raw"?: NonNullable<Json>,"raw_entity_name"?: string | null,"sector"?: Database["public"]['Enums']["sector"],"signal_strength"?: Database["public"]['Enums']["signal_strength"],"source_record_id": string,"source_type": Database["public"]['Enums']["signal_source_type"],"summary"?: string | null,"title"?: string | null,"url"?: string | null
                  }
                  Update: {
                    "company_id"?: string | null,"entity_key"?: string | null,"event_at"?: string | null,"id"?: string,"ingested_at"?: string,"location"?: string | null,"occupier_status"?: Database["public"]['Enums']["occupier_status"],"published_at"?: string | null,"raw"?: NonNullable<Json>,"raw_entity_name"?: string | null,"sector"?: Database["public"]['Enums']["sector"],"signal_strength"?: Database["public"]['Enums']["signal_strength"],"source_record_id"?: string,"source_type"?: Database["public"]['Enums']["signal_source_type"],"summary"?: string | null,"title"?: string | null,"url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "signals_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"sources": {
                  Row: {
                    "content_hash": string | null,"date_method": Database["public"]['Enums']["date_method"],"event_at": string | null,"excerpt": string | null,"fetched_at": string,"first_seen_query": string | null,"id": string,"published_at": string | null,"publisher": string | null,"signal_id": string | null,"title": string | null,"url": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content_hash"?: string | null,"date_method"?: Database["public"]['Enums']["date_method"],"event_at"?: string | null,"excerpt"?: string | null,"fetched_at"?: string,"first_seen_query"?: string | null,"id"?: string,"published_at"?: string | null,"publisher"?: string | null,"signal_id"?: string | null,"title"?: string | null,"url": string
                  }
                  Update: {
                    "content_hash"?: string | null,"date_method"?: Database["public"]['Enums']["date_method"],"event_at"?: string | null,"excerpt"?: string | null,"fetched_at"?: string,"first_seen_query"?: string | null,"id"?: string,"published_at"?: string | null,"publisher"?: string | null,"signal_id"?: string | null,"title"?: string | null,"url"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sources_signal_id_fkey"
      columns: ["signal_id"]
isOneToOne: false
      referencedRelation: "signals"
      referencedColumns: ["id"]
    }
                  ]
                },"watchlist": {
                  Row: {
                    "added_at": string,"added_by": string | null,"company_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "added_at"?: string,"added_by"?: string | null,"company_id": string
                  }
                  Update: {
                    "added_at"?: string,"added_by"?: string | null,"company_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "watchlist_added_by_fkey"
      columns: ["added_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "watchlist_company_id_fkey"
      columns: ["company_id"]
isOneToOne: true
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "latest_briefs": {
                  Row: {
                    "analysis": NonNullable<Json>,"analyzed_at": string,"company_id": string,"created_by": string | null,"discovery_run_id": string | null,"dismissed": boolean,"dismissed_at": string | null,"dismissed_by": string | null,"id": string,"model": string,"origin": Database["public"]['Enums']["brief_origin"],"rating": Database["public"]['Enums']["signal_rating"],"sector": Database["public"]['Enums']["sector"],"stage": Database["public"]['Enums']["opportunity_stage"],"trigger_query": string | null,"trigger_signal_id": string | null,"version": number
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "briefs_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "briefs_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "briefs_discovery_run_id_fkey"
      columns: ["discovery_run_id"]
isOneToOne: false
      referencedRelation: "discovery_runs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "briefs_dismissed_by_fkey"
      columns: ["dismissed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "briefs_trigger_signal_id_fkey"
      columns: ["trigger_signal_id"]
isOneToOne: false
      referencedRelation: "signals"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"link_signals_to_companies":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"upsert_signals":
{ Args: { "rows": Json }; Returns: {
              "inserted": number,"updated": number
            }[]
                           }
          }
          Enums: {
            "app_role": "admin"|"member","brief_origin": "discovered"|"live_research","date_method": "metadata"|"structured_data"|"url"|"text"|"none"|"public_record","evidence_type": "fact"|"inference"|"hypothesis"|"unknown","occupier_status": "named"|"unresolved"|"not_applicable","opportunity_stage": "pre_shop"|"active_search"|"site_controlled"|"construction_fit_out"|"open"|"undetermined","relevance": "signal"|"context"|"not_relevant","research_mode": "company"|"theme","research_status": "searching"|"scraping"|"ready"|"analyzing"|"analyzed"|"saved"|"failed","run_status": "queued"|"running"|"completed"|"failed","run_trigger": "manual"|"scheduled","sector": "industrial"|"retail","signal_rating": "strong_signal"|"worth_monitoring"|"no_meaningful_signal","signal_source_type": "canadabuys_award"|"permit_mississauga"|"permit_brampton"|"permit_toronto"|"jobbank_posting"|"web"|"federal_grant"|"ontario_news"|"ero_approval"|"permit_caledon"|"permit_oakville"|"feddev_news"|"permit_kitchener"|"permit_waterloo"|"permit_kingston"|"permit_barrie"|"permit_ottawa"|"agco_cannabis"|"agco_liquor"|"ccaa_filing"|"newswire_release"|"devapp_oakville"|"devapp_hamilton","signal_strength": "award"|"new_building"|"addition"|"change_of_use"|"alteration"|"demolition"|"sign"|"other"|"grant"|"announcement"|"env_approval"|"store_licence"|"insolvency"|"development"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "app_role": ["admin", "member"],"brief_origin": ["discovered", "live_research"],"date_method": ["metadata", "structured_data", "url", "text", "none", "public_record"],"evidence_type": ["fact", "inference", "hypothesis", "unknown"],"occupier_status": ["named", "unresolved", "not_applicable"],"opportunity_stage": ["pre_shop", "active_search", "site_controlled", "construction_fit_out", "open", "undetermined"],"relevance": ["signal", "context", "not_relevant"],"research_mode": ["company", "theme"],"research_status": ["searching", "scraping", "ready", "analyzing", "analyzed", "saved", "failed"],"run_status": ["queued", "running", "completed", "failed"],"run_trigger": ["manual", "scheduled"],"sector": ["industrial", "retail"],"signal_rating": ["strong_signal", "worth_monitoring", "no_meaningful_signal"],"signal_source_type": ["canadabuys_award", "permit_mississauga", "permit_brampton", "permit_toronto", "jobbank_posting", "web", "federal_grant", "ontario_news", "ero_approval", "permit_caledon", "permit_oakville", "feddev_news", "permit_kitchener", "permit_waterloo", "permit_kingston", "permit_barrie", "permit_ottawa", "agco_cannabis", "agco_liquor", "ccaa_filing", "newswire_release", "devapp_oakville", "devapp_hamilton"],"signal_strength": ["award", "new_building", "addition", "change_of_use", "alteration", "demolition", "sign", "other", "grant", "announcement", "env_approval", "store_licence", "insolvency", "development"]
          }
        }
} as const
