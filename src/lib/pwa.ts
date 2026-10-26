/**
 * Detección del entorno de la app instalada (PWA). En iPhone no hay tienda: la web se
 * agrega a la pantalla de inicio desde Safari y corre a pantalla completa ("standalone").
 */

/** true si la app corre instalada (desde el icono), no dentro del navegador. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches
}

/** iPhone o iPad (el iPad moderno se presenta como Mac, pero con pantalla táctil). */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

/** Safari de verdad (no Chrome ni Firefox en iOS, que no pueden instalar PWAs). */
export function isIosSafari(): boolean {
  if (!isIos()) return false
  const ua = navigator.userAgent
  return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
}

/** Pantalla angosta: la misma regla que el `md:` de Tailwind. */
export function isPhoneWidth(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
}

/** A dónde ir tras iniciar sesión: en el teléfono, directo a registrar. */
export function homePath(): string {
  return isPhoneWidth() ? '/registrar' : '/'
}
