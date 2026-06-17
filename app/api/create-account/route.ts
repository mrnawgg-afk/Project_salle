import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const supabase = createAdminClient()

  // Verify the caller is an admin
  const { data: { user }, error: userError } = await supabase.auth.getUser(token)
  if (userError || !user) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (!profile || !['admin', 'receptionist'].includes(profile.role)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const { email: rawEmail, password, memberId } = await request.json()
  if (!rawEmail || !password || !memberId) {
    return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })
  }
  const email = rawEmail.toLowerCase().trim()

  // Step 1 — Create auth user, or update password if already exists
  let authUserId: string
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError) {
    // User already exists in auth.users — find them and reset password
    const { data: listData, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    if (listError) return NextResponse.json({ error: listError.message }, { status: 400 })

    const existing = listData.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())
    if (!existing) return NextResponse.json({ error: authError.message }, { status: 400 })

    const { error: updateError } = await supabase.auth.admin.updateUserById(existing.id, { password })
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })

    authUserId = existing.id
  } else {
    authUserId = authData.user.id
  }

  // Step 2 — Upsert athlete_accounts (handles duplicate member_id gracefully)
  const { data: account, error: upsertError } = await supabase
    .from('athlete_accounts')
    .upsert(
      { member_id: memberId, email, is_active: true },
      { onConflict: 'member_id' }
    )
    .select('id')
    .single()

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 400 })
  }

  return NextResponse.json({ success: true, accountId: account.id, authUserId })
}
