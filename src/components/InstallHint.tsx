import { Share, SquarePlus, X } from 'lucide-react'
import { useState } from 'react'
import { isIos, isIosSafari, isStandalone } from '@/lib/pwa'

const DISMISSED_KEY = 'mis-finanzas:install-hint-dismissed'

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * En iPhone no hay botón de instalar: se agrega desde el menú Compartir de Safari.
 * Este aviso lo explica una vez y desaparece cuando la app ya corre instalada.
 */
export function InstallHint({ className = '' }: { className?: string }) {
  const [hidden, setHidden] = useState(wasDismissed)
  if (hidden || isStandalone() || !isIos()) return null

  const dismiss = () => {
    setHidden(true)
    try {
      localStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      // Sin storage: solo se oculta en esta visita
    }
  }

  return (
    <div className={`relative rounded-xl border border-brand-500/20 bg-brand-50 px-4 py-3 text-sm text-brand-700 ${className}`}>
      <button
        type="button"
        onClick={dismiss}
        className="absolute right-2 top-2 p-1 text-brand-700/70"
        aria-label="Ocultar aviso"
      >
        <X className="w-4 h-4" />
      </button>
      <p className="font-semibold pr-6">Instala Mis Finanzas en tu iPhone</p>
      {isIosSafari() ? (
        <ol className="mt-1 space-y-1 text-brand-700/90">
          <li className="flex items-center gap-2">
            <span className="w-5 text-center font-semibold">1.</span>
            Toca <Share className="w-4 h-4 inline" aria-label="Compartir" /> Compartir, abajo en Safari.
          </li>
          <li className="flex items-center gap-2">
            <span className="w-5 text-center font-semibold">2.</span>
            Elige <SquarePlus className="w-4 h-4 inline" aria-hidden /> «Agregar a pantalla de inicio».
          </li>
        </ol>
      ) : (
        <p className="mt-1 text-brand-700/90">
          Abre esta misma dirección en Safari y usa Compartir → «Agregar a pantalla de inicio».
        </p>
      )}
      <p className="mt-1 text-xs text-brand-700/70">Así abre a pantalla completa, lista para anotar un gasto.</p>
    </div>
  )
}
