import type { Cell } from './import-parser'

/**
 * Convierte el texto posicionado de un estado de cuenta en PDF en una tabla
 * (primera fila = encabezados), para reutilizar el mismo flujo que un CSV.
 *
 * Los PDF no tienen columnas: solo fragmentos de texto con posición. Por eso:
 * 1. Las filas de movimientos son las líneas que empiezan con una fecha y tienen un monto
 *    (así se ignoran saldos, totales, títulos de sección y tablas de cuotas).
 * 2. Las columnas se deducen de esas filas: los textos se alinean por su borde izquierdo
 *    y los montos por el derecho (van alineados a la derecha, p. ej. "Soles" y "Dólares").
 * 3. Los nombres de columna salen de las palabras del encabezado más cercanas.
 */

export interface PdfItem {
  /** Borde izquierdo */
  x: number
  /** Línea base (en PDF crece hacia arriba) */
  y: number
  /** Ancho */
  w: number
  str: string
}

interface Column {
  kind: 'text' | 'num'
  /** Borde izquierdo (texto) o derecho (montos) promedio */
  anchor: number
  from: number
  to: number
  hits: number
  isDate: boolean
}

const DATE_RE =
  /^(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}[\s\-/.]?[a-zA-Z]{3}[\s\-/.]?\d{2,4}|\d{1,2}[\s\-/.][a-zA-Z]{3,4}\.?|\d{1,2}\/\d{1,2})$/
const AMOUNT_RE = /^[-(]?\s*(S\/|US\$|\$)?\s*-?\d{1,3}([.,\s]\d{3})*([.,]\d{1,2})?\s*\)?-?$/

/** Palabras típicas de encabezado (sin tildes) */
const HEADER_WORD =
  /fecha|date|descrip|detalle|concepto|glosa|movimiento|operaci|referencia|comercio|monto|importe|valor|cargo|abono|debito|credito|saldo|soles|dolares|moneda|amount|^s\/\.?$|^us\$$/

const plain = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')

const isDate = (s: string) => DATE_RE.test(s.trim())
const isAmount = (s: string) => {
  const t = s.trim()
  // Un número suelto sin decimales ni separador (p. ej. "0" o un año) no es un monto
  return AMOUNT_RE.test(t) && /[.,]\d{2}\)?-?$/.test(t)
}

/** Agrupa fragmentos en líneas (de arriba abajo) y une palabras contiguas de un mismo texto. */
export function toLines(items: PdfItem[]): PdfItem[][] {
  const lines: Array<{ y: number; items: PdfItem[] }> = []
  for (const it of items) {
    if (!it.str.trim()) continue
    let line = lines.find((l) => Math.abs(l.y - it.y) <= 2)
    if (!line) {
      line = { y: it.y, items: [] }
      lines.push(line)
    }
    line.items.push({ ...it, str: it.str.trim() })
  }
  lines.sort((a, b) => b.y - a.y)
  return lines.map((l) => {
    const sorted = l.items.sort((a, b) => a.x - b.x)
    const merged: PdfItem[] = []
    for (const it of sorted) {
      const prev = merged[merged.length - 1]
      const gap = prev ? it.x - (prev.x + prev.w) : Infinity
      const bothText = prev && !isAmount(prev.str) && !isAmount(it.str) && !isDate(prev.str) && !isDate(it.str)
      if (prev && bothText && gap < 4.5) {
        prev.str = `${prev.str} ${it.str}`
        prev.w = it.x + it.w - prev.x
      } else {
        merged.push({ ...it })
      }
    }
    return merged
  })
}

const isTransactionLine = (line: PdfItem[]) =>
  line.length >= 2 && isDate(line[0].str) && line.some((i) => isAmount(i.str))

/**
 * Totales del período (se conservan para cuadrar; al no tener fecha no se importan).
 * Incluye los de Interbank: "Debías en el estado de cuenta anterior" y "Pago del mes".
 */
const SUMMARY_RE =
  /^(saldo anterior|saldo inicial|deuda anterior|deuda total|saldo final|saldo actual|nuevo saldo|total a pagar|pago del mes|deb[ií]as en el estado de cuenta anterior)/i

