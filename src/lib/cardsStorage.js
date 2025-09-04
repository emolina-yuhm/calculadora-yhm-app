// src/lib/cardsStorage.js
import { fetchCards, saveCards } from './cardsApi'

const STORAGE_KEY = 'fin_cards_motos_v1'
let cache = null

/* ─────────────────────────────
   Helpers de persistencia
   ───────────────────────────── */
const readLocal = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const writeLocal = (payload) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* ignore quota errors */
  }
}

/* ─────────────────────────────
   Normalización
   ───────────────────────────── */
const normalizeCoefficients = (coeficientes) => {
  const out = {}
  Object.entries(coeficientes || {}).forEach(([k, v]) => {
    const cuotas = Number(k)
    const pct = Number(v)
    if (Number.isFinite(cuotas) && cuotas > 0 && Number.isFinite(pct) && pct >= 0) {
      // guardamos la key como string numérico para consistencia
      out[String(cuotas)] = pct
    }
  })
  return out
}

const normalizeCards = (cards) =>
  (Array.isArray(cards) ? cards : []).map((c) => ({
    ...c,
    coeficientes: normalizeCoefficients(c.coeficientes),
  }))

/* ─────────────────────────────
   Eventos
   ───────────────────────────── */
const dispatchCardsUpdated = () => {
  try {
    const detail = { version: cache?.version ?? 1, at: Date.now() }
    window.dispatchEvent(new CustomEvent('cards:updated', { detail }))
  } catch {
    // ambientes sin window/CustomEvent
  }
}

/* ─────────────────────────────
   API pública
   ───────────────────────────── */

/** Obtiene las cards desde cache o localStorage (sincrónico) */
export const getCards = () => {
  if (cache) return cache.cards || []
  const local = readLocal()
  if (local && Array.isArray(local.cards)) {
    const cards = normalizeCards(local.cards)
    cache = { version: Number(local.version || 1), cards }
    return cards
  }
  return []
}

/** Carga las cards desde el backend y persiste en cache + localStorage */
export const loadCardsAsync = async () => {
  const server = await fetchCards()
  const cards = normalizeCards(server?.cards || [])
  cache = { version: Number(server?.version || 1), cards }
  writeLocal(cache)
  dispatchCardsUpdated()
  return cache.cards
}

/** Crea/actualiza una card por id y persiste en backend + localStorage */
export const upsertCard = async (card) => {
  if (!cache) {
    const server = await fetchCards()
    cache = { version: Number(server?.version || 1), cards: normalizeCards(server?.cards || []) }
  }

  const cards = [...(cache.cards || [])]
  const idx = cards.findIndex((c) => c.id === card.id)

  const next = {
    ...card,
    coeficientes: normalizeCoefficients(card.coeficientes || {}),
  }

  if (idx >= 0) cards[idx] = next
  else cards.push(next)

  cache = { version: (Number(cache.version) || 1) + 1, cards }
  await saveCards(cache)
  writeLocal(cache)
  dispatchCardsUpdated()
  return cache.cards
}

/** Elimina una card por id y persiste en backend + localStorage */
export const deleteCard = async (id) => {
  if (!cache) {
    const server = await fetchCards()
    cache = { version: Number(server?.version || 1), cards: normalizeCards(server?.cards || []) }
  }
  const cards = (cache.cards || []).filter((c) => c.id !== id)
  cache = { version: (Number(cache.version) || 1) + 1, cards }
  await saveCards(cache)
  writeLocal(cache)
  dispatchCardsUpdated()
  return cache.cards
}

/* ─────────────────────────────
   Utilidades extra (opcional)
   ───────────────────────────── */

/** Devuelve la card por id usando cache/localStorage */
export const getCardById = (id) => {
  const cards = getCards()
  return cards.find((c) => c.id === id) || null
}

/** Devuelve las cuotas disponibles (ordenadas asc) de una card */
export const listCuotas = (card) => {
  const coef = normalizeCoefficients(card?.coeficientes || {})
  return Object.keys(coef)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b)
}

/** Devuelve una copia de la card con coeficientes normalizados */
export const normalizeCardCoefficients = (card) => {
  if (!card) return null
  return {
    ...card,
    coeficientes: normalizeCoefficients(card.coeficientes || {}),
  }
}