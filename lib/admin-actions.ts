'use server'

import { requireAdmin } from '@/lib/auth'
import { calculateAthleteReadiness, calculateTeamReadiness, getCurrentWeekNumber } from '@/lib/readiness'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import type {
  AthleteAccount,
  AthleteReadiness,
  TeamReadiness,
  WeeklyReport,
} from '@/types'

// ── Gestion des comptes athlètes ──────────────────────────────

export async function createAthleteAccount(data: {
  member_id: string
  email: string
  password: string
}): Promise<{ success: boolean; error?: string }> {
  await requireAdmin()

  const supabase = createClient()
  const admin = createAdminClient()

  // 1. Vérifie que le membre existe
  const { data: member, error: memberError } = await supabase
    .from('members')
    .select('id')
    .eq('id', data.member_id)
    .single()

  if (memberError || !member) {
    return { success: false, error: 'Membre introuvable' }
  }

  // 2. Crée le compte auth
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true,
    user_metadata: { role: 'athlete', member_id: data.member_id },
  })

  if (authError || !authUser.user) {
    return { success: false, error: authError?.message ?? 'Erreur création compte' }
  }

  // 3. Insère dans athlete_accounts
  const { error: insertError } = await supabase.from('athlete_accounts').insert({
    member_id: data.member_id,
    email: data.email,
  })

  if (insertError) {
    // Rollback : supprime le compte auth créé
    await admin.auth.admin.deleteUser(authUser.user.id)
    return { success: false, error: insertError.message }
  }

  return { success: true }
}

export async function getAthleteAccounts(): Promise<AthleteAccount[]> {
  await requireAdmin()

  const supabase = createClient()

  const { data, error } = await supabase
    .from('athlete_accounts')
    .select('*, members(id, name, phone, email, grade, branch)')
    .order('created_at', { ascending: false })

  if (error) return []
  return (data as AthleteAccount[]) ?? []
}

