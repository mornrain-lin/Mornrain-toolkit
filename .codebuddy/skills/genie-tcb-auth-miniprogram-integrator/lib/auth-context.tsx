import React, { createContext, useContext, useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { auth, isH5, isWeapp, getWxCloud } from './cloudbase'

export type UserProfile = {
  uid: string
  openid: string
  email: string
  phone: string
  nickName: string
  avatarUrl: string
  provider: string
} | null

type AuthContextType = {
  user: UserProfile
  loading: boolean
  signInWithWechat: (profile?: { nickName?: string; avatarUrl?: string }) => Promise<{ isNewUser: boolean }>
  updateProfile: (profile: { nickName: string; avatarUrl: string }) => void
  signInWithPhone: (phoneCode: string) => Promise<void>
  sendPhoneCode: (phone: string) => Promise<any>
  signInWithPhoneOtp: (phone: string, code: string, verificationInfo: any) => Promise<void>
  sendEmailCode: (email: string) => Promise<any>
  signUpWithEmail: (email: string, code: string, verificationInfo: any) => Promise<void>
  signInWithEmail: (email: string, code: string, verificationInfo: any) => Promise<void>
  signInWithEmailPassword: (email: string, password: string) => Promise<void>
  resetPasswordForEmail: (email: string) => Promise<any>
  resetPasswordForOld: (oldPassword: string, newPassword: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signInWithWechat: async () => ({ isNewUser: false }),
  updateProfile: () => {},
  signInWithPhone: async () => {},
  sendPhoneCode: async () => {},
  signInWithPhoneOtp: async () => {},
  sendEmailCode: async () => {},
  signUpWithEmail: async () => {},
  signInWithEmail: async () => {},
  signInWithEmailPassword: async () => {},
  resetPasswordForEmail: async () => ({}),
  resetPasswordForOld: async () => {},
  signOut: async () => {},
})

/** 从 TCB SDK 拉用户（H5 邮箱/手机号登录后可用） */
async function fetchTcbUser(): Promise<UserProfile> {
  try {
    const { data, error } = await (auth as any).getUser()
    if (error || !data?.user) return null
    const user = data.user
    return {
      uid: user.id || '',
      openid: '',
      email: user.email || '',
      phone: user.phone || '',
      nickName: user.user_metadata?.nickName || user.user_metadata?.name || '',
      avatarUrl: user.user_metadata?.avatarUrl || '',
      provider: user.app_metadata?.provider || 'unknown',
    }
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        // 优先从 TCB SDK 恢复 session（H5 邮箱/手机号登录）
        const profile = await fetchTcbUser()
        if (profile) {
          setUser(profile)
        } else {
          // 小程序端从 storage 恢复
          const savedOpenid = Taro.getStorageSync('wx_openid')
          if (savedOpenid) {
            setUser({
              uid: 'wx:' + savedOpenid,
              openid: savedOpenid,
              email: '',
              phone: '',
              nickName: Taro.getStorageSync('wx_nickname') || '',
              avatarUrl: Taro.getStorageSync('wx_avatar') || '',
              provider: 'wechat',
            })
          }
        }
      } catch {
        setUser(null)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  /**
   * 微信 OpenID 登录（仅小程序环境）
   *
   * 流程：
   * 1. wx.cloud.callFunction('mini-app-login') 获取 openid（不需要域名白名单）
   * 2. 云函数内部 createTicket + /auth/v1/signin/custom 完成 TCB 用户注册/登录
   * 3. 云函数从 JWT 读取已有昵称（老用户换设备可恢复）
   * 4. 如传入 nickName/avatarUrl，云函数写入 TCB 用户资料（新用户）
   * 5. 前端根据 isNewUser 决定是否弹资料补充弹窗
   */
  const signInWithWechat = async (profile?: { nickName?: string; avatarUrl?: string }) => {
    if (isH5()) {
      Taro.showToast({ title: '请在微信小程序中使用微信登录', icon: 'none', duration: 2000 })
      return { isNewUser: false }
    }

    const wxCloud = await getWxCloud()
    if (!wxCloud) {
      throw new Error('wx.cloud 跨账号实例未初始化')
    }

    const { result } = await wxCloud.callFunction({
      name: 'mini-app-login',
      data: {
        nickName: profile?.nickName || '',
        avatarUrl: profile?.avatarUrl || '',
      },
    }) as { result: any }

    const openid = result?.openid
      || result?.event?.userInfo?.openId
      || ''

    if (!openid) {
      throw new Error(result?.message || '微信登录失败：无法获取 openid')
    }

    // 从云函数返回的用户信息中读取（已注册用户会有昵称头像）
    const serverUser = result?.data?.user || {}
    const nickName = serverUser.nickName || profile?.nickName || ''
    const avatarUrl = serverUser.avatarUrl || profile?.avatarUrl || ''

    Taro.setStorageSync('wx_openid', openid)
    if (nickName) Taro.setStorageSync('wx_nickname', nickName)
    if (avatarUrl) Taro.setStorageSync('wx_avatar', avatarUrl)

    setUser({
      uid: 'wx:' + openid,
      openid: openid,
      email: '',
      phone: '',
      nickName,
      avatarUrl,
      provider: 'wechat',
    })

    // 如果没有昵称，说明是新用户需要补充资料
    const isNewUser = !nickName
    return { isNewUser }
  }

  /** 更新用户昵称和头像（登录后补充资料） */
  const updateProfile = (profile: { nickName: string; avatarUrl: string }) => {
    if (profile.nickName) Taro.setStorageSync('wx_nickname', profile.nickName)
    if (profile.avatarUrl) Taro.setStorageSync('wx_avatar', profile.avatarUrl)
    setUser(prev => prev ? { ...prev, nickName: profile.nickName, avatarUrl: profile.avatarUrl } : null)
  }

  /**
   * 微信手机号快速验证登录（仅小程序环境）
   */
  const signInWithPhone = async (phoneCode: string) => {
    if (!isWeapp()) {
      throw new Error('手机号登录仅支持小程序环境')
    }
    const { data, error } = await (auth as any).signInWithPhoneAuth({ phoneCode })
    if (error) throw new Error(error.message || '手机号登录失败')
    const userProfile = await fetchTcbUser()
    setUser(userProfile)
  }

  /** 发送手机号验证码（降级方案：用户拒绝微信授权手机号时使用） */
  const sendPhoneCode = async (phone: string) => {
    const { data, error } = await (auth as any).signInWithOtp({ phone })
    if (error) throw new Error(error.message || '发送验证码失败')
    return data
  }

  /** 手机号验证码登录（降级方案） */
  const signInWithPhoneOtp = async (phone: string, code: string, verificationInfo: any) => {
    const { data, error } = await verificationInfo.verifyOtp({ token: code })
    if (error) throw new Error(error.message || '验证码验证失败')
    const userProfile = await fetchTcbUser()
    setUser(userProfile)
  }

  const sendEmailCode = async (email: string) => {
    const { data, error } = await (auth as any).signInWithOtp({ email })
    if (error) throw new Error(error.message || 'Failed to send verification code')
    return data
  }

  const signUpWithEmail = async (email: string, code: string, verificationInfo: any) => {
    const { data, error } = await verificationInfo.verifyOtp({ token: code })
    if (error) throw new Error(error.message || 'Verification failed')
    const userProfile = await fetchTcbUser()
    setUser(userProfile)
  }

  const signInWithEmail = async (email: string, code: string, verificationInfo: any) => {
    const { data, error } = await verificationInfo.verifyOtp({ token: code })
    if (error) throw new Error(error.message || 'Verification failed')
    const userProfile = await fetchTcbUser()
    setUser(userProfile)
  }

  const signInWithEmailPassword = async (email: string, password: string) => {
    const { data, error } = await (auth as any).signInWithPassword({ email, password })
    if (error) throw new Error(error.message || 'Email password login failed')
    const userProfile = await fetchTcbUser()
    setUser(userProfile)
  }

  const resetPasswordForEmail = async (email: string) => {
    const { data, error } = await (auth as any).resetPasswordForEmail(email)
    if (error) throw new Error(error.message || 'Failed to send reset code')
    return {
      ...data,
      updateUser: async (params: { nonce: string; password: string }) => {
        const result = await data.updateUser(params)
        if (result.error) throw new Error(result.error.message || 'Failed to reset password')
        const userProfile = await fetchTcbUser()
        setUser(userProfile)
        return result
      },
    }
  }

  const resetPasswordForOld = async (oldPassword: string, newPassword: string) => {
    const { data, error } = await (auth as any).resetPasswordForOld({
      old_password: oldPassword,
      new_password: newPassword,
    })
    if (error) throw new Error(error.message || 'Failed to reset password')
  }

  const signOut = async () => {
    setUser(null)
    Taro.removeStorageSync('wx_openid')
    Taro.removeStorageSync('wx_nickname')
    Taro.removeStorageSync('wx_avatar')
    try { await auth.signOut() } catch { /* noop */ }
  }

  return (
    <AuthContext.Provider value={{
      user, loading,
      signInWithWechat, updateProfile, signInWithPhone, sendPhoneCode, signInWithPhoneOtp,
      sendEmailCode, signUpWithEmail, signInWithEmail,
      signInWithEmailPassword, resetPasswordForEmail, resetPasswordForOld, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
