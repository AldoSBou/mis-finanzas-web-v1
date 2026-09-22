import { describe, expect, it } from 'vitest'
import { applyProfile, detectProfile, profileById } from './bank-profiles'
import { buildRows, detectHeaderRow, guessMapping, reconcile } from './import-parser'
import { pdfToTable, toLines, type PdfItem } from './pdf-parser'

/**
 * Estado de cuenta de tarjeta inventado que imita el formato de un banco peruano:
 * encabezado partido en varias líneas, secciones, montos alineados a la derecha en
 * columnas Soles / Dólares, pagos con "-" al final y una tabla de cuotas que no se importa.
 */
const item = (x: number, y: number, str: string, charW = 4.2): PdfItem => ({
  x,
  y,
  w: str.length * charW,
  str,
})
/** Monto alineado a la derecha en `right` */
const amount = (right: number, y: number, str: string): PdfItem => item(right - str.length * 4.2, y, str)
const SOLES = 472
const DOLARES = 536

const page: PdfItem[] = [
  item(269, 731, 'DEL PERIODO DE FACTURACION DEL'),
  item(456, 692, 'Deuda Total'),
  item(18, 684, 'Fecha Compra Fecha Proceso Descripción'),
  item(436, 676, 'Soles'),
  item(496, 676, 'Dólares'),
  item(19, 659, 'Saldo Anterior'),
  amount(SOLES, 659, '1,500.00'),
  amount(DOLARES, 659, '40.00'),
  item(19, 639, 'CONSUMO DEL TITULAR: JUAN PEREZ'),
  // Consumos
  item(31, 630, '06/08/26'), item(87, 630, '07/08/26'), item(132, 630, 'SUPERMERCADO EJEMPLO LIMA PER'), amount(SOLES, 630, '120.40'),
  item(31, 622, '07/08/26'), item(87, 622, '09/08/26'), item(132, 622, 'STREAMING EJEMPLO CA'), amount(DOLARES, 622, '15.99'),
  item(31, 613, '09/08/26'), item(87, 613, '10/08/26'), item(132, 613, 'TIENDA CON DESCRIPCION'), amount(SOLES, 613, '1,051.65'),
  item(132, 605, 'EN DOS LINEAS'),
  item(19, 590, 'INTERESES,COMISIONES Y GASTOS'),
  item(31, 581, '04/09/26'), item(87, 581, '04/09/26'), item(132, 581, 'SEGURO DE DESGRAVAMEN'), amount(DOLARES, 581, '5.41'),
  item(19, 567, 'PAGOS Y AJUSTES'),
  item(31, 558, '08/08/26'), item(87, 558, '09/08/26'), item(132, 558, 'GRACIAS POR SU PAGO'), amount(SOLES, 558, '409.48-'),
  item(19, 540, 'Deuda Total'),
  amount(SOLES, 540, '2,262.57'),
  amount(DOLARES, 540, '61.40'),
  // Tabla de cuotas: empieza con descripción, no con fecha → no se importa
  item(16, 500, 'Consumos en Cuotas'),
  item(19, 480, 'TIENDA CON DESCRIPCION'), item(152, 480, '09/08/26'), amount(265, 480, '1,051.65'), amount(419, 480, '175.28'),
]

describe('toLines', () => {
  it('ordena de arriba abajo y une palabras contiguas', () => {
    const lines = toLines([item(10, 100, 'COMPRA'), item(10 + 6 * 4.2 + 2, 100, 'TIENDA'), item(10, 120, 'Arriba')])
    expect(lines.map((l) => l.map((i) => i.str))).toEqual([['Arriba'], ['COMPRA TIENDA']])
  })
})

