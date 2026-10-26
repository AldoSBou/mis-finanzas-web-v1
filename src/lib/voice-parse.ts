/**
 * Interpreta lo que la persona dijo ("veinte con cincuenta almuerzo", "taxi 12 soles",
 * "me pagaron 1500 de freelance") y saca monto, tipo, categoría y nota.
 * Sin dependencias: se prueba con node directamente.
 */

export interface VoiceCategory {
  id: number
  name: string
  type: 'EXPENSE' | 'INCOME'
}

export interface VoiceParse {
  /** Dígitos de centavos ('2050' = 20.50) o '' si no se entendió el monto */
  digits: string
  /** USD si dijo "dólares"; null si no dijo moneda (se asume la base) */
  currency: 'USD' | 'EUR' | null
  type: 'EXPENSE' | 'INCOME'
  categoryId: number | null
  /** Cómo se decidió la categoría */
  matchedBy: 'name' | 'keyword' | 'history' | null
  /** Lo que quedó después de quitar el monto y las palabras de relleno */
  note: string
}

/** Descripción → categoría, aprendido de los últimos movimientos de la persona */
export type VoiceHistory = { description: string; categoryId: number }[]

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ.,\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------- Números en palabras ----------

const UNITS: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintiun: 21, veintidos: 22, veintitres: 23,
  veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
}
const HUNDREDS: Record<string, number> = {
  cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500,
  seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900,
}
const NUMBER_WORDS = new Set([...Object.keys(UNITS), ...Object.keys(HUNDREDS), 'mil', 'y'])

/** "dos mil trescientos cuarenta y cinco" → 2345; null si no es un número */
export function wordsToNumber(words: string[]): number | null {
  if (words.length === 0 || !words.some((w) => w !== 'y')) return null
  let total = 0
  let current = 0
  for (const w of words) {
    if (w === 'y') continue
    if (w === 'mil') {
      total += (current || 1) * 1000
      current = 0
    } else if (w in HUNDREDS) {
      current += HUNDREDS[w]
    } else if (w in UNITS) {
      current += UNITS[w]
    } else {
      return null
    }
  }
  return total + current
}

interface AmountMatch {
  value: number
  /** Índices de palabras que formaban el monto (para quitarlas de la nota) */
  used: Set<number>
}

const CENTS_JOIN = new Set(['con', 'punto', 'coma'])
const CURRENCY = new Set(['sol', 'soles', 'lucas', 'luca', 'centimos', 'centimo', 's', 'dolares', 'dolar', 'usd', 'euros', 'euro'])

/** Busca el monto: cifras ("20.50", "20 con 50") o palabras ("veinte con cincuenta"). */
export function findAmount(words: string[]): AmountMatch | null {
  // 1) Cifras: "20.50", "20,50", "1,200"
  for (let i = 0; i < words.length; i++) {
    const m = /^(\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,](\d{1,2}))?$/.exec(words[i])
    if (!m) continue
    const intPart = parseInt(m[1].replace(/[.,]/g, ''), 10)
    let value = intPart + (m[2] ? parseInt(m[2].padEnd(2, '0'), 10) / 100 : 0)
    const used = new Set([i])
    // "20 con 50", "20 soles con 50"
    let j = i + 1
    if (words[j] && CURRENCY.has(words[j])) {
      used.add(j)
      j++
    }
    if (!m[2] && words[j] && CENTS_JOIN.has(words[j]) && words[j + 1] && /^\d{1,2}$/.test(words[j + 1])) {
      value = intPart + parseInt(words[j + 1].padEnd(2, '0'), 10) / 100
      used.add(j)
      used.add(j + 1)
      j += 2
    }
    if (words[j] && CURRENCY.has(words[j])) used.add(j)
    return { value, used }
  }

  // 2) Palabras: la secuencia más larga de palabras numéricas
  let best: AmountMatch | null = null
  for (let i = 0; i < words.length; i++) {
    if (!NUMBER_WORDS.has(words[i]) || words[i] === 'y') continue
    let j = i
    while (j < words.length && NUMBER_WORDS.has(words[j])) j++
    while (words[j - 1] === 'y') j--
    const intPart = wordsToNumber(words.slice(i, j))
    if (intPart === null) continue
    const used = new Set<number>()
    for (let k = i; k < j; k++) used.add(k)
    let value = intPart
    let k = j
    if (words[k] && CURRENCY.has(words[k])) {
      used.add(k)
      k++
    }
    if (words[k] && CENTS_JOIN.has(words[k])) {
      let e = k + 1
      while (e < words.length && NUMBER_WORDS.has(words[e])) e++
      const cents = wordsToNumber(words.slice(k + 1, e))
      if (cents !== null && cents < 100) {
        value = intPart + cents / 100
        for (let x = k; x < e; x++) used.add(x)
        k = e
      }
    }
    if (words[k] && CURRENCY.has(words[k])) used.add(k)
    if (!best || used.size > best.used.size) best = { value, used }
    i = j
  }
  return best
}

