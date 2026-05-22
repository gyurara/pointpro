class ApiError extends Error {
  constructor({ message, status, errorCode, traceId, details }) {
    super(message || `요청 실패 (${status})`)
    this.name = 'ApiError'
    this.status = status
    this.errorCode = errorCode
    this.traceId = traceId
    this.details = details || {}
  }
}

let _refreshing = false
let _refreshQueue = []

async function _tryRefresh() {
  const refreshToken = localStorage.getItem('refreshToken')
  if (!refreshToken) return false
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) return false
    const data = await res.json().catch(() => ({}))
    if (data.accessToken) {
      localStorage.setItem('accessToken', data.accessToken)
      if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken)
      return true
    }
    return false
  } catch {
    return false
  }
}

function _clearAuth() {
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
  localStorage.removeItem('memberType')
  localStorage.removeItem('userId')
  localStorage.removeItem('memberNumber')
  localStorage.removeItem('memberName')
  window.dispatchEvent(new CustomEvent('auth:logout'))
}

async function apiFetch(path, { method = 'GET', body, headers = {}, isFormData = false, _retry = false } = {}) {
  const accessToken = localStorage.getItem('accessToken')

  const reqHeaders = { ...headers }
  if (accessToken) reqHeaders['Authorization'] = `Bearer ${accessToken}`
  if (!isFormData && body !== undefined) reqHeaders['Content-Type'] = 'application/json'

  const options = { method, headers: reqHeaders }
  if (body !== undefined) options.body = isFormData ? body : JSON.stringify(body)

  const res = await fetch(`/api${path}`, options)

  // 401 처리: 토큰 갱신 후 1회 재시도
  if (res.status === 401 && !_retry) {
    if (_refreshing) {
      // 이미 갱신 중이면 완료 후 재시도
      await new Promise(resolve => _refreshQueue.push(resolve))
      return apiFetch(path, { method, body, headers, isFormData, _retry: true })
    }
    _refreshing = true
    const ok = await _tryRefresh()
    _refreshing = false
    _refreshQueue.forEach(fn => fn())
    _refreshQueue = []

    if (ok) {
      return apiFetch(path, { method, body, headers, isFormData, _retry: true })
    }
    _clearAuth()
    throw new ApiError({ message: '세션이 만료되었습니다. 다시 로그인해주세요.', status: 401 })
  }

  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError({
      message: payload.message,
      status: res.status,
      errorCode: payload.errorCode,
      traceId: payload.traceId,
      details: payload.details,
    })
  }

  if (payload && Object.prototype.hasOwnProperty.call(payload, 'data') && Object.prototype.hasOwnProperty.call(payload, 'traceId')) {
    return payload.data
  }
  return payload
}

export { ApiError }
export default apiFetch
