import type { Cell, ColumnMapping } from './import-parser'

/**
 * Perfiles de estados de cuenta por banco. El lector genérico funciona con cualquier banco;
 * un perfil agrega lo que sabemos de un formato concreto: qué columnas usar, cómo leer el
 * signo, qué filas son pagos de la tarjeta y cómo se llaman los totales para cuadrar.
 *
 * Solo se marca como verificado un perfil probado con un estado de cuenta real.
 */
export interface BankProfile {
  id: string
  name: string
  /** Producto al que aplica (para avisar si no coincide con la cuenta elegida) */
  kind: 'CREDIT_CARD' | 'BANK' | 'ANY'
  verified: boolean
  /** Reconoce el banco por el texto del archivo */
  detect?: RegExp
  /** Columna de fecha preferida (por encabezado) */
  dateHeader?: RegExp
  /** Columna de monto según la moneda de la cuenta destino */
  amountHeader?: { PEN: RegExp; USD: RegExp }
  /** Montos positivos = entradas (cuenta) o consumos (tarjeta); undefined = según la cuenta */
  positiveIsIncome?: boolean
  /** Filas que son pagos de la tarjeta: se sugieren como transferencia desde la cuenta de pago */
  paymentPattern: RegExp
  /**
   * Filas con el saldo inicial y final del período, para cuadrar. Sin `openingPattern`, el
   * total final es la suma de los movimientos del período (bancos que no muestran saldo anterior).
   */
  openingPattern?: RegExp
  closingPattern: RegExp
  /**
   * Datos del ciclo para registrar el pago del mes (tarjetas). Recibe el texto del archivo con
   * los espacios normalizados; lo que no encuentre queda para que lo complete el usuario.
   */
  statement?: (text: string, currency: string) => StatementInfo
  /** Dónde conseguir el archivo */
  hint: string
}

/** Datos del ciclo de la tarjeta leídos del estado de cuenta ('YYYY-MM-DD' y montos '1234.56'). */
export interface StatementInfo {
  closingDate?: string
  dueDate?: string
  totalDue?: string
  minimumDue?: string
}

const DATE = String.raw`(\d{1,2}[/-]\d{1,2}[/-]\d{4})`
const AMOUNT = String.raw`([\d,]+\.\d{2})`

/** 'dd/mm/yyyy' o 'dd-mm-yyyy' → 'yyyy-mm-dd' */
function dmy(value?: string): string | undefined {
  const m = value && /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value)
  if (!m) return undefined
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return undefined
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const plain = (amount?: string) => (amount ? amount.replace(/,/g, '') : undefined)

/** Cierre y vencimiento con las etiquetas más comunes; sirve para cualquier banco. */
function genericStatement(text: string): StatementInfo {
  const closing = new RegExp(
    String.raw`(?:al cierre de|fecha de (?:cierre|corte)|facturaci[oó]n del \S+ al)\s*:?\s*${DATE}`,
    'i',
  ).exec(text)
  const due = new RegExp(
    String.raw`(?:[uú]ltimo d[ií]a de pago|fecha l[ií]mite de pago|fecha de vencimiento|pagar hasta(?: el)?)\s*:?\s*${DATE}`,
    'i',
  ).exec(text)
  return { closingDate: dmy(closing?.[1]), dueDate: dmy(due?.[1]) }
}

/**
 * Vencimiento sin etiqueta: la fecha más tardía hasta 60 días después del cierre (otras fechas
 * del PDF, como números de operación con guiones, quedan fuera de esa ventana).
 */
function dueAfter(text: string, closing: string): string | undefined {
  const limit = new Date(`${closing}T00:00:00Z`)
  limit.setUTCDate(limit.getUTCDate() + 60)
  const max = limit.toISOString().slice(0, 10)
  let best: string | undefined
  for (const m of text.matchAll(new RegExp(String.raw`\b${DATE}\b`, 'g'))) {
    const d = dmy(m[1])
    if (d && d > closing && d <= max && (!best || d > best)) best = d
  }
  return best
}

const GENERIC: BankProfile = {
  id: 'auto',
  name: 'Otro banco (detección automática)',
  kind: 'ANY',
  verified: false,
  paymentPattern: /gracias por su pago|pago recibido|su pago|pago (de )?tarjeta|pago tc\b|pago minimo/i,
  openingPattern: /saldo anterior|saldo inicial|deuda anterior/i,
  closingPattern: /deuda total|saldo final|saldo actual|nuevo saldo|total a pagar/i,
  statement: genericStatement,
  hint: 'Sube el PDF del estado de cuenta o los movimientos en Excel/CSV de la banca por internet.',
}

