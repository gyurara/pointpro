import { useState } from 'react'

function OAuthButtons({ label = '로그인' }) {
  const go = (provider) => { window.location.href = `/api/auth/oauth/${provider}` }
  return (
    <div style={{ marginTop: 8 }}>
      <div className="oauth-divider"><span>또는 소셜 계정으로 {label}</span></div>
      <div className="oauth-btns">
        <button className="oauth-btn oauth-naver" onClick={() => go('naver')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16.273 12.845L7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727z"/>
          </svg>
          네이버로 {label}
        </button>
        <button className="oauth-btn oauth-kakao" onClick={() => go('kakao')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3C6.477 3 2 6.477 2 10.8c0 2.74 1.63 5.16 4.1 6.64L5.05 21l4.44-2.87C10.14 18.35 11.06 18.5 12 18.5c5.523 0 10-3.477 10-7.7S17.523 3 12 3z"/>
          </svg>
          카카오로 {label}
        </button>
        <button className="oauth-btn oauth-google" onClick={() => go('google')}>
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Google로 {label}
        </button>
      </div>
    </div>
  )
}

const REGIONS = [
  '서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시',
  '대전광역시', '울산광역시', '세종특별자치시',
  '경기도', '강원도', '충청북도', '충청남도',
  '전라북도', '전라남도', '경상북도', '경상남도', '제주특별자치도',
]

export default function AuthPage({ mode, onLogin, onBack }) {
  const [role, setRole] = useState('guardian')
  const [tab, setTab]   = useState(mode === 'signup' ? 'signup' : 'login')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [loginId, setLoginId] = useState('')
  const [loginPw, setLoginPw] = useState('')

  const [gName, setGName]           = useState('')
  const [gPhone, setGPhone]         = useState('')
  const [gEmail, setGEmail]         = useState('')
  const [gPw, setGPw]               = useState('')
  const [gPwConfirm, setGPwConfirm] = useState('')
  const [gAddress, setGAddress]     = useState('경기도')

  const [hName, setHName]   = useState('')
  const [hBiz, setHBiz]     = useState('')
  const [hPhone, setHPhone] = useState('')
  const [hOrg, setHOrg]     = useState('')
  const [hEmail, setHEmail] = useState('')
  const [hPw, setHPw]       = useState('')

  const roles = [
    { id: 'guardian', icon: '01', name: '보호자', desc: '반려동물 보험 청구' },
    { id: 'hospital', icon: '02', name: '병원',   desc: '진료기록 관리' },
  ]

  const btnClass = { guardian: 'btn-primary', hospital: 'btn-orange' }
  const desc     = { guardian: '반려동물 보험 청구를 위한 계정', hospital: '동물병원 진료기록 등록 계정' }

  async function api(path, body) {
    let res
    try {
      res = await fetch(`/api${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch {
      throw new Error('백엔드 서버에 연결할 수 없습니다. 서버 실행 상태를 확인해주세요.')
    }

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
      throw new Error(data.message || text || '요청에 실패했습니다.')
    }
    return data
  }

  const ROLE_MAP = { USER: 'guardian', HOSPITAL: 'hospital', INSURANCE: 'insurance', PLATFORM: 'platform' }
  const EXPECTED_TYPE = { guardian: 'USER', hospital: 'HOSPITAL' }

  async function handleLogin() {
    setError('')
    setLoading(true)
    try {
      const data = await api('/auth/login', { loginId, password: loginPw })
      const serverType = data.memberType?.toUpperCase()
      const expected = EXPECTED_TYPE[role]
      if (expected && serverType !== expected) {
        const roleLabel = { guardian: '보호자', hospital: '병원' }[role]
        const actualLabel = { USER: '보호자', HOSPITAL: '병원', INSURANCE: '보험사', PLATFORM: '관리자' }[serverType] || serverType
        throw new Error(`${roleLabel} 계정이 아닙니다. 이 계정은 ${actualLabel} 계정입니다.`)
      }
      localStorage.setItem('accessToken', data.accessToken)
      localStorage.setItem('refreshToken', data.refreshToken)
      localStorage.setItem('memberType', data.memberType)
      localStorage.setItem('userId', String(data.userId ?? ''))
      localStorage.setItem('memberNumber', data.memberNumber || '')
      try {
        const me = await fetch('/api/users/me', { headers: { Authorization: `Bearer ${data.accessToken}` } })
        if (me.ok) {
          const meData = await me.json()
          localStorage.setItem('memberName', meData.name || '')
        }
      } catch { /* 선택 정보 조회 실패는 로그인 성공을 막지 않는다. */ }
      onLogin(ROLE_MAP[serverType] || role)
    } catch (e) {
      setError(e.message || '로그인에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  async function handleGuardianSignup() {
    setError('')
    if (gPw !== gPwConfirm) { setError('비밀번호가 일치하지 않습니다.'); return }
    setLoading(true)
    try {
      const data = await api('/auth/register/user', {
        name: gName, phone: gPhone, email: gEmail, password: gPw, address: gAddress,
      })
      localStorage.setItem('accessToken', data.accessToken)
      localStorage.setItem('refreshToken', data.refreshToken)
      localStorage.setItem('memberType', data.memberType)
      localStorage.setItem('userId', String(data.userId))
      localStorage.setItem('memberNumber', data.memberNumber || '')
      localStorage.setItem('memberName', gName)
      onLogin('guardian')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleHospitalSignup() {
    setError('')
    setLoading(true)
    try {
      await api('/auth/register/hospital', {
        name: hName, businessNumber: hBiz, phone: hPhone,
        fabricOrgId: hOrg, adminEmail: hEmail, password: hPw,
      })
      setError('등록 신청이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다.')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-wrap">
      {/* Left panel */}
      <div className="auth-left">
        <div
          style={{ fontSize: 19, fontWeight: 800, color: '#fff', cursor: 'pointer', marginBottom: 48, letterSpacing: '-.03em' }}
          onClick={onBack}
        >
          PET<span style={{ color: '#b8885a' }}>CHAIN.</span>
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#b8885a', letterSpacing: '.22em', textTransform: 'uppercase', marginBottom: 14 }}>
          — Member Access
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, color: '#fff', marginBottom: 6, letterSpacing: '-.02em' }}>
          {mode === 'signup' ? '회원가입' : '로그인'}
        </div>
        <div style={{ fontSize: 13.5, color: 'rgba(245,242,236,.5)', marginBottom: 32 }}>역할을 선택해주세요</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
          {roles.map(r => (
            <div
              key={r.id}
              className={`role-pill ${role === r.id ? 'sel' : ''}`}
              onClick={() => { setRole(r.id); setError('') }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: '#b8885a', letterSpacing: '.14em', width: 28, textAlign: 'center' }}>{r.icon}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{r.name}</div>
                <div style={{ fontSize: 12, color: 'rgba(245,242,236,.5)', marginTop: 2 }}>{r.desc}</div>
              </div>
            </div>
          ))}
          <div style={{ marginTop: 'auto', paddingTop: 24, borderTop: '1px solid rgba(245,242,236,.12)' }}>
            <div style={{ fontSize: 12, color: 'rgba(245,242,236,.45)', lineHeight: 1.7 }}>
              보험사 · 플랫폼 관리자는<br />
              <a href="/admin" style={{ color: '#b8885a', textDecoration: 'none', fontWeight: 600 }}>관리자 페이지</a>에서 로그인하세요
            </div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'rgba(245,242,236,.3)', marginTop: 24, letterSpacing: '.04em' }}>© 2024 PETCHAIN INC.</div>
      </div>

      {/* Right panel */}
      <div className="auth-right">
        <button
          className="btn btn-ghost btn-sm"
          style={{ position: 'absolute', top: 22, right: 26 }}
          onClick={onBack}
        >
          ← 홈으로
        </button>

        <div style={{ width: '100%', maxWidth: 400 }}>
          {error && (
            <div style={{
              marginBottom: 14, padding: '10px 13px', borderRadius: 8,
              background: error.startsWith('등록 신청') ? '#f0fdf4' : '#fee2e2',
              color: error.startsWith('등록 신청') ? '#166534' : '#dc2626',
              fontSize: 13,
            }}>
              {error}
            </div>
          )}

          <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 4 }}>
            {roles.find(r => r.id === role)?.name}
          </div>
          <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 24 }}>{desc[role]}</div>

          <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', marginBottom: 24 }}>
            {['login', 'signup'].map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setError('') }}
                style={{
                  padding: '9px 20px', background: 'none', border: 'none',
                  borderBottom: `2px solid ${tab === t ? 'var(--brand)' : 'transparent'}`,
                  marginBottom: -2, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  color: tab === t ? 'var(--brand)' : 'var(--muted)', fontFamily: 'inherit',
                }}
              >
                {t === 'login' ? '로그인' : { guardian: '회원가입', hospital: '병원 등록' }[role]}
              </button>
            ))}
          </div>

          {tab === 'login' && (
            <>
              <label className="fl">{role === 'guardian' ? '이메일' : '기관 Org ID'}</label>
              <input className="fi" placeholder={role === 'guardian' ? 'hong@email.com' : 'org-id'} value={loginId} onChange={e => setLoginId(e.target.value)} />
              <label className="fl">비밀번호</label>
              <input className="fi" type="password" placeholder="••••••••" value={loginPw} onChange={e => setLoginPw(e.target.value)} />
              <button
                className={`btn ${btnClass[role]}`}
                style={{ width: '100%', justifyContent: 'center', padding: 13 }}
                onClick={handleLogin}
                disabled={loading}
              >
                {loading ? '처리 중...' : '로그인'}
              </button>
              {role === 'guardian' && <OAuthButtons label="로그인" />}
            </>
          )}

          {tab === 'signup' && role === 'guardian' && (
            <>
              <div className="fi-row">
                <div>
                  <label className="fl">이름</label>
                  <input className="fi" placeholder="홍길동" value={gName} onChange={e => setGName(e.target.value)} />
                </div>
                <div>
                  <label className="fl">전화번호</label>
                  <input className="fi" placeholder="010-0000-0000" value={gPhone} onChange={e => setGPhone(e.target.value)} />
                </div>
              </div>
              <label className="fl">이메일</label>
              <input className="fi" type="email" placeholder="hong@email.com" value={gEmail} onChange={e => setGEmail(e.target.value)} />
              <div className="fi-row">
                <div>
                  <label className="fl">비밀번호</label>
                  <input className="fi" type="password" placeholder="8자 이상" value={gPw} onChange={e => setGPw(e.target.value)} />
                </div>
                <div>
                  <label className="fl">비밀번호 확인</label>
                  <input className="fi" type="password" placeholder="재입력" value={gPwConfirm} onChange={e => setGPwConfirm(e.target.value)} />
                </div>
              </div>
              <label className="fl">거주 지역</label>
              <select className="fi" value={gAddress} onChange={e => setGAddress(e.target.value)}>
                {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <div className="fi-note">📌 개인정보는 AES-256 암호화 저장됩니다.</div>
              <button
                className={`btn ${btnClass[role]}`}
                style={{ width: '100%', justifyContent: 'center', padding: 13 }}
                onClick={handleGuardianSignup}
                disabled={loading}
              >
                {loading ? '처리 중...' : '보호자로 가입하기'}
              </button>
              <OAuthButtons label="가입" />
            </>
          )}

          {tab === 'signup' && role === 'hospital' && (
            <>
              <div className="fi-row">
                <div>
                  <label className="fl">병원명</label>
                  <input className="fi" placeholder="행복동물병원" value={hName} onChange={e => setHName(e.target.value)} />
                </div>
                <div>
                  <label className="fl">사업자등록번호</label>
                  <input className="fi" placeholder="000-00-00000" value={hBiz} onChange={e => setHBiz(e.target.value)} />
                </div>
              </div>
              <div className="fi-row">
                <div>
                  <label className="fl">대표 전화</label>
                  <input className="fi" placeholder="02-0000-0000" value={hPhone} onChange={e => setHPhone(e.target.value)} />
                </div>
                <div>
                  <label className="fl">Fabric Org ID</label>
                  <input className="fi" placeholder="HospitalA" value={hOrg} onChange={e => setHOrg(e.target.value)} />
                </div>
              </div>
              <label className="fl">관리자 이메일</label>
              <input className="fi" type="email" placeholder="admin@hospital.com" value={hEmail} onChange={e => setHEmail(e.target.value)} />
              <label className="fl">비밀번호</label>
              <input className="fi" type="password" placeholder="8자 이상" value={hPw} onChange={e => setHPw(e.target.value)} />
              <div className="a-notice">📋 등록 신청 후 플랫폼 관리자 승인이 필요합니다.</div>
              <button
                className={`btn ${btnClass[role]}`}
                style={{ width: '100%', justifyContent: 'center', padding: 13 }}
                onClick={handleHospitalSignup}
                disabled={loading}
              >
                {loading ? '처리 중...' : '병원 등록 신청'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
