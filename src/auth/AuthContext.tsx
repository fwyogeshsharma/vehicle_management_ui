import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { setToken, setUnauthorizedHandler } from '../api/client'
import { auth } from '../api/resources'
import type { UserDetail } from '../api/types'

/**
 * Who is signed in, and the token proving it.
 *
 * **The token lives in localStorage.** That is a deliberate trade, not an oversight. A bearer
 * token in a header cannot be sent by the browser on its own, so there is no CSRF exposure and
 * the API can leave CSRF protection off; the cost is that a successful XSS could read it, which
 * an HttpOnly cookie would prevent. The API was built for bearer tokens, so this is the matching
 * client. If that trade is ever revisited it must be revisited on both sides at once.
 *
 * **The stored user is a cache, and is re-checked on load.** The API re-reads the account on
 * every request, so a token can stop working between sessions — deactivated, password changed,
 * login removed. On start-up this asks `/api/auth/me` and signs out if the answer is 401, rather
 * than rendering a shell for an account that no longer works.
 */

const TOKEN_KEY = 'vm.token'

interface AuthState {
  user: UserDetail | null
  /** True until the stored token has been checked, so guards do not redirect too early. */
  loading: boolean
  isAdmin: boolean
  /**
   * Whether this person may work with lorry receipts.
   *
   * The only thing that tells CSR and TEJJJ_CSR apart. Everything else in the domain is open
   * to any login, so a second flag here would be a second rule to keep in step with the API.
   */
  canSeeLorryReceipts: boolean
  signIn: (username: string, password: string) => Promise<void>
  signOut: () => void
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

function read(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null // private mode, blocked storage: sign-in still works, it just will not persist
  }
}

function write(value: string | null) {
  try {
    if (value === null) localStorage.removeItem(TOKEN_KEY)
    else localStorage.setItem(TOKEN_KEY, value)
  } catch {
    /* ignore: the session works for this tab even if it cannot be remembered */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const signOut = useCallback(() => {
    write(null)
    setToken(null)
    setUser(null)
  }, [])

  // A 401 from anywhere means this token is finished. One handler, so no caller has to remember.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      write(null)
      setToken(null)
      setUser(null)
    })
  }, [])

  useEffect(() => {
    const stored = read()
    if (!stored) {
      setLoading(false)
      return
    }
    setToken(stored)
    auth
      .me()
      .then(setUser)
      .catch(() => {
        // Expired, revoked, or the account was deactivated while we were away.
        write(null)
        setToken(null)
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const signIn = useCallback(async (username: string, password: string) => {
    const session = await auth.login(username, password)
    write(session.token)
    setToken(session.token)
    setUser(session.user)
  }, [])

  const refresh = useCallback(async () => {
    setUser(await auth.me())
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      // From `role`, not `user_type`. Those were the same thing until the role column, and
      // reading the type here meant an administrator whose type is STAFF saw no Accounts tab
      // while somebody typed ADMIN but demoted to CSR still saw one.
      isAdmin: user?.role === 'ADMIN',
      canSeeLorryReceipts: user?.role === 'ADMIN' || user?.role === 'TEJJJ_CSR',
      signIn,
      signOut,
      refresh,
    }),
    [user, loading, signIn, signOut, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
