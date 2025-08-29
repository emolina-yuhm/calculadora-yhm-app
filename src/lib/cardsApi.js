// src/lib/cardsApi.js
const API_BASE_RAW = import.meta.env.VITE_API_BASE || ''
// Normalizar: quitar barras finales (/, //, etc.)
const API_BASE = API_BASE_RAW.replace(/\/+$/, '')
const ADMIN_SECRET = import.meta.env.VITE_ADMIN_SECRET || ''

// Fallback local si el server no responde
const LS_KEY = 'fin_cards_motos_v1'

// Helper para construir URLs asegurando una sola barra
function apiUrl(path = '') {
  const p = String(path || '')
  return API_BASE ? `${API_BASE}${p.startsWith('/') ? '' : '/'}${p}` : ''
}

export async function fetchCards() {
  if (!API_BASE) {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return { version: 1, cards: [] }
    return JSON.parse(raw)
  }
  try {
    const res = await fetch(apiUrl('/cards'), { cache: 'no-store' })
    if (!res.ok) throw new Error('bad_response')
    const data = await res.json()
    localStorage.setItem(LS_KEY, JSON.stringify(data))
    return data
  } catch {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw)
    return { version: 1, cards: [] }
  }
}

export async function saveCards(payload) {
  if (!API_BASE) {
    localStorage.setItem(LS_KEY, JSON.stringify(payload))
    window.dispatchEvent(new CustomEvent('cards:updated'))
    return { ok: true, local: true }
  }
  const res = await fetch(apiUrl('/cards'), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-secret': ADMIN_SECRET
    },
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error('save_failed')
  localStorage.setItem(LS_KEY, JSON.stringify(payload))
  window.dispatchEvent(new CustomEvent('cards:updated'))
  return { ok: true }
}

// Guardado pensado para "unload/ocultar pestaña".
// Usa keepalive:true (permite headers, a diferencia de sendBeacon).
export async function saveCardsBackground(payload) {
  if (!API_BASE) {
    localStorage.setItem(LS_KEY, JSON.stringify(payload))
    window.dispatchEvent(new CustomEvent('cards:updated'))
    return { ok: true, local: true }
  }
  try {
    await fetch(apiUrl('/cards'), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': ADMIN_SECRET
      },
      body: JSON.stringify(payload),
      keepalive: true
    })
    localStorage.setItem(LS_KEY, JSON.stringify(payload))
    window.dispatchEvent(new CustomEvent('cards:updated'))
    return { ok: true }
  } catch {
    // Al menos cachear localmente
    localStorage.setItem(LS_KEY, JSON.stringify(payload))
    window.dispatchEvent(new CustomEvent('cards:updated'))
    return { ok: false, local: true }
  }
}
