// src/lib/cardsApi.js

// Lee base desde cualquiera de las dos envs (usa la que tengas)
const API_BASE_RAW =
  (import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL || '').trim();

// Normalizar: quitar barras finales (/, //, etc.) y espacios
const API_BASE = API_BASE_RAW.replace(/\/+$/, '');

const ADMIN_SECRET = (import.meta.env.VITE_ADMIN_SECRET || '').trim();

// Fallback local si el server no responde
const LS_KEY = 'fin_cards_motos_v1';

// Helper para construir URLs asegurando una sola barra
function apiUrl(path = '') {
  const p = String(path || '');
  if (!API_BASE) return '';
  return `${API_BASE}${p.startsWith('/') ? '' : '/'}${p}`;
}

// Validación suave para detectar configuraciones raras
function isAbsoluteHttpUrl(u) {
  return /^https?:\/\//i.test(u);
}

/* ─────────────────────────────
   Helpers locales
   ───────────────────────────── */
function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function safeSetLocal(payload) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

function dispatchCardsUpdated(version) {
  try {
    const detail = { version: Number(version || 1), at: Date.now() };
    window.dispatchEvent(new CustomEvent('cards:updated', { detail }));
  } catch {
    /* non-browser env */
  }
}

/* ─────────────────────────────
   LECTURA
   ───────────────────────────── */

export async function fetchCards() {
  // Si no hay API configurada, usa cache local
  if (!API_BASE || !isAbsoluteHttpUrl(API_BASE)) {
    const raw = localStorage.getItem(LS_KEY);
    const parsed = raw ? safeParse(raw) : null;
    if (!parsed) return { version: 1, cards: [] };
    return parsed;
  }

  try {
    const res = await fetch(apiUrl('/cards'), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      credentials: 'omit'
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      const message = `read_failed (${res.status})${txt ? `: ${txt}` : ''}`;
      throw new Error(message);
    }

    const data = await res.json();
    safeSetLocal(data);
    return data;
  } catch (_err) {
    // si falla la red/servidor, intenta fallback local
    const raw = localStorage.getItem(LS_KEY);
    const parsed = raw ? safeParse(raw) : null;
    if (parsed) return parsed;
    // último recurso: estructura vacía
    return { version: 1, cards: [] };
  }
}

/* ─────────────────────────────
   ESCRITURA (segura por defecto con UPSERT)
   ───────────────────────────── */

// Intenta usar POST /cards/upsert (merge por id). Si no existe, cae a PUT /cards.
async function sendUpsertOrPut(payload) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };
  if (ADMIN_SECRET) {
    headers['x-admin-secret'] = ADMIN_SECRET; // ⚠️ temporal (no recomendado para prod)
  }

  // 1) Intentar UPSERT (no borra lo existente)
  const upsertBody = {
    cards: Array.isArray(payload?.cards) ? payload.cards : []
  };

  let res = await fetch(apiUrl('/cards/upsert'), {
    method: 'POST',
    headers,
    body: JSON.stringify(upsertBody),
    credentials: 'omit'
  });

  // Si el endpoint no existe (404) o método no permitido (405), probamos PUT
  if (res.status === 404 || res.status === 405) {
    res = await fetch(apiUrl('/cards'), {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload),
      credentials: 'omit'
    });
  }

  return res;
}

// Guardado remoto con manejo de errores + fallback local.
// Usa UPSERT por defecto.
export async function saveCards(payload) {
  // Sin API => solo local
  if (!API_BASE || !isAbsoluteHttpUrl(API_BASE)) {
    safeSetLocal(payload);
    dispatchCardsUpdated(payload?.version);
    return { ok: true, local: true };
  }

  try {
    const res = await sendUpsertOrPut(payload);

    if (res.status === 401) {
      const body = await res.text().catch(() => '');
      throw new Error(`unauthorized (401)${body ? `: ${body}` : ''}`);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`save_failed (${res.status})${body ? `: ${body}` : ''}`);
    }

    // Éxito: asumimos que payload ya representa el estado local deseado
    safeSetLocal(payload);
    dispatchCardsUpdated(payload?.version);
    try {
      return await res.json();
    } catch {
      return { ok: true };
    }
  } catch (err) {
    // Fallback local ante red caida/timeout/etc.
    safeSetLocal(payload);
    dispatchCardsUpdated(payload?.version);
    return { ok: false, error: String(err?.message || err), local: true };
  }
}

