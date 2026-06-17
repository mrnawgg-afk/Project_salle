'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { submitWeeklyReport } from '@/lib/athlete-actions'

type Props = {
  memberId: string
  championshipId: string
  weekNumber: number
}

const ratingLabels: Record<number, string> = {
  1: 'Très mauvais', 2: 'Mauvais', 3: 'Moyen', 4: 'Bon', 5: 'Excellent',
}

function RatingInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <p style={{ margin: '0 0 10px', fontWeight: 600, color: '#374151', fontSize: 14 }}>{label}</p>
      <div style={{ display: 'flex', gap: 8 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n} type="button" onClick={() => onChange(n)}
            style={{
              flex: 1, padding: '10px 0',
              border: `2px solid ${value === n ? '#2563EB' : '#E5E7EB'}`,
              borderRadius: 8,
              background: value === n ? '#EFF6FF' : 'white',
              color: value === n ? '#2563EB' : '#6B7280',
              fontWeight: value === n ? 700 : 500,
              cursor: 'pointer', fontSize: 16,
            }}
          >
            {n}
          </button>
        ))}
      </div>
      <p style={{ margin: '6px 0 0', fontSize: 12, color: '#6B7280' }}>{ratingLabels[value]}</p>
    </div>
  )
}

function Toggle({
  value, onChange, labelYes = 'Oui', labelNo = 'Non',
  colorYes = '#16A34A', colorNo = '#DC2626',
}: {
  value: boolean; onChange: (v: boolean) => void
  labelYes?: string; labelNo?: string
  colorYes?: string; colorNo?: string
}) {
  const btn = (active: boolean, color: string, label: string, val: boolean) => ({
    onClick: () => onChange(val),
    type: 'button' as const,
    style: {
      padding: '9px 22px',
      border: `2px solid ${active ? color : '#E5E7EB'}`,
      borderRadius: 8,
      background: active ? `${color}18` : 'white',
      color: active ? color : '#6B7280',
      fontWeight: active ? 700 : 500,
      cursor: 'pointer', fontSize: 14,
    },
    children: label,
  })
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <button {...btn(!value, colorNo, labelNo, false)} />
      <button {...btn(value, colorYes, labelYes, true)} />
    </div>
  )
}

