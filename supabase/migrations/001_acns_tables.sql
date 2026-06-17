-- ============================================================
-- ACNS Portal — nouvelles tables uniquement
-- Ne modifie pas : members, profiles, championships,
-- championship_athletes
-- ============================================================

-- Comptes athlètes pour le portail
CREATE TABLE athlete_accounts (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id   uuid NOT NULL UNIQUE
              REFERENCES members(id) ON DELETE CASCADE,
  email       text NOT NULL UNIQUE,
  is_active   boolean NOT NULL DEFAULT true,
  last_login  timestamptz,
  created_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Rapports hebdomadaires de suivi
CREATE TABLE weekly_reports (
  id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  championship_id         uuid NOT NULL
                          REFERENCES championships(id) ON DELETE CASCADE,
  member_id               uuid NOT NULL
                          REFERENCES members(id) ON DELETE CASCADE,
  week_number             integer NOT NULL CHECK (week_number >= 1),
  report_date             date NOT NULL DEFAULT current_date,

  has_injury              boolean NOT NULL DEFAULT false,
  injury_description      text,

  -- 1=très mauvais → 5=très bien
  training_feeling        integer NOT NULL
                          CHECK (training_feeling BETWEEN 1 AND 5),

  -- ex: '22:00', '23:00', '00:00', '01:00'
  sleep_time              text NOT NULL,
  -- nombre d'heures
  sleep_duration          integer NOT NULL
                          CHECK (sleep_duration BETWEEN 4 AND 12),

  wants_improvement       boolean NOT NULL DEFAULT false,
  improvement_description text,

  nutrition_ok            boolean NOT NULL DEFAULT true,
  nutrition_notes         text,

  -- 1=très bas → 5=très élevé
  motivation_level        integer NOT NULL
                          CHECK (motivation_level BETWEEN 1 AND 5),

  weight_kg               decimal(5,2),
  athlete_notes           text,
  submitted_at            timestamptz NOT NULL DEFAULT now(),

  UNIQUE(championship_id, member_id, week_number)
);

-- ── Row Level Security ────────────────────────────────────────

ALTER TABLE athlete_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_reports   ENABLE ROW LEVEL SECURITY;

-- athlete_accounts : admin/receptionist peut tout gérer
CREATE POLICY "athlete_accounts: admin all"
  ON athlete_accounts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'receptionist')
    )
  );

-- athlete_accounts : athlète peut lire son propre compte
CREATE POLICY "athlete_accounts: self read"
  ON athlete_accounts FOR SELECT
  USING (
    member_id IN (
      SELECT m.id FROM members m
      JOIN auth.users u ON u.email = m.email
      WHERE u.id = auth.uid()
    )
  );

-- weekly_reports : admin/receptionist peut tout lire
CREATE POLICY "weekly_reports: admin read all"
  ON weekly_reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'receptionist')
    )
  );

-- weekly_reports : athlète peut lire ses propres rapports
CREATE POLICY "weekly_reports: athlete read own"
  ON weekly_reports FOR SELECT
  USING (
    member_id IN (
      SELECT m.id FROM members m
      JOIN auth.users u ON u.email = m.email
      WHERE u.id = auth.uid()
    )
  );

-- weekly_reports : athlète peut insérer ses propres rapports
CREATE POLICY "weekly_reports: athlete insert own"
  ON weekly_reports FOR INSERT
  WITH CHECK (
    member_id IN (
      SELECT m.id FROM members m
      JOIN auth.users u ON u.email = m.email
      WHERE u.id = auth.uid()
    )
  );

-- weekly_reports : athlète peut modifier uniquement le jour même
CREATE POLICY "weekly_reports: athlete update own same day"
  ON weekly_reports FOR UPDATE
  USING (
    member_id IN (
      SELECT m.id FROM members m
      JOIN auth.users u ON u.email = m.email
      WHERE u.id = auth.uid()
    )
    AND submitted_at::date = current_date
  );