// ---------- Categorías ----------

/** Palabras típicas → nombre de categoría por defecto (Perú) */
const KEYWORDS: Record<string, string[]> = {
  Alimentación: ['mercado', 'supermercado', 'super', 'verduras', 'frutas', 'fruta', 'pan', 'panaderia', 'bodega', 'pollo', 'carne', 'pescado', 'leche', 'huevos', 'arroz', 'comida', 'viveres', 'despensa', 'plaza vea', 'tottus', 'wong', 'metro', 'makro'],
  Restaurantes: ['almuerzo', 'desayuno', 'cena', 'lonche', 'menu', 'restaurante', 'restaurant', 'chifa', 'pizza', 'hamburguesa', 'cafe', 'cafeteria', 'pollo a la brasa', 'ceviche', 'cevicheria', 'rappi', 'pedidosya', 'delivery', 'sandwich', 'jugo', 'helado', 'postre', 'sushi', 'starbucks'],
  Transporte: ['taxi', 'uber', 'cabify', 'indrive', 'didi', 'bus', 'combi', 'micro', 'metropolitano', 'tren', 'pasaje', 'gasolina', 'grifo', 'peaje', 'estacionamiento', 'parqueo', 'moto', 'bicicleta', 'avion', 'vuelo'],
  Salud: ['farmacia', 'medicina', 'medicinas', 'pastillas', 'doctor', 'medico', 'clinica', 'consulta', 'dentista', 'inkafarma', 'mifarma', 'boticas', 'hospital', 'examen', 'laboratorio', 'lentes'],
  Servicios: ['luz', 'agua', 'internet', 'celular', 'telefono', 'claro', 'movistar', 'entel', 'bitel', 'gas', 'cable', 'recibo', 'sedapal', 'enel', 'luz del sur', 'wifi'],
  Educación: ['colegio', 'universidad', 'instituto', 'curso', 'clase', 'clases', 'libro', 'libros', 'pension', 'matricula', 'utiles', 'academia', 'nido', 'taller'],
  Entretenimiento: ['cine', 'pelicula', 'concierto', 'juego', 'juegos', 'salida', 'bar', 'cerveza', 'cervezas', 'trago', 'tragos', 'fiesta', 'discoteca', 'teatro', 'parque', 'bowling', 'karaoke', 'entrada', 'entradas'],
  Ropa: ['ropa', 'zapatillas', 'zapatos', 'polo', 'polos', 'pantalon', 'camisa', 'vestido', 'casaca', 'medias', 'tienda', 'zara', 'saga', 'ripley', 'falabella'],
  Suscripciones: ['suscripcion', 'netflix', 'spotify', 'disney', 'youtube', 'hbo', 'icloud', 'google one', 'chatgpt', 'gimnasio', 'gym'],
  Vivienda: ['alquiler', 'arriendo', 'mantenimiento', 'casa', 'departamento', 'condominio', 'hipoteca', 'cuarto', 'muebles', 'sodimac', 'promart', 'maestro'],
  'Pago de deudas': ['prestamo', 'cuota', 'deuda', 'tarjeta', 'banco', 'credito'],
  Otros: ['regalo', 'propina', 'donacion', 'cosas', 'varios'],
  Salario: ['sueldo', 'salario', 'quincena', 'planilla', 'gratificacion', 'cts'],
  Freelance: ['freelance', 'chamba', 'honorarios', 'recibo por honorarios', 'freelo'],
  Intereses: ['intereses', 'interes', 'rendimiento', 'dividendos'],
  'Otros ingresos': ['venta', 'vendi', 'devolucion', 'reembolso', 'yape', 'plin', 'me devolvieron'],
}

const INCOME_HINTS = ['ingreso', 'me pagaron', 'me pago', 'cobre', 'recibi', 'me llego', 'me depositaron', 'deposito', 'sueldo', 'salario', 'quincena', 'gane', 'me dieron', 'vendi']