export async function toggleAthleteAccount(
  accountId: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin()

  const supabase = createClient()
  const admin = createAdminClient()

  const { data: account, error: fetchError } = await supabase
    .from('athlete_accounts')
    .select('email')
    .eq('id', accountId)
    .single()

  if (fetchError || !account) {
    return { success: false, error: 'Compte introuvable' }
  }

  const { error: updateError } = await supabase
    .from('athlete_accounts')
    .update({ is_active: isActive })
    .eq('id', accountId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  // Banni dans auth si désactivé
  if (!isActive) {
    const { data: users } = await admin.auth.admin.listUsers()
    const authUser = users.users.find((u) => u.email === account.email)
    if (authUser) {
      await admin.auth.admin.updateUserById(authUser.id, { ban_duration: '876600h' })
    }
  } else {
    const { data: users } = await admin.auth.admin.listUsers()
    const authUser = users.users.find((u) => u.email === account.email)
    if (authUser) {
      await admin.auth.admin.updateUserById(authUser.id, { ban_duration: 'none' })
    }
  }

  return { success: true }
}

export async function resetAthletePassword(
  accountId: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin()

  const supabase = createClient()
  const admin = createAdminClient()

  const { data: account, error: fetchError } = await supabase
    .from('athlete_accounts')
    .select('email')
    .eq('id', accountId)
    .single()

  if (fetchError || !account) {
    return { success: false, error: 'Compte introuvable' }
  }

  const { data: users } = await admin.auth.admin.listUsers()
  const authUser = users.users.find((u) => u.email === account.email)

  if (!authUser) {
    return { success: false, error: 'Utilisateur auth introuvable' }
  }

  const { error } = await admin.auth.admin.updateUserById(authUser.id, {
    password: newPassword,
  })

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function deleteAthleteAccount(
  accountId: string
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin()

  const supabase = createClient()
  const admin = createAdminClient()

  const { data: account, error: fetchError } = await supabase
    .from('athlete_accounts')
    .select('email')
    .eq('id', accountId)
    .single()

  if (fetchError || !account) {
    return { success: false, error: 'Compte introuvable' }
  }

  const { data: users } = await admin.auth.admin.listUsers()
  const authUser = users.users.find((u) => u.email === account.email)

  if (authUser) {
    const { error: deleteAuthError } = await admin.auth.admin.deleteUser(authUser.id)
    if (deleteAuthError) {
      return { success: false, error: deleteAuthError.message }
    }
  }

  // Suppression explicite : pas de FK auth.users → athlete_accounts, pas de cascade
  const { error: deleteAccountError } = await supabase
    .from('athlete_accounts')
    .delete()
    .eq('id', accountId)

  if (deleteAccountError) {
    return { success: false, error: deleteAccountError.message }
  }

  return { success: true }
}

// ── KPIs et rapports ──────────────────────────────────────────

export async function getChampionshipKPIs(championshipId: string): Promise<{
  total_athletes: number
  reports_this_week: number
  athletes_readiness: AthleteReadiness[]
  team_readiness: TeamReadiness
  weekly_reports_by_athlete: Record<string, WeeklyReport[]>
}> {
  await requireAdmin()

  const supabase = createClient()

  // 1. Athlètes sélectionnés avec infos membre
  const { data: athleteRows, error: athleteError } = await supabase
    .from('championship_athletes')
    .select('member_id, qualified, place, members(id, name, phone, grade, branch)')
    .eq('championship_id', championshipId)

  if (athleteError || !athleteRows) {
    return {
      total_athletes: 0,
      reports_this_week: 0,
      athletes_readiness: [],
      team_readiness: calculateTeamReadiness([]),
      weekly_reports_by_athlete: {},
    }
  }

  // 2. Tous les rapports pour ce championnat
  const { data: allReports } = await supabase
    .from('weekly_reports')
    .select('*, members(name, phone, grade)')
    .eq('championship_id', championshipId)
    .order('submitted_at', { ascending: false })

  const reports = (allReports as WeeklyReport[]) ?? []

  // 3. Regroupe les rapports par membre
  const reportsByAthlete: Record<string, WeeklyReport[]> = {}
  for (const report of reports) {
    if (!reportsByAthlete[report.member_id]) {
      reportsByAthlete[report.member_id] = []
    }
    reportsByAthlete[report.member_id].push(report)
  }

  // 4. Calcule le readiness de chaque athlète
  const athletesReadiness: AthleteReadiness[] = athleteRows.map((row) => {
    const m = row.members as { id: string; name: string; phone: string; grade: number } | null
    return calculateAthleteReadiness(
      row.member_id,
      m?.name ?? '',
      m?.phone ?? '',
      m?.grade ?? 0,
      reportsByAthlete[row.member_id] ?? []
    )
  })

  // 5. Score équipe
  const teamReadiness = calculateTeamReadiness(athletesReadiness)

  // 6. Rapports soumis cette semaine ISO
  const now = new Date()
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay())
  startOfWeek.setHours(0, 0, 0, 0)

  const reportsThisWeek = reports.filter(
    (r) => new Date(r.submitted_at) >= startOfWeek
  ).length

  return {
    total_athletes: athleteRows.length,
    reports_this_week: reportsThisWeek,
    athletes_readiness: athletesReadiness,
    team_readiness: teamReadiness,
    weekly_reports_by_athlete: reportsByAthlete,
  }
}

export async function getAllWeeklyReports(
  championshipId: string,
  filters?: {
    member_id?: string
    week_number?: number
    has_injury?: boolean
    wants_improvement?: boolean
  }
): Promise<WeeklyReport[]> {
  await requireAdmin()

  const supabase = createClient()

  let query = supabase
    .from('weekly_reports')
    .select('*, members(name, phone, grade)')
    .eq('championship_id', championshipId)
    .order('submitted_at', { ascending: false })

  if (filters?.member_id) query = query.eq('member_id', filters.member_id)
  if (filters?.week_number !== undefined) query = query.eq('week_number', filters.week_number)
  if (filters?.has_injury !== undefined) query = query.eq('has_injury', filters.has_injury)
  if (filters?.wants_improvement !== undefined)
    query = query.eq('wants_improvement', filters.wants_improvement)

  const { data, error } = await query
  if (error) return []
  return (data as WeeklyReport[]) ?? []
}

export async function getWeeklyReportDetail(reportId: string): Promise<WeeklyReport | null> {
  await requireAdmin()

  const supabase = createClient()

  const { data, error } = await supabase
    .from('weekly_reports')
    .select('*, members(name, phone, grade)')
    .eq('id', reportId)
    .single()

  if (error || !data) return null
  return data as WeeklyReport
}

// Re-export pour usage dans les composants serveur
export { getCurrentWeekNumber }
