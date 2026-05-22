import { useState, useRef, useEffect } from 'react'
import Overlay from '../../components/common/Overlay'
import { useApp, generatePetId } from '../../context/AppContext'
import apiFetch from '../../api/client'

/* ─── CSS ───────────────────────────────────────────────────────── */
const CSS = `
/* ── 레이아웃 ── */
.gd-shell { display: flex; height: 100vh; overflow: hidden; font-family: var(--font-sans); }

/* ── 사이드바 ── */
.gd-sidebar {
  width: 220px; flex-shrink: 0;
  background: #221428;
  border-right: 1px solid #362040;
  display: flex; flex-direction: column;
}
.gd-logo { padding: 26px 22px 22px; border-bottom: 1px solid #362040; margin-bottom: 10px; }
.gd-logo-name { font-size: 16px; font-weight: 800; letter-spacing: -0.3px; color: #f5f2ec; }
.gd-logo-sub { font-size: 11px; color: #c4a8bc; margin-top: 4px; letter-spacing: .04em; }
.gd-nav { padding: 0 0 0 0; flex: 1; display: flex; flex-direction: column; gap: 2px; overflow-y: auto; }
.gd-nav-item {
  display: flex; align-items: center; gap: 12px;
  padding: 11px 22px; border-radius: 0;
  font-size: 13.5px; color: rgba(255,240,248,.55);
  cursor: pointer; border: none; background: transparent;
  width: 100%; text-align: left; font-family: var(--font-sans);
  transition: background 0.15s, color 0.15s, border-color .15s;
  border-left: 3px solid transparent;
}
.gd-nav-item:hover { background: rgba(255,255,255,.07); color: #fff0f8; }
.gd-nav-item.active { background: rgba(255,255,255,.1); color: #fff0f8; font-weight: 600; border-left: 3px solid #c8a0bc; }
.gd-nav-icon { font-size: 14px; width: 20px; text-align: center; flex-shrink: 0; }
.gd-bottom { padding: 18px 22px; border-top: 1px solid #362040; }
.gd-user-name { font-size: 14px; font-weight: 600; color: #fff0f8; }
.gd-user-region { font-size: 12px; color: #c4a8bc; margin-top: 3px; }
.gd-logout {
  display: block; width: 100%; margin-top: 14px;
  padding: 9px 12px; font-size: 13px; font-weight: 600;
  color: #fff0f8; background: rgba(248,113,113,.12);
  border: 1px solid rgba(248,113,113,.35); border-radius: 8px;
  cursor: pointer; font-family: var(--font-sans);
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.gd-logout:hover { background: #f87171; color: #fff; border-color: #f87171; }

/* ── 메인 ── */
.gd-main { flex: 1; overflow-y: auto; padding: 36px 40px; background: #fffbf9; }
`

/* ─── 상수 ──────────────────────────────────────────────────────── */
const REGIONS = [
  '서울특별시','부산광역시','대구광역시','인천광역시','광주광역시',
  '대전광역시','울산광역시','세종특별자치시',
  '경기도','강원도','충청북도','충청남도',
  '전라북도','전라남도','경상북도','경상남도','제주특별자치도',
]
const INSURERS = [
  { id:'insurance-samsung', name:'삼성화재해상보험', logo:'🛡️' },
  { id:'insurance-db',      name:'DB손해보험',      logo:'🛡️' },
]
const PAGE_SIZE = 7
const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']
const NAV = [
  { key:'home',      label:'내 반려동물', icon:'🐾' },
  { key:'records',   label:'진료기록',    icon:'📋' },
  { key:'consent',   label:'동의 관리',   icon:'🛡️' },
  { key:'status',    label:'청구 상태',   icon:'📄' },
  { key:'community', label:'커뮤니티',    icon:'💬' },
  { key:'ranking',   label:'지역 랭킹',   icon:'🏆' },
  { key:'myinfo',    label:'내 정보',     icon:'👤' },
]
const REGION_PINS = [
  { name:'서울특별시',x:128,y:150,label:'서울' },
  { name:'인천광역시',x:88,y:163,label:'인천' },
  { name:'경기도',x:132,y:202,label:'경기' },
  { name:'강원도',x:220,y:148,label:'강원' },
  { name:'세종특별자치시',x:152,y:267,label:'세종' },
  { name:'대전광역시',x:140,y:284,label:'대전' },
  { name:'충청북도',x:192,y:262,label:'충북' },
  { name:'충청남도',x:105,y:274,label:'충남' },
  { name:'전라북도',x:118,y:350,label:'전북' },
  { name:'광주광역시',x:115,y:406,label:'광주' },
  { name:'전라남도',x:133,y:444,label:'전남' },
  { name:'대구광역시',x:236,y:347,label:'대구' },
  { name:'경상북도',x:228,y:280,label:'경북' },
  { name:'경상남도',x:218,y:417,label:'경남' },
  { name:'울산광역시',x:261,y:377,label:'울산' },
  { name:'부산광역시',x:249,y:434,label:'부산' },
  { name:'제주특별자치도',x:148,y:502,label:'제주' },
]

// BE는 dog|cat|rabbit 영문 코드를 저장하지만, 과거 한글 데이터도 함께 노출될 수 있다.
const SPECIES_LABEL = { dog:'강아지', cat:'고양이', rabbit:'토끼', '강아지':'강아지', '고양이':'고양이', '토끼':'토끼' }
const speciesIcon = s => (s==='dog'||s==='강아지') ? '🐶' : (s==='cat'||s==='고양이') ? '🐱' : (s==='rabbit'||s==='토끼') ? '🐰' : '🐾'

/* ── ConsentCard ── */
function ConsentCard({ c, onToggle, onStartConsent }) {
  const isActive    = c.status === 'active'
  const isPending   = c.status === 'pending'
  const needsConsent = isPending && !c.insurerId  // 진료기록은 있지만 아직 동의 미생성
  return (
    <div className="card" style={{
      borderLeft: `3px solid ${isActive ? 'var(--success)' : isPending ? 'var(--warning)' : 'var(--border-d)'}`,
      opacity: needsConsent ? .9 : 1,
      background: isActive ? 'var(--success-xl)' : c.status === 'revoked' ? '#fafaf9' : 'var(--surface)',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
            <span style={{ fontSize:16, fontWeight:600 }}>{c.pet || '반려동물'}</span>
            <span style={{ color:'var(--muted)' }}>·</span>
            <span style={{ fontSize:15, color:'var(--text-2)' }}>{c.disease || '—'}</span>
          </div>
          <div style={{ fontSize:13, color:'var(--muted)', display:'flex', gap:12, flexWrap:'wrap' }}>
            <span>🏥 {c.hospital || '—'}</span>
            <span className="mono">{c.recordId}</span>
            <span>💰 {(c.cost||0).toLocaleString()}원</span>
            {c.insurerName && <span>🛡️ {c.insurerName}</span>}
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginLeft:20, flexShrink:0 }}>
          {needsConsent ? (
            <button className="btn btn-primary btn-sm" onClick={() => onStartConsent && onStartConsent(c.recordId)}>
              보험사 선택 후 동의 →
            </button>
          ) : (
            <>
              <span style={{ fontSize:13, fontWeight:500, color:isActive?'var(--success)':isPending?'var(--warning)':'var(--muted)' }}>
                {isActive?'동의 중':isPending?'대기 중':'동의 안 함'}
              </span>
              <label className="toggle">
                <input type="checkbox" checked={isActive} disabled={isPending} onChange={() => onToggle(c.recordId)} />
                <span className="toggle-slider" />
              </label>
            </>
          )}
        </div>
      </div>
      {isActive  && <div className="consent-active-banner"  style={{ marginTop:10 }}>✅ <strong>{c.insurerName}</strong>에 서류 자동 전달 중 · 보험사 검증 가능 상태</div>}
      {c.status==='revoked' && <div className="consent-revoked-banner" style={{ marginTop:10 }}>⛔ 동의 철회됨 — <strong>{c.insurerName}</strong> 신규 접근 차단 · 토글 ON으로 재동의 가능</div>}
      {needsConsent && <div className="alert alert-info" style={{ marginTop:10 }}>📋 진료기록이 등록되었습니다. 보험사를 선택해 동의를 시작하세요.</div>}
    </div>
  )
}

/* ── MonthPicker ── */
function MonthPicker({ selectedYear, selectedMonth, onChange, onClear }) {
  const [open, setOpen]         = useState(false)
  const [viewYear, setViewYear] = useState(selectedYear || new Date().getFullYear())
  const label = selectedYear ? `${selectedYear}년 ${selectedMonth}월` : '전체 기간'
  return (
    <div style={{ position:'relative' }}>
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(o => !o)} style={{ display:'flex', alignItems:'center', gap:6, minWidth:130 }}>
        📅 {label} <span style={{ fontSize:10, color:'var(--muted)' }}>▼</span>
      </button>
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 6px)', right:0, zIndex:200, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, boxShadow:'var(--shadow-lg)', padding:18, width:260 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setViewYear(y => y-1)}>←</button>
            <span style={{ fontWeight:600, fontSize:16 }}>{viewYear}년</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setViewYear(y => y+1)}>→</button>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6 }}>
            {MONTHS.map((m, i) => {
              const mon = i+1
              const isSel = selectedYear===viewYear && selectedMonth===mon
              return (
                <button key={mon} onClick={() => { isSel?onClear():onChange(viewYear,mon); setOpen(false) }}
                  style={{ padding:'8px 4px', borderRadius:8, border:'none', cursor:'pointer', fontSize:14, fontWeight:isSel?600:400, background:isSel?'var(--brand)':'transparent', color:isSel?'#fff':'var(--text)', transition:'background .12s', fontFamily:'var(--font-sans)' }}
                  onMouseEnter={e => { if (!isSel) e.currentTarget.style.background='var(--brand-xl)' }}
                  onMouseLeave={e => { if (!isSel) e.currentTarget.style.background='transparent' }}
                >{m}</button>
              )
            })}
          </div>
          <button className="btn btn-ghost btn-sm" style={{ width:'100%', justifyContent:'center', marginTop:12 }} onClick={() => { onClear(); setOpen(false) }}>전체 기간 보기</button>
        </div>
      )}
    </div>
  )
}

