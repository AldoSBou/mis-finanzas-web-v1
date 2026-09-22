/**
 * Lectura de estados de cuenta (CSV o Excel) en el navegador. El archivo nunca se sube:
 * al servidor solo van las filas interpretadas (fecha, descripción, monto con signo).
 */

export type Cell = string | number | boolean | Date | null
export type DateFormat = 'DMY' | 'YMD' | 'MDY'
export type DecimalStyle = 'dot' | 'comma'

export interface ColumnMapping {
  date: number | null
  description: number | null
  /** Una sola columna de monto con signo */
  amount: number | null
  /** O dos columnas: cargo (sale) y abono (entra) */
  debit: number | null
  credit: number | null
}

export interface ParseOptions {
  dateFormat: DateFormat
  decimal: DecimalStyle
  /**
   * Con columna única de monto: true si los positivos son ingresos (cuenta bancaria);
   * false si los positivos son consumos (estado de cuenta de tarjeta).
   */
  positiveIsIncome: boolean
}

export interface ParsedRow {
  /** Fila del archivo (1 = primera), para ubicar errores */
  line: number
  date: string
  description: string
  /** Negativo = sale dinero de la cuenta */
  amount: number
}

// ---------------------------------------------------------------
// Lectura del archivo
// ---------------------------------------------------------------

/** Texto de un CSV: UTF-8 si es válido; si no, Windows-1252 (común en bancos). */
export function decodeText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^﻿/, '')
  } catch {
    return new TextDecoder('windows-1252').decode(buffer)
  }
}

/** Separador más probable de un CSV, mirando las primeras líneas. */
export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20)
  let best = ','
  let bestScore = 0
  for (const d of [',', ';', '\t', '|']) {
    const counts = lines.map((l) => splitCsvLine(l, d).length)
    const max = Math.max(...counts)
    // Líneas con la mayor cantidad de columnas (las de datos), si hay más de una columna
    const score = max > 1 ? counts.filter((c) => c === max).length * max : 0
    if (score > bestScore) {
      bestScore = score
      best = d
    }
  }
  return best
}

/** Divide una línea CSV respetando comillas. */
function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') {
        quoted = false
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === delimiter) {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

export function parseCsv(text: string): Cell[][] {
  const delimiter = detectDelimiter(text)
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .map((l) => splitCsvLine(l, delimiter).map((c) => (c.trim() === '' ? null : c.trim())))
}

export async function readFile(file: File): Promise<Cell[][]> {
  const buffer = await file.arrayBuffer()
  if (/\.(csv|txt)$/i.test(file.name)) {
    return parseCsv(decodeText(buffer))
  }
  // SheetJS pesa ~400 KB: se descarga solo al leer un Excel
  const XLSX = await import('xlsx')
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: null, blankrows: false })
}

// ---------------------------------------------------------------
// Detección de encabezados y columnas
// ---------------------------------------------------------------

const KEYWORDS = {
  date: /fecha|date/,
  description: /descrip|concepto|detalle|glosa|movimiento|referencia|comercio|establecimiento/,
  amount: /monto|importe|valor|amount/,
  debit: /cargo|debito|retiro|egreso|salida/,
  credit: /abono|credito|deposito|ingreso|entrada/,
}

function norm(cell: Cell): string {
  return String(cell ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
}

/** Primera fila (de las 20 primeras) que parece encabezado: tiene fecha y algo de monto. */
export function detectHeaderRow(rows: Cell[][]): number {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const cells = rows[i].map(norm)
    const hasDate = cells.some((c) => KEYWORDS.date.test(c))
    const hasMoney = cells.some(
      (c) => KEYWORDS.amount.test(c) || KEYWORDS.debit.test(c) || KEYWORDS.credit.test(c),
    )
    if (hasDate && hasMoney) return i
  }
  return 0
}

export function guessMapping(header: Cell[]): ColumnMapping {
  const cells = header.map(norm)
  const find = (re: RegExp, avoid?: RegExp) => {
    const preferred = cells.findIndex((c) => re.test(c) && !(avoid && avoid.test(c)))
    return preferred >= 0 ? preferred : cells.findIndex((c) => re.test(c))
  }
  // Fecha de operación antes que fecha valor / proceso
  const date = find(KEYWORDS.date, /valu|valor|proceso|contable/)
  const description = find(KEYWORDS.description)
  const debit = find(KEYWORDS.debit)
  const credit = find(KEYWORDS.credit)
  // "Saldo" nunca es el monto del movimiento
  const amount = cells.findIndex((c) => KEYWORDS.amount.test(c) && !/saldo/.test(c))
  const hasPair = debit >= 0 && credit >= 0 && debit !== credit
  return {
    date: date >= 0 ? date : null,
    description: description >= 0 ? description : null,
    amount: !hasPair && amount >= 0 ? amount : null,
    debit: hasPair ? debit : null,
    credit: hasPair ? credit : null,
  }
}

// ---------------------------------------------------------------
// Montos
// ---------------------------------------------------------------

