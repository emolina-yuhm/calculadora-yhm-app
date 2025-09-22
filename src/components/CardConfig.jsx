import { useEffect, useMemo, useRef, useState } from 'react'
import Swal from 'sweetalert2'
import { getCards, upsertCard, deleteCard, loadCardsAsync, editCard } from '../lib/cardsStorage'
import { saveCardsBackground, replaceAllCards } from '../lib/cardsApi'

export default function CardConfig() {
  const [cards, setCards] = useState(getCards() || [])
  const [selected, setSelected] = useState(cards[0]?.id || '')
  const current = useMemo(() => cards.find(c => c.id === selected), [cards, selected])

  const [form, setForm] = useState(() => current || { id: '', nombre: '', coeficientes: {} })

  // AutoSave
  const [autoSave, setAutoSave] = useState(true)
  const debounceTimer = useRef(null)
  const prevIdRef = useRef(selected)

  // Inputs para agregar cuota
  const [newCuota, setNewCuota] = useState('')
  const [newCoef, setNewCoef] = useState('')

  // Banner "Guardando…"
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const savedTimer = useRef(null)

  const startSavingBanner = () => {
    setJustSaved(false)
    setSaving(true)
    if (savedTimer.current) clearTimeout(savedTimer.current)
  }
  const showSavedBannerSoon = () => {
    setSaving(false)
    setJustSaved(true)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setJustSaved(false), 1200)
  }
  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current) }, [])

  // Cargar desde API al montar
  useEffect(() => {
    (async () => {
      const fresh = await loadCardsAsync()
      setCards(fresh)
      if (fresh.length && !selected) setSelected(fresh[0].id)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Escuchar actualizaciones locales/externas
  useEffect(() => {
    const h = async () => setCards(await loadCardsAsync())
    window.addEventListener('cards:updated', h)
    return () => window.removeEventListener('cards:updated', h)
  }, [])

  const selectCard = (id) => {
    setSelected(id)
    const found = cards.find(c => c.id === id)
    if (found) {
      setForm(JSON.parse(JSON.stringify(found)))
      setNewCuota(''); setNewCoef('')
      prevIdRef.current = found.id
    }
  }

  const onChangeField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const onChangeCoef = (cuotas, value) => {
    setForm(prev => ({
      ...prev,
      coeficientes: {
        ...prev.coeficientes,
        [String(cuotas)]: value === '' ? '' : Number(value) || 0
      }
    }))
  }

  const quitarCuota = (cuotas) => {
    setForm(prev => {
      const next = { ...prev, coeficientes: { ...prev.coeficientes } }
      delete next.coeficientes[String(cuotas)]
      return next
    })
  }

  const agregarCuota = () => {
    const n = Number(newCuota)
    const pct = newCoef === '' ? '' : Number(newCoef)
    if (!Number.isInteger(n) || n < 1 || n > 24) {
      Swal.fire({ icon: 'error', title: 'Cuota inválida', text: 'Ingresá 1–24.', confirmButtonColor: '#10B981' })
      return
    }
    if (newCoef === '' || !Number.isFinite(Number(newCoef))) {
      Swal.fire({ icon: 'error', title: 'Coeficiente inválido', text: 'Ej: 18 o 18.5', confirmButtonColor: '#10B981' })
      return
    }
    setForm(prev => ({
      ...prev,
      coeficientes: { ...prev.coeficientes, [String(n)]: Number(pct) }
    }))
    setNewCuota(''); setNewCoef('')
  }

  const guardarManual = async () => {
    const ok = await saveForm({ showModal: true, showBanner: false })
    if (ok) showSavedBannerSoon()
  }

  /**
   * Guarda el form:
   * - Normaliza ID
   * - Maneja renombrado (usa editCard para evitar duplicados)
   * - Sube a API (editCard ⇒ replaceAll, upsertCard ⇒ upsert)
   * - showModal: usa SweetAlert modal
   * - showBanner: usa banner Guardando/Guardado (sin SweetAlert toast)
   */
  const saveForm = async ({ showModal = false, showBanner = true } = {}) => {
    if (!form.id || !form.nombre) {
      if (showModal) {
        await Swal.fire({ icon: 'error', title: 'Faltan datos', text: 'Completá ID y Nombre.', confirmButtonColor: '#10B981' })
      }
      return false
    }

    const oldId = prevIdRef.current
    const normalizedId = String(form.id).trim().toLowerCase().replace(/\s+/g, '-')
    const normalized = { ...form, id: normalizedId }

    if (showBanner) startSavingBanner()

    try {
      if (oldId && oldId !== normalizedId) {
        // RENOMBRE de id → evita duplicados en backend
        await editCard(oldId, { id: normalizedId, nombre: normalized.nombre, coeficientes: normalized.coeficientes })
      } else {
        // Alta/edición sin cambio de id → upsert
        await upsertCard(normalized)
      }
    } catch (e) {
      const msg = String(e?.message || e)
      if (msg.includes('id_conflict')) {
        if (showBanner) setSaving(false)
        await Swal.fire({
          icon: 'error',
          title: 'ID en uso',
          text: `Ya existe otra tarjeta con id "${normalizedId}". Elegí otro id.`,
          confirmButtonColor: '#10B981'
        })
        return false
      }
      if (showBanner) setSaving(false)
      await Swal.fire({
        icon: 'error',
        title: 'No se pudo guardar',
        text: msg,
        confirmButtonColor: '#10B981'
      })
      return false
    }

    // Refrescar lista desde storage/API para quedar en sync 100%
    const fresh = await loadCardsAsync()
    setCards(fresh)
    setSelected(normalizedId)
    prevIdRef.current = normalizedId

    if (showModal) {
      await Swal.fire({ icon: 'success', title: 'Configuración guardada', text: `Tarjeta "${normalized.nombre}" actualizada.`, confirmButtonColor: '#10B981' })
    } else if (showBanner) {
      showSavedBannerSoon()
    }

    return true
  }

  const eliminar = async () => {
    if (!selected) return
    const res = await Swal.fire({
      icon: 'warning',
      title: 'Eliminar tarjeta',
      text: `¿Eliminar "${form.nombre || selected}"?`,
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#DC2626',
      cancelButtonColor: '#6B7280'
    })
    if (!res.isConfirmed) return

    startSavingBanner()
    await deleteCard(selected)
    const fresh = await loadCardsAsync()
    setCards(fresh)
    setSelected(fresh[0]?.id || '')
    setForm(fresh[0] || { id: '', nombre: '', coeficientes: {} })
    prevIdRef.current = fresh[0]?.id || ''
    showSavedBannerSoon()

    await Swal.fire({ icon: 'success', title: 'Tarjeta eliminada', confirmButtonColor: '#10B981' })
  }

  // Autosave con debounce (banner, sin modal)
  useEffect(() => {
    if (!autoSave) return
    if (!form.id || !form.nombre) return
    clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => { saveForm({ showModal: false, showBanner: true }) }, 600)
    return () => clearTimeout(debounceTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.id, form.nombre, form.coeficientes, autoSave])

  // beforeunload (respaldo)
  useEffect(() => {
    const onBeforeUnload = () => {
      if (!autoSave || !form.id || !form.nombre) return
      // fire-and-forget
      saveForm({ showModal: false, showBanner: true })
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeunload)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSave, form.id, form.nombre, form.coeficientes])

  // visibilitychange + pagehide => persistencia; si hay rename, usar replaceAll
  useEffect(() => {
    const buildPayload = () => {
      const oldId = prevIdRef.current
      const normalizedId = String(form.id || '').trim().toLowerCase().replace(/\s+/g, '-')
      if (!normalizedId || !form.nombre) return null
      const normalized = { ...form, id: normalizedId }

      let next = [...cards]
      if (oldId && oldId !== normalizedId) next = next.filter(c => c.id !== oldId)
      const idx = next.findIndex(c => c.id === normalizedId)
      if (idx >= 0) next[idx] = normalized
      else next.push(normalized)

      let prevVersion = 1
      try { prevVersion = JSON.parse(localStorage.getItem('fin_cards_motos_v1'))?.version || 1 } catch {}
      return { version: prevVersion + 1, cards: next, __renamed__: oldId && oldId !== normalizedId }
    }

    const persistBackground = () => {
      if (!autoSave) return
      const payload = buildPayload()
      if (!payload) return
      startSavingBanner()
      const { __renamed__, ...toSave } = payload
      // Si hubo rename → PUT (replace all) para que borre el id viejo en backend
      const p = __renamed__ ? replaceAllCards(toSave) : saveCardsBackground(toSave)
      p.finally(showSavedBannerSoon)
    }

    const onVis = () => { if (document.visibilityState === 'hidden') persistBackground() }
    const onHide = () => persistBackground()

    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', onHide)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSave, form, cards])

  // Filas ordenadas
  const filas = useMemo(() => (
    Object.entries(form.coeficientes || {})
      .map(([k, v]) => [Number(k), v])
      .filter(([k]) => Number.isInteger(k))
      .sort((a, b) => a[0] - b[0])
  ), [form.coeficientes])

  const inputBase =
    'mt-1 w-full rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm ' +
    'focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500'
  const btnPrimary =
    'inline-flex items-center justify-center px-3 py-2 rounded-md text-sm font-medium ' +
    'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800'
  const btnDanger =
    'inline-flex items-center justify-center px-3 py-2 rounded-md text-sm font-medium ' +
    'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800'
  const btnGhost =
    'inline-flex items-center justify-center px-2.5 py-2 rounded-md text-sm font-medium ' +
    'text-emerald-800 hover:bg-emerald-50'

  return (
    <>
      {/* Banner Guardando / Guardado */}
      {(saving || justSaved) && (
        <div className="fixed right-4 bottom-4 z-50 pointer-events-none">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-md shadow-md ring-1
                           ${saving ? 'bg-white ring-emerald-200 text-emerald-900' : 'bg-emerald-600 ring-emerald-700 text-white'}`}>
            {saving ? (
              <>
                <svg className="h-4 w-4 animate-spin text-emerald-600" viewBox="0 0 24 24">
                  <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                  <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4A4 4 0 0 0 8 12H4z"/>
                </svg>
                <span className="text-sm">Guardando…</span>
              </>
            ) : (
              <>
                <span className="text-sm font-semibold">Guardado ✓</span>
              </>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-[280px,1fr] overflow-x-hidden">
        {/* Sidebar */}
        <aside className="rounded-xl bg-white shadow-sm ring-1 ring-emerald-100 p-3 overflow-x-hidden">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-emerald-900">Tarjetas</h3>
            <button className="text-sm text-emerald-700 hover:underline" onClick={() => { setSelected(''); setForm({ id: '', nombre: '', coeficientes: {} }); prevIdRef.current = '' }}>
              + Nueva
            </button>
          </div>
          <ul className="space-y-1">
            {cards.map(c => (
              <li key={c.id} className="min-w-0">
                <button
                  className={`w-full text-left px-2 py-2 rounded transition min-w-0
                    ${selected === c.id ? 'bg-emerald-50 ring-1 ring-emerald-200' : 'hover:bg-emerald-50'}`}
                  onClick={() => selectCard(c.id)}
                >
                  <div className="text-sm font-medium text-emerald-900 truncate">{c.nombre}</div>
                  <div className="text-xs text-emerald-700 break-words">{c.id}</div>
                </button>
              </li>
            ))}
            {!cards.length && <li className="text-sm text-emerald-800">No hay tarjetas aún.</li>}
          </ul>
        </aside>

        {/* Editor */}
        <section className="rounded-xl bg-white shadow-sm ring-1 ring-emerald-100 p-4 overflow-x-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="font-semibold text-emerald-900">Editar tarjeta</h4>
            <label className="inline-flex items-center gap-2 text-sm text-emerald-900">
              <input type="checkbox" className="h-4 w-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                checked={autoSave} onChange={(e) => setAutoSave(e.target.checked)} />
              Guardado automático
            </label>
          </div>

          <div className="mt-2 grid sm:grid-cols-2 gap-3">
            <label className="block min-w-0">
              <span className="text-sm font-medium text-emerald-900">ID (único, sin espacios)</span>
              <input className={inputBase} value={form.id} onChange={e => onChangeField('id', e.target.value)} placeholder="ej: visa-master" />
            </label>
            <label className="block min-w-0">
              <span className="text-sm font-medium text-emerald-900">Nombre visible</span>
              <input className={inputBase} value={form.nombre} onChange={e => onChangeField('nombre', e.target.value)} placeholder="VISA/MASTER" />
            </label>
          </div>

          <div className="mt-4">
            <h4 className="font-semibold text-emerald-900">Cuotas configuradas</h4>
            <p className="text-xs text-emerald-800 mb-2">Agregá las cuotas que ofrece esta tarjeta y su % total de recargo.</p>

            <div className="rounded-lg ring-1 ring-emerald-100 p-3 bg-emerald-50/40">
              <div className="grid sm:grid-cols-[120px,1fr,auto] gap-3 items-end">
                <label className="block min-w-0">
                  <span className="text-sm font-medium text-emerald-900">Cuotas (1–24)</span>
                  <input type="number" min={1} max={24} className={inputBase} value={newCuota} onChange={(e) => setNewCuota(e.target.value)} placeholder="Ej: 6" />
                </label>
                <label className="block min-w-0">
                  <span className="text-sm font-medium text-emerald-900">% total de recargo</span>
                  <input type="number" step="0.01" className={inputBase} value={newCoef} onChange={(e) => setNewCoef(e.target.value)} placeholder="Ej: 18.5" />
                </label>
                <button type="button" onClick={agregarCuota} className={btnPrimary}>Agregar cuota</button>
              </div>
            </div>

            <div className="mt-3 grid gap-2">
              {filas.length === 0 && <div className="text-sm text-emerald-800">No hay cuotas cargadas.</div>}
              {filas.map(([cuotas]) => (
                <div key={cuotas} className="grid sm:grid-cols-[120px,1fr,auto] gap-3 items-center rounded-lg ring-1 ring-emerald-100 p-3 min-w-0">
                  <div className="min-w-0">
                    <div className="text-xs text-emerald-700">Cuotas</div>
                    <div className="text-base font-semibold text-emerald-900">{cuotas}</div>
                  </div>
                  <label className="block min-w-0">
                    <span className="text-xs text-emerald-700">Coeficiente (%)</span>
                    <input
                      type="number" step="0.01" className={inputBase}
                      value={form.coeficientes[String(cuotas)] ?? ''}
                      onChange={e => onChangeCoef(cuotas, e.target.value)}
                    />
                  </label>
                  <button type="button" onClick={() => quitarCuota(cuotas)} className={btnGhost} title="Quitar cuota">Quitar</button>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button className={btnPrimary} onClick={guardarManual}>Guardar</button>
            {selected && <button className={btnDanger} onClick={eliminar}>Eliminar</button>}
          </div>
        </section>
      </div>
    </>
  )
}
