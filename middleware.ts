import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

const PUBLIC_ROUTES = ['/', '/login']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Rafraîchit la session (ne pas utiliser getSession côté serveur seul)
  const { data: { user } } = await supabase.auth.getUser()

  const isPublic = PUBLIC_ROUTES.includes(pathname)
  const isAdminRoute = pathname.startsWith('/admin')
  const isAthleteRoute = pathname.startsWith('/athlete')
  const isLoginRoute = pathname === '/login'

  // Pas de session
  if (!user) {
    if (isPublic) return response
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Session active sur /login → redirige selon le type
  if (isLoginRoute) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (profile && ['admin', 'receptionist'].includes(profile.role)) {
      return NextResponse.redirect(new URL('/admin', request.url))
    }

    const { data: account } = await supabase
      .from('athlete_accounts')
      .select('is_active')
      .eq('email', user.email!)
      .single()

    if (account?.is_active) {
      return NextResponse.redirect(new URL('/athlete', request.url))
    }

    // Compte non reconnu → déconnecte et laisse sur /login
    await supabase.auth.signOut()
    return response
  }

  // Routes admin
  if (isAdminRoute) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (!profile || !['admin', 'receptionist'].includes(profile.role)) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    return response
  }

  // Routes athlète
  if (isAthleteRoute) {
    const { data: account } = await supabase
      .from('athlete_accounts')
      .select('is_active')
      .eq('email', user.email!)
      .single()

    if (!account?.is_active) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    return response
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|html)$).*)',
  ],
}
