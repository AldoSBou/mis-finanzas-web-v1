import { metricsApi } from '@/api/services'
import type { ClientEventRequest } from '@/types/api'

/**
 * Cómo se hizo el registro: con el teclado, por voz ('voice' = se guardó tal como se
 * entendió; 'voice-edited' = la persona corrigió algo) o desde una foto.
 */
export type EntrySource = 'app' | 'voice' | 'voice-edited' | 'photo' | 'photo-edited'

/** Evento pendiente de enviar al backend (se acumula si no hay conexión). */
interface PendingEvent {
  id: string
  kind: 'ENTRY' | 'ERROR'
  durationMs?: number
  source?: string
  message?: string
  occurredAt: string
}

const QUEUE = 'mis-finanzas:metrics-queue'
const MAX = 500
const MAX_BATCH = 200
/** Más de esto no es "registrar": la app quedó abierta sin usarse. */
export const IDLE_MS = 120_000

declare const __APP_VERSION__: string
const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'

function loadQueue(): PendingEvent[] {
  try {
    const raw = localStorage.getItem(QUEUE)
    return raw ? (JSON.parse(raw) as PendingEvent[]) : []
  } catch {
    return []
  }
}

function saveQueue(queue: PendingEvent[]) {
  try {
    localStorage.setItem(QUEUE, JSON.stringify(queue.slice(-MAX)))
  } catch {
    // Sin storage: el evento se pierde, no es grave
  }
}

function enqueue(event: Omit<PendingEvent, 'id' | 'occurredAt'>) {
  const queue = loadQueue()
  queue.push({
    ...event,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    occurredAt: new Date().toISOString(),
  })
  saveQueue(queue)
}

/**
 * Cuánto tardó el registro: desde que la pantalla aparece hasta que se toca Guardar
 * (el esfuerzo de la persona, sin contar la respuesta del servidor).
 */
export function recordEntry(ms: number, source: EntrySource) {
  enqueue({ kind: 'ENTRY', durationMs: Math.round(ms), source })
  void flush()
}

/** Algo falló en el teléfono (p. ej. no se pudo guardar): queda registrado en el backend. */
export function recordError(source: string, message: string) {
  enqueue({ kind: 'ERROR', source, message: message.slice(0, 500) })
  void flush()
}

let flushing = false

/** Manda lo pendiente. Si no hay conexión, se queda en cola para la próxima. */
export async function flush() {
  if (flushing) return
  flushing = true
  try {
    const batch = loadQueue().slice(0, MAX_BATCH)
    if (batch.length === 0) return
    const events: ClientEventRequest[] = batch.map(({ id: _id, ...e }) => ({
      ...e,
      platform: 'web',
      appVersion: APP_VERSION.slice(0, 20),
    }))
    await metricsApi.record(events)
    // Se vuelve a leer: mientras se enviaba pudo entrar otro evento
    const sent = new Set(batch.map((e) => e.id))
    saveQueue(loadQueue().filter((e) => !sent.has(e.id)))
  } catch {
    // Sin conexión o sesión vencida: se reintenta después
  } finally {
    flushing = false
  }
}

/** Cronómetro del registro: se reinicia al mostrar la pantalla y después de cada guardado. */
export class Stopwatch {
  private started = Date.now()
  source: EntrySource = 'app'

  reset(source?: EntrySource) {
    this.started = Date.now()
    if (source) this.source = source
  }

  elapsed(): number {
    return Date.now() - this.started
  }
}
