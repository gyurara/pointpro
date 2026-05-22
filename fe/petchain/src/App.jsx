import { useState, useEffect } from 'react'
import { AppProvider } from './context/AppContext'
import Landing from './pages/Landing'
import AuthPage from './pages/AuthPage'
import GuardianDash from './pages/guardian/GuardianDash'
import HospitalDash from './pages/hospital/HospitalDash'
import InsuranceDash from './pages/insurance/InsuranceDash'
import Platform from './pages/platform/Platform'
import Toast from './components/common/Toast'
import './styles/global.css'

const ROLE_MAP = { USER: 'guardian', HOSPITAL: 'hospital', INSURANCE: 'insurance', PLATFORM: 'platform' }

function initFromUrl() {
  const params       = new URLSearchParams(window.location.search)
  const pathname     = window.location.pathname
  const accessToken  = params.get('accessToken')
  const refreshToken = params.get('refreshToken')
  const memberType   = params.get('memberType')
  const userId       = params.get('userId')
  const memberNumber = params.get('memberNumber')
  const oauthError   = params.get('oauth_error') || params.get('error')

  if (oauthError) {
    window.history.replaceState({}, '', pathname === '/admin' ? '/admin' : '/')
    return { page: pathname === '/admin' ? 'admin' : 'auth', role: null, toast: { title: 'OAuth 오류', msg: decodeURIComponent(oauthError) } }
  }

  if (accessToken) {
    localStorage.setItem('accessToken', accessToken)
    localStorage.setItem('refreshToken', refreshToken || '')
    localStorage.setItem('memberType', memberType || 'USER')
    localStorage.setItem('userId', userId || '')
    localStorage.setItem('memberNumber', memberNumber || '')
    window.history.replaceState({}, '', pathname === '/admin' ? '/admin' : '/')
    const role = ROLE_MAP[memberType?.toUpperCase()] || 'guardian'
    const page = role === 'guardian' ? 'landing' : 'main'
    return { page, role, toast: null }
  }

  const token = localStorage.getItem('accessToken')
  const mt    = localStorage.getItem('memberType')
  const role  = (token && mt) ? (ROLE_MAP[mt.toUpperCase()] || null) : null

  if (pathname === '/admin') {
    if (role === 'platform' || role === 'insurance') {
      return { page: 'main', role, toast: null }
    }
    return { page: 'admin', role: null, toast: null }
  }

  // 루트 경로: 보호자는 랜딩이 홈, 병원은 대시보드, 플랫폼·보험사는 /admin 전용
  if (role === 'guardian') return { page: 'main', role, toast: null }
  if (role === 'hospital') return { page: 'main', role, toast: null }
  return { page: 'landing', role: null, toast: null }
}

