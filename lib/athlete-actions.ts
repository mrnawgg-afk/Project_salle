'use server'

import { requireAthlete } from '@/lib/auth'
import { calculateAthleteReadiness, getCurrentWeekNumber } from '@/lib/readiness'
import { createClient } from '@/lib/supabase/server'
import type {
  AthleteReadiness,
  Championship,
  ChampionshipAthlete,
  WeeklyReport,
  WeeklyReportFormData,
} from '@/types'

export async function getAthleteChampionship(memberId: string): Promise<{
  championship: Championship | null
  athlete: ChampionshipAthlete | null
  current_week: number
  days_until_championship: number
}> {
  await requireAthlete()

  const supabase = createClient()

  const { data, error } = await supabase
    .from('championship_athletes')
    .select('*, championships!inner(id, name, date, location, branch, status, created_at)')
    .eq('member_id', memberId)
    .neq('championships.status', 'completed')
    .order('date', { referencedTable: 'championships', ascending: true })
    .limit(1)
    .single()

  if (error || !data) {
    return { championship: null, athlete: null, current_week: 1, days_until_championship: 0 }
  }

  const champ = data.championships as unknown as Championship & { created_at: string }
  const athlete: ChampionshipAthlete = {
    id: data.id,
    championship_id: data.championship_id,
    member_id: data.member_id,
    qualified: data.qualified,
    place: data.place,
  }

  const champDate = new Date(champ.date)
  const now = new Date()
  const daysUntil = Math.max(
    0,
    Math.ceil((champDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  )

  const currentWeek = getCurrentWeekNumber(champ.created_at ?? champ.date)

  return {
    championship: champ,
    athlete,
    current_week: currentWeek,
    days_until_championship: daysUntil,
  }
}

export async function getAthleteReports(
  memberId: string,
  championshipId: string
): Promise<WeeklyReport[]> {
  await requireAthlete()

  const supabase = createClient()

  const { data, error } = await supabase
    .from('weekly_reports')
    .select('*')
    .eq('member_id', memberId)
    .eq('championship_id', championshipId)
    .order('week_number', { ascending: true })

  if (error) return []
  return (data as WeeklyReport[]) ?? []
}

export async function getCurrentWeekReport(
  memberId: string,
  championshipId: string,
  weekNumber: number
): Promise<WeeklyReport | null> {
  await requireAthlete()

  const supabase = createClient()

  const { data, error } = await supabase
    .from('weekly_reports')
    .select('*')
    .eq('member_id', memberId)
    .eq('championship_id', championshipId)
    .eq('week_number', weekNumber)
    .single()

  if (error || !data) return null
  return data as WeeklyReport
}

export async function submitWeeklyReport(
  data: WeeklyReportFormData
): Promise<{ success: boolean; error?: string; reportId?: string }> {
  const { memberId } = await requireAthlete()

  // Vérifie que l'athlète ne soumet pas pour quelqu'un d'autre
  if (data.member_id !== memberId) {
    return { success: false, error: 'Accès refusé' }
  }

  const supabase = createClient()

  // 1. Vérifie la sélection au championnat
  const { data: selection, error: selectionError } = await supabase
    .from('championship_athletes')
    .select('id')
    .eq('member_id', data.member_id)
    .eq('championship_id', data.championship_id)
    .single()

  if (selectionError || !selection) {
    return { success: false, error: 'Athlète non sélectionné pour ce championnat' }
  }

  // 2. Vérifie qu'aucun rapport n'existe pour cette semaine
  const { data: existing } = await supabase
    .from('weekly_reports')
    .select('id')
    .eq('member_id', data.member_id)
    .eq('championship_id', data.championship_id)
    .eq('week_number', data.week_number)
    .single()

  if (existing) {
    return { success: false, error: 'Un rapport existe déjà pour cette semaine' }
  }

  // 3. Nettoie les champs conditionnels
  const payload = {
    championship_id: data.championship_id,
    member_id: data.member_id,
    week_number: data.week_number,
    has_injury: data.has_injury,
    injury_description: data.has_injury ? (data.injury_description ?? null) : null,
    training_feeling: data.training_feeling,
    sleep_time: data.sleep_time,
    sleep_duration: data.sleep_duration,
    wants_improvement: data.wants_improvement,
    improvement_description: data.wants_improvement
      ? (data.improvement_description ?? null)
      : null,
    nutrition_ok: data.nutrition_ok,
    nutrition_notes: data.nutrition_ok ? null : (data.nutrition_notes ?? null),
    motivation_level: data.motivation_level,
    weight_kg: data.weight_kg ?? null,
    athlete_notes: data.athlete_notes ?? null,
  }

  // 4. Insère le rapport
  const { data: inserted, error: insertError } = await supabase
    .from('weekly_reports')
    .insert(payload)
    .select('id')
    .single()

  if (insertError || !inserted) {
    return { success: false, error: insertError?.message ?? 'Erreur lors de la soumission' }
  }

  return { success: true, reportId: inserted.id }
}

export async function updateWeeklyReport(
  reportId: string,
  data: Partial<WeeklyReportFormData>
): Promise<{ success: boolean; error?: string }> {
  const { memberId } = await requireAthlete()

  const supabase = createClient()

  // Vérifie que le rapport appartient à l'athlète et a été soumis aujourd'hui
  const { data: existing, error: fetchError } = await supabase
    .from('weekly_reports')
    .select('id, member_id, submitted_at')
    .eq('id', reportId)
    .single()

  if (fetchError || !existing) {
    return { success: false, error: 'Rapport introuvable' }
  }

  if (existing.member_id !== memberId) {
    return { success: false, error: 'Accès refusé' }
  }

  const submittedDate = new Date(existing.submitted_at).toISOString().split('T')[0]
  const today = new Date().toISOString().split('T')[0]
  if (submittedDate !== today) {
    return { success: false, error: 'Modification impossible après le jour de soumission' }
  }

  // Nettoie les champs conditionnels si présents dans la mise à jour
  const payload: Record<string, unknown> = { ...data }
  if ('has_injury' in data && !data.has_injury) payload.injury_description = null
  if ('wants_improvement' in data && !data.wants_improvement) payload.improvement_description = null
  if ('nutrition_ok' in data && data.nutrition_ok) payload.nutrition_notes = null

  // Supprime les champs non modifiables
  delete payload.championship_id
  delete payload.member_id
  delete payload.week_number

  const { error: updateError } = await supabase
    .from('weekly_reports')
    .update(payload)
    .eq('id', reportId)

  if (updateError) return { success: false, error: updateError.message }
  return { success: true }
}

export async function getAthleteReadinessSelf(
  memberId: string,
  championshipId: string
): Promise<AthleteReadiness> {
  const { memberId: authMemberId } = await requireAthlete()

  const supabase = createClient()

  const { data: member } = await supabase
    .from('members')
    .select('name, phone, grade')
    .eq('id', authMemberId)
    .single()

  const reports = await (async () => {
    const { data } = await supabase
      .from('weekly_reports')
      .select('*')
      .eq('member_id', authMemberId)
      .eq('championship_id', championshipId)
      .order('week_number', { ascending: true })
    return (data as WeeklyReport[]) ?? []
  })()

  return calculateAthleteReadiness(
    authMemberId,
    member?.name ?? '',
    member?.phone ?? '',
    member?.grade ?? 0,
    reports
  )
}
