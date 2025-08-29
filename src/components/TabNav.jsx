export default function TabNav({ value, onChange }) {
  const tabs = [
    { id: 'financiacion', label: 'Financiación (Motos)' },
    { id: 'config', label: 'Configurar tarjetas' }
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map(t => (
        <button
          key={t.id}
          className={`px-3 py-2 text-sm rounded-md ring-1 
            ${value === t.id
              ? 'bg-emerald-600 text-white ring-emerald-600'
              : 'bg-white text-emerald-900 ring-emerald-200 hover:bg-emerald-50'}
          `}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