/** Coma decimal (1.234,56) o punto decimal (1,234.56), según lo que predomina. */
export function detectDecimalStyle(values: Cell[]): DecimalStyle {
  let comma = 0
  let dot = 0
  for (const v of values) {
    if (typeof v !== 'string') continue
    if (/,\d{1,2}\)?-?$/.test(v.trim())) comma++
    if (/\.\d{1,2}\)?-?$/.test(v.trim())) dot++
  }
  return comma > dot ? 'comma' : 'dot'
}

/** "S/ -1,234.56", "1.234,56", "(45.00)", "45.00-" → número con signo; null si no es monto. */
export function parseAmount(value: Cell, decimal: DecimalStyle): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  let s = value.trim()
  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  if (s.endsWith('-')) {
    negative = true
    s = s.slice(0, -1)
  }
  s = s.replace(/[^\d.,-]/g, '')
  if (s.startsWith('-')) {
    negative = !negative
    s = s.slice(1)
  }
  if (!/\d/.test(s)) return null
  s = decimal === 'comma' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return negative ? -n : n
}

// ---------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------

const MONTHS: Record<string, number> = {
  ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7,
  ago: 8, aug: 8, set: 9, sep: 9, oct: 10, nov: 11, dic: 12, dec: 12,
}

function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null
  const date = new Date(y, m - 1, d)
  if (date.getMonth() !== m - 1) return null // 31/02 no existe
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Fecha → 'YYYY-MM-DD', o null si no se puede interpretar con ese formato. */
export function parseDate(value: Cell, format: DateFormat): string | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : iso(value.getFullYear(), value.getMonth() + 1, value.getDate())
  }
  const s = String(value).trim().toLowerCase()

  // Con mes en texto: "22 set 2026", "22-sep-26", "22SEP2026"
  const textual = /^(\d{1,2})[\s\-/.]*([a-z]{3})[a-z]*\.?[\s\-/.]*(\d{2,4})$/.exec(s)
  if (textual && MONTHS[textual[2]]) {
    return iso(Number(textual[3]), MONTHS[textual[2]], Number(textual[1]))
  }

  const parts = /^(\d{1,4})[\s\-/.](\d{1,2})[\s\-/.](\d{1,4})/.exec(s)
  if (!parts) return null
  const [a, b, c] = [Number(parts[1]), Number(parts[2]), Number(parts[3])]
  if (format === 'YMD') return parts[1].length === 4 ? iso(a, b, c) : null
  if (parts[1].length === 4) return null
  return format === 'DMY' ? iso(c, b, a) : iso(c, a, b)
}

/** Formato que interpreta más valores; ante empate, día/mes/año (el usual en Perú). */
export function detectDateFormat(values: Cell[]): DateFormat {
  const sample = values.filter((v) => v !== null && v !== '').slice(0, 200)
  let best: DateFormat = 'DMY'
  let bestCount = -1
  for (const f of ['DMY', 'YMD', 'MDY'] as DateFormat[]) {
    const count = sample.filter((v) => parseDate(v, f) !== null).length
    if (count > bestCount) {
      bestCount = count
      best = f
    }
  }
  return best
}

// ---------------------------------------------------------------
// Filas finales
// ---------------------------------------------------------------

export interface BuildResult {
  rows: ParsedRow[]
  /** Filas sin fecha o sin monto válido (saldos, totales, líneas en blanco) */
  skipped: number
}

export function buildRows(
  rows: Cell[][],
  headerIndex: number,
  mapping: ColumnMapping,
  options: ParseOptions,
): BuildResult {
  const result: ParsedRow[] = []
  let skipped = 0
  if (mapping.date === null || (mapping.amount === null && (mapping.debit === null || mapping.credit === null))) {
    return { rows: [], skipped: 0 }
  }
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const r = rows[i]
    const date = parseDate(r[mapping.date] ?? null, options.dateFormat)
    let amount: number | null
    if (mapping.amount !== null) {
      const v = parseAmount(r[mapping.amount] ?? null, options.decimal)
      amount = v === null ? null : options.positiveIsIncome ? v : -v
    } else {
      const debit = parseAmount(r[mapping.debit!] ?? null, options.decimal)
      const credit = parseAmount(r[mapping.credit!] ?? null, options.decimal)
      amount = debit === null && credit === null ? null : Math.abs(credit ?? 0) - Math.abs(debit ?? 0)
    }
    if (!date || amount === null || amount === 0) {
      skipped++
      continue
    }
    const description =
      mapping.description !== null ? String(r[mapping.description] ?? '').trim().slice(0, 200) : ''
    result.push({ line: i + 1, date, description, amount: Math.round(amount * 100) / 100 })
  }
  return { rows: result, skipped }
}

/** Letra de columna estilo Excel: 0 → A, 25 → Z, 26 → AA. */
export function columnLetter(index: number): string {
  let n = index + 1
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/** Nombre de columna para los selectores ("Columna C" si el encabezado está vacío). */
export function columnLabel(header: Cell[], index: number): string {
  const name = header[index]
  const letter = columnLetter(index)
  return name !== null && name !== undefined && String(name).trim()
    ? `${String(name).trim()} (${letter})`
    : `Columna ${letter}`
}
