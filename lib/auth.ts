'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type UserType = 'admin' | 'athlete' | null

export interface CurrentUser {
  userId: string
  email: string
  userType: UserType
  memberId?: string
  memberName?: string
  profileRole?: string
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = createClient()

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null

  // 1. Cherche dans profiles (admin / receptionist)
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, name')
    .eq('user_id', user.id)
    .single()

  if (profile && ['admin', 'receptionist'].includes(profile.role)) {
    return {
      userId: user.id,
      email: user.email!,
      userType: 'admin',
      memberName: profile.name,
      profileRole: profile.role,
    }
  }

  // 2. Cherche dans athlete_accounts
  const { data: account } = await supabase
    .from('athlete_accounts')
    .select('member_id, is_active, members(name)')
    .eq('email', user.email!)
    .single()

  if (account && account.is_active) {
    return {
      userId: user.id,
      email: user.email!,
      userType: 'athlete',
      memberId: account.member_id,
      memberName: (account.members as { name: string } | null)?.name,
    }
  }

  return null
}

export async function requireAdmin(): Promise<void> {
  const user = await getCurrentUser()
  if (!user || user.userType !== 'admin') {
    redirect('/login')
  }
}

export async function requireAthlete(): Promise<{ memberId: string; memberName: string }> {
  const user = await getCurrentUser()
  if (!user || user.userType !== 'athlete' || !user.memberId) {
    redirect('/login')
  }
  return {
    memberId: user.memberId!,
    memberName: user.memberName ?? '',
  }
}

export async function signIn(
  email: string,
  password: string
): Promise<{ userType: UserType; error?: string }> {
  const supabase = createClient()

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    return { userType: null, error: error.message }
  }

  const user = await getCurrentUser()
  return { userType: user?.userType ?? null }
}

export async function signOut(): Promise<void> {
  const supabase = createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
