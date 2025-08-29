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
   LECTURA
   ───────────────────────────── */

export async function fetchCards() {
  // Si no hay API configurada, usa cache local
  if (!API_BASE || !isAbsoluteHttpUrl(API_BASE)) {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { version: 1, cards: [] };
    return JSON.parse(raw);
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
    localStorage.setItem(LS_KEY, JSON.stringify(data));
    return data;
  } catch (_err) {
    // si falla la red/servidor, intenta fallback local
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
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

// Guardado remoto con errores diferenciados (401 vs otros). Usa UPSERT por defecto.
export async function saveCards(payload) {
  if (!API_BASE || !isAbsoluteHttpUrl(API_BASE)) {
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent('cards:updated'));
    return { ok: true, local: true };
  }

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
  localStorage.setItem(LS_KEY, JSON.stringify(payload));
  window.dispatchEvent(new CustomEvent('cards:updated'));
  // Intentamos devolver JSON si el server lo envió; sino, { ok: true }
  try {
    return await res.json();
  } catch {
    return { ok: true };
  }
}

// Guardado pensado para "unload/ocultar pestaña" con keepalive. Usa UPSERT por defecto.
export async function saveCardsBackground(payload) {
  if (!API_BASE || !isAbsoluteHttpUrl(API_BASE)) {
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent('cards:updated'));
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
      localStorage.setItem(LS_KEY, JSON.stringify(payload));
      window.dispatchEvent(new CustomEvent('cards:updated'));
      return { ok: false, status: res.status, body: body || null, local: true };
    }

    localStorage.setItem(LS_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent('cards:updated'));
    return { ok: true };
  } catch {
    // Sin red: cache local silenciosa
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent('cards:updated'));
    return { ok: false, local: true };
  }
}

/* ─────────────────────────────
   (Opcional) Reemplazo total explícito
   ───────────────────────────── */
// Si alguna vez necesitás **intencionalmente** reemplazar TODO desde el front:
export async function replaceAllCards(payload) {
  if (!API_BASE || !isAbsoluteHttpUrl(API_BASE)) {
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent('cards:updated'));
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

  localStorage.setItem(LS_KEY, JSON.stringify(payload));
  window.dispatchEvent(new CustomEvent('cards:updated'));
  try {
    return await res.json();
  } catch {
    return { ok: true };
  }
}
