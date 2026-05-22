import { useState, useEffect, useRef } from 'react'
import DashNav from '../../components/common/DashNav'
import { useApp } from '../../context/AppContext'
import apiFetch from '../../api/client'

// 이상 신고 사유 목록
const FLAG_REASONS = [
  { code: 'DUPLICATE_SUSPECTED',    label: '중복 청구 의심' },
  { code: 'COST_INCONSISTENT',      label: '진료비 불일치' },
  { code: 'DIAGNOSIS_MISMATCH',     label: '진단 코드 불일치' },
  { code: 'TREATMENT_UNREASONABLE', label: '진료 행위 부적절' },
  { code: 'DOCUMENT_SUSPICIOUS',    label: '서류 위조 의심' },
  { code: 'OTHER',                  label: '기타' },
]

// BE 가 내려주는 failureReasons 코드(verification_log.result) → 한국어 라벨
const FAILURE_LABEL = {
  hash_mismatch:   '진료기록 해시 불일치 — 원문이 변조되었거나 동의 시점과 다릅니다.',
  consent_revoked: '동의가 철회되어 검증할 수 없습니다.',
  duplicate:       '중복된 검증 요청입니다.',
  error:           '내부 오류로 검증에 실패했습니다.',
}
function failureReasonLabel(reasons) {
  if (!reasons || reasons.length === 0) return '검증에 실패했습니다.'
  return FAILURE_LABEL[reasons[0]] || `검증 실패 (${reasons[0]})`
}

const CHANNEL_INFO = [
  {
    id: 'ch1',
    name: '수의사회 채널',
    badge: '공동 채널',
    badgeColor: '#16a34a',
    desc: '한국수의사회 주관. 소속 중소 동물병원 3곳과 보험사 2곳이 참여합니다.',
    members: [
      { label: '한국수의사회',   role: 'Orderer', dot: '#b8885a' },
      { label: '중소동물병원 A', role: '병원',    dot: '#fb923c' },
      { label: '중소동물병원 B', role: '병원',    dot: '#fb923c' },
      { label: '중소동물병원 C', role: '병원',    dot: '#fb923c' },
      { label: 'DB손해보험',     role: '보험사',  dot: '#34d399' },
      { label: '삼성화재해상보험', role: '보험사', dot: '#34d399' },
    ],
  },
  {
    id: 'ch2',
    name: '대형병원 독립 채널',
    badge: '유료 독립',
    badgeColor: '#ea580c',
    desc: '독립 조직을 선택한 대형 동물병원 전용 채널. 보험사 2곳이 함께 참여합니다.',
    members: [
      { label: '대형동물병원',     role: '병원(독립)', dot: '#fb923c' },
      { label: 'DB손해보험',       role: '보험사',     dot: '#34d399' },
      { label: '삼성화재해상보험', role: '보험사',     dot: '#34d399' },
    ],
  },
]

