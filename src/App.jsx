import { useState } from 'react'
import TabNav from './components/TabNav'
import FinancingCalculator from './components/FinancingCalculator'
import CardConfig from './components/CardConfig'

export default function App() {
  const [tab, setTab] = useState('financiacion') // 'financiacion' | 'intereses' | 'config'

  return (
    <div className="min-h-screen">
      {/* Header con logo y tema verde */}
      <header className="bg-emerald-600 text-white">
        <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-3">
          <img src="/logo-yuhmak.png" alt="Yuhmak" className="h-20 w-auto" />
          <h1 className="text-lg sm:text-2xl font-semibold">Calculadora de Financiación — Motos</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <TabNav value={tab} onChange={setTab} />
        <div className="mt-6">
          {tab === 'financiacion' && <FinancingCalculator />}
          
          {tab === 'config' && <CardConfig />}
        </div>
        <p className="text-xs text-emerald-800 mt-6">
          * Los coeficientes representan el % total de recargo aplicado sobre el monto a financiar para la cantidad de cuotas elegida.
        </p>
      </main>
    </div>
  )
}
