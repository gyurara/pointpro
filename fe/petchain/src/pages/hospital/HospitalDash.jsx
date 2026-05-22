import { useState, useMemo, useEffect, useRef } from 'react'
import DashNav from '../../components/common/DashNav'
import Overlay from '../../components/common/Overlay'
import { useApp } from '../../context/AppContext'
import apiFetch from '../../api/client'

const DISEASE_CODES = [
  { code: 'KC-001', name: '피부염' },
  { code: 'KC-042', name: '골절' },
  { code: 'KC-055', name: '관절염' },
  { code: 'KC-108', name: '슬개골 탈구' },
]
const TREATMENT_CODES = [
  { code: 'VA-032', name: '약물 처방' },
  { code: 'VA-011', name: 'X-ray 촬영' },
  { code: 'VA-025', name: '수술' },
]

const PAGE_SIZE = 5

/* ── 드롭박스 다중 선택 ── */
function MultiSelect({ label, options, selected, onToggle, accent }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginBottom: 16, position: 'relative' }}>
      <label className="fl">{label}</label>
      {/* 트리거 */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          border: '1.5px solid var(--border)', borderRadius: 9, padding: '10px 14px',
          cursor: 'pointer', background: 'var(--surface)', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between', userSelect: 'none',
          fontSize: 14,
        }}
      >
        <span style={{ color: selected.length === 0 ? 'var(--placeholder)' : 'var(--text)' }}>
          {selected.length === 0 ? '선택하세요' : `${selected.length}개 선택됨`}
        </span>
        <span style={{ fontSize: 11, color: 'var(--muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>▼</span>
      </div>

      {/* 드롭다운 */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 100,
          background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 10,
          boxShadow: 'var(--shadow-md)', overflow: 'hidden',
        }}>
          {options.map(({ code, name }) => {
            const checked = selected.includes(code)
            return (
              <div
                key={code}
                onClick={() => onToggle(code)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '11px 14px', cursor: 'pointer', fontSize: 14,
                  background: checked ? (accent === 'orange' ? 'var(--orange-xl)' : 'var(--brand-xl)') : 'transparent',
                  transition: 'background .12s',
                }}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: 5, border: `2px solid ${checked ? (accent === 'orange' ? 'var(--orange)' : 'var(--brand)') : 'var(--border-d)'}`,
                  background: checked ? (accent === 'orange' ? 'var(--orange)' : 'var(--brand)') : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {checked && <span style={{ color: '#fff', fontSize: 11, fontWeight: 800 }}>✓</span>}
                </div>
                <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{code}</span>
                <span style={{ fontWeight: checked ? 700 : 400 }}>{name}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* 선택된 태그 */}
      {selected.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {selected.map(code => {
            const item = [...DISEASE_CODES, ...TREATMENT_CODES].find(o => o.code === code)
            return (
              <span key={code} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                background: accent === 'orange' ? 'var(--orange-xl)' : 'var(--brand-xl)',
                color: accent === 'orange' ? 'var(--orange)' : 'var(--brand)',
                border: `1px solid ${accent === 'orange' ? 'var(--orange-l)' : 'var(--brand-l)'}`,
              }}>
                {code} · {item?.name}
                <span style={{ cursor: 'pointer', fontWeight: 800 }} onClick={() => onToggle(code)}>×</span>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ── 진료기록 상세 모달 (병원용 — 소견 포함) ── */
function RecordDetailModal({ record, onClose }) {
  return (
    <Overlay title="진료기록 상세" sub={record.id} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[['반려동물', record.petName], ['진료일', record.date], ['진료비', `${record.cost.toLocaleString()}원`], ['온체인', record.onChain ? 'confirmed' : 'pending']].map(([k, v]) => (
            <div key={k} style={{ background: 'var(--bg-2)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>{k}</div>
              <div style={{ fontWeight: 600 }}>{v}</div>
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>질병 코드</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{record.diseases.map(d => <span key={d} className="badge badge-brand">{d}</span>)}</div>
        </div>
        {record.treatments?.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>진료 행위</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{record.treatments.map(t => <span key={t} className="badge badge-orange">{t}</span>)}</div>
          </div>
        )}
        {record.memo ? (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>진료 소견</div>
            <div style={{ background: 'var(--bg-2)', borderRadius: 8, padding: '12px 14px', fontSize: 14, color: 'var(--text-2)', lineHeight: 1.7 }}>{record.memo}</div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>진료 소견 없음</div>
        )}
      </div>
    </Overlay>
  )
}

// 조직 정보 탭
function OrgTab() {
  const [me, setMe] = useState(null)
  // 로그인한 병원 본인 정보를 백엔드에서 가져온다
  useEffect(() => { apiFetch('/users/me').then(setMe).catch(() => {}) }, [])
  const orgId   = me?.memberNumber || localStorage.getItem('memberNumber') || localStorage.getItem('userId') || '-'
  const orgName = me?.orgName || me?.name || localStorage.getItem('hospitalName') || '동물병원'

  const CH1_MEMBERS = [
    { label: '한국수의사회', role: 'Orderer', color: '#b8885a' },
    { label: '중소동물병원 A', role: '병원', color: '#fb923c' },
    { label: '중소동물병원 B', role: '병원', color: '#fb923c' },
    { label: '중소동물병원 C', role: '병원', color: '#fb923c' },
    { label: 'DB손해보험', role: '보험사', color: '#16a34a' },
    { label: '삼성화재해상보험', role: '보험사', color: '#16a34a' },
  ]

  return (
    <div className="fade-in">
      <div className="pane-h">조직 정보</div>
      <div className="pane-sub">현재 소속 채널 및 하이퍼레저 패브릭 네트워크 구성</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        <div className="card">
          <div className="card-title">현재 소속 조직</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              ['조직 유형',   '수의사회 소속'],
              ['채널',        '수의사회 채널'],
              ['Org ID',      orgId],
              ['병원명',      orgName],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }}>
                <span style={{ color: 'var(--muted)', fontWeight: 500 }}>{k}</span>
                <span style={{ fontWeight: 600 }} className={k === 'Org ID' ? 'mono' : ''}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ background: 'var(--brand-xl)', border: '1px solid var(--brand-l)' }}>
          <div className="card-title">독립 조직 신청</div>
          <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7, marginBottom: 16 }}>
            대형 동물병원은 별도 비용으로 독립 패브릭 조직을 생성할 수 있습니다. 독립 조직은 전용 채널을 운영하며 보험사와 직접 협약을 맺을 수 있습니다.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
            {['전용 채널 정책 설정', '보험사와 직접 협약', '별도 크레딧 체계'].map(b => (
              <div key={b} style={{ fontSize: 13, color: 'var(--brand)', display: 'flex', gap: 6 }}>
                <span>→</span><span>{b}</span>
              </div>
            ))}
          </div>
          <button className="btn btn-primary btn-sm">독립 조직 신청 문의</button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">수의사회 채널 구성원</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {CH1_MEMBERS.map((m, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', background: 'var(--bg-2)', borderRadius: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
              <span style={{ fontSize: 14, flex: 1 }}>{m.label}</span>
              <span style={{ fontSize: 12, color: m.color, fontWeight: 600 }}>{m.role}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function HospitalDash({ showToast, onLogout }) {
  const { state, setState, addMedicalRecord } = useApp()
  const [tab, setTab] = useState(() => localStorage.getItem('petchain_hospital_tab') || 'reg')

  useEffect(() => { localStorage.setItem('petchain_hospital_tab', tab) }, [tab])

  const consents       = state.consents
  const activeConsents = Object.values(consents).filter(c => c.status === 'active')

  const [searchId,       setSearchId]       = useState('')
  const [searchLoading,  setSearchLoading]  = useState(false)
  const [foundPet,       setFoundPet]       = useState(null)
  const [formDate,       setFormDate]       = useState(new Date().toISOString().slice(0, 10))
  const [formDiseases,   setFormDiseases]   = useState([])
  const [formTreatments, setFormTreatments] = useState([])
  const [formCost,       setFormCost]       = useState('')
  const [formMemo,       setFormMemo]       = useState('')
  const [formAttachments, setFormAttachments] = useState([])
  const fileInputRef = useRef(null)

  const [prevPage,     setPrevPage]     = useState(0)
  const [prevMonth,    setPrevMonth]    = useState('전체')
  const [detailRecord, setDetailRecord] = useState(null)
  const [creditTx,     setCreditTx]     = useState([])

  // 동의 목록 + 크레딧 적립 내역 API 로드
  useEffect(() => {
    async function loadConsents() {
      try {
        // hospitalId=me 로 필터 — 본인 병원이 발급한 진료기록의 동의만 조회
        const res = await apiFetch('/consents?hospitalId=me')
        const data = Array.isArray(res?.consents) ? res.consents : (Array.isArray(res) ? res : null)
        if (data) {
          const map = {}
          data.forEach(c => {
            map[c.recordId] = {
              recordId:    c.recordId,
              consentId:   c.consentId || c.id,
              petId:       c.petId,
              hospitalId:  c.hospitalId || '',
              recordHash:  c.recordHash || '',
              status:      (c.status || 'pending').toLowerCase(),
              pet:         c.petName || c.pet || '',
              hospital:    c.hospitalName || c.hospital || '',
              insurerName: c.insurerName || '',
              insurerId:   c.insurerId || '',
              disease:     c.disease || '',
              treatment:   c.treatment || '',
              cost:        c.cost || 0,
              date:        c.date || '',
            }
          })
          setState(s => ({ ...s, consents: map }))
        }
      } catch { /* 서버 미연결 시 무시 */ }
    }
    async function loadCredits() {
      try {
        // 'me' = 인증된 병원 본인 (프론트는 병원 회사 id를 모름)
        const res = await apiFetch('/credits/transactions?hospitalId=me&size=50')
        const list = Array.isArray(res?.transactions) ? res.transactions : []
        setCreditTx(list)
      } catch { /* 서버 미연결 시 무시 */ }
    }
    loadConsents()
    loadCredits()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = async () => {
    const id = searchId.trim().toUpperCase()
    if (!id) return
    setSearchLoading(true)
    setFoundPet(null)
    try {
      const data = await apiFetch(`/pets/${id}`)
      if (data) {
        const records = data.records || data.medicalRecords || []
        setFoundPet({ ...data, petId: data.petId || id, records })
        setPrevPage(0)
        setPrevMonth('전체')
        return
      }
    } catch { /* API 실패 시 로컬 폴백 */ }
    finally {
      // 성공·실패·return 어떤 경로에서도 로딩 표시는 반드시 끈다.
      setSearchLoading(false)
    }
    const pet = state.pets.find(p => p.petId.toUpperCase() === id)
    if (!pet) {
      showToast('조회 실패', '등록된 반려동물을 찾을 수 없습니다')
      return
    }
    const records = state.medicalRecords.filter(r => r.petId === pet.petId)
    setFoundPet({ ...pet, records })
    setPrevPage(0)
    setPrevMonth('전체')
  }

  // 달 목록 추출
  const prevMonths = useMemo(() => {
    if (!foundPet) return []
    const months = [...new Set(foundPet.records.map(r => r.date.slice(0, 7)))]
    return ['전체', ...months.sort().reverse()]
  }, [foundPet])

  // 필터 + 페이지네이션
  const filteredRecords = useMemo(() => {
    if (!foundPet) return []
    return foundPet.records.filter(r => prevMonth === '전체' || r.date.startsWith(prevMonth))
  }, [foundPet, prevMonth])

  const totalPages  = Math.ceil(filteredRecords.length / PAGE_SIZE)
  const pagedRecords = filteredRecords.slice(prevPage * PAGE_SIZE, (prevPage + 1) * PAGE_SIZE)

  const toggleDisease   = code => setFormDiseases(p => p.includes(code) ? p.filter(c => c !== code) : [...p, code])
  const toggleTreatment = code => setFormTreatments(p => p.includes(code) ? p.filter(c => c !== code) : [...p, code])

  const handleSubmitRecord = async () => {
    if (!foundPet || !formCost || formDiseases.length === 0) {
      showToast('입력 오류', '환자 조회, 질병 코드, 진료비를 모두 입력하세요'); return
    }
    addMedicalRecord({
      petId:      foundPet.petId,
      petName:    foundPet.name,
      date:       formDate.replace(/-/g, '.'),
      diseases:   formDiseases.map(code => `${code} · ${DISEASE_CODES.find(d => d.code === code)?.name}`),
      treatments: formTreatments.map(code => `${code} · ${TREATMENT_CODES.find(t => t.code === code)?.name}`),
      cost:       Number(formCost),
      memo:       formMemo,
    })
    setState(s => ({
      ...s,
      creditN: s.creditN + 1,
      txLog: [{ time: new Date().toLocaleTimeString(), type: '기록', org: 'hosp-001', desc: `${foundPet.name} 진료기록 등록 완료` }, ...s.txLog],
    }))
    showToast('원장 기록', `${foundPet.name} 진료기록 등록 완료 · 크레딧 +1${formAttachments.length ? ` · 첨부 ${formAttachments.length}건` : ''}`)
    const attachmentsToSend = formAttachments
    setFoundPet(null); setSearchId(''); setFormDiseases([]); setFormTreatments([]); setFormCost(''); setFormMemo(''); setFormAttachments([])
    if (fileInputRef.current) fileInputRef.current.value = ''

    // Sync with API (graceful degradation)
    try {
      const metadata = JSON.stringify({
        petId:      foundPet.petId,
        diseases:   formDiseases,
        treatments: formTreatments,
        cost:       Number(formCost),
        date:       formDate,
        memo:       formMemo,
      })
      const formData = new FormData()
      formData.append('metadata', new Blob([metadata], { type: 'application/json' }))
      // 사용자가 업로드한 영수증·X-RAY·초음파 파일을 그대로 attachments 로 보낸다. recordFile 은 EMR-lite 에서 선택 항목.
      attachmentsToSend.forEach(file => {
        formData.append('attachments', file, file.name)
      })
      await apiFetch('/records', { method: 'POST', body: formData, isFormData: true })
    } catch {
      // API failure: local state already updated
    }
  }

  const handleAttachmentChange = (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setFormAttachments(prev => [...prev, ...files])
  }
  const removeAttachment = (idx) => {
    setFormAttachments(prev => prev.filter((_, i) => i !== idx))
    if (fileInputRef.current && formAttachments.length <= 1) fileInputRef.current.value = ''
  }

  return (
    <>
      <DashNav role="hospital" tab={tab} setTab={setTab} onLogout={onLogout} />
      <div className="dash-wrap">

        {/* ── 진료기록 등록 ── */}
        {tab === 'reg' && (
          <div className="fade-in">
            <div className="pane-h">진료기록 등록</div>
            <div className="pane-sub">표준 코드로 등록 → SHA-256 해시 생성 → 원장 기록 (medical_records)</div>

            <div className={`alert ${activeConsents.length > 0 ? 'alert-success' : 'alert-warning'}`} style={{ marginBottom: 24 }}>
              {activeConsents.length > 0 ? `✅ 보호자 동의 ${activeConsents.length}건 활성` : '⚠️ 활성 동의가 없습니다.'}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

                {/* 환자 조회 */}
                <div className="card">
                  <div className="card-title">환자 조회</div>
                  <label className="fl">PetChain ID</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="fi" style={{ flex: 1, fontFamily: 'var(--font-mono)', letterSpacing: '.05em', textTransform: 'uppercase' }}
                      placeholder="예: A12345678" value={searchId}
                      onChange={e => { setSearchId(e.target.value.toUpperCase()); setFoundPet(null) }}
                      onKeyDown={e => e.key === 'Enter' && handleSearch()} />
                    <button className="btn btn-primary" onClick={handleSearch} disabled={searchLoading}>
                      {searchLoading ? '조회 중...' : '조회'}
                    </button>
                  </div>

                  {foundPet && (
                    <div style={{ marginTop: 14, padding: '14px 16px', background: 'var(--success-xl)', border: '1.5px solid var(--success)', borderRadius: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <span style={{ fontSize: 22 }}>🐶</span>
                        <div>
                          <span style={{ fontWeight: 800, fontSize: 16 }}>{foundPet.name}</span>
                          <span className="mono" style={{ marginLeft: 10, fontSize: 12, color: 'var(--brand)' }}>{foundPet.petId}</span>
                        </div>
                        <span className="badge badge-success" style={{ marginLeft: 'auto' }}>조회됨</span>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--muted)' }}>{foundPet.species} · {foundPet.breed} · 보험: {foundPet.insurer}</div>
                    </div>
                  )}

                  {/* 이전 진료기록 — 달별 필터 + 페이지네이션 */}
                  {foundPet && foundPet.records.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                          이전 진료기록 ({filteredRecords.length}건)
                        </div>
                        {/* 달 필터 */}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {prevMonths.map(m => (
                            <button key={m}
                              className={`btn btn-sm ${prevMonth === m ? 'btn-primary' : 'btn-ghost'}`}
                              onClick={() => { setPrevMonth(m); setPrevPage(0) }}
                            >{m}</button>
                          ))}
                        </div>
                      </div>
                      <table className="tbl">
                        <thead><tr><th>기록 ID</th><th>진료일</th><th>질병</th><th>진료비</th><th>상태</th><th></th></tr></thead>
                        <tbody>
                          {pagedRecords.map(r => (
                            <tr key={r.id}>
                              <td><span className="mono">{r.id}</span></td>
                              <td>{r.date}</td>
                              <td style={{ fontSize: 12 }}>{r.diseases.join(', ')}</td>
                              <td>{r.cost.toLocaleString()}원</td>
                              <td><span className={`badge ${r.onChain ? 'badge-success' : 'badge-warning'}`}>{r.onChain ? '원장 기록' : '미기록'}</span></td>
                              <td><button className="btn btn-ghost btn-sm" onClick={() => setDetailRecord(r)}>상세</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {/* 페이지네이션 */}
                      {totalPages > 1 && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 }}>
                          <button className="btn btn-sm btn-ghost" disabled={prevPage === 0} onClick={() => setPrevPage(p => p - 1)}>← 이전</button>
                          <span style={{ fontSize: 13, color: 'var(--muted)' }}>{prevPage + 1} / {totalPages}</span>
                          <button className="btn btn-sm btn-ghost" disabled={prevPage === totalPages - 1} onClick={() => setPrevPage(p => p + 1)}>다음 →</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 진료 정보 — 질병코드/행위코드 드롭박스, 진료일 아래로 */}
                <div className="card">
                  <div className="card-title">진료 정보</div>

                  <MultiSelect label="질병 코드 (복수 선택)" options={DISEASE_CODES} selected={formDiseases} onToggle={toggleDisease} accent="brand" />
                  <MultiSelect label="진료 행위 코드 (복수 선택)" options={TREATMENT_CODES} selected={formTreatments} onToggle={toggleTreatment} accent="orange" />

                  <div className="fi-row">
                    <div>
                      <label className="fl">총 진료비 (원)</label>
                      <input className="fi" type="number" placeholder="48000" value={formCost} onChange={e => setFormCost(e.target.value)} />
                    </div>
                    <div>
                      <label className="fl">진료일</label>
                      <input className="fi" type="date" value={formDate} onChange={e => setFormDate(e.target.value)} />
                    </div>
                  </div>
                  <label className="fl">진료 소견</label>
                  <textarea
                    className="fi"
                    rows={4}
                    placeholder="진료 소견을 상세히 입력하세요. 보호자가 진료기록 조회 시 확인할 수 있습니다."
                    value={formMemo}
                    onChange={e => setFormMemo(e.target.value)}
                    style={{ resize: 'vertical', fontFamily: 'inherit' }}
                  />
                </div>

                <div className="card">
                  <div className="card-title">첨부 파일 (S3 오프체인)</div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf,.dcm,.jpg,.jpeg,.png"
                    style={{ display: 'none' }}
                    onChange={handleAttachmentChange}
                  />
                  <div
                    className="upload-zone"
                    onClick={() => fileInputRef.current?.click()}
                    style={{ cursor: 'pointer' }}
                  >
                    📎 영수증 · X-RAY · 초음파 파일 업로드<br />
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>클릭하여 선택 · 원문 AES-256 암호화 저장 · 해시값만 온체인</span>
                  </div>
                  {formAttachments.length > 0 && (
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {formAttachments.map((file, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg-2)', borderRadius: 8, fontSize: 13 }}>
                          <span style={{ fontSize: 14 }}>📄</span>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                          <span style={{ color: 'var(--muted)', fontSize: 12, flexShrink: 0 }}>{(file.size / 1024).toFixed(1)} KB</span>
                          <button
                            type="button"
                            onClick={() => removeAttachment(idx)}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 16, fontWeight: 700, padding: 0 }}
                            aria-label="첨부 제거"
                          >×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 오른쪽 패널 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="card">
                  <div className="card-title">해시 미리보기</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--muted)', wordBreak: 'break-all', background: 'var(--bg-2)', padding: 14, borderRadius: 10, lineHeight: 2, border: '1px solid var(--border)' }}>
                    detail_data_hash:<br />sha256:a3f2b9c1d4e5f678<br />90ab12cd34ef5678
                  </div>
                </div>
                <div className="card">
                  <div className="card-title">on_chain_status</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 700 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--warning)', boxShadow: '0 0 0 3px var(--warning-xl)' }} />
                    <span style={{ color: 'var(--warning)' }}>pending</span>
                  </div>
                </div>
                <div className="card" style={{ background: 'var(--brand-xl)', border: '1px solid var(--brand-l)' }}>
                  <div className="card-title">동의 상태 확인</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {Object.values(consents).map(c => (
                      <div key={c.recordId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                        <span className="mono">{c.recordId}</span>
                        <span className={`badge ${c.status === 'active' ? 'badge-success' : c.status === 'revoked' ? 'badge-danger' : 'badge-warning'}`}>
                          {c.status === 'active' ? '동의 완료' : c.status === 'revoked' ? '동의 철회' : '대기 중'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <button
                  className="btn btn-primary"
                  style={{ padding: 14, fontSize: 14, fontWeight: 700 }}
                  onClick={handleSubmitRecord}
                  disabled={!foundPet}
                >
                  🔗 원장에 기록 (on-chain)
                </button>
              </div>
            </div>

            {activeConsents.length > 0 && (
              <div className="card" style={{ marginTop: 28 }}>
                <div className="card-title">보호자 동의 완료 — 보험사 자동 전달 중</div>
                <table className="tbl">
                  <thead><tr><th>record_id</th><th>반려동물</th><th>질병</th><th>진료비</th><th>동의 상태</th><th></th></tr></thead>
                  <tbody>
                    {activeConsents.map(c => (
                      <tr key={c.recordId}>
                        <td><span className="mono">{c.recordId}</span></td>
                        <td style={{ fontWeight: 600 }}>{c.pet}</td>
                        <td><span className="mono">{c.disease}</span></td>
                        <td>{c.cost.toLocaleString()}원</td>
                        <td><span className="badge badge-success">동의 완료</span></td>
                        <td>
                          <span className="badge badge-success" title="보호자 동의 시 보험사로 자동 전달됩니다">✅ 자동 제출됨</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── 크레딧 현황 — 적립만, 돈 없음 ── */}
        {tab === 'credit' && (
          <div className="fade-in">
            <div className="pane-h">크레딧 현황</div>
            <div className="pane-sub">진료기록 등록·검증 성공 시 적립되는 운영 크레딧 (12개월 유효)</div>
            <div className="g2" style={{ marginBottom: 24 }}>
              <div className="stat-box" style={{ background: 'var(--brand-xl)', border: '1px solid var(--brand-l)' }}>
                <div className="stat-n" style={{ color: 'var(--brand)' }}>{creditTx.reduce((sum, t) => sum + (t.amount || 0), 0) || state.creditN}</div>
                <div className="stat-l" style={{ color: 'var(--brand)', opacity: .75 }}>누적 크레딧</div>
              </div>
              <div className="stat-box" style={{ background: 'var(--success-xl)', border: '1px solid var(--success-l)' }}>
                <div className="stat-n" style={{ color: 'var(--success)' }}>{state.txLog.filter(t => t.type === '기록' || t.type === '제출').length}</div>
                <div className="stat-l" style={{ color: 'var(--success)', opacity: .75 }}>이번 세션 적립</div>
              </div>
            </div>
            <div className="card">
              <div className="card-title">크레딧 적립 내역</div>
              <table className="tbl">
                <thead><tr><th>날짜</th><th>record_id</th><th>유형</th><th>내용</th><th>적립</th></tr></thead>
                <tbody>
                  {creditTx.length === 0 && state.txLog.filter(t => t.type === '기록' || t.type === '제출').length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>적립된 크레딧이 없습니다</td></tr>
                  )}
                  {creditTx.map(t => (
                    <tr key={t.transactionId}>
                      <td>{(t.createdAt || '').slice(0, 10)}</td>
                      <td><span className="mono">{t.relatedRecordId || '—'}</span></td>
                      <td><span className="badge badge-success">ACCRUAL</span></td>
                      <td>{t.reason || '검증 API 성공'}</td>
                      <td style={{ color: 'var(--success)', fontWeight: 700 }}>+{t.amount}</td>
                    </tr>
                  ))}
                  {state.txLog.filter(t => t.type === '기록' || t.type === '제출').map((t, i) => (
                    <tr key={i}><td>지금</td><td><span className="mono">신규</span></td><td><span className="badge badge-success">ACCRUAL</span></td><td>{t.desc}</td><td style={{ color: 'var(--success)', fontWeight: 700 }}>+1</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── 감사 로그 ── */}
        {tab === 'log' && (
          <div className="fade-in">
            <div className="pane-h">감사 로그</div>
            <div className="pane-sub">원장 기록 트랜잭션 이력 (audit_logs)</div>
            <div className="card">
              <table className="tbl">
                <thead><tr><th>시각</th><th>record_id</th><th>유형</th><th>내용</th><th>Fabric TX</th><th>상태</th></tr></thead>
                <tbody>
                  {state.txLog.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>기록된 트랜잭션이 없습니다</td></tr>
                  )}
                  {state.txLog.map((t, i) => (
                    <tr key={i}>
                      <td style={{ color: 'var(--muted)', fontSize: 13 }}>{t.time}</td>
                      <td><span className="mono">{t.desc.split(' ')[0]}</span></td>
                      <td><span className="badge badge-brand">{t.type}</span></td>
                      <td style={{ color: 'var(--text-2)' }}>{t.desc}</td>
                      <td><span className="mono">—</span></td>
                      <td><span className="badge badge-success">confirmed</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

        {/* ── 조직 정보 ── */}
        {tab === 'org' && <OrgTab />}

      {detailRecord && <RecordDetailModal record={detailRecord} onClose={() => setDetailRecord(null)} />}
    </>
  )
}
