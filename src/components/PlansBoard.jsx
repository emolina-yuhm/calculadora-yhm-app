// src/components/PlansBoard.jsx
import React, { useMemo, useRef, useState } from 'react'
import { useReactToPrint } from 'react-to-print'
import PlanCard from './PlanCard'
import { calcularPlanesPorCoeficientes, sanitizeNumber } from '../utils/finance'
import { getCards } from '../lib/cardsStorage'
import { modal, toast } from '../lib/alerts'

/* ======= Helpers locales ======= */
const fmtARS = (n) =>
  Number(n || 0).toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })

const normTitle = (t) => String(t || 'Plan').trim().toLowerCase().replace(/\s+/g, '-')

// Mapeos de títulos y storageKeys usados por las cards
const TITLES = { A: 'Plan A', B: 'Plan B', C: 'Plan C' }
const STORAGE_KEYS = {
  A: 'fin_motos_plan_A_v1',
  B: 'fin_motos_plan_B_v1',
  C: 'fin_motos_plan_C_v1'
}

// Obtiene estado guardado de un PlanCard desde localStorage y resuelve tarjeta/planes
// Soporta la clave derivada (storageKey + ":" + title-normalizado) y la clave "cruda" (compatibilidad).
function readPlanState(storageKey, title) {
  const derivedKey = `${storageKey}:${normTitle(title)}`
  const keysToTry = [derivedKey, storageKey] // primero la derivada (PlanCard nuevo), luego la cruda (legacy)

  let parsed = null
  for (const k of keysToTry) {
    const raw = localStorage.getItem(k)
    if (!raw) continue
    try {
      const st = JSON.parse(raw)
      if (st && typeof st === 'object') { parsed = st; break }
    } catch { /* ignore */ }
  }
  if (!parsed) return null

  const { producto = '', precio, adelanto, cardId } = parsed || {}
  if (!cardId) return null

  const cards = getCards() || []
  const card = cards.find(c => c.id === cardId)
  if (!card) return null

  const coeficientes = card.coeficientes || {}
  const cuotasKeys = Object.keys(coeficientes || {})
  if (cuotasKeys.length === 0) return null

  const planes = calcularPlanesPorCoeficientes({
    precio,
    adelanto,
    coeficientes
  })

  // a financiar (es constante para todos los planes; lo tomamos del primero o calculamos)
  const anticipo = sanitizeNumber(adelanto)
  const monto = sanitizeNumber(precio)
  const aFinanciar = Number.isFinite(planes?.[0]?.aFinanciar)
    ? planes[0].aFinanciar
    : Math.max(0, monto - anticipo)

  return {
    titulo: String(title || ''),
    producto,
    precio,
    adelanto,
    aFinanciar,
    card,
    planes
  }
}