/* ── RecordsTab ── */
function RecordsTab({ records, onDetail }) {
  const [page, setPage]             = useState(0)
  const [filterYear, setFilterYear] = useState(null)
  const [filterMonth,setFilterMonth]= useState(null)
  const filtered   = records.filter(r => { if (!filterYear) return true; const p=r.date.split('.'); return Number(p[0])===filterYear && Number(p[1])===filterMonth })
  const totalPages = Math.max(1, Math.ceil(filtered.length/PAGE_SIZE))
  const safePage   = Math.min(page, totalPages-1)
  const paged      = filtered.slice(safePage*PAGE_SIZE, (safePage+1)*PAGE_SIZE)
  const handleMonthChange = (y,m) => { setFilterYear(y); setFilterMonth(m); setPage(0) }
  const handleClear = () => { setFilterYear(null); setFilterMonth(null); setPage(0) }
  return (
    <div className="fade-in">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:24 }}>
        <div>
          <div className="pane-h">진료기록 확인</div>
          <div className="pane-sub" style={{ marginBottom:0 }}>행을 클릭하면 소견을 볼 수 있습니다</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {filterYear && <span className="badge badge-brand">{filterYear}년 {filterMonth}월 · {filtered.length}건</span>}
          <MonthPicker selectedYear={filterYear} selectedMonth={filterMonth} onChange={handleMonthChange} onClear={handleClear} />
        </div>
      </div>
      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        <table className="tbl">
          <thead><tr><th>기록 ID</th><th>반려동물</th><th>진료일</th><th>질병 코드</th><th>진료비</th><th>블록체인</th><th></th></tr></thead>
          <tbody>
            {paged.length===0 ? (
              <tr><td colSpan={7} style={{ textAlign:'center', color:'var(--muted)', padding:56 }}>
                <div style={{ fontSize:30, marginBottom:10 }}>📋</div>
                <div style={{ fontWeight:500, fontSize:15 }}>{filterYear?`${filterYear}년 ${filterMonth}월 진료기록이 없습니다`:'등록된 진료기록이 없습니다'}</div>
              </td></tr>
            ) : paged.map(r => (
              <tr key={r.id} style={{ cursor:'pointer' }} onClick={() => onDetail(r)}>
                <td><span className="mono">{r.id}</span></td>
                <td style={{ fontWeight:500 }}>{r.petName}</td>
                <td style={{ color:'var(--text-2)' }}>{r.date}</td>
                <td>{r.diseases.join(', ')}</td>
                <td style={{ fontWeight:500 }}>{r.cost.toLocaleString()}원</td>
                <td><span className={`badge ${r.onChain?'badge-success':'badge-warning'}`}>{r.onChain?'원장 기록':'미기록'}</span></td>
                <td><button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); onDetail(r) }}>상세</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {totalPages>1 && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'14px 16px', borderTop:'1px solid var(--border)' }}>
            <button className="btn btn-ghost btn-sm" disabled={safePage===0} onClick={() => setPage(safePage-1)}>← 이전</button>
            {Array.from({length:totalPages},(_,i) => (
              <button key={i} className="btn btn-sm" onClick={() => setPage(i)}
                style={{ minWidth:34, background:i===safePage?'var(--brand)':'transparent', color:i===safePage?'#fff':'var(--text)', border:i===safePage?'none':'1px solid var(--border)', fontWeight:i===safePage?600:400 }}>{i+1}</button>
            ))}
            <button className="btn btn-ghost btn-sm" disabled={safePage===totalPages-1} onClick={() => setPage(safePage+1)}>다음 →</button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── MyInfoTab ── */
