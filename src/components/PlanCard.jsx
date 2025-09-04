// src/components/PlanCard.jsx
import React, { useEffect, useMemo, useRef, useState, forwardRef } from 'react'
import { useReactToPrint } from 'react-to-print'
import {
  fmtARS,
  fmtARSCompact,
  sanitizeNumber,
  calcularPlanesPorCoeficientes,
} from '../utils/finance'
import { getCards, loadCardsAsync } from '../lib/cardsStorage'
import { modal, toast } from '../lib/alerts'

const PlanCard = forwardRef(function PlanCard(
  { title = 'Plan', storageKey = 'fin_motos_plan_state_v1', forceCompact = false, hideActions = false },
  _ref
) {
  const [open, setOpen] = useState(true)
  const [compact, setCompact] = useState(false)

  const derivedStorageKey = useMemo(() => {
    const t = (title || 'Plan').trim().toLowerCase().replace(/\s+/g, '-')
    return `${storageKey}:${t}`
  }, [storageKey, title])

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

  const [producto, setProducto] = useState('')
  const [precio, setPrecio] = useState('')     // solo dígitos
  const [adelanto, setAdelanto] = useState('') // solo dígitos
  const [cardId, setCardId] = useState('')

  const hydratedRef = useRef(false)
  const persistTimer = useRef(null)

  // limpiar a dígitos
  const digitsOnly = (s) => String(s || '').replace(/[^\d]/g, '')
  const onChangeDigits = (setter) => (e) => setter(digitsOnly(e.target.value))
  const onPasteDigits = (setter) => (e) => {
    try {
      e.preventDefault()
      const text = (e.clipboardData || window.clipboardData).getData('text')
      setter(digitsOnly(text))
    } catch {}
  }

  useEffect(() => {
    if (hydratedRef.current) return
    try {
      const raw = localStorage.getItem(derivedStorageKey)
      if (raw) {
        const st = JSON.parse(raw)
        if (st && typeof st === 'object') {
          setProducto(st.producto !== undefined ? String(st.producto) : '')
          setPrecio(st.precio !== undefined ? digitsOnly(st.precio) : '')
          setAdelanto(st.adelanto !== undefined ? digitsOnly(st.adelanto) : '')
          setCardId(st.cardId || '')
          setCompact(!!st.compact)
          setOpen(st.open === undefined ? true : !!st.open)
        }
      }
    } catch {}
    hydratedRef.current = true
  }, [derivedStorageKey])

  useEffect(() => {
    if (!hydratedRef.current) return
    clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      localStorage.setItem(
        derivedStorageKey,
        JSON.stringify({ producto, precio, adelanto, cardId, compact, open })
      )
    }, 250)
    return () => clearTimeout(persistTimer.current)
  }, [producto, precio, adelanto, cardId, compact, open, derivedStorageKey])

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

  const coefEntries = useMemo(() => {
    if (!selectedCard) return []
    return Object.entries(selectedCard.coeficientes || {})
      .map(([k, v]) => ({ cuotas: Number(k), pct: Number(v) }))
      .filter(x => Number.isFinite(x.cuotas) && x.cuotas > 0 && Number.isFinite(x.pct) && x.pct >= 0)
      .sort((a, b) => a.cuotas - b.cuotas)
  }, [selectedCard])

  const tasasPorCuotaText = useMemo(() => {
    if (!coefEntries.length) return '—'
    return coefEntries.map(({ cuotas, pct }) => `${cuotas}: ${pct}%`).join(' • ')
  }, [coefEntries])

  const tasasResumen = useMemo(() => {
    if (!coefEntries.length) return null
    const pcts = coefEntries.map(e => e.pct)
    const min = Math.min(...pcts)
    const max = Math.max(...pcts)
    const avg = pcts.reduce((a, b) => a + b, 0) / pcts.length
    return { min, max, avg }
  }, [coefEntries])

  const planes = useMemo(() => {
    if (!selectedCard) return []
    return calcularPlanesPorCoeficientes({
      precio,
      adelanto,
      coeficientes: selectedCard.coeficientes || {}
    })
  }, [precio, adelanto, selectedCard])

  const monto = sanitizeNumber(precio)
  const anticipo = sanitizeNumber(adelanto)
  const aFinanciar = Math.max(0, monto - anticipo)

  const ready =
    monto > 0 &&
    anticipo >= 0 &&
    !!selectedCard &&
    availableCuotas.length > 0

  const inputBase =
    'mt-1 w-full rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm ' +
    'focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500'

  const isCompact = forceCompact || compact
  const kpiNumber = isCompact ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl'
  const tableText = isCompact ? 'text-sm' : 'text-[15px] sm:text-base'
  const sectionGap = isCompact ? 'gap-3' : 'gap-4'
  const cardPadding = isCompact ? 'p-3' : 'p-4'

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

  const clearPlan = () => {
    setProducto('')
    setPrecio('')
    setAdelanto('')
    try { localStorage.removeItem(derivedStorageKey) } catch {}
    toast.info('Plan limpiado.')
  }

  // TEXTO — sin precio visible; con línea extra tras "A financiar"
  const copyPlansOnly = async () => {
    if (!ready) {
      modal.warning('Faltan datos', 'Completá el plan antes de copiar.')
      return
    }

    const header = [
      `**${title || 'Plan'}**`,
      '',
      `Producto: ${producto || '—'}`,
      '',
      `Financiamiento: Tarjeta: ${selectedCard?.nombre || selectedCard?.id || '—'}`,
      '',
      `Anticipo: ${fmtARS(anticipo)}`,
      '',
      `A financiar: ${fmtARS(aFinanciar)}`,
      '',
      '', // ← línea extra antes de las cuotas
    ].join('\n')

    const bloques = [...planes]
      .sort((a, b) => (a.cuotas || 0) - (b.cuotas || 0))
      .map((p) =>
        [
          `Cuotas: ${p.cuotas}`,
          `  Valor de cuota: ${fmtARS(p.valorCuota)}`,
          `  Margen necesario: ${fmtARS(p.costoFinal)}`
        ].join('\n')
      )
      .join('\n\n')

    const text = `${header}${bloques}\n`

    try {
      await navigator.clipboard.writeText(text)
      toast.success('Plan copiado.')
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.focus(); ta.select()
      try { document.execCommand('copy') } catch {}
      document.body.removeChild(ta)
      toast.success('Plan copiado.')
    }
  }

  // WHATSAPP — sin precio visible; con línea extra tras "*A FINANCIAR*"
  const copyTemplateWA = async () => {
    if (!ready) {
      modal.warning('Faltan datos', 'Completá el plan antes de copiar.')
      return
    }

    const encabezado = [
      '*PRESUPUESTO:*',
      '',
      `*PRODUCTO:* ${String(producto || '—')}`,
      '',
      `*FINANCIAMIENTO:* Tarjeta: ${selectedCard?.nombre || selectedCard?.id || '—'}`,
      '',
      `*ANTICIPO:* ${fmtARS(anticipo)}`,
      '',
      `*A FINANCIAR:* ${fmtARS(aFinanciar)}`,
      '',
      '', // ← línea extra antes de las cuotas
    ].join('\n')

    const cuerpo = [...planes]
      .sort((a, b) => (a.cuotas || 0) - (b.cuotas || 0))
      .map(p => [
        `*Cuotas:* ${p.cuotas}`,
        `  Valor de cuota: ${fmtARS(p.valorCuota)}`,
        `  Margen necesario: ${fmtARS(p.costoFinal)}`
      ].join('\n'))
      .join('\n\n')

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

    const text = `${encabezado}${cuerpo}${condiciones}`

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
              title="Copiar este plan (texto)"
              disabled={!ready}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              Copiar plan
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
                <path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-3"/><path d="M3 21l7-7"/>
              </svg>
              Imprimir / PDF
            </button>

            <button
              type="button"
              onClick={clearPlan}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium ring-1 ring-rose-200 text-rose-800 bg-white hover:bg-rose-50 active:bg-rose-100"
              title="Limpiar campos de este plan"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
              </svg>
              Limpiar plan
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
                type="text"
                inputMode="numeric"
                placeholder="Ej: 1500000"
                value={precio}
                onChange={onChangeDigits(setPrecio)}
                onPaste={onPasteDigits(setPrecio)}
              />
              <div className="mt-1 text-[11px] text-emerald-700">
                Solo números (sin puntos ni comas). Ej: <span className="font-semibold">1500000</span>
              </div>
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-emerald-900">Adelanto</span>
              <input
                className={inputBase}
                type="text"
                inputMode="numeric"
                placeholder="Ej: 500000"
                value={adelanto}
                onChange={onChangeDigits(setAdelanto)}
                onPaste={onPasteDigits(setAdelanto)}
              />
              <div className="mt-1 text-[11px] text-emerald-700">
                Solo números (sin puntos ni comas).
              </div>
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
                      {fmtARS(monto)}
                    </div>
                    <div className="text-xs text-emerald-700">Precio / Monto base</div>
                  </div>

                  <div className="rounded-lg bg-white ring-1 ring-emerald-100 p-3">
                    <div className="text-[11px] uppercase tracking-wide text-emerald-700 font-semibold">Adelanto</div>
                    <div className={`mt-1 font-extrabold text-emerald-900 leading-tight ${kpiNumber}`}>
                      {fmtARS(anticipo)}
                    </div>
                    <div className="text-xs text-emerald-700">Se descuenta del monto</div>
                  </div>
                </div>

                {/* Listado de planes */}
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

                {/* Detalle extendido (SOLO NO compacto) */}
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
                          <td className="py-3 pl-3 sm:pl-4 pr-4 font-semibold text-emerald-900">Tasas por cuota</td>
                          <td className="py-3 pr-3 sm:pr-4 text-emerald-900">
                            {tasasPorCuotaText}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-3 pl-3 sm:pl-4 pr-4 font-semibold text-emerald-900">A financiar</td>
                          <td className="py-3 pr-3 sm:pr-4 text-emerald-900">
                            {fmtARS(aFinanciar)}
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