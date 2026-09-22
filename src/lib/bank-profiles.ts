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
  /** Filas con el saldo inicial y final del período, para cuadrar */
  openingPattern: RegExp
  closingPattern: RegExp
  /** Dónde conseguir el archivo */
  hint: string
}

const GENERIC: BankProfile = {
  id: 'auto',
  name: 'Otro banco (detección automática)',
  kind: 'ANY',
  verified: false,
  paymentPattern: /gracias por su pago|pago recibido|su pago|pago (de )?tarjeta|pago tc\b|pago minimo/i,
  openingPattern: /saldo anterior|saldo inicial|deuda anterior/i,
  closingPattern: /deuda total|saldo final|saldo actual|nuevo saldo|total a pagar/i,
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
    hint:
      'El PDF del estado de cuenta mensual que llega por correo (la contraseña suele ser tu DNI). ' +
      'Es bimoneda: impórtalo una vez en tu tarjeta en soles y otra en la de dólares.',
  },
]

export const profileById = (id: string) => BANK_PROFILES.find((p) => p.id === id) ?? GENERIC

/** Perfil verificado que reconoce el texto del archivo, si hay alguno. */
export function detectProfile(text: string): BankProfile | null {
  return BANK_PROFILES.find((p) => p.detect && p.detect.test(text)) ?? null
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