describe('pdfToTable', () => {
  const table = pdfToTable([page])

  it('deduce columnas y nombres del encabezado partido', () => {
    expect(table[0]).toEqual(['Fecha Compra', 'Fecha Proceso', 'Descripción', 'Soles', 'Dólares'])
  })

  it('toma las filas de movimientos (y los totales para cuadrar), con la descripción en dos líneas unida', () => {
    expect(table.slice(1)).toEqual([
      ['Saldo Anterior', null, null, '1,500.00', '40.00'],
      ['06/08/26', '07/08/26', 'SUPERMERCADO EJEMPLO LIMA PER', '120.40', null],
      ['07/08/26', '09/08/26', 'STREAMING EJEMPLO CA', null, '15.99'],
      ['09/08/26', '10/08/26', 'TIENDA CON DESCRIPCION EN DOS LINEAS', '1,051.65', null],
      ['04/09/26', '04/09/26', 'SEGURO DE DESGRAVAMEN', null, '5.41'],
      ['08/08/26', '09/08/26', 'GRACIAS POR SU PAGO', '409.48-', null],
      ['Deuda Total', null, null, '2,262.57', '61.40'],
    ])
  })

  it('cuadra con el flujo de importación: consumos como gastos y pagos como entradas', () => {
    const h = detectHeaderRow(table)
    const mapping = guessMapping(table[h])
    expect(mapping).toMatchObject({ date: 0, description: 2, amount: 3 })

    const soles = buildRows(table, h, mapping, { dateFormat: 'DMY', decimal: 'dot', positiveIsIncome: false })
    expect(soles.rows.map((r) => [r.date, r.amount])).toEqual([
      ['2026-08-06', -120.4],
      ['2026-08-09', -1051.65],
      ['2026-08-08', 409.48],
    ])
    // Omitidas: las 2 filas en dólares (sin monto en soles) y los 2 totales (sin fecha)
    expect(soles.skipped).toBe(4)

    const dolares = buildRows(table, h, { ...mapping, amount: 4 }, {
      dateFormat: 'DMY',
      decimal: 'dot',
      positiveIsIncome: false,
    })
    expect(dolares.rows.map((r) => r.amount)).toEqual([-15.99, -5.41])
  })

  it('devuelve vacío si no hay filas con fecha y monto (p. ej. un PDF escaneado)', () => {
    expect(pdfToTable([[item(10, 100, 'Texto sin movimientos')]])).toEqual([])
  })
})

describe('cuadre con los totales del estado de cuenta', () => {
  const table = pdfToTable([page])
  const profile = profileById('scotiabank-tc')
  const patterns = { opening: profile.openingPattern, closing: profile.closingPattern }
  const options = { dateFormat: 'DMY' as const, decimal: 'dot' as const, positiveIsIncome: false }

  it('cuadra en soles y en dólares', () => {
    for (const [currency, col] of [['PEN', 3], ['USD', 4]] as const) {
      const mapping = applyProfile(profile, table[0], currency, guessMapping(table[0]))
      expect(mapping.amount).toBe(col)
      const { rows } = buildRows(table, 0, mapping, options)
      expect(reconcile(table, 0, mapping, options, rows, patterns)).toMatchObject({ ok: true, difference: 0 })
    }
  })

  it('avisa cuánto falta si se pierde una fila', () => {
    const mapping = applyProfile(profile, table[0], 'PEN', guessMapping(table[0]))
    const { rows } = buildRows(table, 0, mapping, options)
    // Sin el consumo de 1,051.65 la deuda no cuadra por ese monto
    const partial = rows.filter((r) => r.amount !== -1051.65)
    expect(reconcile(table, 0, mapping, options, partial, patterns)).toMatchObject({
      ok: false,
      difference: 1051.65,
    })
  })

  it('sin totales en el archivo no hay cuadre', () => {
    const noTotals = table.filter((r) => !String(r[0]).match(/saldo|deuda/i))
    const mapping = guessMapping(noTotals[0])
    const { rows } = buildRows(noTotals, 0, mapping, options)
    expect(reconcile(noTotals, 0, mapping, options, rows, patterns)).toBeNull()
  })
})

describe('perfiles de banco', () => {
  it('reconoce Scotiabank por el texto y deja lo demás en automático', () => {
    expect(detectProfile('SCOTIABANK PERU S.A.A. Estado de cuenta')?.id).toBe('scotiabank-tc')
    expect(detectProfile('Banco cualquiera')).toBeNull()
  })

  it('el perfil elige la fecha de compra aunque haya otra columna de fecha antes', () => {
    const header = ['Fecha Proceso', 'Fecha Compra', 'Descripción', 'Soles', 'Dólares']
    const mapping = applyProfile(profileById('scotiabank-tc'), header, 'USD', guessMapping(header))
    expect(mapping).toMatchObject({ date: 1, amount: 4 })
  })

  it('reconoce los pagos de la tarjeta', () => {
    expect(profileById('scotiabank-tc').paymentPattern.test('GRACIAS POR SU PAGO LIMA PER')).toBe(true)
    expect(profileById('auto').paymentPattern.test('PAGO RECIBIDO - GRACIAS')).toBe(true)
  })
})
