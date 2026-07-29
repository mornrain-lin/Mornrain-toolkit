import React, { createContext, useContext, useEffect, useState } from 'react'
import { auth } from './cloudbase'

export type UserProfile = {
  uid: string
  email: string
  name: string
  avatar_url: string
  provider: string
} | null

type AuthContextType = {
  user: UserProfile
  loading: boolean
  signInWithGoogle: () => Promise<void>
  sendEmailCode: (email: string) => Promise<any>
  signUpWithEmail: (email: string, code: string, verificationInfo: any) => Promise<void>
  signInWithEmail: (email: string, code: string, verificationInfo: any) => Promise<void>
  signInWithEmailPassword: (email: string, password: string) => Promise<void>
  resetPasswordForEmail: (email: string) => Promise<any>
  resetPasswordForOld: (oldPassword: string, newPassword: string) => Promise<void>
  signOut: () => Promise<void>
  applySession: (accessToken: string, refreshToken: string, oauthUser: UserProfile) => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signInWithGoogle: async () => {},
  sendEmailCode: async () => {},
  signUpWithEmail: async () => {},
  signInWithEmail: async () => {},
  signInWithEmailPassword: async () => {},
  resetPasswordForEmail: async () => ({}),
  resetPasswordForOld: async () => {},
  signOut: async () => {},
  applySession: async () => {},
})

const OAUTH_RELAY_BASE = import.meta.env.VITE_OAUTH_RELAY_URL

/** Fetch current user profile via v2 SDK auth.getUser(). Returns null if not logged in or anonymous. */
async function fetchUserProfile(): Promise<UserProfile> {
  try {
    const { data, error } = await (auth as any).getUser()
    if (error || !data?.user) return null
    const user = data.user
    // Filter out anonymous sessions — SDK auto-creates them with accessKey
    const provider = user.app_metadata?.provider || 'unknown'
    if (provider === 'anonymous' || user.is_anonymous === true) return null
    if (!user.email) return null
    return {
      uid: user.id || '',
      email: user.email || '',
      name: user.user_metadata?.nickName || user.user_metadata?.name || '',
      avatar_url: user.user_metadata?.avatarUrl || '',
      provider,
    }
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const profile = await fetchUserProfile()
        setUser(profile)
      } catch {
        setUser(null)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const applySession = async (
    accessToken: string,
    refreshToken: string,
    oauthUser: UserProfile
  ) => {
    await (auth as any).setSession({ access_token: accessToken, refresh_token: refreshToken })
    const profile = await fetchUserProfile()
    setUser(profile ?? oauthUser)
  }

  const signInWithGoogle = async () => {
    const isInIframe = window.self !== window.top
    const callbackUrl = isInIframe
      ? `${window.location.origin}/auth/callback?mode=popup`
      : `${window.location.origin}/auth/callback`

    const oauthUrl = `${OAUTH_RELAY_BASE}/authorize?provider=google&callback_url=${encodeURIComponent(callbackUrl)}`

    if (!isInIframe) {
      window.location.href = oauthUrl
    } else {
      const popup = window.open(oauthUrl, 'oauth_popup', 'width=520,height=620,left=200,top=100')

      await new Promise<void>((resolve, reject) => {
        const handler = async (event: MessageEvent) => {
          if (event.data?.type !== 'oauth_callback') return
          window.removeEventListener('message', handler)
          clearInterval(checkClosed)
          try {
            const { access_token, refresh_token, user: oauthUser } = event.data
            await applySession(access_token, refresh_token, oauthUser)
            resolve()
          } catch (e) { reject(e) }
        }
        window.addEventListener('message', handler)
        const checkClosed = setInterval(() => {
          if (popup?.closed) {
            clearInterval(checkClosed)
            window.removeEventListener('message', handler)
            resolve()
          }
        }, 500)
      })
    }
  }

  /** Send email verification code via TCB auth (v2: signInWithOtp with shouldCreateUser=true handles both signup and login). */
  const sendEmailCode = async (email: string) => {
    const { data, error } = await (auth as any).signInWithOtp({ email })
    if (error) throw new Error(error.message || 'Failed to send verification code')
    return data
  }

  /** Register a new user with email verification code (v2: signInWithOtp + verifyOtp, auto-creates user). */
  const signUpWithEmail = async (email: string, code: string, verificationInfo: any) => {
    const { data, error } = await verificationInfo.verifyOtp({ token: code })
    if (error) throw new Error(error.message || 'Verification failed')
    const profile = await fetchUserProfile()
    setUser(profile)
  }

  /** Sign in an existing user with email verification code (v2: signInWithOtp + verifyOtp). */
  const signInWithEmail = async (email: string, code: string, verificationInfo: any) => {
    const { data, error } = await verificationInfo.verifyOtp({ token: code })
    if (error) throw new Error(error.message || 'Verification failed')
    const profile = await fetchUserProfile()
    setUser(profile)
  }

  /** Sign in with email + password (TCB native). */
  const signInWithEmailPassword = async (email: string, password: string) => {
    const { data, error } = await (auth as any).signInWithPassword({ email, password })
    if (error) throw new Error(error.message || 'Email password login failed')
    const profile = await fetchUserProfile()
    setUser(profile)
  }

  /** Send password reset verification code to email. Returns wrapped updateUser callback that auto-refreshes user state. */
  const resetPasswordForEmail = async (email: string) => {
    const { data, error } = await (auth as any).resetPasswordForEmail(email)
    if (error) throw new Error(error.message || 'Failed to send reset code')
    // 包装 updateUser 回调，执行后自动刷新用户状态
    return {
      ...data,
      updateUser: async (params: { nonce: string; password: string }) => {
        const result = await data.updateUser(params)
        if (result.error) throw new Error(result.error.message || 'Failed to reset password')
        // 密码重置成功后，刷新用户状态（TCB 已自动登录）
        const profile = await fetchUserProfile()
        setUser(profile)
        return result
      },
    }
  }

  /** Reset password using old password (requires login). */
  const resetPasswordForOld = async (oldPassword: string, newPassword: string) => {
    const { data, error } = await (auth as any).resetPasswordForOld({
      old_password: oldPassword,
      new_password: newPassword,
    })
    if (error) throw new Error(error.message || 'Failed to reset password')
  }

  const signOut = async () => {
    setUser(null)
    await auth.signOut()
  }

  return (
    <AuthContext.Provider value={{
      user, loading,
      signInWithGoogle, sendEmailCode, signUpWithEmail, signInWithEmail, signInWithEmailPassword,
      resetPasswordForEmail, resetPasswordForOld, signOut, applySession,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