function MyInfoTab({ state, update, showToast }) {
  const [name,   setName]   = useState(state.userName  || '')
  const [email,  setEmail]  = useState(state.userEmail || '')
  const [phone,  setPhone]  = useState(state.userPhone || '')
  const [region, setRegion] = useState(state.userRegion)
  const handleSave = async () => {
    update({ userRegion:region, userName:name, userEmail:email, userPhone:phone })
    try { await apiFetch('/users/me',{method:'PATCH',body:{region,name,phone,email}}) } catch { /* 서버 미연결 시 로컬 상태만 갱신 */ }
    showToast('저장 완료','내 정보가 업데이트되었습니다')
  }
  const toggleInsurer = id => {
    const next = state.userInsurers.includes(id) ? state.userInsurers.filter(i=>i!==id) : [...state.userInsurers, id]
    update({ userInsurers:next })
  }
  return (
    <div className="fade-in">
      <div className="pane-h">내 정보</div>
      <div className="pane-sub">기본 정보와 연결 보험사를 관리합니다</div>
      <div className="g2" style={{ alignItems:'start' }}>
        <div className="card">
          <div style={{ fontSize:13, fontWeight:500, color:'var(--muted)', marginBottom:18, textTransform:'uppercase', letterSpacing:'0.4px' }}>기본 정보</div>
          <div className="fi-row">
            <div><label className="fl">이름</label><input className="fi" value={name} onChange={e=>setName(e.target.value)} /></div>
            <div><label className="fl">전화번호</label><input className="fi" value={phone} onChange={e=>setPhone(e.target.value)} /></div>
          </div>
          <label className="fl">이메일</label>
          <input className="fi" type="email" value={email} onChange={e=>setEmail(e.target.value)} />
          <label className="fl">거주 지역</label>
          <select className="fi" value={region} onChange={e=>setRegion(e.target.value)}>
            {REGIONS.map(r=><option key={r} value={r}>{r}</option>)}
          </select>
          <button className="btn btn-primary" style={{ width:'100%', justifyContent:'center', padding:12, marginTop:4 }} onClick={handleSave}>저장</button>
        </div>
        <div className="card">
          <div style={{ fontSize:13, fontWeight:500, color:'var(--muted)', marginBottom:18, textTransform:'uppercase', letterSpacing:'0.4px' }}>보험사 연결</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {INSURERS.map(ins => {
              const isOn = state.userInsurers.includes(ins.id)
              return (
                <div key={ins.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'13px 16px', borderRadius:10, border:`1px solid ${isOn?'var(--success)':'var(--border)'}`, background:isOn?'var(--success-xl)':'var(--surface)', transition:'all .15s' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:18 }}>{ins.logo}</span>
                    <div>
                      <div style={{ fontWeight:500, fontSize:15 }}>{ins.name}</div>
                      <div style={{ fontSize:13, color:isOn?'var(--success)':'var(--muted)', marginTop:1 }}>{isOn?'연결됨':'미연결'}</div>
                    </div>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" checked={isOn} onChange={() => toggleInsurer(ins.id)} />
                    <span className="toggle-slider" />
                  </label>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── RegionBanner ── */
function RegionBanner({ userRegion, onSave }) {
  const [editing,  setEditing]  = useState(!userRegion)
  const [selected, setSelected] = useState(userRegion || REGIONS[0])
  const [saving,   setSaving]   = useState(false)
  const handleSave = async () => {
    if (!selected) return
    setSaving(true); await onSave(selected); setSaving(false); setEditing(false)
  }
  if (!editing && userRegion) return (
    <div style={{ display:'flex', alignItems:'center', gap:14, padding:'13px 18px', borderRadius:12, marginBottom:20, background:'var(--brand-xl)', border:'1px solid var(--brand-l)' }}>
      <span style={{ fontSize:18 }}>📍</span>
      <div style={{ flex:1, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
        <span style={{ fontSize:14, fontWeight:500, color:'var(--text-2)' }}>내 거주지역</span>
        <span className="badge badge-brand">{userRegion}</span>
        <span style={{ fontSize:14, color:'var(--muted)' }}>· 내 지역 게시물에만 투표(추천)할 수 있어요</span>
      </div>
      <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>변경</button>
    </div>
  )
  return (
    <div style={{ padding:'24px 26px', borderRadius:16, marginBottom:24, background:'linear-gradient(135deg, var(--brand-h) 0%, var(--brand) 60%, var(--brand-2) 100%)', boxShadow:'var(--shadow-brand)' }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:16 }}>
        <div style={{ width:48, height:48, borderRadius:12, flexShrink:0, background:'rgba(255,255,255,.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24 }}>📍</div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:17, fontWeight:600, color:'#fff', marginBottom:4 }}>내 거주지역을 설정해주세요</div>
          <div style={{ fontSize:14, color:'rgba(255,255,255,.75)', lineHeight:1.7, marginBottom:18 }}>
            커뮤니티 투표(추천)는 <strong style={{ color:'#bfdbfe' }}>같은 지역 주민</strong>만 참여할 수 있어요.<br/>
            지역을 설정하면 우리 동네 반려동물 친구들을 응원할 수 있습니다! 🐾
          </div>
          <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
            <select className="fi" style={{ margin:0, flex:1, maxWidth:260, background:'rgba(255,255,255,.96)', fontWeight:500 }} value={selected} onChange={e=>setSelected(e.target.value)}>
              {REGIONS.map(r=><option key={r} value={r}>{r}</option>)}
            </select>
            <button className="btn" style={{ background:'#fff', color:'var(--brand)', fontWeight:600, border:'none', padding:'10px 22px', flexShrink:0 }} onClick={handleSave} disabled={saving}>
              {saving?'저장 중…':'설정 완료'}
            </button>
            {userRegion && <button className="btn" style={{ color:'rgba(255,255,255,.7)', border:'1px solid rgba(255,255,255,.25)', background:'transparent' }} onClick={() => setEditing(false)}>취소</button>}
          </div>
        </div>
      </div>
      <div style={{ display:'flex', gap:20, marginTop:16, paddingTop:14, borderTop:'1px solid rgba(255,255,255,.15)', flexWrap:'wrap' }}>
        {[['🗳️','내 지역 게시물에만 투표 가능'],['🐾','우리 동네 반려동물 이야기'],['🏆','지역별 랭킹에 반영']].map(([icon,text]) => (
          <div key={text} style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, color:'rgba(255,255,255,.65)' }}><span>{icon}</span><span>{text}</span></div>
        ))}
      </div>
    </div>
  )
}

/* ── CommunityTab API 매퍼 ── */
// 업로드 전 이미지 리사이즈/압축 — base64 저장 부담을 줄인다 (최대 1024px, JPEG 품질 0.7)
function compressImage(file, maxSize = 1024, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        if (width > maxSize || height > maxSize) {
          const r = Math.min(maxSize / width, maxSize / height)
          width = Math.round(width * r); height = Math.round(height * r)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        canvas.getContext('2d').drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = reject
      img.src = e.target.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
// 서버 응답(PostSummary/PostResponse) → 프론트 게시물 모델
function mapServerPost(p) {
  return {
    id: p.id,
    authorId: p.authorId || null,
    authorName: p.authorName || '익명',
    authorRegion: p.authorRegion || '',
    petName: p.petName || '',
    petBreed: p.petBreed || '',
    content: p.content || '',
    imageUrl: (Array.isArray(p.imageKeys) && p.imageKeys[0]) || null,
    likes: [],
    likeCount: p.likeCount || 0,
    liked: !!p.liked,
    comments: [],
    commentCount: p.commentCount || 0,
    commentsLoaded: false,
    createdAt: (p.createdAt || '').slice(0, 10).replaceAll('-', '.'),
    votes: {}, myVoted: false,
  }
}
// 서버 CommentResponse → 프론트 댓글 모델
function mapServerComment(c) {
  return {
    id: c.id,
    authorId: c.authorId || null,
    authorName: c.authorName || '익명',
    authorRegion: '',
    content: c.content || '',
    likeCount: c.likeCount || 0,
    liked: !!c.liked,
    replies: Array.isArray(c.replies)
      ? c.replies.map(r => ({ id: r.id, authorId: r.authorId || null, authorName: r.authorName || '익명', content: r.content || '', likeCount: r.likeCount || 0, liked: !!r.liked }))
      : [],
  }
}
// 숫자 id = 서버 게시물/댓글, 'post-xxx' 등 문자열 = 목업
const isServerId = id => typeof id === 'number' || /^\d+$/.test(String(id))

/* ── CommunityTab ── */
function CommunityTab({ state, update, showToast, onRegionSave }) {
  const [filter,           setFilter]           = useState('all')
  const [expandedComments, setExpandedComments] = useState({})
  const [commentInputs,    setCommentInputs]    = useState({})
  const [replyOpen,        setReplyOpen]        = useState({})
  const [replyInputs,      setReplyInputs]      = useState({})
  const [showCompose,      setShowCompose]      = useState(false)
  const [newPost,          setNewPost]          = useState({ content:'', petId:'', imagePreview:null })
  const [submitting,       setSubmitting]       = useState(false)
  const [editingPost,      setEditingPost]      = useState(null)   // {id, content}
  const [editingComment,   setEditingComment]   = useState(null)   // {postId, cmtId, content}
  const [editingReply,     setEditingReply]     = useState(null)   // {postId, cmtId, repId, content}
  const [replyLikes,       setReplyLikes]       = useState({})     // {repId: {count, liked}}
  const fileRef     = useRef()
  const editFileRef = useRef()
  const userRegion    = state.userRegion
  const likedPosts    = state.likedPosts || []
  const filteredPosts = filter==='all' ? state.posts : state.posts.filter(p=>p.authorRegion===userRegion)
  const isLiked = id => likedPosts.includes(id)
  const currentUserId = Number(localStorage.getItem('userId'))

  // 커뮤니티 탭 진입 시 서버 게시물 로드 (실패/빈 목록이면 목업 유지)
  useEffect(() => {
    let alive = true
    apiFetch('/posts?page=0&size=20')
      .then(res => {
        const list = Array.isArray(res?.content) ? res.content : (Array.isArray(res) ? res : [])
        if (alive && list.length > 0) update({ posts: list.map(mapServerPost) })
      })
      .catch(() => {})
    return () => { alive = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleLike = async postId => {
    if (!userRegion) { showToast('지역 미설정','투표하려면 먼저 거주지역을 설정해야 합니다'); return }
    const post = state.posts.find(p=>p.id===postId)
    if (post && post.authorRegion!==userRegion) { showToast('투표 불가',`내 지역(${userRegion}) 게시물에만 투표할 수 있어요`); return }
    if (isServerId(postId)) {
      try {
        const res = await apiFetch(`/posts/${postId}/likes`,{method:'POST'})
        update({
          likedPosts: res.liked ? [...likedPosts.filter(id=>id!==postId),postId] : likedPosts.filter(id=>id!==postId),
          posts: state.posts.map(p=>p.id===postId?{...p,liked:res.liked,likeCount:res.likeCount}:p),
        })
      } catch (e) { showToast('추천 실패', e?.message||'추천 처리에 실패했습니다') }
      return
    }
    const liked = isLiked(postId)
    update({ likedPosts:liked?likedPosts.filter(id=>id!==postId):[...likedPosts,postId], posts:state.posts.map(p=>p.id===postId?{...p,likes:liked?p.likes.slice(0,-1):[...p.likes,userRegion]}:p) })
  }
  // 댓글 영역 토글 — 펼칠 때 서버 게시물이면 상세 조회로 댓글 트리 로드
  const toggleCommentsView = async postId => {
    const willExpand = !expandedComments[postId]
    setExpandedComments(prev=>({...prev,[postId]:willExpand}))
    if (!willExpand) return
    const post = state.posts.find(p=>p.id===postId)
    if (!post || post.commentsLoaded || !isServerId(postId)) return
    try {
      const detail = await apiFetch(`/posts/${postId}`)
      const comments = Array.isArray(detail?.comments) ? detail.comments.map(mapServerComment) : []
      update({ posts:state.posts.map(p=>p.id===postId?{...p,comments,commentsLoaded:true,commentCount:comments.length}:p) })
    } catch { /* 조회 실패 시 기존 상태 유지 */ }
  }
  const handleAddComment = async postId => {
    const content=(commentInputs[postId]||'').trim(); if(!content) return
    if (isServerId(postId)) {
      try {
        const c = await apiFetch(`/posts/${postId}/comments`,{method:'POST',body:{content}})
        update({ posts:state.posts.map(p=>p.id===postId?{...p,comments:[...p.comments,mapServerComment(c)],commentCount:(p.commentCount??p.comments.length)+1}:p) })
        setCommentInputs(prev=>({...prev,[postId]:''}))
      } catch (e) { showToast('댓글 실패', e?.message||'댓글 등록에 실패했습니다') }
      return
    }
    update({ posts:state.posts.map(p=>p.id===postId?{...p,comments:[...p.comments,{id:`cmt-${Date.now()}`,authorName:'홍길동',authorRegion:userRegion,content,likes:0,replies:[]}]}:p) })
    setCommentInputs(prev=>({...prev,[postId]:''}))
  }
  const handleAddReply = async (postId,cmtId) => {
    const content=(replyInputs[cmtId]||'').trim(); if(!content) return
    if (isServerId(postId) && isServerId(cmtId)) {
      try {
        const r = await apiFetch(`/posts/${postId}/comments`,{method:'POST',body:{content,parentCommentId:cmtId}})
        update({ posts:state.posts.map(p=>p.id===postId?{...p,comments:p.comments.map(c=>c.id===cmtId?{...c,replies:[...c.replies,{id:r.id,authorName:r.authorName||'익명',content:r.content||content,likes:0}]}:c)}:p) })
        setReplyInputs(prev=>({...prev,[cmtId]:''})); setReplyOpen(prev=>({...prev,[cmtId]:false}))
      } catch (e) { showToast('대댓글 실패', e?.message||'대댓글 등록에 실패했습니다') }
      return
    }
    update({ posts:state.posts.map(p=>p.id===postId?{...p,comments:p.comments.map(c=>c.id===cmtId?{...c,replies:[...c.replies,{id:`rep-${Date.now()}`,authorName:'홍길동',content,likes:0}]}:c)}:p) })
    setReplyInputs(prev=>({...prev,[cmtId]:''})); setReplyOpen(prev=>({...prev,[cmtId]:false}))
  }
  const handleSavePost = async (postId) => {
    if (!editingPost?.content?.trim()) return
    if (isServerId(postId)) {
      try {
        const body = { content: editingPost.content.trim() }
        if (editingPost.removeImage) body.imageData = null
        else if (editingPost.imagePreview && !editingPost.imagePreview.startsWith('http')) body.imageData = editingPost.imagePreview
        await apiFetch(`/posts/${postId}`, { method:'PUT', body })
      } catch(e) { showToast('수정 실패', e?.message||'수정에 실패했습니다'); return }
    }
    const newImageUrl = editingPost.removeImage ? null : (editingPost.imagePreview ?? state.posts.find(p=>p.id===postId)?.imageUrl ?? null)
    update({ posts: state.posts.map(p => p.id===postId ? {...p, content:editingPost.content.trim(), imageUrl:newImageUrl} : p) })
    setEditingPost(null)
    showToast('수정 완료', '게시물이 수정되었습니다')
  }
  const handleDeletePost = async (postId) => {
    if (!window.confirm('게시물을 삭제하시겠습니까?')) return
    if (isServerId(postId)) {
      try { await apiFetch(`/posts/${postId}`, { method:'DELETE' }) } catch(e) { showToast('삭제 실패', e?.message||'삭제에 실패했습니다'); return }
    }
    update({ posts: state.posts.filter(p => p.id !== postId) })
    showToast('삭제 완료', '게시물이 삭제되었습니다')
  }
  const handleSaveComment = async (postId, cmtId) => {
    if (!editingComment?.content?.trim()) return
    if (isServerId(postId) && isServerId(cmtId)) {
      try { await apiFetch(`/posts/${postId}/comments/${cmtId}`, { method:'PUT', body:{ content:editingComment.content.trim() } }) } catch(e) { showToast('수정 실패', e?.message||'댓글 수정에 실패했습니다'); return }
    }
    update({ posts: state.posts.map(p => p.id===postId ? {...p, comments:p.comments.map(c => c.id===cmtId ? {...c,content:editingComment.content.trim()} : c)} : p) })
    setEditingComment(null)
  }
  const handleDeleteComment = async (postId, cmtId) => {
    if (isServerId(postId) && isServerId(cmtId)) {
      try { await apiFetch(`/posts/${postId}/comments/${cmtId}`, { method:'DELETE' }) } catch(e) { showToast('삭제 실패', e?.message||'댓글 삭제에 실패했습니다'); return }
    }
    update({ posts: state.posts.map(p => p.id===postId ? {...p, comments:p.comments.filter(c=>c.id!==cmtId), commentCount:Math.max(0,(p.commentCount??p.comments.length)-1)} : p) })
  }
  const handleToggleCommentLike = async (postId, cmtId) => {
    if (isServerId(postId) && isServerId(cmtId)) {
      try {
        const res = await apiFetch(`/posts/${postId}/comments/${cmtId}/likes`, { method:'POST' })
        update({ posts: state.posts.map(p => p.id===postId ? {...p, comments:p.comments.map(c => c.id===cmtId ? {...c, liked:res.liked, likeCount:res.likeCount} : c)} : p) })
      } catch { /* 로컬 상태만 갱신 */ }
    } else {
      update({ posts: state.posts.map(p => p.id===postId ? {...p, comments:p.comments.map(c => c.id===cmtId ? {...c, liked:!c.liked, likeCount:(c.likeCount||0)+(c.liked?-1:1)} : c)} : p) })
    }
  }
  const handleSaveReply = async (postId, cmtId, repId) => {
    if (!editingReply?.content?.trim()) return
    if (isServerId(repId)) {
      try { await apiFetch(`/posts/${postId}/comments/${repId}`, { method:'PUT', body:{ content:editingReply.content.trim() } }) } catch(e) { showToast('수정 실패', e?.message||'대댓글 수정에 실패했습니다'); return }
    }
    update({ posts: state.posts.map(p => p.id===postId ? {...p, comments:p.comments.map(c => c.id===cmtId ? {...c, replies:c.replies.map(r => r.id===repId ? {...r,content:editingReply.content.trim()} : r)} : c)} : p) })
    setEditingReply(null)
  }
  const handleDeleteReply = async (postId, cmtId, repId) => {
    if (isServerId(repId)) {
      try { await apiFetch(`/posts/${postId}/comments/${repId}`, { method:'DELETE' }) } catch(e) { showToast('삭제 실패', e?.message||'대댓글 삭제에 실패했습니다'); return }
    }
    update({ posts: state.posts.map(p => p.id===postId ? {...p, comments:p.comments.map(c => c.id===cmtId ? {...c, replies:c.replies.filter(r=>r.id!==repId)} : c)} : p) })
  }
  const handleToggleReplyLike = async (postId, cmtId, repId) => {
    const cur = replyLikes[repId] ?? { count: 0, liked: false }
    if (isServerId(repId)) {
      try {
        const res = await apiFetch(`/posts/${postId}/comments/${repId}/likes`, { method:'POST' })
        setReplyLikes(prev => ({...prev, [repId]: {count:res.likeCount, liked:res.liked}}))
        return
      } catch { /* 낙관적 업데이트로 폴백 */ }
    }
    setReplyLikes(prev => ({...prev, [repId]: {count:cur.liked?cur.count-1:cur.count+1, liked:!cur.liked}}))
  }

  const handleSubmitPost = async () => {
    if (!newPost.content.trim() || submitting) return
    const pet=state.pets.find(p=>p.petId===newPost.petId)||state.pets[0]
    setSubmitting(true)
    try {
      const created = await apiFetch('/posts',{method:'POST',body:{
        content:newPost.content.trim(),
        petName:pet?.name||undefined,
        petBreed:pet?.breed||undefined,
        authorRegion:userRegion||undefined,
        imageData:newPost.imagePreview||undefined,
      }})
      update({ posts:[mapServerPost(created),...state.posts] })
      setNewPost({content:'',petId:'',imagePreview:null}); setShowCompose(false)
      showToast('게시 완료','게시물이 등록되었습니다')
    } catch (e) {
      showToast('게시 실패', e?.message||'게시물 등록에 실패했습니다 (로그인이 필요할 수 있어요)')
    } finally {
      setSubmitting(false)
    }
  }
  return (
    <div className="fade-in">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div><div className="pane-h">커뮤니티</div><div className="pane-sub" style={{ marginBottom:0 }}>우리 동네 반려동물 이야기</div></div>
        <button className="btn btn-primary" onClick={() => setShowCompose(true)}>+ 게시물 작성</button>
      </div>
      <RegionBanner key={userRegion||'unset'} userRegion={userRegion} onSave={onRegionSave} />
      <div style={{ display:'flex', gap:8, marginBottom:20 }}>
        {[['all','전체'],['myregion',userRegion?`내 지역 (${userRegion})`:'내 지역 (미설정)']].map(([f,lbl]) => (
          <button key={f} className={`btn btn-sm ${filter===f?'btn-primary':'btn-ghost'}`} onClick={() => setFilter(f)}>{lbl}</button>
        ))}
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        {filteredPosts.length===0 && <div className="card" style={{ textAlign:'center', padding:'48px 24px', color:'var(--muted)' }}><div style={{ fontSize:32, marginBottom:10 }}>🐾</div><div style={{ fontWeight:500, fontSize:16 }}>게시물이 없습니다</div></div>}
        {filteredPosts.map(post => {
          const liked=post.liked ?? isLiked(post.id); const cmtExpanded=expandedComments[post.id]
          const isMyPost = post.authorId && post.authorId === currentUserId
          const isEditingThisPost = editingPost?.id === post.id
          return (
            <div key={post.id} className="card" style={{ padding:'20px 22px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                <div style={{ width:38, height:38, borderRadius:'50%', background:'var(--bg-2)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:17 }}>🐾</div>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontWeight:500, fontSize:15 }}>{post.authorName}</span>
                    <span className="badge badge-brand" style={{ fontSize:11 }}>{post.authorRegion}</span>
                  </div>
                  <div style={{ fontSize:13, color:'var(--muted)', marginTop:1 }}>{post.createdAt}</div>
                </div>
                {isMyPost && (
                  <div style={{ display:'flex', gap:4 }}>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize:12, color:'var(--muted)' }} onClick={() => isEditingThisPost ? setEditingPost(null) : setEditingPost({id:post.id, content:post.content, imagePreview:post.imageUrl||null, removeImage:false})}>{isEditingThisPost ? '취소' : '✏️ 수정'}</button>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize:12, color:'var(--danger)' }} onClick={() => handleDeletePost(post.id)}>🗑️ 삭제</button>
                  </div>
                )}
              </div>
              {post.petName && <div style={{ display:'flex', gap:6, marginBottom:10 }}><span className="badge badge-orange">🐶 {post.petName}</span><span className="badge badge-muted">{post.petBreed}</span></div>}
              {isEditingThisPost ? (
                <div style={{ marginBottom:12 }}>
                  <textarea className="fi" rows={4} style={{ resize:'vertical', fontFamily:'inherit', marginBottom:8 }} value={editingPost.content} onChange={e=>setEditingPost(p=>({...p,content:e.target.value}))} />
                  <input ref={editFileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={async e=>{ const f=e.target.files[0]; if(!f) return; try { const data=await compressImage(f); setEditingPost(p=>({...p,imagePreview:data,removeImage:false})) } catch { showToast('이미지 오류','이미지를 불러오지 못했습니다') } }} />
                  {editingPost.imagePreview && !editingPost.removeImage ? (
                    <div style={{ position:'relative', marginBottom:8 }}>
                      <img src={editingPost.imagePreview} alt="" style={{ width:'100%', borderRadius:8, aspectRatio:'16/9', objectFit:'cover', display:'block' }} />
                      <button onClick={()=>setEditingPost(p=>({...p,imagePreview:null,removeImage:true}))} style={{ position:'absolute', top:6, right:6, background:'rgba(0,0,0,.55)', border:'none', borderRadius:6, color:'#fff', fontSize:12, padding:'3px 8px', cursor:'pointer' }}>✕ 사진 제거</button>
                    </div>
                  ) : (
                    <div className="upload-zone" style={{ marginBottom:8, padding:'10px 14px', fontSize:13 }} onClick={()=>editFileRef.current.click()}>📎 사진 첨부 (선택)</div>
                  )}
                  <button className="btn btn-primary btn-sm" onClick={() => handleSavePost(post.id)}>저장</button>
                </div>
              ) : (
                <div style={{ fontSize:15, color:'var(--text-2)', lineHeight:1.75, marginBottom:12 }}>{post.content}</div>
              )}
              {!isEditingThisPost && post.imageUrl && <div style={{ marginBottom:12, borderRadius:10, overflow:'hidden', aspectRatio:'16/9' }}><img src={post.imageUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /></div>}
              <div style={{ display:'flex', gap:4, paddingTop:10, borderTop:'1px solid var(--border)' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => handleLike(post.id)} style={{ color:liked?'#e11d48':'var(--muted)', fontWeight:liked?600:400 }}>{liked?'❤️':'🤍'} {post.likeCount ?? post.likes.length}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => toggleCommentsView(post.id)}>💬 {post.commentCount ?? post.comments.length}</button>
              </div>
              {cmtExpanded && (
                <div style={{ marginTop:14, paddingTop:14, borderTop:'1px solid var(--border)' }}>
                  {post.comments.map(cmt => {
                    const isEditingCmt = editingComment?.postId===post.id && editingComment?.cmtId===cmt.id
                    const isMyCmt = cmt.authorId && cmt.authorId===currentUserId
                    return (
                      <div key={cmt.id} style={{ marginBottom:14 }}>
                        <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                          <div style={{ width:28, height:28, borderRadius:'50%', background:'var(--bg-2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, flexShrink:0 }}>🐾</div>
                          <div style={{ flex:1 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                              <span style={{ fontSize:14, fontWeight:500 }}>{cmt.authorName}</span>
                            </div>
                            {isEditingCmt ? (
                              <div style={{ display:'flex', gap:8, marginBottom:4 }}>
                                <input className="fi" style={{ margin:0, fontSize:14 }} value={editingComment.content} onChange={e=>setEditingComment(prev=>({...prev,content:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&handleSaveComment(post.id,cmt.id)} autoFocus />
                                <button className="btn btn-primary btn-sm" onClick={()=>handleSaveComment(post.id,cmt.id)}>저장</button>
                                <button className="btn btn-ghost btn-sm" onClick={()=>setEditingComment(null)}>취소</button>
                              </div>
                            ) : (
                              <div style={{ fontSize:14, color:'var(--text-2)', lineHeight:1.6 }}>{cmt.content}</div>
                            )}
                            <div style={{ display:'flex', gap:6, marginTop:5, alignItems:'center' }}>
                              <button className="btn btn-ghost btn-sm" style={{ fontSize:12, padding:'3px 8px', color:cmt.liked?'#e11d48':'var(--muted)' }} onClick={()=>handleToggleCommentLike(post.id,cmt.id)}>{cmt.liked?'❤️':'🤍'} {cmt.likeCount||0}</button>
                              <button className="btn btn-ghost btn-sm" style={{ fontSize:12, padding:'3px 8px' }} onClick={()=>setReplyOpen(prev=>({...prev,[cmt.id]:!prev[cmt.id]}))}>↩ 대댓글</button>
                              {isMyCmt && !isEditingCmt && (
                                <>
                                  <button className="btn btn-ghost btn-sm" style={{ fontSize:11, padding:'2px 6px', color:'var(--muted)' }} onClick={()=>setEditingComment({postId:post.id,cmtId:cmt.id,content:cmt.content})}>✏️</button>
                                  <button className="btn btn-ghost btn-sm" style={{ fontSize:11, padding:'2px 6px', color:'var(--danger)' }} onClick={()=>handleDeleteComment(post.id,cmt.id)}>🗑️</button>
                                </>
                              )}
                            </div>
                            {cmt.replies.map(rep => {
                              const isEditingRep = editingReply?.postId===post.id && editingReply?.cmtId===cmt.id && editingReply?.repId===rep.id
                              const isMyRep = rep.authorId && rep.authorId===currentUserId
                              const repLk = replyLikes[rep.id] ?? { count:rep.likeCount||0, liked:rep.liked||false }
                              return (
                                <div key={rep.id} style={{ display:'flex', gap:8, marginTop:8, paddingLeft:12, borderLeft:'2px solid var(--border)', alignItems:'flex-start' }}>
                                  <div style={{ flex:1 }}>
                                    <span style={{ fontSize:13, fontWeight:500, color:'var(--brand)', marginRight:4 }}>{rep.authorName}</span>
                                    {isEditingRep ? (
                                      <div style={{ display:'flex', gap:8, marginTop:4 }}>
                                        <input className="fi" style={{ margin:0, fontSize:13 }} value={editingReply.content} onChange={e=>setEditingReply(prev=>({...prev,content:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&handleSaveReply(post.id,cmt.id,rep.id)} autoFocus />
                                        <button className="btn btn-primary btn-sm" style={{ fontSize:12 }} onClick={()=>handleSaveReply(post.id,cmt.id,rep.id)}>저장</button>
                                        <button className="btn btn-ghost btn-sm" style={{ fontSize:12 }} onClick={()=>setEditingReply(null)}>취소</button>
                                      </div>
                                    ) : (
                                      <span style={{ fontSize:13, color:'var(--text-2)' }}>{rep.content}</span>
                                    )}
                                    <div style={{ display:'flex', gap:4, marginTop:3 }}>
                                      <button className="btn btn-ghost btn-sm" style={{ fontSize:11, padding:'2px 6px', color:repLk.liked?'#e11d48':'var(--muted)' }} onClick={()=>handleToggleReplyLike(post.id,cmt.id,rep.id)}>{repLk.liked?'❤️':'🤍'} {repLk.count}</button>
                                      {isMyRep && !isEditingRep && (
                                        <>
                                          <button className="btn btn-ghost btn-sm" style={{ fontSize:11, padding:'2px 6px', color:'var(--muted)' }} onClick={()=>setEditingReply({postId:post.id,cmtId:cmt.id,repId:rep.id,content:rep.content})}>✏️</button>
                                          <button className="btn btn-ghost btn-sm" style={{ fontSize:11, padding:'2px 6px', color:'var(--danger)' }} onClick={()=>handleDeleteReply(post.id,cmt.id,rep.id)}>🗑️</button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                            {replyOpen[cmt.id] && (
                              <div style={{ display:'flex', gap:8, marginTop:8 }}>
                                <input className="fi" style={{ margin:0, fontSize:14 }} placeholder="대댓글 입력..." value={replyInputs[cmt.id]||''} onChange={e=>setReplyInputs(prev=>({...prev,[cmt.id]:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&handleAddReply(post.id,cmt.id)} />
                                <button className="btn btn-primary btn-sm" onClick={() => handleAddReply(post.id,cmt.id)}>등록</button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <div style={{ display:'flex', gap:8, marginTop:4 }}>
                    <input className="fi" style={{ margin:0, fontSize:14 }} placeholder="댓글을 입력하세요..." value={commentInputs[post.id]||''} onChange={e=>setCommentInputs(prev=>({...prev,[post.id]:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&handleAddComment(post.id)} />
                    <button className="btn btn-primary btn-sm" onClick={() => handleAddComment(post.id)}>등록</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {showCompose && (
        <Overlay title="게시물 작성" sub="반려동물 이야기를 공유해보세요" onClose={() => setShowCompose(false)}>
          <label className="fl">반려동물 선택</label>
          <select className="fi" value={newPost.petId} onChange={e=>setNewPost(p=>({...p,petId:e.target.value}))}>
            <option value="">-- 선택하세요 --</option>
            {state.pets.map(p=><option key={p.petId} value={p.petId}>{p.name} ({p.breed})</option>)}
          </select>
          <label className="fl">내용</label>
          <textarea className="fi" rows={5} placeholder="오늘 있었던 이야기를 적어보세요..." value={newPost.content} onChange={e=>setNewPost(p=>({...p,content:e.target.value}))} style={{ resize:'vertical', fontFamily:'inherit' }} />
          <label className="fl">이미지 첨부</label>
          <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={async e=>{ const f=e.target.files[0]; if(!f) return; try { const data=await compressImage(f); setNewPost(p=>({...p,imagePreview:data})) } catch { showToast('이미지 오류','이미지를 불러오지 못했습니다') } }} />
          {newPost.imagePreview ? <img src={newPost.imagePreview} alt="" style={{ width:'100%', borderRadius:10, marginBottom:14, aspectRatio:'16/9', objectFit:'cover' }} /> : <div className="upload-zone" style={{ marginBottom:14 }} onClick={() => fileRef.current.click()}>📎 이미지 첨부 (선택)</div>}
          <button className="btn btn-primary" style={{ width:'100%', justifyContent:'center', padding:13 }} onClick={handleSubmitPost} disabled={submitting}>{submitting?'게시 중...':'게시하기'}</button>
        </Overlay>
      )}
    </div>
  )
}

/* ── RankingTab ── */
// imageKeys[0]가 data URL / http URL이면 사진으로 사용, S3 key뿐이면 null
function postPhoto(post) {
  const k = post && Array.isArray(post.imageKeys) ? post.imageKeys[0] : null
  return (typeof k === 'string' && (k.startsWith('data:') || k.startsWith('http'))) ? k : null
}

function RankingTab() {
  const [regionTops,     setRegionTops]     = useState(null)  // [{region, topPost}] · null=로딩중
  const [selectedRegion, setSelectedRegion] = useState(null)
  const [ranking,        setRanking]        = useState(null)  // 선택 지역 TOP 10
  const [rankLoading,    setRankLoading]    = useState(false)

  // 지도 로드: 각 지역 좋아요 1위 게시물 (한 번의 호출)
  useEffect(() => {
    let alive = true
    apiFetch('/posts/popular/by-region')
      .then(rows => { if (alive) setRegionTops(Array.isArray(rows) ? rows : []) })
      .catch(() => { if (alive) setRegionTops([]) })
    return () => { alive = false }
  }, [])

  // 핀 클릭: 해당 지역 TOP 10 조회
  const selectRegion = region => {
    if (region === selectedRegion) { setSelectedRegion(null); setRanking(null); return }
    setSelectedRegion(region)
    setRanking(null)
    setRankLoading(true)
    apiFetch(`/posts/popular?region=${encodeURIComponent(region)}`)
      .then(rows => setRanking(Array.isArray(rows) ? rows : []))
      .catch(() => setRanking([]))
      .finally(() => setRankLoading(false))
  }

  const topByRegion = {}
  ;(regionTops || []).forEach(r => { topByRegion[r.region] = r.topPost })

  const rankStyle = rank => {
    if(rank===1) return {background:'#fef08a',color:'#713f12',border:'1.5px solid #fbbf24'}
    if(rank===2) return {background:'#e2e8f0',color:'#334155',border:'1.5px solid #94a3b8'}
    if(rank===3) return {background:'#fed7aa',color:'#7c2d12',border:'1.5px solid #fb923c'}
    return {background:'var(--bg-2)',color:'var(--muted)',border:'1px solid var(--border)'}
  }

  return (
    <div className="fade-in">
      <div className="pane-h">지역 랭킹</div>
      <div className="pane-sub">지역 핀을 클릭해서 TOP 10 랭킹을 확인하세요 · 최근 30일 좋아요 기준</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:24, alignItems:'start' }}>
        <div className="card" style={{ padding:20 }}>
          <svg viewBox="0 0 320 540" width="100%" style={{ display:'block', maxHeight:480 }}>
            <defs>
              {REGION_PINS.map(pin => (
                <clipPath key={pin.name} id={`pinclip-${pin.label}`}>
                  <circle cx={pin.x} cy={pin.y} r={16}/>
                </clipPath>
              ))}
            </defs>
            <path d="M 140 25 L 170 28 L 210 42 L 258 72 L 278 120 L 285 185 L 282 260 L 272 330 L 258 395 L 248 445 L 228 472 L 200 480 L 170 478 L 140 468 L 108 450 L 78 420 L 60 375 L 52 310 L 56 245 L 64 185 L 76 140 L 90 100 L 112 68 L 132 45 Z" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1.5"/>
            <ellipse cx="148" cy="502" rx="38" ry="20" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1.5"/>
            {REGION_PINS.map(pin => {
              const post=topByRegion[pin.name]; const photo=postPhoto(post)
              const isSel=selectedRegion===pin.name; const hasData=!!post
              const R=hasData?16:7
              return (
                <g key={pin.name} onClick={() => selectRegion(pin.name)} style={{ cursor:'pointer' }}>
                  {isSel && <circle cx={pin.x} cy={pin.y} r={R+5} fill="rgba(37,99,235,0.15)"/>}
                  {photo ? (
                    <>
                      <image href={photo} x={pin.x-R} y={pin.y-R} width={R*2} height={R*2}
                             clipPath={`url(#pinclip-${pin.label})`} preserveAspectRatio="xMidYMid slice"/>
                      <circle cx={pin.x} cy={pin.y} r={R} fill="none" stroke={isSel?'var(--brand)':'#b8885a'} strokeWidth={isSel?3:2}/>
                    </>
                  ) : (
                    <circle cx={pin.x} cy={pin.y} r={R} fill={isSel?'var(--brand)':hasData?'#b8885a':'#a09688'} opacity={hasData?1:.55}/>
                  )}
                  {hasData && (
                    <>
                      <circle cx={pin.x+R-3} cy={pin.y-R+3} r="7" fill="var(--brand)"/>
                      <text x={pin.x+R-3} y={pin.y-R+3.5} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize="7" fontWeight="700">{post.likeCount}</text>
                    </>
                  )}
                  <text x={pin.x} y={pin.y+R+9} textAnchor="middle" fill={isSel?'var(--brand)':'#888'} fontSize="8.5" fontWeight={isSel?'700':'500'}>{pin.label}</text>
                </g>
              )
            })}
          </svg>
        </div>
        {selectedRegion ? (
          <div className="card">
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
              <span style={{ fontSize:18 }}>📍</span>
              <div><div style={{ fontWeight:600, fontSize:16 }}>{selectedRegion}</div><div style={{ fontSize:13, color:'var(--muted)', marginTop:2 }}>지역 TOP 10 · 좋아요 순</div></div>
            </div>
            {rankLoading ? (
              <div style={{ textAlign:'center', padding:'32px 0', color:'var(--muted)' }}>불러오는 중…</div>
            ) : (ranking && ranking.length===0) ? (
              <div style={{ textAlign:'center', padding:'32px 0', color:'var(--muted)' }}><div style={{ fontSize:28, marginBottom:8 }}>🐾</div><div style={{ fontWeight:500 }}>등록된 게시물이 없습니다</div></div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {(ranking || []).map((post, i) => {
                  const rank=i+1; const photo=postPhoto(post)
                  return (
                    <div key={post.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px', borderRadius:10, background:'var(--bg-2)' }}>
                      <div style={{ width:26, height:26, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0, ...rankStyle(rank) }}>{rank}</div>
                      {photo
                        ? <img src={photo} alt="" style={{ width:34, height:34, borderRadius:8, objectFit:'cover', flexShrink:0 }}/>
                        : <span style={{ fontSize:17 }}>🐶</span>}
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:500, fontSize:14 }}>{post.petName || post.authorName}</div>
                        <div style={{ fontSize:12, color:'var(--muted)' }}>{post.petBreed || '—'}</div>
                      </div>
                      <div style={{ fontSize:14, fontWeight:600, color:'var(--brand)', flexShrink:0 }}>❤️ {post.likeCount}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="card" style={{ textAlign:'center', padding:'48px 24px', color:'var(--muted)' }}>
            <div style={{ fontSize:32, marginBottom:12 }}>🗺️</div>
            <div style={{ fontWeight:500, fontSize:16, marginBottom:6 }}>지역을 선택하세요</div>
            <div style={{ fontSize:14 }}>
              {regionTops===null
                ? '지도를 불러오는 중입니다…'
                : <>지도의 핀을 클릭하면<br/>해당 지역 TOP 10을 확인할 수 있습니다</>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── InsuranceModal ── */
function InsuranceModal({ pets, onClose, onRegister }) {
  const availPets = pets.filter(p => !p.insurer)
  const [selPet,     setSelPet]     = useState(availPets[0]?.petId || '')
  const [selInsurer, setSelInsurer] = useState(INSURERS[0]?.id || '')
  return (
    <Overlay title="보험 계약 등록" sub="반려동물과 보험사를 선택하세요" onClose={onClose}>
      <label className="fl">반려동물 선택</label>
      {availPets.length === 0 ? (
        <div className="alert alert-info" style={{ marginBottom:14 }}>모든 반려동물에 보험이 등록되어 있습니다.</div>
      ) : (
        <select className="fi" value={selPet} onChange={e=>setSelPet(e.target.value)}>
          <option value="">-- 선택하세요 --</option>
          {availPets.map(p => (
            <option key={p.petId} value={p.petId}>{p.name} ({p.breed})</option>
          ))}
        </select>
      )}
      <label className="fl" style={{ marginTop:8 }}>보험사</label>
      <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
        {INSURERS.map(ins => (
          <div key={ins.id} onClick={() => setSelInsurer(ins.id)}
            style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:10, cursor:'pointer',
              border:`1.5px solid ${selInsurer===ins.id?'var(--brand)':'var(--border)'}`,
              background:selInsurer===ins.id?'var(--brand-xl)':'var(--surface)', transition:'all .15s' }}>
            <span style={{ fontSize:18 }}>{ins.logo}</span>
            <span style={{ fontWeight:selInsurer===ins.id?600:400, fontSize:15 }}>{ins.name}</span>
            {selInsurer===ins.id && <span style={{ marginLeft:'auto', color:'var(--brand)', fontWeight:700 }}>✓</span>}
          </div>
        ))}
      </div>
      <div className="fi-note" style={{ marginBottom:16 }}>📌 보험 등록 후 진료기록이 생기면 동의 관리 탭에서 자동 전달됩니다.</div>
      <button className="btn btn-primary" style={{ width:'100%', padding:13, fontSize:15, justifyContent:'center' }}
        disabled={!selPet || !selInsurer || availPets.length===0}
        onClick={() => onRegister(selPet, selInsurer)}>
        등록 완료
      </button>
    </Overlay>
  )
}

/* ── Main ── */
export default function GuardianDash({ showToast, onLogout, initialTab = null, onHome }) {
  const { state, update, toggleConsent } = useApp()
  const [tab, setTab] = useState(() => initialTab || localStorage.getItem('petchain_guardian_tab') || 'home')

  useEffect(() => { localStorage.setItem('petchain_guardian_tab', tab) }, [tab])
  const [modal,        setModal]        = useState(null)
  const [detailRecord, setDetailRecord] = useState(null)
  const [newPet,       setNewPet]       = useState({ name:'', species:'dog', breed:'', birthYear:'', chipNo:'', petId:'' })
  const [petFormError, setPetFormError] = useState('')
  const [consentModal,      setConsentModal]      = useState(null)   // recordId of pending consent
  const [consentInsurerId,  setConsentInsurerId]  = useState(INSURERS[0]?.id || '')
  const [consentCreating,   setConsentCreating]   = useState(false)
  const [consentActivePage, setConsentActivePage] = useState(0)
  const [consentRevokePage, setConsentRevokePage] = useState(0)
  const [statusPage,        setStatusPage]        = useState(0)

  useEffect(() => {
    async function loadData() {
      try {
        const [petsRes,recordsRes,consentsRes,meRes] = await Promise.allSettled([apiFetch('/pets'),apiFetch('/records?guardianId=me&size=200'),apiFetch('/consents?guardianId=me'),apiFetch('/users/me')])
        if (meRes.status==='fulfilled' && meRes.value) {
          const me = meRes.value
          const patch = {}
          if (me.region) patch.userRegion = me.region
          if (me.name)   patch.userName  = me.name
          if (me.email)  patch.userEmail = me.email
          if (me.phone)  patch.userPhone = me.phone
          if (Object.keys(patch).length) update(patch)
        }
        // 펫 로드 (consents에서 보험사 정보 반영 후 update)
        let loadedPets = []
        if (petsRes.status==='fulfilled') {
          const a=Array.isArray(petsRes.value)?petsRes.value:[]
          if(a.length>0) loadedPets=a.map(p=>({ petId:p.petNumber||String(p.id),name:p.name,species:p.species,breed:p.breed,birthYear:p.birthYear,insurer:'' }))
        }
        if (recordsRes.status==='fulfilled') { const a=Array.isArray(recordsRes.value?.records)?recordsRes.value.records:(Array.isArray(recordsRes.value?.content)?recordsRes.value.content:[]); if(a.length>0) update({ medicalRecords:a.map(r=>({ id:String(r.recordId||r.id),petId:String(r.petId||''),petName:r.petName||'',date:(r.treatmentDate||r.date||'').replaceAll('-','.'),diseases:Array.isArray(r.diagnosisCodes)?r.diagnosisCodes:(Array.isArray(r.diseases)?r.diseases:[]),treatments:Array.isArray(r.treatmentCodes)?r.treatmentCodes:(Array.isArray(r.treatments)?r.treatments:[]),cost:r.treatmentCost||r.cost||0,memo:r.memo||'',onChain:!!(r.recordHash||r.onChain) })) }) }
        if (consentsRes.status==='fulfilled') {
          const a=Array.isArray(consentsRes.value?.consents)?consentsRes.value.consents:(Array.isArray(consentsRes.value?.content)?consentsRes.value.content:[])
          const sm={ACTIVE:'active',REVOKED:'revoked',PENDING:'pending'}
          const m={}
          const petInsurerMap={}
          a.forEach(c=>{
            const k=String(c.recordId)
            m[k]={consentId:String(c.consentId||c.id||''),recordId:k,guardianId:c.guardianId,insurerId:c.insurerId||'',status:sm[c.status]||(c.status||'').toLowerCase(),insurerName:c.insurerName||c.insurerId||'',pet:c.petName||'',disease:c.disease||'',hospital:c.hospitalName||'',cost:Number(c.cost)||0,petId:String(c.petId||''),claimStatus:c.claimStatus||'pending',reviewResult:c.reviewResult||null}
            if(c.petId && c.insurerName) petInsurerMap[String(c.petId)]=c.insurerName
          })
          const petsWithInsurer=loadedPets.length>0 ? loadedPets.map(p=>({...p, insurer:petInsurerMap[p.petId]||''})) : null
          const patch={consents:m}
          if(petsWithInsurer) patch.pets=petsWithInsurer
          if(a.length>0 || loadedPets.length>0) update(patch)
          else if(loadedPets.length>0) update({pets:loadedPets})
        } else if(loadedPets.length>0) {
          update({pets:loadedPets})
        }
      } catch { /* fallback */ }
    }
    loadData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const consents     = Object.values(state.consents)
  const activeCount  = consents.filter(c=>c.status==='active').length
  const revokedCount = consents.filter(c=>c.status==='revoked').length

  const handleToggle = async recordId => {
    const c=state.consents[recordId]; const next=c.status==='active'?'revoked':'active'
    toggleConsent(recordId)
    showToast(next==='active'?'동의 완료':'동의 철회', next==='active'?`${recordId} — 보험사에 서류 자동 전달됩니다`:`${recordId} — 보험사 접근 차단됨`)
    try {
      if(c.status==='active') {
        await apiFetch(`/consents/${c.consentId}/revoke`,{method:'POST'})
      } else {
        await apiFetch('/consents',{method:'POST',body:{recordId:c.recordId,insurerId:c.insurerId||localStorage.getItem('userId')||'1',guardianId:c.guardianId||localStorage.getItem('userId')||'1'}})
      }
      // 서버 최신 상태 반영
      const res = await apiFetch('/consents?guardianId=me')
      const a=Array.isArray(res?.consents)?res.consents:(Array.isArray(res?.content)?res.content:[])
      if(a.length>0){
        const sm={ACTIVE:'active',REVOKED:'revoked',PENDING:'pending'}
        const m={}
        const petInsurerMap={}
        a.forEach(ci=>{const k=String(ci.recordId);m[k]={consentId:String(ci.consentId||ci.id||''),recordId:k,guardianId:ci.guardianId,insurerId:ci.insurerId||'',status:sm[ci.status]||(ci.status||'').toLowerCase(),insurerName:ci.insurerName||ci.insurerId||'',pet:ci.petName||'',disease:ci.disease||'',hospital:ci.hospitalName||'',cost:Number(ci.cost)||0,petId:String(ci.petId||''),claimStatus:ci.claimStatus||'pending',reviewResult:ci.reviewResult||null};if(ci.petId&&ci.insurerName)petInsurerMap[String(ci.petId)]=ci.insurerName})
        const petsWithInsurer=state.pets.map(p=>({...p,insurer:petInsurerMap[p.petId]||p.insurer||''}))
        update({consents:m, pets:petsWithInsurer})
      }
    } catch { /* 서버 미연결 시 로컬 상태만 갱신 */ }
  }
  const handleRegionSave = async region => {
    update({ userRegion:region }); showToast('지역 설정 완료',`거주지역이 ${region}(으)로 설정되었습니다`)
    try { await apiFetch('/users/me',{method:'PATCH',body:{region}}) } catch { /* 서버 미연결 시 로컬 상태만 갱신 */ }
  }

  const handleStartConsent = (recordId) => {
    setConsentInsurerId(INSURERS[0]?.id || '')
    setConsentModal(recordId)
  }

  const handleCreateConsent = async () => {
    if (!consentInsurerId || !consentModal || consentCreating) return
    setConsentCreating(true)
    try {
      const c = state.consents[consentModal]
      await apiFetch('/consents', { method:'POST', body:{ recordId:consentModal, insurerId:consentInsurerId, guardianId:'me' } })
      showToast('동의 생성 완료', `${c?.pet || consentModal} — 보험사에 서류 자동 전달 시작`)
      // 동의 목록 갱신
      const res = await apiFetch('/consents?guardianId=me')
      const a = Array.isArray(res?.consents) ? res.consents : (Array.isArray(res?.content) ? res.content : [])
      if (a.length > 0) {
        const sm = {ACTIVE:'active',REVOKED:'revoked',PENDING:'pending',EXPIRED:'revoked'}
        const m = {}
        const petInsurerMap = {}
        a.forEach(item => {
          const k = String(item.recordId)
          m[k] = { consentId:String(item.consentId||item.id||''), recordId:k, guardianId:item.guardianId, insurerId:item.insurerId||'', status:sm[item.status]||(item.status||'').toLowerCase(), insurerName:item.insurerName||item.insurerId||'', pet:item.petName||'', disease:item.disease||'', hospital:item.hospitalName||'', cost:Number(item.cost)||0, petId:String(item.petId||''), claimStatus:item.claimStatus||'requested', reviewResult:item.reviewResult||null }
          if(item.petId && item.insurerName) petInsurerMap[String(item.petId)] = item.insurerName
        })
        const petsWithInsurer = state.pets.map(p=>({...p, insurer:petInsurerMap[p.petId]||p.insurer||''}))
        update({ consents:m, pets:petsWithInsurer })
      }
      setConsentModal(null)
    } catch (e) {
      showToast('동의 생성 실패', e?.message || '서버 오류가 발생했습니다')
    } finally {
      setConsentCreating(false)
    }
  }
  const openPetModal = () => {
    const petId = generatePetId(state.pets.map(p=>p.petId))
    setPetFormError('')
    setNewPet({name:'',species:'dog',breed:'',birthYear:'',chipNo:'',petId}); setModal('pet')
  }
  const handleAddPet = async () => {
    // BE 가 dog|cat|rabbit 영문 코드를 기대하므로 그대로 전송하고, 화면 표시만 한글로 변환한다.
    const name = newPet.name.trim()
    const species = newPet.species.trim()
    const breed = newPet.breed.trim()
    const birthYearText = String(newPet.birthYear).trim()
    if (!name || !species || !breed || !birthYearText) {
      const message = '이름, 종류, 품종, 출생연도를 모두 입력해 주세요.'
      setPetFormError(message)
      showToast('반려동물 등록 실패', message)
      return
    }
    try {
      const created=await apiFetch('/pets',{method:'POST',body:{petNumber:newPet.petId,name,species,breed,birthYear:Number(birthYearText),gender:'',isNeutered:false}})
      const createdPet = created?.petNumber || created?.id
        ? {petId:created.petNumber||String(created.id),name:created.name||name,species:created.species||species,breed:created.breed||breed,birthYear:created.birthYear??Number(birthYearText),chipNo:newPet.chipNo,insurer:''}
        : null
      if(createdPet) {
        update({pets:[...state.pets, createdPet]})
      } else {
        const refreshed=await apiFetch('/pets');const a=Array.isArray(refreshed)?refreshed:[];if(a.length>0)update({pets:a.map(p=>({petId:p.petNumber||String(p.id),name:p.name,species:p.species,breed:p.breed,birthYear:p.birthYear,insurer:''}))})
      }
      setPetFormError('')
      setModal(null)
      showToast('반려동물 등록',`${name} 등록 완료`)
    } catch (e) {
      const message = e?.message || '서버 오류로 등록에 실패했습니다.'
      setPetFormError(message)
      showToast('반려동물 등록 실패', message)
    }
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="gd-shell">

        {/* ── 사이드바 ── */}
        <nav className="gd-sidebar">
          <div className="gd-logo" onClick={onHome} style={{cursor:'pointer'}} title="메인 화면으로">
            <div className="gd-logo-name">PET<span style={{color:'#b8885a'}}>CHAIN.</span></div>
            <div className="gd-logo-sub">GUARDIAN · MEMBER</div>
          </div>
          <div className="gd-nav">
            {NAV.map(n => (
              <button key={n.key} className={`gd-nav-item${tab===n.key?' active':''}`} onClick={() => setTab(n.key)}>
                <span className="gd-nav-icon">{n.icon}</span>{n.label}
              </button>
            ))}
          </div>
          <div className="gd-bottom">
            <div className="gd-user-name">{state.userName || '보호자'}</div>
            <div className="gd-user-region">{state.userRegion || '지역 미설정'}</div>
            <button className="gd-logout" onClick={onLogout}>로그아웃 →</button>
          </div>
        </nav>

        {/* ── 메인 ── */}
        <main className="gd-main">

          {/* 홈 */}
          {tab==='home' && (
            <div className="fade-in">
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:28 }}>
                <div>
                  <div className="pane-h">내 반려동물</div>
                  <div className="pane-sub" style={{ marginBottom:0 }}>등록된 반려동물과 보험 계약을 관리합니다</div>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button className="btn btn-ghost" onClick={() => setModal('ins')}>+ 보험 계약 등록</button>
                  <button className="btn btn-primary" onClick={openPetModal}>+ 반려동물 추가</button>
                </div>
              </div>
              <div className="g3" style={{ marginBottom:28 }}>
                {[
                  { n:state.medicalRecords.length, l:'총 진료기록 · 클릭하여 확인', bg:'var(--brand-xl)', border:'var(--brand)', color:'var(--brand)', target:'records' },
                  { n:activeCount,  l:'동의 활성 · 클릭하여 관리',  bg:'var(--success-xl)', border:'var(--success)', color:'var(--success)', target:'consent' },
                  { n:revokedCount, l:'동의 철회 · 클릭하여 관리',  bg:'var(--danger-xl)',  border:'var(--danger)',  color:'var(--danger)',  target:'consent' },
                ].map((s,i) => (
                  <div key={i} className="stat-box" onClick={() => setTab(s.target)}
                    style={{ background:s.bg, border:`1px solid ${s.border}33`, cursor:'pointer', padding:'22px 24px' }}
                    onMouseEnter={e => e.currentTarget.style.boxShadow='var(--shadow-md)'}
                    onMouseLeave={e => e.currentTarget.style.boxShadow='none'}>
                    <div className="stat-n" style={{ color:s.color }}>{s.n}</div>
                    <div className="stat-l" style={{ color:s.color, opacity:.75 }}>{s.l}</div>
                  </div>
                ))}
              </div>
              <div className="g3">
                {state.pets.map((p,i) => {
                  const speciesLabel = SPECIES_LABEL[p.species] || p.species
                  const hasInsurer = !!p.insurer
                  return (
                  <div key={i} className="card" style={{ borderTop:'2px solid var(--brand)' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:18 }}>
                      <div style={{ width:50, height:50, borderRadius:12, background:'var(--brand-xl)', border:'1px solid var(--brand-l)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24 }}>{speciesIcon(p.species)}</div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:18, fontWeight:600 }}>{p.name}</div>
                        <div style={{ display:'inline-flex', alignItems:'center', gap:6, marginTop:4, padding:'3px 8px', borderRadius:6, background:'var(--brand-xl)', border:'1px solid var(--brand-l)' }}>
                          <span style={{ fontSize:10, fontWeight:700, color:'var(--brand)', letterSpacing:'.04em' }}>PETCHAIN ID</span>
                          <span className="mono" style={{ fontSize:12, fontWeight:600, color:'var(--brand)' }}>{p.petId}</span>
                        </div>
                        <div style={{ fontSize:14, color:'var(--muted)', marginTop:4 }}>{speciesLabel} · {p.breed}</div>
                      </div>
                      <span className={`badge ${hasInsurer?'badge-success':'badge-muted'}`}>{hasInsurer?'보험 활성':'보험 미등록'}</span>
                    </div>
                    <div className="divider" />
                    <div className="row-flex"><span style={{ color:'var(--muted)' }}>보험사</span><span style={{ fontWeight:500, color: hasInsurer ? 'var(--text)' : 'var(--muted)' }}>{p.insurer || '미등록'}</span></div>
                    <div className="row-flex"><span style={{ color:'var(--muted)' }}>동의 활성</span><span style={{ fontWeight:500, color:'var(--success)' }}>{activeCount}건</span></div>
                    <div className="row-flex"><span style={{ color:'var(--muted)' }}>출생연도</span><span style={{ fontWeight:500 }}>{p.birthYear}년</span></div>
                    <button className="btn btn-primary btn-sm" style={{ width:'100%', marginTop:16, justifyContent:'center' }} onClick={() => setTab('records')}>📋 진료기록 확인</button>
                  </div>
                  )
                })}
              </div>
            </div>
          )}

          {tab==='records' && <RecordsTab records={state.medicalRecords} onDetail={setDetailRecord} />}

          {/* 동의 관리 */}
          {tab==='consent' && (() => {
            const CPAGE = 5
            const sortedConsents = [...consents].sort((a,b)=>String(b.recordId).localeCompare(String(a.recordId)))
            const activeList  = sortedConsents.filter(c=>c.status==='active')
            const revokeList  = sortedConsents.filter(c=>c.status!=='active')
            const aTotalPages = Math.max(1, Math.ceil(activeList.length/CPAGE))
            const rTotalPages = Math.max(1, Math.ceil(revokeList.length/CPAGE))
            const aSafe = Math.min(consentActivePage, aTotalPages-1)
            const rSafe = Math.min(consentRevokePage, rTotalPages-1)
            const aPage = activeList.slice(aSafe*CPAGE, (aSafe+1)*CPAGE)
            const rPage = revokeList.slice(rSafe*CPAGE, (rSafe+1)*CPAGE)
            const Pager = ({page, total, onPage}) => total<=1 ? null : (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, paddingTop:12 }}>
                <button className="btn btn-ghost btn-sm" disabled={page===0} onClick={()=>onPage(page-1)}>← 이전</button>
                {Array.from({length:total},(_,i)=>(
                  <button key={i} className="btn btn-sm" onClick={()=>onPage(i)} style={{ minWidth:30, background:i===page?'var(--brand)':'transparent', color:i===page?'#fff':'var(--text)', border:i===page?'none':'1px solid var(--border)', fontWeight:i===page?600:400 }}>{i+1}</button>
                ))}
                <button className="btn btn-ghost btn-sm" disabled={page===total-1} onClick={()=>onPage(page+1)}>다음 →</button>
              </div>
            )
            return (
            <div className="fade-in">
              <div className="pane-h">동의 관리</div>
              <div className="pane-sub">토글을 ON하면 보험사에 서류가 자동으로 전달됩니다</div>
              <div className="alert alert-info" style={{ marginBottom:28 }}>
                ℹ️ 동의 유효기간은 1년이며, 언제든지 철회 가능합니다. 철회 즉시 보험사의 신규 접근이 차단됩니다.
              </div>
              {activeList.length>0 && (
                <div style={{ marginBottom:28 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:'var(--success)' }} />
                    <span style={{ fontSize:13, fontWeight:600, color:'var(--success)', textTransform:'uppercase', letterSpacing:'.06em' }}>동의 완료 — {activeList.length}건 전송 중</span>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    {aPage.map(c=><ConsentCard key={c.recordId} c={c} onToggle={handleToggle} onStartConsent={handleStartConsent}/>)}
                  </div>
                  <Pager page={aSafe} total={aTotalPages} onPage={setConsentActivePage} />
                </div>
              )}
              {revokeList.length>0 && (
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:'var(--muted-l)' }} />
                    <span style={{ fontSize:13, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em' }}>미동의 / 철회 — {revokeList.length}건</span>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    {rPage.map(c=><ConsentCard key={c.recordId} c={c} onToggle={handleToggle} onStartConsent={handleStartConsent}/>)}
                  </div>
                  <Pager page={rSafe} total={rTotalPages} onPage={setConsentRevokePage} />
                </div>
              )}
              {consents.length===0 && <div className="card" style={{ textAlign:'center', padding:56, color:'var(--muted)' }}><div style={{ fontSize:32, marginBottom:10 }}>📋</div><div style={{ fontWeight:500, fontSize:16 }}>등록된 진료기록이 없습니다</div></div>}
            </div>
            )
          })()}

          {/* 청구 상태 */}
          {tab==='status' && (
            <div className="fade-in">
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:4 }}>
                <div>
                  <div className="pane-h" style={{ marginBottom:0 }}>청구 상태</div>
                  <div className="pane-sub" style={{ marginBottom:0 }}>보험 청구 진행 현황 (보험사 심사 진행 수준만 표시)</div>
                </div>
                <button className="btn btn-ghost btn-sm" style={{ marginBottom:4 }} onClick={async () => {
                  try {
                    const res = await apiFetch('/consents?guardianId=me')
                    const a=Array.isArray(res?.consents)?res.consents:(Array.isArray(res?.content)?res.content:[])
                    if(a.length>0){
                      const sm={ACTIVE:'active',REVOKED:'revoked',PENDING:'pending'}
                      const m={}
                      a.forEach(c=>{const k=String(c.recordId);m[k]={...state.consents[k],...{consentId:String(c.consentId||c.id||''),recordId:k,guardianId:c.guardianId,insurerId:c.insurerId||'',status:sm[c.status]||(c.status||'').toLowerCase(),insurerName:c.insurerName||c.insurerId||'',pet:c.petName||'',disease:c.disease||'',hospital:c.hospitalName||'',cost:Number(c.cost)||0,petId:String(c.petId||''),claimStatus:c.claimStatus||'pending',reviewResult:c.reviewResult||null}}})
                      update({consents:m})
                    }
                  } catch { /* 무시 */ }
                }}>↻ 새로고침</button>
              </div>
              {consents.filter(c=>c.status==='active').length===0 ? (
                <div className="card" style={{ textAlign:'center', padding:64, color:'var(--muted)' }}>
                  <div style={{ fontSize:36, marginBottom:14 }}>🔒</div>
                  <div style={{ fontWeight:600, fontSize:17, marginBottom:8, color:'var(--text-2)' }}>활성 동의가 없습니다</div>
                  <div style={{ fontSize:15 }}>동의 관리 탭에서 토글을 ON 해주세요</div>
                  <button className="btn btn-primary" style={{ marginTop:20 }} onClick={() => setTab('consent')}>동의 관리로 이동 →</button>
                </div>
              ) : (() => {
                const SPAGE = 5
                const sortedActive = [...consents].filter(c=>c.status==='active').sort((a,b)=>String(b.recordId).localeCompare(String(a.recordId)))
                const sTotalPages = Math.max(1, Math.ceil(sortedActive.length/SPAGE))
                const sSafe = Math.min(statusPage, sTotalPages-1)
                const sPageItems = sortedActive.slice(sSafe*SPAGE, (sSafe+1)*SPAGE)
                return (
                <>
                <div className="g2">
                  {sPageItems.map(c => {
                    const cs = c.claimStatus || 'pending'
                    const rv = c.reviewResult || null
                    const isApproved = rv==='approved' || cs==='approved'
                    const isRejected = rv==='rejected' || cs==='rejected'
                    const isVerified = cs==='verified' || cs==='approved' || cs==='rejected'
                    const isRequested = cs==='requested' || isVerified
                    const steps = [
                      {lbl:'동의 완료',      sub:'consent_status: ACTIVE',    done:true},
                      {lbl:'보험사 접수',     sub:'claim_status: requested',   done:isRequested, now:!isRequested},
                      {lbl:'해시 검증 완료',  sub:'detail_data_hash 일치',     done:isVerified,  now:isRequested&&!isVerified},
                      {lbl:'심사 결과',       sub: isApproved?'✅ APPROVED — 승인' : isRejected?'❌ REJECTED — 반려' : 'APPROVED / REJECTED 대기',
                        done:isApproved||isRejected, now:isVerified&&!isApproved&&!isRejected,
                        approved:isApproved, rejected:isRejected},
                    ]
                    return (
                      <div key={c.recordId} className="card">
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
                          <div>
                            <div style={{ fontSize:17, fontWeight:600, marginBottom:4 }}>{c.pet} · {c.disease}</div>
                            <div style={{ fontSize:14, color:'var(--muted)', display:'flex', gap:10 }}>
                              <span className="mono">{c.recordId}</span><span>· {c.cost.toLocaleString()}원</span>
                            </div>
                          </div>
                          {isApproved && <span className="badge badge-success">승인 완료</span>}
                          {isRejected && <span className="badge badge-danger">반려됨</span>}
                          {!isApproved && !isRejected && <span className="badge badge-brand">심사 중</span>}
                        </div>
                        {steps.map((r,i) => (
                          <div key={i} className="tl-row">
                            <div className="tl-dot" style={{
                              background: r.approved?'var(--success)': r.rejected?'var(--danger)': r.done?'var(--success)': r.now?'var(--brand)':'var(--border-d)',
                              boxShadow: r.now?'0 0 0 4px var(--brand-xl)':'none'
                            }} />
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:15, fontWeight:500, color: r.approved?'var(--success)': r.rejected?'var(--danger)': r.done?'var(--success)': r.now?'var(--brand)':'var(--muted)' }}>{r.lbl}</div>
                              <div style={{ fontSize:13, color:'var(--muted)', marginTop:2, fontFamily:'var(--mono)' }}>{r.sub}</div>
                            </div>
                            {r.approved && <span className="badge badge-success" style={{ marginLeft:'auto' }}>승인</span>}
                            {r.rejected && <span className="badge badge-danger" style={{ marginLeft:'auto' }}>반려</span>}
                            {!r.approved && !r.rejected && r.done && <span className="badge badge-success" style={{ marginLeft:'auto' }}>완료</span>}
                            {!r.approved && !r.rejected && r.now  && <span className="badge badge-brand" style={{ marginLeft:'auto' }}>진행 중</span>}
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
                {sTotalPages>1 && (
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, paddingTop:16 }}>
                    <button className="btn btn-ghost btn-sm" disabled={sSafe===0} onClick={()=>setStatusPage(sSafe-1)}>← 이전</button>
                    {Array.from({length:sTotalPages},(_,i)=>(
                      <button key={i} className="btn btn-sm" onClick={()=>setStatusPage(i)} style={{ minWidth:30, background:i===sSafe?'var(--brand)':'transparent', color:i===sSafe?'#fff':'var(--text)', border:i===sSafe?'none':'1px solid var(--border)', fontWeight:i===sSafe?600:400 }}>{i+1}</button>
                    ))}
                    <button className="btn btn-ghost btn-sm" disabled={sSafe===sTotalPages-1} onClick={()=>setStatusPage(sSafe+1)}>다음 →</button>
                  </div>
                )}
                </>
                )
              })()}
            </div>
          )}

          {tab==='community' && <CommunityTab state={state} update={update} showToast={showToast} onRegionSave={handleRegionSave} />}
          {tab==='ranking'   && <RankingTab />}
          {tab==='myinfo'    && <MyInfoTab state={state} update={update} showToast={showToast} />}
        </main>
      </div>

      {/* 반려동물 등록 모달 */}
      {modal==='pet' && (
        <Overlay title="반려동물 등록" sub="정보 입력 후 반려동물이 등록됩니다" onClose={() => { setPetFormError(''); setModal(null) }}>
          <label className="fl">PetChain ID (자동 발급)</label>
          <div style={{ fontFamily:'var(--mono)', fontSize:14, fontWeight:600, color:'var(--brand)', background:'var(--brand-xl)', border:'1px solid var(--brand-l)', borderRadius:8, padding:'10px 14px', marginBottom:14 }}>{newPet.petId}</div>
          <div className="fi-row">
            <div><label className="fl">이름</label><input className="fi" placeholder="초코" value={newPet.name} onChange={e=>setNewPet(p=>({...p,name:e.target.value}))}/></div>
            <div><label className="fl">종류</label><select className="fi" value={newPet.species} onChange={e=>setNewPet(p=>({...p,species:e.target.value}))}><option value="dog">강아지</option><option value="cat">고양이</option><option value="rabbit">토끼</option></select></div>
          </div>
          <div className="fi-row">
            <div><label className="fl">품종</label><input className="fi" placeholder="말티즈" value={newPet.breed} onChange={e=>setNewPet(p=>({...p,breed:e.target.value}))}/></div>
            <div><label className="fl">출생연도</label><input className="fi" type="number" placeholder="2021" value={newPet.birthYear} onChange={e=>setNewPet(p=>({...p,birthYear:e.target.value}))}/></div>
          </div>
          <label className="fl">마이크로칩 번호</label>
          <input className="fi" placeholder="15자리 숫자 — 없으면 공란" value={newPet.chipNo} onChange={e=>setNewPet(p=>({...p,chipNo:e.target.value}))}/>
          <div className="fi-note" style={{ marginBottom:16 }}>📌 마이크로칩 번호는 SHA-256 해시 변환 후 온체인 기록됩니다.</div>
          {petFormError && <div className="alert alert-danger" style={{ marginBottom:16 }}>{petFormError}</div>}
          <button className="btn btn-primary" style={{ width:'100%', padding:13, fontSize:15, justifyContent:'center' }} onClick={handleAddPet}>등록 완료</button>
        </Overlay>
      )}

      {/* 보험 계약 모달 */}
      {modal==='ins' && (
        <InsuranceModal
          pets={state.pets}
          onClose={() => setModal(null)}
          onRegister={(petId, insurerId) => {
            const ins = INSURERS.find(i => i.id === insurerId)
            update({ pets: state.pets.map(p => p.petId===petId ? {...p, insurer:ins?.name||insurerId} : p) })
            setModal(null)
            showToast('보험 등록 완료', `${ins?.name||insurerId} 연동이 완료되었습니다`)
          }}
        />
      )}

      {/* 보험사 선택 → 동의 생성 모달 */}
      {consentModal && (
        <Overlay title="보험사 선택 후 동의" sub={`진료기록 ${consentModal}에 대한 동의를 시작합니다`} onClose={() => setConsentModal(null)}>
          <label className="fl">보험사 선택</label>
          <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
            {INSURERS.map(ins => (
              <div key={ins.id} onClick={() => setConsentInsurerId(ins.id)} style={{ display:'flex', alignItems:'center', gap:12, padding:'13px 16px', borderRadius:10, cursor:'pointer', border:`1.5px solid ${consentInsurerId===ins.id?'var(--brand)':'var(--border)'}`, background:consentInsurerId===ins.id?'var(--brand-xl)':'var(--surface)', transition:'all .15s' }}>
                <span style={{ fontSize:18 }}>{ins.logo}</span>
                <span style={{ fontWeight:consentInsurerId===ins.id?600:400, fontSize:15 }}>{ins.name}</span>
                {consentInsurerId===ins.id && <span style={{ marginLeft:'auto', color:'var(--brand)', fontWeight:700 }}>✓</span>}
              </div>
            ))}
          </div>
          <div className="alert alert-info" style={{ marginBottom:16 }}>
            ℹ️ 동의 유효기간 1년 · 언제든지 철회 가능 · 철회 즉시 보험사 접근 차단
          </div>
          <button className="btn btn-primary" style={{ width:'100%', padding:13, fontSize:15, justifyContent:'center' }} onClick={handleCreateConsent} disabled={!consentInsurerId||consentCreating}>
            {consentCreating ? '처리 중...' : '동의 생성 및 전달 시작'}
          </button>
        </Overlay>
      )}

      {/* 진료기록 상세 모달 */}
      {detailRecord && (
        <Overlay title="진료기록 상세" sub={detailRecord.id} onClose={() => setDetailRecord(null)}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {[['반려동물',detailRecord.petName],['진료일',detailRecord.date],['병원',detailRecord.hospital||'행복동물병원'],['진료비',`${detailRecord.cost.toLocaleString()}원`]].map(([k,v]) => (
                <div key={k} style={{ background:'var(--bg-2)', borderRadius:8, padding:'10px 14px' }}>
                  <div style={{ fontSize:12, fontWeight:500, color:'var(--muted)', marginBottom:4 }}>{k}</div>
                  <div style={{ fontWeight:500, fontSize:15 }}>{v}</div>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize:12, fontWeight:500, color:'var(--muted)', marginBottom:8 }}>질병 코드</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>{detailRecord.diseases.map(d=><span key={d} className="badge badge-brand">{d}</span>)}</div>
            </div>
            {detailRecord.treatments?.length>0 && (
              <div>
                <div style={{ fontSize:12, fontWeight:500, color:'var(--muted)', marginBottom:8 }}>진료 행위</div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>{detailRecord.treatments.map(t=><span key={t} className="badge badge-orange">{t}</span>)}</div>
              </div>
            )}
            {detailRecord.memo && (
              <div>
                <div style={{ fontSize:12, fontWeight:500, color:'var(--muted)', marginBottom:8 }}>진료 소견</div>
                <div style={{ background:'var(--bg-2)', borderRadius:8, padding:'12px 14px', fontSize:15, color:'var(--text-2)', lineHeight:1.7 }}>{detailRecord.memo}</div>
              </div>
            )}
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:13, color:'var(--muted)' }}>블록체인 기록</span>
              <span className={`badge ${detailRecord.onChain?'badge-success':'badge-warning'}`}>{detailRecord.onChain?'원장 기록 완료':'미기록'}</span>
            </div>
          </div>
        </Overlay>
      )}
    </>
  )
}
