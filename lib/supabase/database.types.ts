
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
                    "analysis": NonNullable<Json>,"analyzed_at": string,"company_id": string,"created_by": string | null,"discovery_run_id": string | null,"dismissed": boolean,"dismissed_at": string | null,"dismissed_by": string | null,"id": string,"model": string,"origin": Database["public"]['Enums']["brief_origin"],"rating": Database["public"]['Enums']["signal_rating"],"stage": Database["public"]['Enums']["opportunity_stage"],"trigger_query": string | null,"trigger_signal_id": string | null,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "analysis": NonNullable<Json>,"analyzed_at"?: string,"company_id": string,"created_by"?: string | null,"discovery_run_id"?: string | null,"dismissed"?: boolean,"dismissed_at"?: string | null,"dismissed_by"?: string | null,"id"?: string,"model": string,"origin": Database["public"]['Enums']["brief_origin"],"rating": Database["public"]['Enums']["signal_rating"],"stage"?: Database["public"]['Enums']["opportunity_stage"],"trigger_query"?: string | null,"trigger_signal_id"?: string | null,"version": number
                  }
                  Update: {
                    "analysis"?: NonNullable<Json>,"analyzed_at"?: string,"company_id"?: string,"created_by"?: string | null,"discovery_run_id"?: string | null,"dismissed"?: boolean,"dismissed_at"?: string | null,"dismissed_by"?: string | null,"id"?: string,"model"?: string,"origin"?: Database["public"]['Enums']["brief_origin"],"rating"?: Database["public"]['Enums']["signal_rating"],"stage"?: Database["public"]['Enums']["opportunity_stage"],"trigger_query"?: string | null,"trigger_signal_id"?: string | null,"version"?: number
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
                    "analyzed": number,"candidates_found": number,"errors": NonNullable<Json>,"finished_at": string | null,"id": string,"settings": NonNullable<Json>,"skipped": NonNullable<Json>,"started_at": string,"started_by": string | null,"status": Database["public"]['Enums']["run_status"],"usage": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "analyzed"?: number,"candidates_found"?: number,"errors"?: NonNullable<Json>,"finished_at"?: string | null,"id"?: string,"settings"?: NonNullable<Json>,"skipped"?: NonNullable<Json>,"started_at"?: string,"started_by"?: string | null,"status"?: Database["public"]['Enums']["run_status"],"usage"?: NonNullable<Json>
                  }
                  Update: {
                    "analyzed"?: number,"candidates_found"?: number,"errors"?: NonNullable<Json>,"finished_at"?: string | null,"id"?: string,"settings"?: NonNullable<Json>,"skipped"?: NonNullable<Json>,"started_at"?: string,"started_by"?: string | null,"status"?: Database["public"]['Enums']["run_status"],"usage"?: NonNullable<Json>
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
                },"settings": {
                  Row: {
                    "analysis_model": string | null,"discovery_cap": number,"id": boolean,"screening_model": string | null,"skip_window_days": number,"sources_per_candidate": number,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "analysis_model"?: string | null,"discovery_cap"?: number,"id"?: boolean,"screening_model"?: string | null,"skip_window_days"?: number,"sources_per_candidate"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "analysis_model"?: string | null,"discovery_cap"?: number,"id"?: boolean,"screening_model"?: string | null,"skip_window_days"?: number,"sources_per_candidate"?: number,"updated_at"?: string,"updated_by"?: string | null
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
                    "company_id": string | null,"event_at": string | null,"id": string,"ingested_at": string,"location": string | null,"published_at": string | null,"raw": NonNullable<Json>,"raw_entity_name": string | null,"source_record_id": string,"source_type": Database["public"]['Enums']["signal_source_type"],"summary": string | null,"title": string | null,"url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string | null,"event_at"?: string | null,"id"?: string,"ingested_at"?: string,"location"?: string | null,"published_at"?: string | null,"raw"?: NonNullable<Json>,"raw_entity_name"?: string | null,"source_record_id": string,"source_type": Database["public"]['Enums']["signal_source_type"],"summary"?: string | null,"title"?: string | null,"url"?: string | null
                  }
                  Update: {
                    "company_id"?: string | null,"event_at"?: string | null,"id"?: string,"ingested_at"?: string,"location"?: string | null,"published_at"?: string | null,"raw"?: NonNullable<Json>,"raw_entity_name"?: string | null,"source_record_id"?: string,"source_type"?: Database["public"]['Enums']["signal_source_type"],"summary"?: string | null,"title"?: string | null,"url"?: string | null
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
                    "content_hash": string | null,"event_at": string | null,"excerpt": string | null,"fetched_at": string,"id": string,"published_at": string | null,"publisher": string | null,"title": string | null,"url": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content_hash"?: string | null,"event_at"?: string | null,"excerpt"?: string | null,"fetched_at"?: string,"id"?: string,"published_at"?: string | null,"publisher"?: string | null,"title"?: string | null,"url": string
                  }
                  Update: {
                    "content_hash"?: string | null,"event_at"?: string | null,"excerpt"?: string | null,"fetched_at"?: string,"id"?: string,"published_at"?: string | null,"publisher"?: string | null,"title"?: string | null,"url"?: string
                  }
                  Relationships: [
                    
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
                    "analysis": NonNullable<Json>,"analyzed_at": string,"company_id": string,"created_by": string | null,"discovery_run_id": string | null,"dismissed": boolean,"dismissed_at": string | null,"dismissed_by": string | null,"id": string,"model": string,"origin": Database["public"]['Enums']["brief_origin"],"rating": Database["public"]['Enums']["signal_rating"],"stage": Database["public"]['Enums']["opportunity_stage"],"trigger_query": string | null,"trigger_signal_id": string | null,"version": number
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
                           }
          }
          Enums: {
            "app_role": "admin"|"member","brief_origin": "discovered"|"live_research","evidence_type": "fact"|"inference"|"hypothesis"|"unknown","opportunity_stage": "pre_shop"|"active_search"|"site_controlled"|"construction_fit_out"|"open"|"undetermined","relevance": "signal"|"context"|"not_relevant","run_status": "queued"|"running"|"completed"|"failed","signal_rating": "strong_signal"|"worth_monitoring"|"no_meaningful_signal","signal_source_type": "canadabuys_award"|"permit_mississauga"|"permit_brampton"|"permit_toronto"|"jobbank_posting"|"web"
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
            "app_role": ["admin", "member"],"brief_origin": ["discovered", "live_research"],"evidence_type": ["fact", "inference", "hypothesis", "unknown"],"opportunity_stage": ["pre_shop", "active_search", "site_controlled", "construction_fit_out", "open", "undetermined"],"relevance": ["signal", "context", "not_relevant"],"run_status": ["queued", "running", "completed", "failed"],"signal_rating": ["strong_signal", "worth_monitoring", "no_meaningful_signal"],"signal_source_type": ["canadabuys_award", "permit_mississauga", "permit_brampton", "permit_toronto", "jobbank_posting", "web"]
          }
        }
} as const
