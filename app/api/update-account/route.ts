import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const supabase = createAdminClient()

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

  const { memberId, newEmail: rawEmail, newPassword } = await request.json()
  if (!memberId) return NextResponse.json({ error: 'memberId requis' }, { status: 400 })
  if (!rawEmail && !newPassword) {
    return NextResponse.json({ error: 'Aucune modification fournie' }, { status: 400 })
  }

  const newEmail = rawEmail?.toLowerCase().trim() || null

  // Get the current athlete_account
  const { data: account, error: accountError } = await supabase
    .from('athlete_accounts')
    .select('id, email')
    .eq('member_id', memberId)
    .single()

  if (accountError || !account) {
    return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })
  }

  // Find the auth user by current email
  const { data: listData, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (listError) return NextResponse.json({ error: listError.message }, { status: 400 })

  const authUser = listData.users?.find(
    u => u.email?.toLowerCase() === account.email.toLowerCase()
  )
  if (!authUser) return NextResponse.json({ error: 'Utilisateur auth introuvable' }, { status: 404 })

  // Build update payload for Supabase Auth
  const authUpdates: { email?: string; password?: string } = {}
  if (newEmail && newEmail !== account.email.toLowerCase()) authUpdates.email = newEmail
  if (newPassword && newPassword.length >= 8) authUpdates.password = newPassword

  if (Object.keys(authUpdates).length > 0) {
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      authUser.id,
      authUpdates
    )
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })
  }

  // Sync email change into athlete_accounts
  if (authUpdates.email) {
    const { error: acctError } = await supabase
      .from('athlete_accounts')
      .update({ email: authUpdates.email })
      .eq('id', account.id)
    if (acctError) return NextResponse.json({ error: acctError.message }, { status: 400 })
  }

  return NextResponse.json({ success: true, email: authUpdates.email || account.email })
}