const isSummaryLine = (line: PdfItem[]) =>
  SUMMARY_RE.test(line[0].str.trim()) && line.some((i) => isAmount(i.str))

/**
 * Fragmentos que son encabezados: al menos la mitad de sus palabras son de encabezado.
 * Descarta el nombre del titular y frases como "El monto total a pagar está compuesto…".
 */
const headerItems = (line: PdfItem[]) =>
  line.filter((i) => {
    const ws = i.str.split(/\s+/).filter(Boolean)
    return ws.filter((w) => HEADER_WORD.test(plain(w))).length * 2 >= ws.length
  })

/**
 * Encabezado de la tabla: de las líneas sobre cada bloque de movimientos (hasta 6, a ≤ 60 pt,
 * sin montos), el bloque con más palabras de encabezado. Así funciona aunque el primer bloque
 * (p. ej. los pagos) no tenga los títulos de columna y otro (los consumos) sí.
 */
function findHeaderLines(pageLines: PdfItem[][][]): PdfItem[][] {
  let best: PdfItem[][] = []
  let bestScore = 0
  for (const lines of pageLines) {
    lines.forEach((line, idx) => {
      if (!isTransactionLine(line) || (idx > 0 && isTransactionLine(lines[idx - 1]))) return
      const candidate = lines
        .slice(Math.max(0, idx - 6), idx)
        .filter((l) => l[0].y - line[0].y <= 60 && !l.some((i) => isAmount(i.str)))
        .map(headerItems)
        .filter((l) => l.length > 0)
      const score = candidate.reduce((s, l) => s + l.length, 0)
      if (score > bestScore) {
        bestScore = score
        best = candidate
      }
    })
  }
  return best
}

/** Agrupa posiciones cercanas (±8 pt) en columnas. */
function clusterColumns(lines: PdfItem[][]): Column[] {
  const columns: Column[] = []
  for (const line of lines) {
    for (const it of line) {
      const kind = isAmount(it.str) ? 'num' : 'text'
      const anchor = kind === 'num' ? it.x + it.w : it.x
      let col = columns.find((c) => c.kind === kind && Math.abs(c.anchor - anchor) <= 8)
      if (!col) {
        col = { kind, anchor, from: it.x, to: it.x + it.w, hits: 0, isDate: true }
        columns.push(col)
      }
      col.anchor = (col.anchor * col.hits + anchor) / (col.hits + 1)
      col.hits++
      col.from = Math.min(col.from, it.x)
      col.to = Math.max(col.to, it.x + it.w)
      col.isDate = col.isDate && isDate(it.str)
    }
  }
  return columns.sort((a, b) => a.from - b.from)
}

function columnFor(it: PdfItem, columns: Column[]): number {
  const kind = isAmount(it.str) ? 'num' : 'text'
  const anchor = kind === 'num' ? it.x + it.w : it.x
  let best = 0
  let bestDist = Infinity
  columns.forEach((c, i) => {
    const dist = Math.abs(c.anchor - anchor) + (c.kind === kind ? 0 : 1000)
    if (dist < bestDist) {
      bestDist = dist
      best = i
    }
  })
  return best
}

/** Distancia de un punto a un rango (0 si está dentro). */
const distance = (x: number, from: number, to: number) => (x < from ? from - x : x > to ? x - to : 0)

/** Palabras de un fragmento con su posición estimada (ancho de carácter promedio). */
function words(it: PdfItem): Array<{ x: number; w: number; s: string }> {
  const charW = it.w / Math.max(it.str.length, 1)
  const out: Array<{ x: number; w: number; s: string }> = []
  const re = /\S+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(it.str))) {
    out.push({ x: it.x + m.index * charW, w: m[0].length * charW, s: m[0] })
  }
  return out
}