export const BANK_PROFILES: BankProfile[] = [
  GENERIC,
  {
    id: 'scotiabank-tc',
    name: 'Scotiabank – Tarjeta de crédito',
    kind: 'CREDIT_CARD',
    verified: true,
    detect: /scotiabank/i,
    dateHeader: /fecha compra/i,
    amountHeader: { PEN: /soles/i, USD: /d[oó]lares/i },
    positiveIsIncome: false,
    paymentPattern: /gracias por su pago/i,
    openingPattern: /^saldo anterior$/i,
    closingPattern: /^deuda total$/i,
    // "PERIODO DE FACTURACION DEL 05-08-2026 AL 04-09-2026"; el último día de pago es la fecha
    // suelta más reciente. El pago del mes no viene como texto: lo ingresa el usuario.
    statement: (text) => {
      const closing = dmy(new RegExp(String.raw`facturaci[oó]n del \S+ al ${DATE}`, 'i').exec(text)?.[1])
      return { closingDate: closing, dueDate: closing ? dueAfter(text, closing) : undefined }
    },
    hint:
      'El PDF del estado de cuenta mensual que llega por correo (la contraseña suele ser tu DNI). ' +
      'Es bimoneda: impórtalo una vez en tu tarjeta en soles y otra en la de dólares.',
  },
  {
    id: 'interbank-tc',
    name: 'Interbank – Tarjeta de crédito',
    kind: 'CREDIT_CARD',
    verified: true,
    detect: /interbank/i,
    dateHeader: /^fecha$/i,
    amountHeader: { PEN: /^s\/\.?$/i, USD: /^us\$$/i },
    positiveIsIncome: false,
    paymentPattern: /pago tarj|pago de tarjeta|pago recibido/i,
    // Deuda anterior + pagos, consumos y cobros del período = "Pago del mes (Suma de subtotales)"
    openingPattern: /^deb[ií]as en el estado de cuenta anterior/i,
    closingPattern: /^pago del mes\b/i,
    // Cabecera: "ÚLTIMO DÍA DE PAGO | PAGO DEL MES | PAGO MÍNIMO" seguida de
    // "15/09/2026 S/ 3,728.31 US$ 23.60 S/ 234.70 US$ 10.58"
    statement: (text, currency) => {
      const closing = dmy(new RegExp(String.raw`al cierre de ${DATE}`, 'i').exec(text)?.[1])
      const m = new RegExp(
        String.raw`${DATE} S/ ?${AMOUNT} US\$ ?${AMOUNT} S/ ?${AMOUNT} US\$ ?${AMOUNT}`,
      ).exec(text)
      if (!m) return { closingDate: closing }
      const usd = currency === 'USD'
      return {
        closingDate: closing,
        dueDate: dmy(m[1]),
        totalDue: plain(usd ? m[3] : m[2]),
        minimumDue: plain(usd ? m[5] : m[4]),
      }
    },
    hint:
      'El PDF del estado de cuenta mensual (contraseña habitual: tu DNI). Las fechas vienen sin ' +
      'año y se completan con el período. Es bimoneda: impórtalo una vez por moneda.',
  },
]

export const profileById = (id: string) => BANK_PROFILES.find((p) => p.id === id) ?? GENERIC

/** Perfil verificado que reconoce el texto del archivo, si hay alguno. */
export function detectProfile(text: string): BankProfile | null {
  return BANK_PROFILES.find((p) => p.detect && p.detect.test(text)) ?? null
}

/** Datos del ciclo según el perfil, completando con las etiquetas genéricas. */
export function extractStatement(profile: BankProfile, text: string, currency: string): StatementInfo {
  const normalized = text.replace(/\s+/g, ' ')
  const generic = genericStatement(normalized)
  const own = profile.statement ? profile.statement(normalized, currency) : {}
  return {
    closingDate: own.closingDate ?? generic.closingDate,
    dueDate: own.dueDate ?? generic.dueDate,
    totalDue: own.totalDue,
    minimumDue: own.minimumDue,
  }
}

/** Ajusta el mapeo adivinado con lo que el perfil sabe del formato. */
export function applyProfile(
  profile: BankProfile,
  header: Cell[],
  currency: string,
  guess: ColumnMapping,
): ColumnMapping {
  const find = (re?: RegExp) => (re ? header.findIndex((c) => re.test(String(c ?? ''))) : -1)
  const mapping = { ...guess }
  const date = find(profile.dateHeader)
  if (date >= 0) mapping.date = date
  if (profile.amountHeader) {
    const amount = find(currency === 'USD' ? profile.amountHeader.USD : profile.amountHeader.PEN)
    if (amount >= 0) {
      mapping.amount = amount
      mapping.debit = null
      mapping.credit = null
    }
  }
  return mapping
}
