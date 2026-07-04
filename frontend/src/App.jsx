import React, { Suspense, useEffect, useState } from 'react'
import apiFetch from './utils/api'
const CameraApp = React.lazy(() => import('./components/CameraApp'));
const Dashboard = React.lazy(() => import('./components/Dashboard'));
import LoginPage from './components/LoginPage'
import ActivationPage from './components/ActivationPage'
import ForgotPasswordPage from './components/ForgotPasswordPage'

export default function App() {
  const [state, setState] = useState({ page: 'login', role: null, user: null })

  const pathFor = (page) => {
    switch (page) {
      case 'activate': return '/activate'
      case 'forgot': return '/forgot'
      case 'dashboard': return '/dashboard'
      case 'camera': return '/camera'
      case 'login':
      default:
        return '/'
    }
  }

  const pageForPath = (path) => {
    if (!path || path === '/') return 'login'
    if (path.startsWith('/activate')) return 'activate'
    if (path.startsWith('/forgot')) return 'forgot'
    if (path.startsWith('/dashboard')) return 'dashboard'
    if (path.startsWith('/camera')) return 'camera'
    return 'login'
  }

  const goto = (page, opts = {}) => {
    const url = pathFor(page)
    try { window.history.pushState({ page, ...opts }, '', url) } catch (e) {}
    setState(s => ({ ...s, page, ...opts }))
  }

  // initialize from current URL and validate token so refresh preserves login
  useEffect(() => {
    const init = async () => {
      const currentPathPage = pageForPath(window.location.pathname)
      const token = window.localStorage.getItem('token') || window.localStorage.getItem('authToken')
      if (token) {
        try {
          const res = await apiFetch('/api/me')
          if (res.ok && res.data && res.data.user) {
            // authenticated — preserve current protected page if already on it
            const preservedPage = ['dashboard', 'camera'].includes(currentPathPage) ? currentPathPage : 'dashboard'
            try { window.history.replaceState({ page: preservedPage }, '', pathFor(preservedPage)) } catch (e) {}
            setState(s => ({ ...s, page: preservedPage, user: res.data.user, role: res.data.user.role }))
            return
          }
        } catch (err) {
          console.error('Token validation error', err)
        }
        // invalid token — clear
        window.localStorage.removeItem('token')
        window.localStorage.removeItem('authToken')
      }

      // no valid token — respect URL but don't land on protected pages
      const current = pageForPath(window.location.pathname)
      if (current === 'dashboard' || current === 'camera') {
        try { window.history.replaceState({}, '', '/') } catch (e) {}
        setState(s => ({ ...s, page: 'login' }))
      } else {
        setState(s => ({ ...s, page: current }))
      }
    }

    init()

    const onPop = (ev) => {
      const p = (ev.state && ev.state.page) || pageForPath(window.location.pathname)
      setState(s => ({ ...s, page: p }))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const renderPage = () => {
    switch (state.page) {
      case 'login':
        return <LoginPage onNavigate={goto} />
      case 'activate':
        return <ActivationPage onNavigate={goto} />
      case 'forgot':
        return <ForgotPasswordPage onNavigate={goto} />
      case 'dashboard':
        return (
          <Suspense fallback={<div>Loading dashboard...</div>}>
            <Dashboard role={state.role} user={state.user} onNavigate={goto} />
          </Suspense>
        )
      case 'camera':
      default:
        return (
          <Suspense fallback={<div>Loading camera...</div>}>
            <CameraApp />
          </Suspense>
        )
    }
  }

  return <div>{renderPage()}</div>
}
