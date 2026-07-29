import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import app from '../lib/cloudbase'

export default function AuthCallback() {
  const navigate = useNavigate()
  const { applySession } = useAuth()
  const handled = useRef(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (handled.current) return
    handled.current = true

    const handleCallback = async () => {
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      const provider = params.get('provider') || 'google'
      const isPopup = params.get('mode') === 'popup'

      if (!code) {
        navigate('/')
        return
      }

      try {
        // Call oauth-callback cloud function instead of backend API
        const res = await app.callFunction({
          name: 'oauth-callback',
          data: { code, provider },
        })

        const result = res.result as any
        if (!result || result.status !== 'success') {
          setError(result?.message || 'Login failed')
          setTimeout(() => navigate('/'), 2000)
          return
        }

        const { access_token, refresh_token, user: oauthUser } = result.data

        if (isPopup && window.opener) {
          window.opener.postMessage(
            { type: 'oauth_callback', access_token, refresh_token, user: oauthUser },
            window.location.origin
          )
          window.close()
        } else {
          await applySession(access_token, refresh_token, oauthUser)
          navigate('/dashboard')
        }
      } catch (err) {
        setError('Login failed')
        setTimeout(() => navigate('/'), 2000)
      }
    }

    handleCallback()
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '1rem' }}>
      <div className="spinner" />
      <p>{error || 'Completing login...'}</p>
    </div>
  )
}
