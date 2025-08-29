import PlansBoard from './PlansBoard'

/**
 * Comparador de financiación para Motos:
 * un único board que contiene Plan A, B y C.
 */
export default function FinancingCalculator() {
  return (
    <div className="grid gap-4">
      <PlansBoard />
    </div>
  )
}
