import { useState, useMemo } from 'react'
import { calcularPlan, fmtARS, sanitizeNumber } from '../utils/finance'
import { getCards } from '../lib/cardsStorage'

/**
 * Escenario colapsable individual.
 * Props:
 * - title (string)
 * - categoria ('bikes' | 'hogar' | 'store')
 */
export default function ScenarioCard({ title = 'Escenario', categoria = 'bikes' }) {
  const [open, setOpen] = useState(true)
  const cards = getCards()

  const [precio, setPrecio] = useState('')
  const [adelanto, setAdelanto] = useState('')
  const [cardId, setCardId] = useState(cards[0]?.id || '')
  const [cuotas, setCuotas] = useState('6')

  const coefPct = useMemo(() => {
    const card = cards.find(c => c.id === cardId)
    const c = card?.coeficientes?.[categoria] || {}
    return Number(c[cuotas] ?? 0)
  }, [cardId, cuotas, categoria, cards])

  const ready =
    sanitizeNumber(precio) > 0 &&
    sanitizeNumber(adelanto) >= 0 &&
    cardId &&
    Number(cuotas) > 0

  const result = useMemo(() => {
    if (!ready) return null
    return calcularPlan({
      precio,
      adelanto,
      coefPct,
      cuotas: Number(cuotas)
    })
  }, [precio, adelanto, coefPct, cuotas, ready])

  return (
    <div className="card p-4">
      <button
        className="w-full flex items-center justify-between"
        onClick={() => setOpen(!open)}
      >
        <span className="font-semibold">{title} <span className="text-slate-400">({categoria})</span></span>
        <span className="text-slate-500 text-sm">{open ? 'Cerrar ▲' : 'Abrir ▼'}</span>
      </button>

      {open && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="grid gap-3">
            <label className="text-sm">
              Precio / Monto base
              <input
                className="mt-1 w-full rounded-md border-slate-300"
                type="number"
                inputMode="decimal"
                placeholder="Ej: 2.500.000"
                value={precio}
                onChange={e => setPrecio(e.target.value)}
              />
            </label>

            <label className="text-sm">
              Adelanto
              <input
                className="mt-1 w-full rounded-md border-slate-300"
                type="number"
                inputMode="decimal"
                placeholder="Ej: 500.000"
                value={adelanto}
                onChange={e => setAdelanto(e.target.value)}
              />
            </label>

            <label className="text-sm">
              Tarjeta
              <select
                className="mt-1 w-full rounded-md border-slate-300 bg-white"
                value={cardId}
                onChange={e => setCardId(e.target.value)}
              >
                {cards.map(c => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              Cuotas
              <select
                className="mt-1 w-full rounded-md border-slate-300 bg-white"
                value={cuotas}
                onChange={e => setCuotas(e.target.value)}
              >
                {Array.from({ length: 24 }, (_, i) => String(i + 1)).map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>

            <div className="text-sm text-slate-600">
              Coeficiente {Number(coefPct).toFixed(2)}%
            </div>
          </div>

          <div className="grid">
            {!ready && (
              <div className="p-4 rounded-md bg-slate-50 ring-1 ring-slate-200 text-slate-600 text-sm">
                Completá los campos para ver el cuadro.
              </div>
            )}

            {ready && result && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <tbody className="[&_tr]:border-b [&_tr]:border-slate-200">
                    <tr>
                      <td className="py-2 pr-4 font-medium">Monto</td>
                      <td className="py-2">{fmtARS(sanitizeNumber(precio))}</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-medium">Adelanto</td>
                      <td className="py-2">{fmtARS(sanitizeNumber(adelanto))}</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-medium">A financiar</td>
                      <td className="py-2">{fmtARS(result.aFinanciar)}</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-medium">Tarjeta</td>
                      <td className="py-2">{cards.find(c => c.id === cardId)?.nombre} · {cuotas} cuotas</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-medium">Coeficiente total</td>
                      <td className="py-2">{Number(coefPct).toFixed(2)}%</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-medium">Interés total</td>
                      <td className="py-2">{fmtARS(result.interesTotal)}</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-medium">Costo final</td>
                      <td className="py-2">{fmtARS(result.costoFinal)}</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-medium">Valor de cuota</td>
                      <td className="py-2">{fmtARS(result.valorCuota)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
