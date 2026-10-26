import type { Category } from '@/types/api'

/**
 * Qué categorías usa la persona y a qué hora, para ponerlas primero: el café en la
 * mañana, el almuerzo al mediodía. Se guarda solo en este navegador.
 */
interface Use {
  c: number // categoría
  h: number // hora del día
}

const KEY = 'mis-finanzas:usage'
const MAX = 300
const LAST_ACCOUNT_KEY = 'mis-finanzas:last-account'

/** Orden de arranque mientras no hay historial: los gastos más frecuentes del día a día. */
const STARTER = ['Alimentación', 'Transporte', 'Restaurantes', 'Servicios', 'Salud', 'Entretenimiento', 'Ropa', 'Vivienda']

function load(): Use[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Use[]) : []
  } catch {
    return []
  }
}

export function recordUse(categoryId: number) {
  const list = load()
  list.push({ c: categoryId, h: new Date().getHours() })
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)))
  } catch {
    // Sin storage: solo se pierde el orden aprendido
  }
}

/** Categorías ordenadas: uso total + triple peso a lo usado a esta hora (±2 h). */
export function rankCategories(categories: Category[], uses: Use[] = load(), hour = new Date().getHours()): Category[] {
  const score = new Map<number, number>()
  for (const u of uses) {
    const near = Math.abs(u.h - hour) <= 2 || Math.abs(u.h - hour) >= 22
    score.set(u.c, (score.get(u.c) ?? 0) + (near ? 3 : 1))
  }
  const starter = (c: Category) => {
    const i = STARTER.indexOf(c.name)
    return i === -1 ? STARTER.length : i
  }
  return [...categories].sort(
    (a, b) => (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0) || starter(a) - starter(b),
  )
}

/** Misma clave que usa TransactionFormModal: la cuenta elegida en un lado vale en el otro. */
export function lastAccount(): number | null {
  try {
    const raw = localStorage.getItem(LAST_ACCOUNT_KEY)
    return raw ? Number(raw) : null
  } catch {
    return null
  }
}

export function saveLastAccount(id: number) {
  try {
    localStorage.setItem(LAST_ACCOUNT_KEY, String(id))
  } catch {
    // Sin storage
  }
}