/** Nombres de columna a partir de las líneas de encabezado sobre la primera fila de datos. */
function headerNames(headerLines: PdfItem[][], columns: Column[]): string[] {
  const names: string[][] = columns.map(() => [])
  for (const line of headerLines) {
    for (const it of line) {
      for (const w of words(it)) {
        const center = w.x + w.w / 2
        let best = -1
        let bestDist = 25
        columns.forEach((c, i) => {
          const d = distance(center, c.from, c.to)
          if (d < bestDist) {
            bestDist = d
            best = i
          }
        })
        if (best >= 0) names[best].push(w.s)
      }
    }
  }
  let dates = 0
  let amounts = 0
  return columns.map((c, i) => {
    if (names[i].length) return names[i].join(' ')
    if (c.isDate) return dates++ === 0 ? 'Fecha' : `Fecha ${dates}`
    if (c.kind === 'num') return amounts++ === 0 ? 'Monto' : `Monto ${amounts + 1}`
    return 'Descripción'
  })
}

/** Tabla lista para el flujo de importación: encabezados + una fila por movimiento. */
export function pdfToTable(pages: PdfItem[][]): Cell[][] {
  const pageLines = pages.map(toLines)
  const txLines = pageLines.flat().filter(isTransactionLine)
  if (txLines.length === 0) return []

  const columns = clusterColumns(txLines)
  // Columna de descripción: la de texto (no fecha) con más contenido
  const textCols = columns
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.kind === 'text' && !c.isDate)
  const descIndex = textCols.length
    ? textCols.reduce((a, b) => (b.c.to - b.c.from > a.c.to - a.c.from ? b : a)).i
    : -1

  const rows: Cell[][] = [headerNames(findHeaderLines(pageLines), columns)]
  for (const lines of pageLines) {
    let last: Cell[] | null = null
    for (const line of lines) {
      if (isTransactionLine(line) || isSummaryLine(line)) {
        const row: Cell[] = columns.map(() => null)
        for (const it of line) {
          const i = columnFor(it, columns)
          row[i] = row[i] ? `${row[i]} ${it.str}` : it.str
        }
        rows.push(row)
        last = isTransactionLine(line) ? row : null
      } else if (
        // Descripción que continúa en la línea siguiente (empieza en su columna, sin montos)
        last &&
        descIndex >= 0 &&
        line[0].x >= columns[descIndex].from - 2 &&
        !line.some((i) => isAmount(i.str) || isDate(i.str))
      ) {
        last[descIndex] = `${last[descIndex] ?? ''} ${line.map((i) => i.str).join(' ')}`.trim()
      } else {
        last = null
      }
    }
  }
  return rows
}

// ---------------------------------------------------------------
// Lectura con pdf.js (solo navegador)
// ---------------------------------------------------------------

/** El PDF tiene contraseña (o la ingresada es incorrecta). */
export class PdfPasswordError extends Error {
  readonly incorrect: boolean

  constructor(incorrect: boolean) {
    super(incorrect ? 'Contraseña incorrecta' : 'El PDF tiene contraseña')
    this.name = 'PdfPasswordError'
    this.incorrect = incorrect
  }
}

export async function readPdf(
  buffer: ArrayBuffer,
  password?: string,
): Promise<{ rows: Cell[][]; text: string }> {
  // pdf.js pesa ~1 MB: se descarga solo al abrir un PDF
  const pdfjs = await import('pdfjs-dist')
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  // La tarea de carga libera el worker al terminar (en pdf.js 6 el documento no tiene destroy)
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer), password })
  const pages: PdfItem[][] = []
  try {
    const doc = await task.promise
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const content = await page.getTextContent()
      pages.push(
        content.items
          .filter((i): i is typeof i & { str: string; transform: number[]; width: number } => 'str' in i)
          .map((i) => ({ x: i.transform[4], y: i.transform[5], w: i.width, str: i.str })),
      )
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'PasswordException') {
      throw new PdfPasswordError(!!password)
    }
    throw err
  } finally {
    await task.destroy()
  }
  const table = pdfToTable(pages)
  if (table.length <= 1) {
    throw new Error(
      'no se encontraron movimientos. Si es un PDF escaneado (imagen), descarga el estado de cuenta en Excel o CSV',
    )
  }
  return { rows: table, text: pages.flat().map((i) => i.str).join(' ') }
}
