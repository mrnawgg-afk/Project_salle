// ── Tables existantes ─────────────────────────────────────────

export interface Championship {
  id: string
  name: string
  date: string
  location: string
  branch: string
  status: string
  created_at?: string
}

export interface ChampionshipAthlete {
  id: string
  championship_id: string
  member_id: string
  qualified: boolean
  place: number | null
  members?: {
    id: string
    name: string
    phone: string
    grade: number
    branch: string
  }
}

// ── Nouvelles tables ──────────────────────────────────────────

export interface AthleteAccount {
  id: string
  member_id: string
  email: string
  is_active: boolean
  last_login: string | null
  created_at: string
  members?: {
    id: string
    name: string
    phone: string
    email: string | null
    grade: number
    branch: string
  }
}

export interface WeeklyReport {
  id: string
  championship_id: string
  member_id: string
  week_number: number
  report_date: string
  has_injury: boolean
  injury_description: string | null
  training_feeling: number
  sleep_time: string
  sleep_duration: number
  wants_improvement: boolean
  improvement_description: string | null
  nutrition_ok: boolean
  nutrition_notes: string | null
  motivation_level: number
  weight_kg: number | null
  athlete_notes: string | null
  submitted_at: string
  members?: {
    name: string
    phone: string
    grade: number
  }
}

// ── Readiness ─────────────────────────────────────────────────

export type InjuryRisk = 'none' | 'low' | 'medium' | 'high'

export interface AthleteReadiness {
  member_id: string
  member_name: string
  member_phone: string
  grade: number
  overall_score: number
  injury_risk: InjuryRisk
  sleep_score: number
  training_score: number
  motivation_score: number
  nutrition_score: number
  is_ready: boolean
  reports_submitted: number
  last_report_date: string | null
  has_active_injury: boolean
  latest_injury_description: string | null
  latest_improvement_request: string | null
}

export interface TeamReadiness {
  ready_count: number
  not_ready_count: number
  pending_count: number
  avg_overall_score: number
  avg_sleep_score: number
  avg_training_score: number
  avg_motivation_score: number
  avg_nutrition_score: number
  injury_alerts: number
  team_motivation_percentage: number
}

// ── Forms ─────────────────────────────────────────────────────

export interface WeeklyReportFormData {
  championship_id: string
  member_id: string
  week_number: number
  has_injury: boolean
  injury_description?: string
  training_feeling: number
  sleep_time: string
  sleep_duration: number
  wants_improvement: boolean
  improvement_description?: string
  nutrition_ok: boolean
  nutrition_notes?: string
  motivation_level: number
  weight_kg?: number
  athlete_notes?: string
}
