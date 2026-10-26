/**
 * Reconocimiento de voz del navegador (Web Speech API). Safari en iPhone lo soporta en
 * la pestaña normal; en la app instalada puede no estar disponible según la versión de iOS,
 * por eso la pantalla siempre ofrece escribir (y el teclado de iOS tiene su propio dictado).
 */

// Tipos mínimos: lib.dom no declara el constructor con prefijo webkit
interface RecognitionResultLike {
  isFinal: boolean
  0: { transcript: string }
}
interface RecognitionEventLike {
  resultIndex: number
  results: ArrayLike<RecognitionResultLike>
}
interface RecognitionErrorLike {
  error: string
  message?: string
}
interface RecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: RecognitionEventLike) => void) | null
  onerror: ((e: RecognitionErrorLike) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type RecognitionCtor = new () => RecognitionLike

function ctor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** true si este navegador puede escuchar. */
export const speechAvailable = ctor() !== null

export interface ListenHandlers {
  /** Texto reconocido hasta ahora; isFinal cuando el reconocedor cerró la frase */
  onResult: (text: string, isFinal: boolean) => void
  /** 'no-speech', 'not-allowed', 'aborted', 'network'… */
  onError: (code: string, message: string) => void
  onEnd: () => void
}

let current: RecognitionLike | null = null

/** Empieza a escuchar en español. Devuelve false si el navegador no puede. */
export function startListening(h: ListenHandlers): boolean {
  const Ctor = ctor()
  if (!Ctor) return false
  cancelListening()
  const rec = new Ctor()
  rec.lang = 'es-PE'
  rec.continuous = true
  rec.interimResults = true
  rec.maxAlternatives = 1
  let finalText = ''
  rec.onresult = (e) => {
    let interim = ''
    finalText = ''
    for (let i = 0; i < e.results.length; i++) {
      const r = e.results[i]
      if (r.isFinal) finalText += r[0].transcript
      else interim += r[0].transcript
    }
    const text = (finalText + ' ' + interim).replace(/\s+/g, ' ').trim()
    h.onResult(text, !!finalText && !interim)
  }
  rec.onerror = (e) => h.onError(e.error, e.message ?? '')
  rec.onend = () => {
    if (current === rec) current = null
    h.onEnd()
  }
  current = rec
  try {
    rec.start()
    return true
  } catch (e) {
    current = null
    h.onError('start-failed', e instanceof Error ? e.message : String(e))
    return false
  }
}

/** Deja de escuchar y entrega lo oído (dispara onEnd). */
export function stopListening() {
  try {
    current?.stop()
  } catch {
    // Ya estaba detenido
  }
}

/** Descarta lo oído. */
export function cancelListening() {
  const rec = current
  current = null
  try {
    rec?.abort()
  } catch {
    // Ya estaba detenido
  }
}
