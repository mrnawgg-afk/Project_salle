import type { AthleteReadiness, InjuryRisk, TeamReadiness, WeeklyReport } from '@/types'

// ── Scores individuels ────────────────────────────────────────

export function calculateSleepScore(
  sleepDuration: number,
  sleepTime: string
): number {
  const durationBase: Record<number, number> = { 4: 10, 5: 35, 6: 65, 7: 85 }
  const base = sleepDuration >= 8 ? 100 : (durationBase[sleepDuration] ?? 10)

  const hour = parseInt(sleepTime.split(':')[0], 10)
  // Normalise les heures post-minuit (0, 1, 2...) en 24+h
  // pour comparer correctement avec les heures de soirée
  const normalized = hour < 6 ? hour + 24 : hour

  let bonus = 0
  if (normalized < 22) bonus = 15
  else if (normalized < 23) bonus = 8
  else if (normalized >= 25) bonus = -15 // 01:00 ou plus tard

  return Math.min(100, Math.max(0, base + bonus))
}

export function calculateTrainingScore(feeling: number): number {
  const scores: Record<number, number> = { 1: 10, 2: 30, 3: 55, 4: 80, 5: 100 }
  return scores[feeling] ?? 0
}

export function calculateMotivationScore(level: number): number {
  const scores: Record<number, number> = { 1: 10, 2: 30, 3: 55, 4: 80, 5: 100 }
  return scores[level] ?? 0
}

export function calculateNutritionScore(reports: WeeklyReport[]): number {
  if (reports.length === 0) return 0
  const okCount = reports.filter((r) => r.nutrition_ok).length
  return Math.round((okCount / reports.length) * 100)
}

export function calculateInjuryRisk(reports: WeeklyReport[]): InjuryRisk {
  const injuryCount = reports.filter((r) => r.has_injury).length
  if (injuryCount === 0) return 'none'
  if (injuryCount === 1) return 'low'
  if (injuryCount === 2) return 'medium'
  return 'high'
}

// ── Score global ──────────────────────────────────────────────

export function calculateOverallScore(params: {
  sleepScore: number
  trainingScore: number
  motivationScore: number
  nutritionScore: number
  injuryRisk: InjuryRisk
}): number {
  const { sleepScore, trainingScore, motivationScore, nutritionScore, injuryRisk } = params

  const weighted =
    sleepScore * 0.3 +
    trainingScore * 0.25 +
    motivationScore * 0.25 +
    nutritionScore * 0.2

  const multipliers: Record<InjuryRisk, number> = {
    none: 1.0,
    low: 0.92,
    medium: 0.8,
    high: 0.65,
  }

  return Math.min(100, Math.max(0, Math.round(weighted * multipliers[injuryRisk])))
}

// ── Readiness athlète ─────────────────────────────────────────

export function calculateAthleteReadiness(
  memberId: string,
  memberName: string,
  memberPhone: string,
  grade: number,
  reports: WeeklyReport[]
): AthleteReadiness {
  // Utilise uniquement les 4 derniers rapports
  const sorted = [...reports].sort((a, b) => b.week_number - a.week_number)
  const last4 = sorted.slice(0, 4)

  const reportsCount = last4.length
  const lastReport = sorted[0] ?? null

  const sleepScore =
    reportsCount > 0
      ? Math.round(
          last4.reduce(
            (sum, r) => sum + calculateSleepScore(r.sleep_duration, r.sleep_time),
            0
          ) / reportsCount
        )
      : 0

  const trainingScore =
    reportsCount > 0
      ? Math.round(
          last4.reduce((sum, r) => sum + calculateTrainingScore(r.training_feeling), 0) /
            reportsCount
        )
      : 0

  const motivationScore =
    reportsCount > 0
      ? Math.round(
          last4.reduce((sum, r) => sum + calculateMotivationScore(r.motivation_level), 0) /
            reportsCount
        )
      : 0

  const nutritionScore = calculateNutritionScore(last4)
  const injuryRisk = calculateInjuryRisk(last4)

  const overallScore = calculateOverallScore({
    sleepScore,
    trainingScore,
    motivationScore,
    nutritionScore,
    injuryRisk,
  })

  const hasActiveInjury = lastReport?.has_injury ?? false

  const latestInjuredReport = sorted.find((r) => r.has_injury)
  const latestImprovementReport = sorted.find((r) => r.wants_improvement)

  return {
    member_id: memberId,
    member_name: memberName,
    member_phone: memberPhone,
    grade,
    overall_score: overallScore,
    injury_risk: injuryRisk,
    sleep_score: sleepScore,
    training_score: trainingScore,
    motivation_score: motivationScore,
    nutrition_score: nutritionScore,
    is_ready: overallScore >= 70 && injuryRisk !== 'high' && reportsCount >= 2,
    reports_submitted: reports.length,
    last_report_date: lastReport?.report_date ?? null,
    has_active_injury: hasActiveInjury,
    latest_injury_description: latestInjuredReport?.injury_description ?? null,
    latest_improvement_request: latestImprovementReport?.improvement_description ?? null,
  }
}

// ── Readiness équipe ──────────────────────────────────────────

export function calculateTeamReadiness(athletes: AthleteReadiness[]): TeamReadiness {
  const total = athletes.length

  const ready = athletes.filter((a) => a.is_ready)
  const notReady = athletes.filter((a) => !a.is_ready && a.reports_submitted >= 2)
  const pending = athletes.filter((a) => a.reports_submitted < 2)

  const avg = (key: keyof AthleteReadiness): number => {
    if (total === 0) return 0
    const sum = athletes.reduce((acc, a) => acc + (a[key] as number), 0)
    return Math.round(sum / total)
  }

  const injuryAlerts = athletes.filter(
    (a) => a.has_active_injury || a.injury_risk === 'high'
  ).length

  const highMotivation = athletes.filter((a) => a.motivation_score >= 55).length
  const teamMotivationPercentage =
    total > 0 ? Math.round((highMotivation / total) * 100) : 0

  return {
    ready_count: ready.length,
    not_ready_count: notReady.length,
    pending_count: pending.length,
    avg_overall_score: avg('overall_score'),
    avg_sleep_score: avg('sleep_score'),
    avg_training_score: avg('training_score'),
    avg_motivation_score: avg('motivation_score'),
    avg_nutrition_score: avg('nutrition_score'),
    injury_alerts: injuryAlerts,
    team_motivation_percentage: teamMotivationPercentage,
  }
}

// ── Utilitaire semaine ────────────────────────────────────────

export function getCurrentWeekNumber(championshipCreatedAt: string): number {
  const start = new Date(championshipCreatedAt)
  const now = new Date()
  const daysDiff = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  return Math.max(1, Math.ceil((daysDiff + 1) / 7))
}
