import { useState } from 'react'

const API_BASE = (import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL || '')
  .trim()
  .replace(/\/+$/, '')

const SESSION_KEY = 'admin_token'

export default function LoginGate({ children }) {
  const [token, setToken] = useState(() => {
    try { return sessionStorage.getItem(SESSION_KEY) || '' } catch { return '' }
  })
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (token) return children

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
        credentials: 'omit'
      })
      if (!res.ok) {
        setError('Contraseña incorrecta. Volvé a intentar.')
        setLoading(false)
        return
      }
      const { token: t } = await res.json()
      sessionStorage.setItem(SESSION_KEY, t)
      setToken(t)
    } catch {
      setError('No se pudo conectar al servidor. Intentá de nuevo.')
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[420px] px-4">

      {/* Card */}
      <div className="w-full max-w-sm">

        {/* Ícono + título */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-emerald-600 shadow-lg flex items-center justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-white" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-800">Acceso de administrador</h2>
          <p className="text-sm text-slate-400 mt-1 text-center">
            Ingresá la contraseña para gestionar las tarjetas
          </p>
        </div>

        {/* Formulario */}
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-6">
          <form onSubmit={handleLogin} className="space-y-4">

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 pointer-events-none">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </span>
                <input
                  type="password"
                  autoFocus
                  autoComplete="current-password"
                  className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-800
                             placeholder:text-slate-300 bg-slate-50
                             focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent
                             transition"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700
                         active:bg-emerald-800 text-white rounded-lg py-2.5 text-sm font-semibold
                         disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {loading ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                    <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4A4 4 0 0 0 8 12H4z"/>
                  </svg>
                  Verificando…
                </>
              ) : (
                <>
                  Ingresar
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
                  </svg>
                </>
              )}
            </button>

          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-5">
          La sesión se cierra al cerrar el navegador
        </p>

      </div>
    </div>
  )
}
