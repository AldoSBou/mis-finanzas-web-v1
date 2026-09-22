import { describe, expect, it } from 'vitest'
import { buildRows, detectHeaderRow, guessMapping } from './import-parser'
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

  it('toma solo las filas de movimientos, con la descripción en dos líneas unida', () => {
    expect(table.slice(1)).toEqual([
      ['06/08/26', '07/08/26', 'SUPERMERCADO EJEMPLO LIMA PER', '120.40', null],
      ['07/08/26', '09/08/26', 'STREAMING EJEMPLO CA', null, '15.99'],
      ['09/08/26', '10/08/26', 'TIENDA CON DESCRIPCION EN DOS LINEAS', '1,051.65', null],
      ['04/09/26', '04/09/26', 'SEGURO DE DESGRAVAMEN', null, '5.41'],
      ['08/08/26', '09/08/26', 'GRACIAS POR SU PAGO', '409.48-', null],
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
    // Las filas en dólares no tienen monto en soles: se omiten en esta pasada
    expect(soles.skipped).toBe(2)

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