export default function QuestionnaireForm({ memberId, championshipId, weekNumber }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const [hasInjury, setHasInjury] = useState(false)
  const [injuryDescription, setInjuryDescription] = useState('')
  const [trainingFeeling, setTrainingFeeling] = useState(3)
  const [sleepTime, setSleepTime] = useState('22:00')
  const [sleepDuration, setSleepDuration] = useState(7)
  const [wantsImprovement, setWantsImprovement] = useState(false)
  const [improvementDescription, setImprovementDescription] = useState('')
  const [nutritionOk, setNutritionOk] = useState(true)
  const [nutritionNotes, setNutritionNotes] = useState('')
  const [motivationLevel, setMotivationLevel] = useState(3)
  const [weightKg, setWeightKg] = useState('')
  const [athleteNotes, setAthleteNotes] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      const result = await submitWeeklyReport({
        championship_id: championshipId,
        member_id: memberId,
        week_number: weekNumber,
        has_injury: hasInjury,
        injury_description: hasInjury ? injuryDescription || undefined : undefined,
        training_feeling: trainingFeeling,
        sleep_time: sleepTime,
        sleep_duration: sleepDuration,
        wants_improvement: wantsImprovement,
        improvement_description: wantsImprovement ? improvementDescription || undefined : undefined,
        nutrition_ok: nutritionOk,
        nutrition_notes: !nutritionOk ? nutritionNotes || undefined : undefined,
        motivation_level: motivationLevel,
        weight_kg: weightKg ? parseFloat(weightKg) : undefined,
        athlete_notes: athleteNotes || undefined,
      })
      if (result.success) {
        router.refresh()
      } else {
        setError(result.error ?? 'Erreur lors de la soumission')
      }
    })
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px',
    border: '1.5px solid #E5E7EB', borderRadius: 8,
    fontSize: 15, outline: 'none', boxSizing: 'border-box',
  }

  const section = (children: React.ReactNode) => (
    <div style={{
      background: 'white', borderRadius: 12, padding: '22px 24px',
      marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    }}>
      {children}
    </div>
  )

  const sectionTitle = (title: string) => (
    <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#0F172A' }}>{title}</h3>
  )

  const question = (text: string) => (
    <p style={{ margin: '0 0 12px', color: '#374151', fontSize: 14 }}>{text}</p>
  )

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div style={{
          background: '#FEF2F2', border: '1px solid #FCA5A5',
          borderRadius: 8, padding: '12px 16px', marginBottom: 14,
          color: '#B91C1C', fontSize: 14,
        }}>
          {error}
        </div>
      )}

      {section(
        <>
          {sectionTitle('🩹 Blessures')}
          {question('Avez-vous une blessure en ce moment ?')}
          <Toggle
            value={hasInjury} onChange={setHasInjury}
            labelNo="Non" labelYes="Oui"
            colorNo="#16A34A" colorYes="#DC2626"
          />
          {hasInjury && (
            <textarea
              value={injuryDescription} onChange={e => setInjuryDescription(e.target.value)}
              placeholder="Décrivez votre blessure..."
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', marginTop: 14 }}
            />
          )}
        </>
      )}

      {section(
        <>
          {sectionTitle('🏋️ Entraînement')}
          <RatingInput
            label="Comment s'est passé votre entraînement cette semaine ?"
            value={trainingFeeling} onChange={setTrainingFeeling}
          />
        </>
      )}

      {section(
        <>
          {sectionTitle('😴 Sommeil')}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
                Heure de coucher
              </label>
              <input type="time" value={sleepTime} onChange={e => setSleepTime(e.target.value)} required style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
                Durée (heures)
              </label>
              <input
                type="number" min={1} max={12} value={sleepDuration}
                onChange={e => setSleepDuration(parseInt(e.target.value))}
                required style={inputStyle}
              />
            </div>
          </div>
        </>
      )}

      {section(
        <>
          {sectionTitle('💪 Motivation')}
          <RatingInput
            label="Quel est votre niveau de motivation ?"
            value={motivationLevel} onChange={setMotivationLevel}
          />
        </>
      )}

      {section(
        <>
          {sectionTitle('🥗 Nutrition')}
          {question('Votre alimentation est-elle correcte cette semaine ?')}
          <Toggle value={nutritionOk} onChange={setNutritionOk} colorYes="#16A34A" colorNo="#DC2626" />
          {!nutritionOk && (
            <textarea
              value={nutritionNotes} onChange={e => setNutritionNotes(e.target.value)}
              placeholder="Précisez les problèmes de nutrition..."
              rows={2}
              style={{ ...inputStyle, resize: 'vertical', marginTop: 14 }}
            />
          )}
        </>
      )}

      {section(
        <>
          {sectionTitle('📈 Points à améliorer')}
          {question('Souhaitez-vous un suivi particulier de votre entraîneur ?')}
          <Toggle
            value={wantsImprovement} onChange={setWantsImprovement}
            colorYes="#2563EB" colorNo="#6B7280"
          />
          {wantsImprovement && (
            <textarea
              value={improvementDescription} onChange={e => setImprovementDescription(e.target.value)}
              placeholder="Décrivez ce sur quoi vous souhaitez travailler..."
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', marginTop: 14 }}
            />
          )}
        </>
      )}

      {section(
        <>
          {sectionTitle('📋 Informations optionnelles')}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
              Poids (kg)
            </label>
            <input
              type="number" step="0.1" min={30} max={200}
              value={weightKg} onChange={e => setWeightKg(e.target.value)}
              placeholder="Ex: 73.5" style={{ ...inputStyle, maxWidth: 160 }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
              Remarques libres
            </label>
            <textarea
              value={athleteNotes} onChange={e => setAthleteNotes(e.target.value)}
              placeholder="Tout ce que vous souhaitez partager avec votre entraîneur..."
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
        </>
      )}

      <button
        type="submit" disabled={isPending}
        style={{
          width: '100%', padding: 14,
          background: isPending ? '#93C5FD' : '#2563EB',
          color: 'white', border: 'none', borderRadius: 10,
          fontSize: 16, fontWeight: 700,
          cursor: isPending ? 'not-allowed' : 'pointer',
          marginTop: 4,
        }}
      >
        {isPending ? 'Envoi en cours...' : `Soumettre le rapport — Semaine ${weekNumber}`}
      </button>
    </form>
  )
}
