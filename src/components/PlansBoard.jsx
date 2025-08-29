// src/components/PlansBoard.jsx
import React, { useMemo, useRef, useState } from 'react'
import { useReactToPrint } from 'react-to-print'
import PlanCard from './PlanCard'
import {
  calcularPlanesPorCoeficientes,
  plantillaPresupuesto,
  plantillaPresupuestoWA,
} from '../utils/finance'
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

// Lista ordenada "cuotas: porcentaje" desde coeficientes
const buildTasasPorCuota = (coeficientes = {}) => {
  const pares = Object.entries(coeficientes)
    .map(([k, v]) => [Number(k), Number(v)])
    .filter(([cuotas, pct]) => Number.isFinite(cuotas) && cuotas > 0 && Number.isFinite(pct) && pct >= 0)
    .sort((a, b) => a[0] - b[0])

  if (!pares.length) return '—'

  return pares.map(([cuotas, pct]) => `${cuotas} cuotas: ${pct}%`).join('\n')
}

export default function PlansBoard() {
  const [sel, setSel] = useState({ A: true, B: false, C: false })
  const selectedKeys = useMemo(
    () => Object.entries(sel).filter(([, v]) => v).map(([k]) => k),
    [sel]
  )
  const toggle = (k) => setSel(prev => ({ ...prev, [k]: !prev[k] }))

  const printRef = useRef(null)
  const handlePrintSelected = useReactToPrint({
    contentRef: printRef,                 // v3
    content: () => printRef.current,      // fallback v2
    removeAfterPrint: true,
    documentTitle: 'Planes seleccionados (compacto)',
    pageStyle: `
      @page { margin: 10mm; }
      @media print {
        /* Ocultar TODO menos el contenedor de impresión */
        body * { visibility: hidden; }
        #print-collection, #print-collection * { visibility: visible; }
        /* Reincorporarlo al flujo normal en print */
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

  /* ─────────────────────────────
     Build de PLANTILLA COMPLETA (se mantiene para WhatsApp)
     ───────────────────────────── */
  const buildPlantillaFromKey = (key) => {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    let st; try { st = JSON.parse(raw) } catch { return null }

    const { producto = '', precio, adelanto, cardId } = st || {}
    if (!cardId) return null

    const cards = getCards() || []
    const card = cards.find(c => c.id === cardId)
    if (!card) return null

    const coeficientes = card.coeficientes || {}
    const cuotasKeys = Object.keys(coeficientes)
    if (cuotasKeys.length === 0) return null

    const planes = calcularPlanesPorCoeficientes({
      precio,
      adelanto,
      coeficientes
    })

    return plantillaPresupuesto({
      producto,
      tarjetaNombre: card.nombre || '',
      planes
    })
  }

  const buildPlantillaWAFromKey = (key) => {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    let st; try { st = JSON.parse(raw) } catch { return null }

    const { producto = '', precio, adelanto, cardId } = st || {}
    if (!cardId) return null

    const cards = getCards() || []
    const card = cards.find(c => c.id === cardId)
    if (!card) return null

    const coeficientes = card.coeficientes || {}
    const cuotasKeys = Object.keys(coeficientes)
    if (cuotasKeys.length === 0) return null

    const planes = calcularPlanesPorCoeficientes({
      precio,
      adelanto,
      coeficientes
    })

    return plantillaPresupuestoWA({
      producto,
      tarjetaNombre: card.nombre || '',
      planes
    })
  }

  /* ─────────────────────────────
     NUEVO: Resumen simple para “Copiar seleccionados (texto)”
     - SOLO planes seleccionados
     - SIN plantilla
     - Incluye Producto y Tarjeta
     - Lista tasas por cuota
     ───────────────────────────── */
  const buildResumenSimpleFromKey = (key, tituloPlan) => {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    let st; try { st = JSON.parse(raw) } catch { return null }

    const { producto = '', precio, adelanto, cardId } = st || {}
    if (!cardId) return null

    const cards = getCards() || []
    const card = cards.find(c => c.id === cardId)
    if (!card) return null

    const coeficientes = card.coeficientes || {}
    if (!Object.keys(coeficientes).length) return null

    // Texto sin plantilla, con Producto + Tarjeta + Tasas por cuota
    const lineas = [
      `${tituloPlan || 'Plan'}`,
      producto ? `Producto: ${producto}` : null,
      card?.nombre ? `Tarjeta: ${card.nombre}` : `Tarjeta: ${card.id}`,
      (precio != null) ? `Precio: ${fmtARS(precio)}` : null,
      (adelanto != null && Number(adelanto) > 0) ? `Adelanto: ${fmtARS(adelanto)}` : null,
      '',
      'Tasas por cuota:',
      buildTasasPorCuota(coeficientes)
    ].filter(Boolean)

    return lineas.join('\n')
  }

  const copySelected = async () => {
    const parts = []
    if (selectedKeys.includes('A')) {
      const s = buildResumenSimpleFromKey('fin_motos_plan_A_v1', 'Plan A'); if (s) parts.push(s)
    }
    if (selectedKeys.includes('B')) {
      const s = buildResumenSimpleFromKey('fin_motos_plan_B_v1', 'Plan B'); if (s) parts.push(s)
    }
    if (selectedKeys.includes('C')) {
      const s = buildResumenSimpleFromKey('fin_motos_plan_C_v1', 'Plan C'); if (s) parts.push(s)
    }

    if (parts.length === 0) {
      modal.warning('Nada para copiar', 'Completá al menos un plan con tarjeta y cuotas configuradas.')
      return
    }

    const text = parts.join('\n\n')
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

  const copySelectedWA = async () => {
    const parts = []
    if (selectedKeys.includes('A')) {
      const s = buildPlantillaWAFromKey('fin_motos_plan_A_v1'); if (s) parts.push(s)
    }
    if (selectedKeys.includes('B')) {
      const s = buildPlantillaWAFromKey('fin_motos_plan_B_v1'); if (s) parts.push(s)
    }
    if (selectedKeys.includes('C')) {
      const s = buildPlantillaWAFromKey('fin_motos_plan_C_v1'); if (s) parts.push(s)
    }

    if (parts.length === 0) {
      modal.warning('Nada para copiar', 'Completá al menos un plan con tarjeta y cuotas configuradas.')
      return
    }

    const text = parts.join('\n\n')
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

  return (
    <>
      {/* Barra de acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button className={chip} onClick={() => toggle('A')}>
            <input type="checkbox" className="mr-1 accent-emerald-600" checked={sel.A} readOnly /> Plan A
          </button>
          <button className={chip} onClick={() => toggle('B')}>
            <input type="checkbox" className="mr-1 accent-emerald-600" checked={sel.B} readOnly /> Plan B
          </button>
          <button className={chip} onClick={() => toggle('C')}>
            <input type="checkbox" className="mr-1 accent-emerald-600" checked={sel.C} readOnly /> Plan C
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button className={btnGhost} onClick={copySelected} disabled={selectedKeys.length === 0}>
            Copiar seleccionados (texto)
          </button>
          <button className={btnGhost} onClick={copySelectedWA} disabled={selectedKeys.length === 0}>
            Copiar seleccionados (WhatsApp)
          </button>
          <button className={btnPrimary} onClick={handlePrintSelected} disabled={selectedKeys.length === 0}>
            Imprimir seleccionados (compacto)
          </button>
        </div>
      </div>

      {/* Tres planes visibles — NO imprimir */}
      <div className="grid gap-4 print:hidden">
        <PlanCard title="Plan A" storageKey="fin_motos_plan_A_v1" />
        <PlanCard title="Plan B" storageKey="fin_motos_plan_B_v1" />
        <PlanCard title="Plan C" storageKey="fin_motos_plan_C_v1" />
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
              <PlanCard title="Plan A" storageKey="fin_motos_plan_A_v1" forceCompact hideActions />
            </section>
          )}
          {selectedKeys.includes('B') && (
            <section style={{ pageBreakInside: 'avoid', breakInside: 'avoid', marginBottom: '10mm' }}>
              <PlanCard title="Plan B" storageKey="fin_motos_plan_B_v1" forceCompact hideActions />
            </section>
          )}
          {selectedKeys.includes('C') && (
            <section style={{ pageBreakInside: 'avoid', breakInside: 'avoid', marginBottom: '10mm' }}>
              <PlanCard title="Plan C" storageKey="fin_motos_plan_C_v1" forceCompact hideActions />
            </section>
          )}
        </div>
      </div>
    </>
  )
}