export default function InsuranceDash({ showToast, onLogout }) {
  const { state, setState } = useApp()
  const [tab, setTab]               = useState(() => localStorage.getItem('petchain_insurance_tab') || 'list')

  useEffect(() => { localStorage.setItem('petchain_insurance_tab', tab) }, [tab])
  const [lastVerified, setLastVerified] = useState(null)
  const [ptTx, setPtTx] = useState([])
  // handleVerify in-flight 가드: 같은 record 에 대해 동시에 두 번 호출되는 것을 방지.
  const verifyingRef = useRef(new Set())

  const [flagModal, setFlagModal]   = useState(null)
  const [flagReason, setFlagReason] = useState('')
  const [flagNote, setFlagNote]     = useState('')
  const [showChargeModal, setShowChargeModal] = useState(false)
  const [chargeAmount, setChargeAmount]       = useState(100)
  const [charging, setCharging]               = useState(false)
  const [myFlags, setMyFlags]                 = useState([])

  // 폴링용 ref — useEffect 밖에서 최신 함수를 참조하기 위해 사용
  const loadConsentsRef = useRef(null)
  const loadMyFlagsRef  = useRef(null)

  // 포인트 잔액 + 동의 목록 + 이상신고 현황 API 로드
  useEffect(() => {
    async function loadBalance() {
      try {
        const data = await apiFetch('/insurers/me/points/balance')
        if (data?.balance !== undefined) setState(s => ({ ...s, ptBalance: data.balance }))
      } catch { /* 폴백 */ }
    }

    async function loadConsents() {
      try {
        const res = await apiFetch('/consents?insurerId=me')
        const data = Array.isArray(res?.consents) ? res.consents : (Array.isArray(res) ? res : null)
        if (data) {
          const map = {}
          data.forEach(c => {
            map[c.recordId] = {
              recordId:    c.recordId,
              consentId:   c.consentId || c.id,
              petId:       c.petId,
              guardianId:  c.guardianId || '',
              hospitalId:  c.hospitalId || '',
              recordHash:  c.recordHash || '',
              status:      (c.status || 'pending').toLowerCase(),
              pet:         c.petName || c.pet || '',
              hospital:    c.hospitalName || c.hospital || '',
              insurerName: c.insurerName || '',
              insurerId:   c.insurerId || '',
              disease:     c.disease || '',
              treatment:   c.treatment || '',
              cost:        typeof c.cost === 'number' ? c.cost : (Number(c.cost) || 0),
              date:        c.date || '',
            }
          })
          setState(s => ({ ...s, consents: map }))
        }
      } catch { /* 폴백 */ }
    }

    async function loadTransactions() {
      try {
        const res = await apiFetch('/insurers/me/points/transactions?size=50')
        const list = Array.isArray(res?.transactions) ? res.transactions : []
        setPtTx(list)
      } catch { /* 폴백 */ }
    }

    async function loadMyFlags() {
      try {
        const rows = await apiFetch('/flags')
        if (Array.isArray(rows)) setMyFlags(rows)
      } catch { /* 폴백 */ }
    }

    // ref 에 저장해 버튼 핸들러에서도 호출 가능하게 함
    loadConsentsRef.current = loadConsents
    loadMyFlagsRef.current  = loadMyFlags

    loadBalance()
    loadConsents()
    loadTransactions()
    loadMyFlags()

    // 60초마다 이상신고 현황 갱신 — 관리자 처리 완료 알림
    const flagsTimer    = setInterval(loadMyFlags, 60000)

    return () => {
      clearInterval(flagsTimer)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const activeConsents  = Object.values(state.consents).filter(c => c.status === 'active')
  const revokedConsents = Object.values(state.consents).filter(c => c.status === 'revoked')

  /* ── 검증 API 호출 ── */
  const handleVerify = async (c) => {
    if (state.ptBalance <= 0) {
      showToast('포인트 부족', '플랫폼에 포인트 충전을 요청하세요.')
      return
    }
    // 진짜 해시가 없으면 verify 호출은 100% hash_mismatch 가 되므로 BE 를 호출하지 않는다.
    if (!c.recordHash) {
      showToast('검증 불가', '진료기록 해시를 불러오지 못했습니다. 동의 목록을 새로고침해 주세요.')
      return
    }
    // 동일 record 에 대한 동시 호출(더블클릭 등) 차단
    if (verifyingRef.current.has(c.recordId)) return
    verifyingRef.current.add(c.recordId)
    try {
      let submissionId = null
      let verificationId = null
      let pointsCharged = 0
      let success = false
      let failureReasons = []
      try {
        const insurerId = localStorage.getItem('userId') || ''
        const submission = await apiFetch('/submissions', { method: 'POST', body: { recordId: c.recordId, insurerId: 'me' } })
        submissionId = submission?.submissionId || submission?.id || null
        if (submissionId) {
          const ver = await apiFetch(`/submissions/${submissionId}/verification`, {
            method: 'POST',
            body: {
              submissionId,
              recordId: c.recordId,
              hospitalId: c.hospitalId || '',
              insurerId,
              consentId: c.consentId || submissionId,
              recordHash: c.recordHash,
              requestedBy: insurerId,
              requestedAt: new Date().toISOString(),
              petId: c.petId,
              guardianId: c.guardianId,
            },
          })
          verificationId = ver?.verificationId || null
          // BE 응답의 status 는 enum: PENDING|PASSED|FAILED|BLOCKED|EXPIRED.
          // PASSED 만 검증 통과(idempotent 응답 포함).
          success = ver?.status === 'PASSED'
          if (typeof ver?.pointsCharged === 'number') pointsCharged = ver.pointsCharged
          if (Array.isArray(ver?.failureReasons)) failureReasons = ver.failureReasons
        }
      } catch (e) {
        showToast('검증 실패', e?.message || '검증 API 호출에 실패했습니다.')
        return
      }

      // BE 가 success=false 로 응답한 경우(hash_mismatch / consent_revoked 등) — 통과로 처리하지 않는다.
      // 단, duplicate 응답은 이미 검증된 건이므로 idempotent 로 처리해 결과 탭을 열어준다.
      if (!success) {
        const isDuplicate = Array.isArray(failureReasons) && failureReasons.some(r => String(r).toLowerCase().includes('duplicate'))
        if (!isDuplicate) {
          const reasonLabel = failureReasonLabel(failureReasons)
          showToast('검증 실패', reasonLabel)
          setState(s => ({
            ...s,
            txLog: [{ time: new Date().toLocaleTimeString(), type: '검증', org: 'ins-001', desc: `${c.recordId} 검증 실패 — ${reasonLabel}` }, ...s.txLog],
          }))
          return
        }
        // duplicate → idempotent: fall through and show result tab so insurer can re-review
      }

      const idempotent = pointsCharged === 0
      const result = {
        verificationId,
        submissionId:   submissionId || `CLM-${c.recordId}`,
        recordId: c.recordId, pet: c.pet, disease: c.disease,
        cost: c.cost, hospital: c.hospital,
        status: 'PASSED', verifiedAt: new Date().toLocaleString(),
        reviewStatus: null,
      }
      setState(s => ({
        ...s,
        ptBalance:       s.ptBalance - pointsCharged,
        usedPt:          s.usedPt + pointsCharged,
        verifyCount:     s.verifyCount + 1,
        verifiedRecords: [result, ...s.verifiedRecords],
        txLog: [{ time: new Date().toLocaleTimeString(), type: '검증', org: 'ins-001', desc: `${c.recordId} 검증 완료 — 해시 일치${idempotent ? ' (idempotent)' : ''}` }, ...s.txLog],
        ptLog: pointsCharged > 0 ? [{ date: '지금', claim: c.recordId, desc: '검증 API 호출', pt: -pointsCharged }, ...s.ptLog] : s.ptLog,
      }))
      setLastVerified(result)
      showToast('검증 완료', idempotent ? 'PASSED — 이미 검증된 건(idempotent)' : `PASSED — 포인트 차감 (-${pointsCharged})`)
      setTab('result')
      // 잔액을 백엔드 기준으로 다시 동기화 (로컬 차감과 어긋남 방지)
      try {
        const data = await apiFetch('/insurers/me/points/balance')
        if (data?.balance !== undefined) setState(s => ({ ...s, ptBalance: data.balance }))
      } catch { /* 무시 */ }
    } finally {
      verifyingRef.current.delete(c.recordId)
    }
  }

  /* ── 포인트 충전 ── */
  const handleCharge = async () => {
    const amt = Number(chargeAmount)
    if (!amt || amt <= 0 || charging) return
    setCharging(true)
    try {
      const data = await apiFetch('/insurers/me/points/charge', { method:'POST', body:{ amount:amt } })
      if (data?.balance !== undefined) setState(s => ({ ...s, ptBalance: data.balance }))
      showToast('충전 완료', `${amt}포인트 충전 완료 · 잔액: ${data.balance ?? ''}`)
      setShowChargeModal(false)
    } catch (e) {
      showToast('충전 실패', e?.message || '충전에 실패했습니다')
    } finally {
      setCharging(false)
    }
  }

  /* ── 심사 결과 기록 ── */
  const handleReview = async (status) => {
    if (!lastVerified) return
    setState(s => ({
      ...s,
      verifiedRecords: s.verifiedRecords.map(r =>
        r.verificationId === lastVerified.verificationId
          ? { ...r, reviewStatus: status }
          : r
      ),
      txLog: [{ time: new Date().toLocaleTimeString(), type: '심사', org: 'ins-001', desc: `${lastVerified.recordId} — ${status}` }, ...s.txLog],
    }))
    setLastVerified(prev => ({ ...prev, reviewStatus: status }))
    showToast('심사 완료', `${status} — 원장 기록 완료`)

    // 실제 submissionId(CLM-연도-...)가 있으면 백엔드 청구 상태에 반영
    const statusMap = { APPROVED: 'APPROVED_BY_INSURER', REJECTED: 'REJECTED_BY_INSURER' }
    const mapped = statusMap[status]
    if (mapped && /^CLM-\d/.test(lastVerified.submissionId || '')) {
      try {
        await apiFetch(`/submissions/${lastVerified.submissionId}/claim-status`, {
          method: 'POST', body: { status: mapped },
        })
      } catch { /* 로컬 상태는 이미 갱신됨 */ }
    }
  }

  /* ── 이상 신고 제출 ── */
  const handleFlag = async () => {
    if (!flagReason) { showToast('오류', '신고 사유를 선택하세요'); return }
    // BE 발급 verificationId 형식(VER-숫자)만 본문에 포함. 가짜/없음이면 보내지 않는다.
    const realVerificationId = /^VER-\d+$/.test(flagModal.verificationId || '') ? flagModal.verificationId : null

    // 백엔드에 먼저 이상 신고를 영속화 — 실패 시(중복 PENDING 등) 로컬 상태도 갱신하지 않음.
    let savedFlag
    try {
      savedFlag = await apiFetch('/flags', {
        method: 'POST',
        body: {
          recordId:       flagModal.recordId,
          verificationId: realVerificationId,
          reasonCode:     flagReason,
          note:           flagNote,
        },
      })
    } catch (e) {
      showToast('신고 실패', e?.message || '이상 신고 등록에 실패했습니다')
      return
    }

    const flagEntry = {
      flagId:         savedFlag?.flagId || `FLAG-${crypto.randomUUID().slice(0,8).toUpperCase()}`,
      verificationId: realVerificationId,
      recordId:       flagModal.recordId,
      pet:            flagModal.pet,
      hospital:       flagModal.hospital,
      disease:        flagModal.disease,
      cost:           flagModal.cost,
      reasonCode:     flagReason,
      reasonLabel:    FLAG_REASONS.find(r => r.code === flagReason)?.label,
      note:           flagNote,
      flaggedAt:      new Date().toLocaleString(),
      status:         'PENDING',
      reportedBy:     'ins-001',
    }
    setState(s => ({
      ...s,
      flaggedRecords: [flagEntry, ...(s.flaggedRecords || [])],
      verifiedRecords: s.verifiedRecords.map(r =>
        r.verificationId === flagModal.verificationId
          ? { ...r, reviewStatus: 'FLAGGED' }
          : r
      ),
      txLog: [{ time: new Date().toLocaleTimeString(), type: '신고', org: 'ins-001', desc: `${flagModal.recordId} — 이상 신고 전달 (${flagEntry.reasonLabel})` }, ...s.txLog],
    }))
    if (lastVerified?.verificationId === flagModal.verificationId) {
      setLastVerified(prev => ({ ...prev, reviewStatus: 'FLAGGED' }))
    }
    showToast('이상 신고 완료', `플랫폼에 전달됨 — ${flagEntry.flagId}`)
    setFlagModal(null)
    setFlagReason('')
    setFlagNote('')
    // 백엔드에서 내 신고 목록 즉시 동기화
    loadMyFlagsRef.current?.()
  }

  /* ── 심사 결과 배지 ── */
  const reviewBadge = (status) => ({
    APPROVED: <span className="badge badge-success">APPROVED</span>,
    REJECTED: <span className="badge badge-danger">REJECTED</span>,
    FLAGGED:  <span className="badge badge-warning">⚠️ FLAGGED</span>,
  }[status] || <span className="badge badge-muted">미기록</span>)

  return (
    <>
      <DashNav role="insurance" tab={tab} setTab={setTab} onLogout={onLogout} />

      <div className="dash-wrap">

        {/* ── 검증 목록 ── */}
        {tab === 'list' && (
          <div className="fade-in">
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 4 }}>
              <div>
                <div className="pane-h" style={{ marginBottom: 0 }}>검증 대기 목록</div>
                <div className="pane-sub" style={{ marginBottom: 0 }}>보호자 동의가 ACTIVE인 청구 건 — 토글 OFF 시 목록에서 사라집니다</div>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                style={{ marginBottom: 4 }}
                onClick={() => loadConsentsRef.current?.()}
              >
                ↻ 새로고침
              </button>
            </div>

            {/* 관리자가 처리 완료한 이상신고 알림 */}
            {myFlags.filter(f => f.status === 'RESOLVED').length > 0 && (
              <div className="alert alert-success" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, marginTop: 10 }}>
                <span style={{ fontSize: 18 }}>✅</span>
                <span style={{ flex: 1 }}>
                  <strong>이상 신고 처리 완료</strong> — {myFlags.filter(f => f.status === 'RESOLVED').length}건이 처리되었습니다.
                  <span style={{ fontSize: 12, marginLeft: 6, color: 'var(--muted)' }}>검증 결과 탭에서 상세 내용을 확인하세요.</span>
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => setTab('result')}>결과 보기 →</button>
              </div>
            )}

            {revokedConsents.length > 0 && (
              <div className="alert alert-danger">
                ⛔ 동의 철회 {revokedConsents.length}건 — 해당 건은 조회 차단됨 (BLOCKED_BY_CONSENT)
              </div>
            )}

            {activeConsents.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: 72 }}>
                <div style={{ fontSize: 44, marginBottom: 16 }}>🔒</div>
                <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 10 }}>검증 가능한 기록이 없습니다</div>
                <div style={{ fontSize: 14, color: 'var(--muted)' }}>보호자가 동의 토글을 ON해야 이 목록에 표시됩니다</div>
              </div>
            ) : (
              <div className="card">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>record_id</th><th>반려동물</th><th>질병코드</th>
                      <th>진료비</th><th>병원</th><th>동의 상태</th><th>포인트</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeConsents.map(c => (
                      <tr key={c.recordId}>
                        <td><span className="mono">{c.recordId}</span></td>
                        <td style={{ fontWeight: 600 }}>{c.pet}</td>
                        <td><span className="mono">{c.disease}</span></td>
                        <td style={{ fontWeight: 600 }}>{c.cost.toLocaleString()}원</td>
                        <td>{c.hospital}</td>
                        <td><span className="badge badge-success">ACTIVE</span></td>
                        <td><span style={{ fontSize: 13, color: 'var(--danger)', fontWeight: 700 }}>-1 pt</span></td>
                        <td>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleVerify(c)}
                            disabled={state.ptBalance <= 0}
                          >
                            검증 API →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {revokedConsents.length > 0 && (
              <div className="card" style={{ marginTop: 18, opacity: .65 }}>
                <div className="card-title">접근 차단된 기록 (동의 철회)</div>
                <table className="tbl">
                  <thead><tr><th>record_id</th><th>반려동물</th><th>이유</th></tr></thead>
                  <tbody>
                    {revokedConsents.map(c => (
                      <tr key={c.recordId}>
                        <td><span className="mono">{c.recordId}</span></td>
                        <td>{c.pet}</td>
                        <td><span className="badge badge-danger">BLOCKED_BY_CONSENT</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── 검증 결과 ── */}
        {tab === 'result' && (
          <div className="fade-in">
            <div className="pane-h">검증 결과</div>
            <div className="pane-sub">verification_logs — 보험사 내부 심사 후 이상 건은 플랫폼에 신고합니다</div>

            {state.verifiedRecords.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: 72, color: 'var(--muted)' }}>
                아직 검증한 기록이 없습니다. 검증 목록에서 API를 호출하세요.
              </div>
            ) : (
              <>
                {lastVerified && (
                  <div className="card fade-in" style={{
                    borderTop: `3px solid ${lastVerified.reviewStatus === 'FLAGGED' ? 'var(--warning)' : 'var(--success)'}`,
                    marginBottom: 22,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
                      <div style={{
                        width: 50, height: 50, borderRadius: 14,
                        background: lastVerified.reviewStatus === 'FLAGGED' ? 'var(--warning-xl)' : 'var(--success-xl)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
                      }}>
                        {lastVerified.reviewStatus === 'FLAGGED' ? '⚠️' : '✅'}
                      </div>
                      <div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: lastVerified.reviewStatus === 'FLAGGED' ? 'var(--warning)' : 'var(--success)' }}>
                          {lastVerified.reviewStatus === 'FLAGGED' ? '이상 신고 완료' : '검증 통과'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                          status: PASSED · {lastVerified.verifiedAt}
                        </div>
                      </div>
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                        {reviewBadge(lastVerified.reviewStatus)}
                        <span className="badge badge-warning">포인트 -1</span>
                      </div>
                    </div>

                    {/* 검증 체크 항목 */}
                    <div className="g2" style={{ marginBottom: 20 }}>
                      {[
                        ['해시 일치', '✓ 정상',    'var(--success)'],
                        ['중복 청구', '✓ 없음',    'var(--success)'],
                        ['동의 상태', '✓ ACTIVE', 'var(--success)'],
                        ['on_chain',  '✓ confirmed','var(--brand)'],
                      ].map(([k, v, c]) => (
                        <div key={k} style={{ background: 'var(--bg-2)', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--border)' }}>
                          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 6 }}>{k}</div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: c }}>{v}</div>
                        </div>
                      ))}
                    </div>

                    <div className="divider" />

                    {/* 진료 상세 */}
                    <div className="g2" style={{ fontSize: 14, marginBottom: 20 }}>
                      {[
                        ['반려동물',        lastVerified.pet,                          false],
                        ['질병코드',        lastVerified.disease,                      true],
                        ['진료비',          `${lastVerified.cost.toLocaleString()}원`, false],
                        ['verification_id', lastVerified.verificationId,               true],
                      ].map(([k, v, mono]) => (
                        <div key={k}>
                          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>{k}</div>
                          <div style={{ fontWeight: 600 }} className={mono ? 'mono' : ''}>{v}</div>
                        </div>
                      ))}
                    </div>

                    {/* 심사 결과 버튼 — 항상 표시 (재심사 가능) */}
                    <>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 10 }}>
                        보험사 내부 심사 후 결과를 선택하세요
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button
                          className="btn btn-success"
                          style={{ flex: 1, padding: 12, fontSize: 14 }}
                          onClick={() => handleReview('APPROVED')}
                        >
                          ✓ 승인 (APPROVED)
                        </button>
                        <button
                          className="btn btn-danger"
                          style={{ flex: 1, padding: 12, fontSize: 14 }}
                          onClick={() => handleReview('REJECTED')}
                        >
                          ✕ 반려 (REJECTED)
                        </button>
                        <button
                          className="btn btn-warning"
                          style={{ flex: 1, padding: 12, fontSize: 14, background: 'var(--warning-xl)', color: 'var(--warning)', borderColor: 'var(--warning)' }}
                          onClick={() => setFlagModal(lastVerified)}
                        >
                          ⚠️ 이상 신고
                        </button>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
                        이상 신고는 플랫폼 관리자에게 전달되며, 플랫폼이 병원·보험사와 함께 해당 건을 재검토합니다.
                      </div>
                    </>

                    {/* 이미 결과 기록된 경우 */}
                    {lastVerified.reviewStatus && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'var(--bg-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 13, color: 'var(--muted)' }}>심사 결과 기록됨</span>
                        {reviewBadge(lastVerified.reviewStatus)}
                        {lastVerified.reviewStatus !== 'FLAGGED' && (
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ marginLeft: 'auto' }}
                            onClick={() => setFlagModal(lastVerified)}
                          >
                            ⚠️ 이상 신고
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 전체 검증 이력 */}
                <div className="card">
                  <div className="card-title">전체 검증 이력</div>
                  <table className="tbl">
                    <thead>
                      <tr><th>verification_id</th><th>record_id</th><th>검증</th><th>심사 결과</th><th>시각</th><th>포인트</th><th></th></tr>
                    </thead>
                    <tbody>
                      {state.verifiedRecords.map((r, i) => (
                        <tr key={i}>
                          <td><span className="mono">{r.verificationId}</span></td>
                          <td><span className="mono">{r.recordId}</span></td>
                          <td><span className="badge badge-success">PASSED</span></td>
                          <td>{reviewBadge(r.reviewStatus)}</td>
                          <td style={{ fontSize: 13, color: 'var(--muted)' }}>{r.verifiedAt}</td>
                          <td style={{ color: 'var(--danger)', fontWeight: 700 }}>-1</td>
                          <td>
                            {r.reviewStatus !== 'FLAGGED' && (
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => { setLastVerified(r); setFlagModal(r) }}
                              >
                                ⚠️ 신고
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 이상 신고 처리 현황 */}
                {myFlags.length > 0 && (
                  <div className="card" style={{ marginTop: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                      <div className="card-title" style={{ margin: 0 }}>내 이상 신고 처리 현황</div>
                      <button className="btn btn-ghost btn-sm" onClick={() => loadMyFlagsRef.current?.()}>↻ 새로고침</button>
                    </div>
                    <table className="tbl">
                      <thead>
                        <tr><th>flag_id</th><th>record_id</th><th>신고 사유</th><th>신고일</th><th>처리 상태</th><th>처리 결과</th></tr>
                      </thead>
                      <tbody>
                        {myFlags.map((f, i) => (
                          <tr key={i} style={f.status === 'RESOLVED' ? { background: 'var(--success-xl)' } : {}}>
                            <td><span className="mono">{f.flagId}</span></td>
                            <td><span className="mono">{f.recordId}</span></td>
                            <td><span className="badge badge-warning">{f.reasonLabel}</span></td>
                            <td style={{ fontSize: 13, color: 'var(--muted)' }}>
                              {f.flaggedAt ? new Date(f.flaggedAt).toLocaleDateString() : '—'}
                            </td>
                            <td>
                              {f.status === 'RESOLVED'
                                ? <span className="badge badge-success">처리 완료</span>
                                : <span className="badge badge-warning">검토 대기</span>}
                            </td>
                            <td>
                              {f.status === 'RESOLVED' ? (
                                <div>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)' }}>
                                    {f.resolveCode === 'CONFIRMED_FRAUD'   ? '사기 확인' :
                                     f.resolveCode === 'FALSE_ALARM'       ? '오탐 — 정상 처리' :
                                     f.resolveCode === 'NEEDS_MORE_INFO'   ? '추가 자료 요청 중' :
                                     f.resolveCode === 'ESCALATED'         ? '외부 기관 이관' :
                                     f.resolveCode || '—'}
                                  </span>
                                  {f.resolveNote && (
                                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{f.resolveNote}</div>
                                  )}
                                </div>
                              ) : <span style={{ color: 'var(--muted)', fontSize: 13 }}>—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── 포인트 현황 ── */}
        {tab === 'point' && (
          <div className="fade-in">
            <div className="pane-h">포인트 현황</div>
            <div className="pane-sub">검증 API 호출 시 차감 (point_balances + point_transactions)</div>

            <div className="g4" style={{ marginBottom: 24 }}>
              {[
                { n: state.ptBalance,   l: '잔여 포인트',  c: 'var(--brand)',   bg: 'var(--brand-xl)' },
                { n: state.usedPt,      l: '이번달 소모',  c: 'var(--danger)',  bg: 'var(--danger-xl)' },
                { n: ptTx.filter(t => t.transactionType === 'issue').reduce((sum, t) => sum + (t.amount || 0), 0), l: '충전 총량', c: 'var(--text-2)', bg: 'var(--bg-2)' },
                { n: state.verifyCount, l: '총 검증 건',   c: 'var(--success)', bg: 'var(--success-xl)' },
              ].map((s, i) => (
                <div key={i} className="stat-box" style={{ background: s.bg, border: `1px solid ${s.c}22` }}>
                  <div className="stat-n" style={{ color: s.c }}>{s.n}</div>
                  <div className="stat-l" style={{ color: s.c, opacity: .75 }}>{s.l}</div>
                </div>
              ))}
            </div>

            {state.ptBalance < 100 && (
              <div className="alert alert-warning">
                ⚠️ 포인트 잔액이 부족합니다.
                <button className="btn btn-orange btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setShowChargeModal(true)}>충전 요청</button>
              </div>
            )}

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <div className="card-title" style={{ margin: 0 }}>포인트 거래 이력</div>
                <button className="btn btn-primary btn-sm" onClick={() => setShowChargeModal(true)}>충전 요청</button>
              </div>
              <table className="tbl">
                <thead>
                  <tr><th>날짜</th><th>tx_type</th><th>record_id</th><th>내용</th><th>포인트</th></tr>
                </thead>
                <tbody>
                  {state.ptLog.map((p, i) => (
                    <tr key={`local-${i}`}>
                      <td>{p.date}</td>
                      <td><span className="badge badge-danger">DEDUCT</span></td>
                      <td><span className="mono">{p.claim}</span></td>
                      <td>{p.desc}</td>
                      <td style={{ color: 'var(--danger)', fontWeight: 700 }}>{p.pt}</td>
                    </tr>
                  ))}
                  {ptTx.map(t => {
                    const isIssue = t.transactionType === 'issue'
                    return (
                      <tr key={t.transactionId}>
                        <td>{(t.createdAt || '').slice(0, 10)}</td>
                        <td><span className={`badge ${isIssue ? 'badge-brand' : 'badge-danger'}`}>{(t.transactionType || '').toUpperCase()}</span></td>
                        <td><span className="mono">{t.relatedRecordId || '—'}</span></td>
                        <td>{t.reason || '—'}</td>
                        <td style={{ color: isIssue ? 'var(--brand)' : 'var(--danger)', fontWeight: 700 }}>{isIssue ? '+' : '-'}{t.amount}</td>
                      </tr>
                    )
                  })}
                  {state.ptLog.length === 0 && ptTx.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>거래 이력이 없습니다</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── 채널 현황 ── */}
        {tab === 'channel' && (
          <div className="fade-in">
            <div className="pane-h">채널 현황</div>
            <div className="pane-sub">현재 참여 중인 하이퍼레저 패브릭 채널 구성</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
              {CHANNEL_INFO.map(ch => (
                <div key={ch.id} className="card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>{ch.name}</div>
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: ch.badgeColor,
                      background: ch.badgeColor + '18', padding: '3px 10px',
                      borderRadius: 20, border: `1px solid ${ch.badgeColor}44`,
                    }}>{ch.badge}</span>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.65 }}>{ch.desc}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {ch.members.map((m, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px', background: 'var(--bg-2)', borderRadius: 9 }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: m.dot, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, flex: 1 }}>{m.label}</span>
                        <span style={{ fontSize: 11, color: m.dot, fontWeight: 600 }}>{m.role}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="card">
              <div className="card-title">채널별 검증 통계 (이번 세션)</div>
              <table className="tbl">
                <thead>
                  <tr><th>채널</th><th>총 기록 수</th><th>검증 완료</th><th>대기 중</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td>수의사회 채널</td>
                    <td>{Object.values(state.consents).filter(c => !c.isIndependent).length}</td>
                    <td style={{ color: 'var(--success)', fontWeight: 700 }}>{state.verifiedRecords.length}</td>
                    <td>{Object.values(state.consents).filter(c => c.status === 'active').length}</td>
                  </tr>
                  <tr>
                    <td>대형병원 독립 채널</td>
                    <td>—</td>
                    <td>—</td>
                    <td>—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── 포인트 충전 모달 ── */}
      {showChargeModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:900, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:18, padding:32, width:'100%', maxWidth:400, position:'relative' }}>
            <button onClick={() => setShowChargeModal(false)} style={{ position:'absolute', top:16, right:18, background:'none', border:'none', fontSize:22, color:'#a1a1aa', cursor:'pointer' }}>✕</button>
            <div style={{ fontSize:19, fontWeight:800, marginBottom:4 }}>포인트 충전</div>
            <div style={{ fontSize:13, color:'var(--muted)', marginBottom:20 }}>충전할 포인트 수량을 입력하세요</div>
            <label className="fl">충전 포인트</label>
            <input className="fi" type="number" min="1" value={chargeAmount} onChange={e => setChargeAmount(e.target.value)} style={{ marginBottom:10 }} />
            <div style={{ display:'flex', gap:8, marginBottom:20 }}>
              {[100, 500, 1000, 3000].map(n => (
                <button key={n} className="btn btn-ghost btn-sm" onClick={() => setChargeAmount(n)} style={{ flex:1, justifyContent:'center' }}>{n}P</button>
              ))}
            </div>
            <div style={{ background:'var(--bg-2)', borderRadius:10, padding:'10px 14px', marginBottom:16, fontSize:13, display:'flex', justifyContent:'space-between' }}>
              <span style={{ color:'var(--muted)' }}>현재 잔액</span>
              <span style={{ fontWeight:700, color:'var(--brand)' }}>{state.ptBalance}P</span>
            </div>
            <button className="btn btn-primary" style={{ width:'100%', padding:13, fontSize:14, fontWeight:700, justifyContent:'center' }} onClick={handleCharge} disabled={!chargeAmount || charging}>
              {charging ? '충전 중...' : `${chargeAmount}포인트 충전`}
            </button>
          </div>
        </div>
      )}

      {/* ── 이상 신고 모달 ── */}
      {flagModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 18, padding: 32, width: '100%', maxWidth: 480, position: 'relative' }}>
            <button
              onClick={() => { setFlagModal(null); setFlagReason(''); setFlagNote('') }}
              style={{ position: 'absolute', top: 16, right: 18, background: 'none', border: 'none', fontSize: 22, color: '#a1a1aa', cursor: 'pointer' }}
            >✕</button>

            <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 4 }}>⚠️ 이상 신고</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>
              플랫폼 관리자에게 이상 내용이 전달됩니다
            </div>

            {/* 신고 대상 요약 */}
            <div style={{ background: 'var(--bg-2)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>record_id</span>
                <span className="mono">{flagModal.recordId}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>반려동물</span>
                <span style={{ fontWeight: 600 }}>{flagModal.pet}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>병원</span>
                <span>{flagModal.hospital}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>진료비</span>
                <span style={{ fontWeight: 600 }}>{flagModal.cost?.toLocaleString()}원</span>
              </div>
            </div>

            {/* 신고 사유 선택 */}
            <label className="fl">신고 사유 <span style={{ color: 'var(--danger)' }}>*</span></label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {FLAG_REASONS.map(r => (
                <label key={r.code} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                  border: `1.5px solid ${flagReason === r.code ? 'var(--warning)' : 'var(--border)'}`,
                  background: flagReason === r.code ? 'var(--warning-xl)' : '#fff',
                  transition: 'all .15s',
                }}>
                  <input
                    type="radio" name="flagReason" value={r.code}
                    checked={flagReason === r.code}
                    onChange={() => setFlagReason(r.code)}
                    style={{ accentColor: 'var(--warning)' }}
                  />
                  <span style={{ fontSize: 14, fontWeight: flagReason === r.code ? 600 : 400 }}>{r.label}</span>
                </label>
              ))}
            </div>

            {/* 상세 메모 */}
            <label className="fl">상세 내용 (선택)</label>
            <textarea
              className="fi"
              rows={3}
              placeholder="이상하다고 판단한 근거나 추가 정보를 입력하세요"
              value={flagNote}
              onChange={e => setFlagNote(e.target.value)}
              style={{ resize: 'vertical' }}
            />

            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.6 }}>
              📌 신고 후에도 이미 다운로드한 자료는 회수되지 않습니다. 플랫폼이 병원 및 보험사와 함께 해당 건을 재검토합니다.
            </div>

            <button
              className="btn btn-warning"
              style={{ width: '100%', padding: 13, fontSize: 14, fontWeight: 700, background: 'var(--warning)', color: '#fff', borderColor: 'var(--warning)', justifyContent: 'center' }}
              onClick={handleFlag}
            >
              플랫폼에 이상 신고 전달
            </button>
          </div>
        </div>
      )}
    </>
  )
}