// Guardado pensado para "unload/ocultar pestaña" con keepalive. Usa UPSERT por defecto.
export async function saveCardsBackground(payload) {
  if (!API_BASE || !isAbsoluteHttpUrl(API_BASE)) {
    safeSetLocal(payload);
    dispatchCardsUpdated(payload?.version);
    return { ok: true, local: true };
  }

  try {
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    };
    if (ADMIN_SECRET) {
      headers['x-admin-secret'] = ADMIN_SECRET; // ⚠️ temporal
    }

    // Intentar UPSERT primero
    let res = await fetch(apiUrl('/cards/upsert'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ cards: Array.isArray(payload?.cards) ? payload.cards : [] }),
      keepalive: true,
      credentials: 'omit'
    });

    if (res.status === 404 || res.status === 405) {
      // Fallback a PUT si el endpoint aún no está desplegado
      res = await fetch(apiUrl('/cards'), {
        method: 'PUT',
        headers,
        body: JSON.stringify(payload),
        keepalive: true,
        credentials: 'omit'
      });
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      safeSetLocal(payload);
      dispatchCardsUpdated(payload?.version);
      return { ok: false, status: res.status, body: body || null, local: true };
    }

    safeSetLocal(payload);
    dispatchCardsUpdated(payload?.version);
    return { ok: true };
  } catch {
    // Sin red: cache local silenciosa
    safeSetLocal(payload);
    dispatchCardsUpdated(payload?.version);
    return { ok: false, local: true };
  }
}

/* ─────────────────────────────
   (Opcional) Reemplazo total explícito
   ───────────────────────────── */
// Si alguna vez necesitás **intencionalmente** reemplazar TODO desde el front:
export async function replaceAllCards(payload) {
  if (!API_BASE || !isAbsoluteHttpUrl(API_BASE)) {
    safeSetLocal(payload);
    dispatchCardsUpdated(payload?.version);
    return { ok: true, local: true };
  }

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };
  if (ADMIN_SECRET) {
    headers['x-admin-secret'] = ADMIN_SECRET;
  }

  const res = await fetch(apiUrl('/cards'), {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload),
    credentials: 'omit'
  });

  if (res.status === 401) {
    const body = await res.text().catch(() => '');
    throw new Error(`unauthorized (401)${body ? `: ${body}` : ''}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`save_failed (${res.status})${body ? `: ${body}` : ''}`);
  }

  safeSetLocal(payload);
  dispatchCardsUpdated(payload?.version);
  try {
    return await res.json();
  } catch {
    return { ok: true };
  }
}

/* ─────────────────────────────
   NUEVO: edición/rename sin duplicar (no requiere backend extra)
   ───────────────────────────── */

/**
 * Edita una tarjeta existente (por su id actual).
 * - Soporta cambio de id (rename) con validación de colisión.
 * - Persiste usando replaceAllCards (PUT /cards) para evitar duplicados.
 *
 * @param {string} originalId Id actual de la tarjeta a editar.
 * @param {object} updates Campos a modificar. Puede incluir { id: 'nuevoId' }.
 * @returns {Promise<{version:number, cards:Array}>} Payload actualizado.
 * @throws Error('not_found') si no existe originalId
 * @throws Error('id_conflict') si updates.id ya existe en otra tarjeta
 */
export async function editCardById(originalId, updates = {}) {
  const prev = await fetchCards();
  const cards = Array.isArray(prev?.cards) ? [...prev.cards] : [];

  const idx = cards.findIndex(c => String(c?.id) === String(originalId));
  if (idx < 0) throw new Error('not_found');

  const current = cards[idx];
  const nextId = Object.prototype.hasOwnProperty.call(updates, 'id')
    ? String(updates.id)
    : current.id;

  // Si cambia el id, validar que no exista otro con ese id
  const isRename = nextId !== current.id;
  if (isRename && cards.some((c, i) => i !== idx && String(c?.id) === String(nextId))) {
    throw new Error('id_conflict');
  }

  const nextCard = { ...current, ...updates, id: nextId };
  cards[idx] = nextCard;

  const nextPayload = {
    version: Number(prev?.version || 1) + 1,
    cards
  };

  await replaceAllCards(nextPayload); // esto actualiza LS y dispara cards:updated
  return nextPayload;
}

/**
 * Atajo para renombrar el id de una tarjeta.
 * @param {string} originalId
 * @param {string} newId
 */
export async function renameCardById(originalId, newId) {
  return editCardById(originalId, { id: newId });
}