const FILLER = new Set([
  'gaste', 'gasto', 'pague', 'pago', 'compre', 'compra', 'en', 'de', 'del', 'por', 'para', 'el', 'la', 'los', 'las',
  'un', 'una', 'unos', 'unas', 'al', 'a', 'he', 'me', 'lo', 'le', 'se', 'que', 'con', 'y', 'hoy', 'ayer', 'ahora',
  'registra', 'registrar', 'anota', 'anotar', 'agrega', 'agregar', 'nuevo', 'gasto', 'ingreso', 'soles', 'sol', 'lucas',
  'centimos', 'fue', 'fueron', 'son', 'es', 'mi', 'mis', 'tu', 'su', 'eso', 'esto', 'esta', 'este', 'ese',
  'dolares', 'dolar', 'usd', 'euros', 'euro',
])

function findCategoryByName(text: string, categories: VoiceCategory[]): VoiceCategory | null {
  let best: VoiceCategory | null = null
  for (const c of categories) {
    const name = normalize(c.name)
    if (name.length >= 3 && new RegExp(`(^|\\s)${escape(name)}(s|es)?(\\s|$)`).test(text)) {
      if (!best || name.length > normalize(best.name).length) best = c
    }
  }
  return best
}

function findCategoryByKeyword(text: string, categories: VoiceCategory[]): VoiceCategory | null {
  const byName = new Map(categories.map((c) => [normalize(c.name), c]))
  let best: { c: VoiceCategory; len: number } | null = null
  for (const [catName, words] of Object.entries(KEYWORDS)) {
    const c = byName.get(normalize(catName))
    if (!c) continue
    for (const w of words) {
      const kw = normalize(w)
      if (new RegExp(`(^|\\s)${escape(kw)}(s|es)?(\\s|$)`).test(text) && (!best || kw.length > best.len)) {
        best = { c, len: kw.length }
      }
    }
  }
  return best?.c ?? null
}

/** Si una descripción anterior (p. ej. "menú donde Lucho") está contenida en lo dicho, o al revés. */
function findCategoryByHistory(text: string, history: VoiceHistory, categories: VoiceCategory[]): VoiceCategory | null {
  const ids = new Map(categories.map((c) => [c.id, c]))
  let best: { c: VoiceCategory; len: number } | null = null
  for (const h of history) {
    const d = normalize(h.description)
    if (d.length < 3) continue
    const c = ids.get(h.categoryId)
    if (!c) continue
    const hit = text.includes(d) || d.split(' ').some((w) => w.length >= 4 && new RegExp(`(^|\\s)${escape(w)}(\\s|$)`).test(text))
    if (hit && (!best || d.length > best.len)) best = { c, len: d.length }
  }
  return best?.c ?? null
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function parseUtterance(raw: string, categories: VoiceCategory[], history: VoiceHistory = []): VoiceParse {
  const text = normalize(raw)
  const words = text.split(' ').filter(Boolean)
  const amount = findAmount(words)
  const digits = amount && amount.value > 0 ? String(Math.round(amount.value * 100)).slice(0, 9) : ''

  const income = INCOME_HINTS.some((h) => new RegExp(`(^|\\s)${escape(h)}(\\s|$)`).test(text))
  let type: 'EXPENSE' | 'INCOME' = income ? 'INCOME' : 'EXPENSE'

  // La categoría decide el tipo si se reconoce por nombre o palabra clave
  const byName = findCategoryByName(text, categories)
  const byKeyword = byName ? null : findCategoryByKeyword(text, categories)
  const byHistory = byName || byKeyword ? null : findCategoryByHistory(text, history, categories)
  const found = byName ?? byKeyword ?? byHistory
  if (found) type = found.type

  const rest = words.filter((w, i) => !(amount?.used.has(i)) && !FILLER.has(w) && !NUMBER_WORDS.has(w))
  // La categoría no va en la nota (sería redundante)
  const note = found
    ? rest.filter((w) => !normalize(found.name).split(' ').includes(w)).join(' ')
    : rest.join(' ')

  const currency = /(^|\s)(dolar|dolares|usd)(\s|$)/.test(text) ? 'USD' : /(^|\s)(euro|euros)(\s|$)/.test(text) ? 'EUR' : null

  return {
    digits,
    currency,
    type,
    categoryId: found?.id ?? null,
    matchedBy: byName ? 'name' : byKeyword ? 'keyword' : byHistory ? 'history' : null,
    note: note.slice(0, 200),
  }
}
