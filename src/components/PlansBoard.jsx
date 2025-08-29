// src/components/PlansBoard.jsx
import React, { useMemo, useRef, useState } from 'react'
import { useReactToPrint } from 'react-to-print'
import PlanCard from './PlanCard'
import { calcularPlanesPorCoeficientes } from '../utils/finance'
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

// Obtiene estado guardado de un PlanCard desde localStorage y resuelve tarjeta/planes
function readPlanState(storageKey) {
  const raw = localStorage.getItem(storageKey)
  if (!raw) return null
  let st; try { st = JSON.parse(raw) } catch { return null }
  const { producto = '', precio, adelanto, cardId } = st || {}
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

  return {
    titulo: '',
    producto,
    precio,
    adelanto,
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

  /* ─────────────────────────────
     COPIAR SELECCIONADOS (solo texto, SIN plantilla, SIN tasas)
     ───────────────────────────── */
  const copySelected = async () => {
    const blocks = []

    const tryPush = (storageKey, titulo) => {
      const st = readPlanState(storageKey)
      if (!st) return
      const { producto, precio, adelanto, card, planes } = st

      // Título en negrita (Markdown-like)
      const header = [
        `**${titulo}**`,
        `Producto: ${producto || '—'}`,
        `Tarjeta: ${card?.nombre || card?.id || '—'}`,
        `Precio: ${fmtARS(precio)}`,
        `Adelanto: ${fmtARS(adelanto)}`,
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

    if (selectedKeys.includes('A')) tryPush('fin_motos_plan_A_v1', 'Plan A')
    if (selectedKeys.includes('B')) tryPush('fin_motos_plan_B_v1', 'Plan B')
    if (selectedKeys.includes('C')) tryPush('fin_motos_plan_C_v1', 'Plan C')

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
     Formato:
       *PRESUPUESTO:*
       *PRODUCTO:* ...
       *FINANCIAMIENTO:* Tarjeta: ...
       (listado de cuotas)
     + Condiciones generales UNA SOLA VEZ al final
     ───────────────────────────── */
  const copySelectedWA = async () => {
    const blocks = []

    const tryPush = (storageKey) => {
      const st = readPlanState(storageKey)
      if (!st) return
      const { producto, card, planes } = st

      const encabezado = [
        '*PRESUPUESTO:*',
        '',
        `*PRODUCTO:* ${String(producto || '—')}`,
        '',
        `*FINANCIAMIENTO:* Tarjeta: ${card?.nombre || card?.id || '—'}`,
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

    if (selectedKeys.includes('A')) tryPush('fin_motos_plan_A_v1')
    if (selectedKeys.includes('B')) tryPush('fin_motos_plan_B_v1')
    if (selectedKeys.includes('C')) tryPush('fin_motos_plan_C_v1')

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
