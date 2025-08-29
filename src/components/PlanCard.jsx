// src/components/PlanCard.jsx
import React, { useEffect, useMemo, useRef, useState, forwardRef } from 'react'
import { useReactToPrint } from 'react-to-print'
import {
  fmtARS,
  fmtARSCompact,
  sanitizeNumber,
  calcularPlanesPorCoeficientes,
  plantillaPresupuestoWA
} from '../utils/finance'
import { getCards, loadCardsAsync } from '../lib/cardsStorage'
import { modal, toast } from '../lib/alerts'

const PlanCard = forwardRef(function PlanCard(
  { title = 'Plan', storageKey = 'fin_motos_plan_state_v1', forceCompact = false, hideActions = false },
  _ref
) {
  const [open, setOpen] = useState(true)
  const [compact, setCompact] = useState(false)

  // Tarjetas (carga y refrescos)
  const [cards, setCards] = useState(() => getCards() || [])
  useEffect(() => {
    (async () => setCards((await loadCardsAsync()) || []))()
    const h = async () => setCards((await loadCardsAsync()) || [])
    window.addEventListener('cards:updated', h)
    const onVis = () => { if (document.visibilityState === 'visible') h() }
    const onFocus = () => h()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onFocus)
    const id = setInterval(h, 60000)
    return () => {
      window.removeEventListener('cards:updated', h)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onFocus)
      clearInterval(id)
    }
  }, [])

  // Estado de entradas + persistencia
  const [producto, setProducto] = useState('')
  const [precio, setPrecio] = useState('')
  const [adelanto, setAdelanto] = useState('')
  const [cardId, setCardId] = useState('')

  const hydratedRef = useRef(false)
  const persistTimer = useRef(null)

  // Hidratar desde localStorage
  useEffect(() => {
    if (hydratedRef.current) return
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const st = JSON.parse(raw)
        if (st && typeof st === 'object') {
          setProducto(st.producto !== undefined ? String(st.producto) : '')
          setPrecio(st.precio !== undefined ? String(st.precio) : '')
          setAdelanto(st.adelanto !== undefined ? String(st.adelanto) : '')
          setCardId(st.cardId || '')
          setCompact(!!st.compact)
          setOpen(st.open === undefined ? true : !!st.open)
        }
      }
    } catch {}
    hydratedRef.current = true
  }, [storageKey])

  // Guardar en localStorage (debounced)
  useEffect(() => {
    if (!hydratedRef.current) return
    clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ producto, precio, adelanto, cardId, compact, open })
      )
    }, 250)
    return () => clearTimeout(persistTimer.current)
  }, [producto, precio, adelanto, cardId, compact, open, storageKey])

  // Defaults válidos para tarjeta
  useEffect(() => {
    if (cards.length === 0) { if (cardId) setCardId(''); return }
    if (!cardId || !cards.some(c => c.id === cardId)) setCardId(cards[0].id)
  }, [cards, cardId])

  const selectedCard = useMemo(() => cards.find(c => c.id === cardId) || null, [cards, cardId])

  const availableCuotas = useMemo(() => {
    if (!selectedCard) return []
    return Object.keys(selectedCard.coeficientes || {})
      .map(n => Number(n))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b)
  }, [selectedCard])

  // Cálculo de todos los planes segun coeficientes de la tarjeta
  const planes = useMemo(() => {
    if (!selectedCard) return []
    return calcularPlanesPorCoeficientes({
      precio,
      adelanto,
      coeficientes: selectedCard.coeficientes || {}
    })
  }, [precio, adelanto, selectedCard])

  const ready =
    sanitizeNumber(precio) > 0 &&
    sanitizeNumber(adelanto) >= 0 &&
    !!selectedCard &&
    availableCuotas.length > 0

  // UI helpers
  const inputBase =
    'mt-1 w-full rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm ' +
    'focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500'

  const isCompact = forceCompact || compact
  const kpiNumber = isCompact ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl'
  const tableText = isCompact ? 'text-sm' : 'text-[15px] sm:text-base'
  const sectionGap = isCompact ? 'gap-3' : 'gap-4'
  const cardPadding = isCompact ? 'p-3' : 'p-4'

  // Nodo a imprimir (react-to-print v3)
  const componentRef = useRef(null)
  const handlePrint = useReactToPrint({
    contentRef: componentRef,
    removeAfterPrint: false,
    documentTitle: title || 'Plan',
    pageStyle: `
      @page { margin: 10mm; }
      @media print {
        body * { visibility: hidden; }
        .print-solo, .print-solo * { visibility: visible; }
        .print-solo { position: static !important; left: auto !important; top: auto !important; }
      }
    `
  })

  // Copiar SOLO los bloques de planes (sin encabezados/condiciones)
  const copyPlansOnly = async () => {
    if (!ready) {
      modal.warning('Faltan datos', 'Completá el plan antes de copiar.')
      return
    }
    const bloques = [...planes]
      .sort((a, b) => (a.cuotas || 0) - (b.cuotas || 0))
      .map((p) =>
        [
          `Cuotas: ${p.cuotas}`,
          `Valor de cuota: ${fmtARS(p.valorCuota)}`,   // 2 decimales
          `Margen necesario: ${fmtARS(p.costoFinal)}`
        ].join('\n')
      )
      .join('\n\n')

    try {
      await navigator.clipboard.writeText(bloques)
      toast.success('Planes copiados.')
    } catch {
      const ta = document.createElement('textarea')
      ta.value = bloques
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.focus(); ta.select()
      try { document.execCommand('copy') } catch {}
      document.body.removeChild(ta)
      toast.success('Planes copiados.')
    }
  }

  // Copiar plantilla completa en formato WhatsApp (con negritas)
  const copyTemplateWA = async () => {
    if (!ready) {
      modal.warning('Faltan datos', 'Completá el plan antes de copiar.')
      return
    }
    const tarjetaNombre = selectedCard?.nombre || '—'
    const text = plantillaPresupuestoWA({ producto, tarjetaNombre, planes })
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Plantilla WA copiada.')
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.focus(); ta.select()
      try { document.execCommand('copy') } catch {}
      document.body.removeChild(ta)
      toast.success('Plantilla WA copiada.')
    }
  }

  return (
    <div
      ref={componentRef}
      className={`rounded-xl bg-white shadow-sm ring-1 ring-emerald-100 ${cardPadding} print-solo`}
    >
      {/* Header + acciones */}
      <div className="w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <button className="flex-1 text-left" onClick={() => setOpen(!open)} title={open ? 'Cerrar' : 'Abrir'}>
          <span className="text-base sm:text-lg font-semibold text-emerald-900">{title}</span>
          <span className="ml-2 text-emerald-700 text-sm">{open ? '▲' : '▼'}</span>
        </button>

        {!hideActions && (
          <div className="flex items-center gap-2 print:hidden">
            <label className="inline-flex items-center gap-2 text-sm text-emerald-900">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                checked={isCompact}
                onChange={(e) => setCompact(e.target.checked)}
              />
              Modo compacto
            </label>

            <button
              type="button"
              onClick={copyPlansOnly}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium ring-1 ring-emerald-200 text-emerald-900 bg-white hover:bg-emerald-50 active:bg-emerald-100"
              title="Copiar solo los planes"
              disabled={!ready}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              Copiar plantilla
            </button>

            <button
              type="button"
              onClick={copyTemplateWA}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium ring-1 ring-emerald-200 text-emerald-900 bg-white hover:bg-emerald-50 active:bg-emerald-100"
              title="Copiar plantilla (WhatsApp)"
              disabled={!ready}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 3h5v5"/><path d="M21 3l-7 7"/><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M3 3l7 7"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M3 21l7-7"/>
              </svg>
              Copiar plantilla (WA)
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800"
              title="Imprimir / Exportar PDF"
              disabled={!ready}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>
              </svg>
              Imprimir / PDF
            </button>
          </div>
        )}
      </div>

      {open && (
        <div className={`mt-4 grid ${sectionGap} lg:grid-cols-[420px,1fr] print:grid-cols-1`}>
          {/* Inputs — NO imprimir */}
          <div className="grid gap-3 print:hidden">
            <label className="block">
              <span className="text-sm font-semibold text-emerald-900">Producto</span>
              <input
                className={inputBase}
                type="text"
                placeholder="Ej: Corven"
                value={producto}
                onChange={(e) => setProducto(e.target.value)}
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-emerald-900">Precio / Monto base</span>
              <input
                className={inputBase}
                type="number"
                inputMode="decimal"
                placeholder="Ej: 2.500.000"
                value={precio}
                onChange={e => setPrecio(e.target.value)}
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-emerald-900">Adelanto</span>
              <input
                className={inputBase}
                type="number"
                inputMode="decimal"
                placeholder="Ej: 500.000"
                value={adelanto}
                onChange={e => setAdelanto(e.target.value)}
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-emerald-900">Tarjeta</span>
              <select
                className={inputBase}
                value={cardId}
                onChange={e => setCardId(e.target.value)}
              >
                {cards.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </label>

            {!availableCuotas.length && (
              <div className="text-xs text-amber-700">
                ⚠ Esta tarjeta no tiene cuotas configuradas. Cargalas en “Configurar tarjetas”.
              </div>
            )}
          </div>

          {/* Resultados */}
          <div className="grid gap-4">
            {!ready && (
              <div className="p-4 rounded-md bg-emerald-50 ring-1 ring-emerald-100 text-emerald-900 text-sm">
                Completá los campos y elegí una tarjeta con cuotas configuradas para ver los planes.
              </div>
            )}

            {ready && (
              <>
                {/* KPIs base */}
                <div className={`grid ${isCompact ? 'gap-2' : 'gap-3'} sm:grid-cols-3`}>
                  <div className="rounded-lg bg-white ring-1 ring-emerald-100 p-3">
                    <div className="text-[11px] uppercase tracking-wide text-emerald-700 font-semibold">Producto</div>
                    <div className={`mt-1 font-extrabold text-emerald-900 leading-tight ${kpiNumber}`}>
                      {producto || '—'}
                    </div>
                    <div className="text-xs text-emerald-700">{selectedCard?.nombre || '—'}</div>
                  </div>

                  <div className="rounded-lg bg-emerald-50 ring-1 ring-emerald-100 p-3">
                    <div className="text-[11px] uppercase tracking-wide text-emerald-700 font-semibold">Monto</div>
                    <div className={`mt-1 font-extrabold text-emerald-900 leading-tight ${kpiNumber}`}>
                      {fmtARS(sanitizeNumber(precio))}
                    </div>
                    <div className="text-xs text-emerald-700">Precio / Monto base</div>
                  </div>

                  <div className="rounded-lg bg-white ring-1 ring-emerald-100 p-3">
                    <div className="text-[11px] uppercase tracking-wide text-emerald-700 font-semibold">Adelanto</div>
                    <div className={`mt-1 font-extrabold text-emerald-900 leading-tight ${kpiNumber}`}>
                      {fmtARS(sanitizeNumber(adelanto))}
                    </div>
                    <div className="text-xs text-emerald-700">Se descuenta del monto</div>
                  </div>
                </div>

                {/* Listado de planes por cuotas */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {planes.map((p) => (
                    <div key={p.cuotas} className="rounded-lg ring-1 ring-emerald-100 p-3 bg-white">
                      <div className="text-sm font-semibold text-emerald-900">
                        Cuotas: <span className="font-extrabold">{p.cuotas}</span>
                      </div>
                      <div className="mt-2 text-[13px] text-emerald-700">Valor de cuota</div>
                      <div className={`leading-tight font-extrabold text-emerald-900 ${isCompact ? 'text-xl' : 'text-2xl'}`}>
                        {fmtARSCompact(p.valorCuota)}
                      </div>
                      <div className="mt-2 text-[13px] text-emerald-700">Margen necesario</div>
                      <div className={`leading-tight font-extrabold text-emerald-900 ${isCompact ? 'text-lg' : 'text-xl'}`}>
                        {fmtARSCompact(p.costoFinal)}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Detalle extendido (solo si NO es compacto) */}
                {!isCompact && (
                  <div className="rounded-lg ring-1 ring-emerald-100 overflow-hidden">
                    <table className={`min-w-full ${tableText}`}>
                      <tbody className="divide-y divide-emerald-100">
                        <tr>
                          <td className="py-3 pl-3 sm:pl-4 pr-4 font-semibold text-emerald-900">Tarjeta</td>
                          <td className="py-3 pr-3 sm:pr-4 text-emerald-900">{selectedCard?.nombre || '—'}</td>
                        </tr>
                        <tr>
                          <td className="py-3 pl-3 sm:pl-4 pr-4 font-semibold text-emerald-900">Cuotas disponibles</td>
                          <td className="py-3 pr-3 sm:pr-4 text-emerald-900">
                            {availableCuotas.join(', ')}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-3 pl-3 sm:pl-4 pr-4 font-semibold text-emerald-900">A financiar</td>
                          <td className="py-3 pr-3 sm:pr-4 text-emerald-900">
                            {fmtARS(Math.max(0, sanitizeNumber(precio) - sanitizeNumber(adelanto)))}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-3 pl-3 sm:pl-4 pr-4 font-semibold text-emerald-900">Nota</td>
                          <td className="py-3 pr-3 sm:pr-4 text-emerald-700">
                            Los valores por cuota y margen necesario varían según el coeficiente configurado por cantidad de cuotas.
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
})

export default PlanCard