function AdminLogin({ onLogin }) {
  const [loginId, setLoginId] = useState('')
  const [loginPw, setLoginPw] = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId, password: loginPw }),
      })
      const text = await res.text()
      const contentType = res.headers.get('content-type') || ''
      let data = {}
      if (text && contentType.includes('application/json')) {
        try { data = JSON.parse(text) } catch { data = {} }
      }
      if (!res.ok) {
        if (text.includes('Invalid CORS request')) {
          throw new Error('CORS 설정이 현재 프론트엔드 주소를 허용하지 않습니다.')
        }
        throw new Error(data.message || text || '로그인에 실패했습니다.')
      }
      localStorage.setItem('accessToken', data.accessToken)
      localStorage.setItem('refreshToken', data.refreshToken)
      localStorage.setItem('memberType', data.memberType)
      localStorage.setItem('userId', String(data.userId ?? ''))
      localStorage.setItem('memberNumber', data.memberNumber || '')
      const role = ROLE_MAP[data.memberType?.toUpperCase()] || 'platform'
      if (role !== 'platform' && role !== 'insurance') {
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        localStorage.removeItem('memberType')
        localStorage.removeItem('userId')
        localStorage.removeItem('memberNumber')
        throw new Error('관리자·보험사 전용 페이지입니다.')
      }
      onLogin(role)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const inp = {
    width: '100%', padding: '12px 14px', borderRadius: 10,
    border: '1.5px solid #362040', background: '#180c20', color: '#f0ecff',
    fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#180c20' }}>
      <div style={{ background: '#221428', borderRadius: 16, padding: '44px 40px', width: '100%', maxWidth: 400, boxShadow: '0 24px 64px rgba(0,0,0,.6)' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#f0ecff', marginBottom: 8, letterSpacing: '-.02em' }}>
            PET<span style={{ color: '#b8885a' }}>CHAIN.</span>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#c4a8bc', letterSpacing: '.16em', textTransform: 'uppercase' }}>Admin · Insurance Access</div>
        </div>

        {error && (
          <div style={{ marginBottom: 18, padding: '10px 14px', borderRadius: 8, background: '#3a1414', color: '#fca5a5', fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#c4a8bc', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>Org ID</label>
          <input style={inp} placeholder="org-id" value={loginId}
            onChange={e => setLoginId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()} />
        </div>

        <div style={{ marginBottom: 28 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#c4a8bc', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>비밀번호</label>
          <input type="password" style={inp} placeholder="••••••••" value={loginPw}
            onChange={e => setLoginPw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()} />
        </div>

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            width: '100%', padding: 13, borderRadius: 10, border: 'none',
            background: loading ? '#362040' : '#8a5a78', color: '#fff',
            fontSize: 14, fontWeight: 700, cursor: loading ? 'default' : 'pointer',
            fontFamily: 'inherit', transition: 'background .2s',
          }}
        >
          {loading ? '처리 중...' : '로그인'}
        </button>

        <div style={{ textAlign: 'center', marginTop: 22 }}>
          <a href="/" style={{ fontSize: 13, color: '#c4a8bc', textDecoration: 'none' }}>← 메인으로 돌아가기</a>
        </div>
      </div>
    </div>
  )
}

function Inner() {
  const [{ page: initPage, role: initRole, toast: initToast }] = useState(initFromUrl)
  const [page, setPage]         = useState(initPage)
  const [authMode, setAuthMode] = useState('login')
  const [role, setRole]         = useState(initRole)
  const [username, setUsername] = useState(() => localStorage.getItem('memberName') || '')
  const [toast, setToast]       = useState(initToast)

  // 초기 히스토리 상태 설정
  useEffect(() => {
    window.history.replaceState({ page: initPage, role: initRole }, '', window.location.pathname)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 브라우저 뒤로가기/앞으로가기 처리
  useEffect(() => {
    const handlePop = (e) => {
      const s = e.state
      if (!s) return
      setPage(s.page || 'landing')
      setRole(s.role || null)
      if (s.authMode) setAuthMode(s.authMode)
    }
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  }, [])

  // 토큰 만료 시 자동 로그아웃
  useEffect(() => {
    const handleAuthLogout = () => {
      setRole(null)
      setInitialTab(null)
      const targetPage = window.location.pathname === '/admin' ? 'admin' : 'landing'
      setPage(targetPage)
      window.history.pushState({ page: targetPage, role: null }, '', window.location.pathname)
    }
    window.addEventListener('auth:logout', handleAuthLogout)
    return () => window.removeEventListener('auth:logout', handleAuthLogout)
  }, [])

  const [initialTab, setInitialTab] = useState(null)

  const showToast = (title, msg) => setToast({ title, msg })

  const handleLogin = (selectedRole) => {
    setUsername(localStorage.getItem('memberName') || '')
    setRole(selectedRole)
    if (selectedRole === 'guardian') {
      const pendingTab = localStorage.getItem('petchain_pending_tab')
      localStorage.removeItem('petchain_pending_tab')
      if (pendingTab) {
        setInitialTab(pendingTab)
        setPage('main')
        window.history.pushState({ page: 'main', role: selectedRole }, '', window.location.pathname)
        return
      }
    }
    const targetPage = selectedRole === 'guardian' ? 'landing' : 'main'
    setPage(targetPage)
    window.history.pushState({ page: targetPage, role: selectedRole }, '', window.location.pathname)
  }

  const handleLogout = () => {
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('memberType')
    localStorage.removeItem('userId')
    localStorage.removeItem('memberNumber')
    localStorage.removeItem('petchain_guardian_tab')
    localStorage.removeItem('petchain_hospital_tab')
    localStorage.removeItem('petchain_insurance_tab')
    setRole(null)
    setInitialTab(null)
    const targetPage = window.location.pathname === '/admin' ? 'admin' : 'landing'
    setPage(targetPage)
    window.history.pushState({ page: targetPage, role: null }, '', window.location.pathname)
  }

  const goAuth = (mode = 'login') => {
    setAuthMode(mode)
    setPage('auth')
    window.history.pushState({ page: 'auth', authMode: mode, role: null }, '', window.location.pathname)
  }

  // 랜딩 nav에서 보호자 탭으로 이동
  const goMain = (tab = 'home') => {
    setInitialTab(tab)
    setPage('main')
    window.history.pushState({ page: 'main', role }, '', window.location.pathname)
  }

  // 대시보드에서 랜딩(홈)으로 복귀
  const goHome = () => {
    setPage('landing')
    window.history.pushState({ page: 'landing', role }, '', window.location.pathname)
  }

  if (page === 'admin') {
    return (
      <>
        <AdminLogin onLogin={handleLogin} />
        {toast && <Toast title={toast.title} msg={toast.msg} onClose={() => setToast(null)} />}
      </>
    )
  }

  if (page === 'landing') {
    return (
      <>
        <Landing onGoAuth={goAuth} role={role} onGoMain={goMain} onLogout={handleLogout} username={username} />
        {toast && <Toast title={toast.title} msg={toast.msg} onClose={() => setToast(null)} />}
      </>
    )
  }

  if (page === 'auth') {
    return (
      <>
        <AuthPage key={authMode} mode={authMode} onLogin={handleLogin} onBack={() => setPage('landing')} />
        {toast && <Toast title={toast.title} msg={toast.msg} onClose={() => setToast(null)} />}
      </>
    )
  }

  const dashProps = { showToast, onLogout: handleLogout }

  return (
    <>
      {role === 'guardian'  && <GuardianDash  {...dashProps} initialTab={initialTab} onHome={goHome} />}
      {role === 'hospital'  && <HospitalDash  {...dashProps} />}
      {role === 'insurance' && <InsuranceDash {...dashProps} />}
      {role === 'platform'  && <Platform      {...dashProps} />}
      {toast && <Toast title={toast.title} msg={toast.msg} onClose={() => setToast(null)} />}
    </>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Inner />
    </AppProvider>
  )
}
