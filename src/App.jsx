import { useState } from 'react'
import TabNav from './components/TabNav'
import FinancingCalculator from './components/FinancingCalculator'
import CardConfig from './components/CardConfig'
import LoginGate from './components/LoginGate'

export default function App() {
  const [tab, setTab] = useState('financiacion')

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">

      {/* Header */}
      <header className="bg-gradient-to-r from-emerald-700 to-emerald-500 text-white shadow-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
          <img src="/logo-yuhmak.png" alt="Yuhmak" className="h-16 w-auto drop-shadow" />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight">
              Calculadora de Financiación
            </h1>
            <p className="text-emerald-100 text-xs sm:text-sm font-medium tracking-wide mt-0.5">
              Motos · Yuhmak
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex-1 w-full">
        <TabNav value={tab} onChange={setTab} />

        <div className="mt-6">
          {tab === 'financiacion' && <FinancingCalculator />}
          {tab === 'config' && (
            <LoginGate>
              <CardConfig />
            </LoginGate>
          )}
        </div>

        {tab === 'financiacion' && (
          <p className="text-xs text-slate-400 mt-8 border-t border-slate-200 pt-4">
            * Los coeficientes representan el % total de recargo aplicado sobre el monto a financiar para la cantidad de cuotas elegida.
          </p>
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 py-4">
        <p className="text-center text-xs text-slate-400">
          Desarrollado por{' '}
          <span className="font-semibold text-slate-500">Esteban Molina</span>
          {' '}·{' '}
          Todos los derechos reservados &copy; {new Date().getFullYear()}
        </p>
      </footer>

    </div>
  )
}