export default function PlansBoard() {
  const [sel, setSel] = useState({ A: true, B: false, C: false })
  const selectedKeys = useMemo(
    () => Object.entries(sel).filter(([, v]) => v).map(([k]) => k),
    [sel]
  )
  const toggle = (k) => setSel(prev => ({ ...prev, [k]: !prev[k] }))

  // Revisiones por plan para forzar remount tras limpiar
  const [rev, setRev] = useState({ A: 0, B: 0, C: 0 })
  const bumpRevs = (letters) =>
    setRev(prev => {
      const next = { ...prev }
      letters.forEach(k => { next[k] = (prev[k] || 0) + 1 })
      return next
    })

  const printRef = useRef(null)
  const handlePrintSelected = useReactToPrint({
    contentRef: printRef,                 // v3
    content: () => printRef.current,      // fallback v2
    removeAfterPrint: true,
    documentTitle: 'Planes seleccionados (compacto)',
    pageStyle: `
      @page { margin: 10mm; }
      @media print {
        body * { visibility: hidden; }
        #print-collection, #print-collection * { visibility: visible; }
        #print-collection { position: static !important; left: auto !important; top: auto !important; width: auto !important; }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    `
  })

  const chip =
    'inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm ring-1 ' +
    'ring-emerald-200 bg-white text-emerald-900 hover:bg-emerald-50'
  const btnPrimary =
    'inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium ' +
    'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800'
  const btnGhost =
    'inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium ring-1 ring-emerald-200 ' +
    'bg-white text-emerald-900 hover:bg-emerald-50 active:bg-emerald-100'
  const btnDanger =
    'inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium ring-1 ring-rose-200 ' +
    'bg-white text-rose-800 hover:bg-rose-50 active:bg-rose-100'

  /* ─────────────────────────────
     COPIAR SELECCIONADOS (solo texto, SIN plantilla, SIN tasas)
     ───────────────────────────── */
  const copySelected = async () => {
    const blocks = []

    const tryPush = (storageKey, tituloVisible) => {
      const st = readPlanState(storageKey, tituloVisible)
      if (!st) return
      const { producto, precio, adelanto, aFinanciar, card, planes } = st

      // Título en negrita (Markdown-like)
      const header = [
        `**${tituloVisible}**`,
        `Producto: ${producto || '—'}`,
        `Tarjeta: ${card?.nombre || card?.id || '—'}`,
        `Precio: ${fmtARS(precio)}`,
        `Adelanto: ${fmtARS(adelanto)}`,
        `A financiar: ${fmtARS(aFinanciar)}`,
        ''
      ].join('\n')

      // Solo líneas de planes calculados (sin tasas)
      const cuerpo = planes
        .slice()
        .sort((a, b) => (a.cuotas || 0) - (b.cuotas || 0))
        .map(p => [
          `Cuotas: ${p.cuotas}`,
          `Valor de cuota: ${fmtARS(p.valorCuota)}`,
          `Margen necesario: ${fmtARS(p.costoFinal)}`
        ].join('\n'))
        .join('\n\n')

      blocks.push(`${header}${cuerpo}`)
    }

    if (selectedKeys.includes('A')) tryPush(STORAGE_KEYS.A, TITLES.A)
    if (selectedKeys.includes('B')) tryPush(STORAGE_KEYS.B, TITLES.B)
    if (selectedKeys.includes('C')) tryPush(STORAGE_KEYS.C, TITLES.C)

    if (!blocks.length) {
      modal.warning('Nada para copiar', 'Completá al menos un plan con tarjeta y cuotas configuradas.')
      return
    }

    const text = blocks.join('\n\n\n')
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Planes seleccionados copiados.')
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.focus(); ta.select()
      try { document.execCommand('copy') } catch {}
      document.body.removeChild(ta)
      toast.success('Planes seleccionados copiados.')
    }
  }

  /* ─────────────────────────────
     COPIAR SELECCIONADOS (WHATSAPP) — con NEGRITAS, sin tasas, sin duplicados
     ───────────────────────────── */
  const copySelectedWA = async () => {
    const blocks = []

    const tryPush = (storageKey, tituloVisible) => {
      const st = readPlanState(storageKey, tituloVisible)
      if (!st) return
      const { producto, aFinanciar, adelanto, card, planes } = st

      const encabezado = [
        '*PRESUPUESTO:*',
        '',
        `*PRODUCTO:* ${String(producto || '—')}`,
        '',
        `*FINANCIAMIENTO:* Tarjeta: ${card?.nombre || card?.id || '—'}`,
        `*ADELANTO:* ${fmtARS(adelanto)}`,
        `*A FINANCIAR:* ${fmtARS(aFinanciar)}`,
        ''
      ].join('\n')

      const cuerpo = planes
        .slice()
        .sort((a, b) => (a.cuotas || 0) - (b.cuotas || 0))
        .map(p => [
          `*Cuotas:* ${p.cuotas}`,
          `*Valor de cuota:* ${fmtARS(p.valorCuota)}`,
          `*Margen necesario:* ${fmtARS(p.costoFinal)}`
        ].join('\n'))
        .join('\n\n')

      blocks.push(`${encabezado}${cuerpo}`)
    }

    if (selectedKeys.includes('A')) tryPush(STORAGE_KEYS.A, TITLES.A)
    if (selectedKeys.includes('B')) tryPush(STORAGE_KEYS.B, TITLES.B)
    if (selectedKeys.includes('C')) tryPush(STORAGE_KEYS.C, TITLES.C)

    if (!blocks.length) {
      modal.warning('Nada para copiar', 'Completá al menos un plan con tarjeta y cuotas configuradas.')
      return
    }

    const condiciones = [
      '',
      '',
      '*CONDICIONES GENERALES*',
      '',
      '- Los precios indicados son sin incluir costos de patentamiento',
      '- Puede usar varias tarjetas de crédito.',
      '- El monto del patentamiento le informa el vendedor.',
      '- Los precios están sujetos a modificaciones sin previo aviso.',
      '',
      '*VALIDEZ DEL PRESUPUESTO 24 hs*',
      '',
      '¿Le interesa este presupuesto?'
    ].join('\n')

    const text = `${blocks.join('\n\n\n')}${condiciones}`

    try {
      await navigator.clipboard.writeText(text)
      toast.success('Plantillas (WhatsApp) copiadas.')
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.focus(); ta.select()
      try { document.execCommand('copy') } catch {}
      document.body.removeChild(ta)
      toast.success('Plantillas (WhatsApp) copiadas.')
    }
  }

  /* ─────────────────────────────
     LIMPIAR SELECCIONADOS (borra estado y remonta solo esos PlanCard)
     ───────────────────────────── */
  const removePlanLocalState = (storageKey, title) => {
    const derivedKey = `${storageKey}:${normTitle(title)}`
    try { localStorage.removeItem(derivedKey) } catch {}
    try { localStorage.removeItem(storageKey) } catch {}
  }

  const clearSelected = () => {
    const toClear = []
    if (selectedKeys.includes('A')) toClear.push('A')
    if (selectedKeys.includes('B')) toClear.push('B')
    if (selectedKeys.includes('C')) toClear.push('C')

    if (!toClear.length) {
      modal.warning('Nada para limpiar', 'Marcá al menos un plan para limpiar sus campos.')
      return
    }

    toClear.forEach(k => removePlanLocalState(STORAGE_KEYS[k], TITLES[k]))
    bumpRevs(toClear)
    toast.success('Planes seleccionados limpiados.')
  }

  return (
    <>
      {/* Barra de acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button className={chip} onClick={() => toggle('A')}>
            <input type="checkbox" className="mr-1 accent-emerald-600" checked={sel.A} readOnly /> {TITLES.A}
          </button>
          <button className={chip} onClick={() => toggle('B')}>
            <input type="checkbox" className="mr-1 accent-emerald-600" checked={sel.B} readOnly /> {TITLES.B}
          </button>
          <button className={chip} onClick={() => toggle('C')}>
            <input type="checkbox" className="mr-1 accent-emerald-600" checked={sel.C} readOnly /> {TITLES.C}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button className={btnGhost} onClick={copySelected} disabled={selectedKeys.length === 0}>
            Copiar seleccionados (texto)
          </button>
          <button className={btnGhost} onClick={copySelectedWA} disabled={selectedKeys.length === 0}>
            Copiar seleccionados (WhatsApp)
          </button>
          <button className={btnDanger} onClick={clearSelected} disabled={selectedKeys.length === 0}>
            {/* ícono tacho */}
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 -ml-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
            </svg>
            Limpiar seleccionados
          </button>
          <button className={btnPrimary} onClick={handlePrintSelected} disabled={selectedKeys.length === 0}>
            Imprimir seleccionados (compacto)
          </button>
        </div>
      </div>

      {/* Tres planes visibles — NO imprimir */}
      <div className="grid gap-4 print:hidden">
        <PlanCard key={`A-${rev.A}`} title={TITLES.A} storageKey={STORAGE_KEYS.A} />
        <PlanCard key={`B-${rev.B}`} title={TITLES.B} storageKey={STORAGE_KEYS.B} />
        <PlanCard key={`C-${rev.C}`} title={TITLES.C} storageKey={STORAGE_KEYS.C} />
      </div>

      {/* Contenedor de impresión: SIEMPRE montado, pero FUERA de pantalla (no hidden) */}
      <div
        id="print-collection"
        ref={printRef}
        className="absolute -left-[99999px] top-0 w-[900px] print:static print:left-auto print:top-auto print:w-auto"
        aria-hidden="true"
      >
        <div className="p-0">
          {selectedKeys.includes('A') && (
            <section style={{ pageBreakInside: 'avoid', breakInside: 'avoid', marginBottom: '10mm' }}>
              <PlanCard key={`print-A-${rev.A}`} title={TITLES.A} storageKey={STORAGE_KEYS.A} forceCompact hideActions />
            </section>
          )}
          {selectedKeys.includes('B') && (
            <section style={{ pageBreakInside: 'avoid', breakInside: 'avoid', marginBottom: '10mm' }}>
              <PlanCard key={`print-B-${rev.B}`} title={TITLES.B} storageKey={STORAGE_KEYS.B} forceCompact hideActions />
            </section>
          )}
          {selectedKeys.includes('C') && (
            <section style={{ pageBreakInside: 'avoid', breakInside: 'avoid', marginBottom: '10mm' }}>
              <PlanCard key={`print-C-${rev.C}`} title={TITLES.C} storageKey={STORAGE_KEYS.C} forceCompact hideActions />
            </section>
          )}
        </div>
      </div>
    </>
  )
}