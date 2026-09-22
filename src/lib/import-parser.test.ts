import { describe, expect, it } from 'vitest'
import {
  buildRows,
  columnLetter,
  decodeText,
  detectDateFormat,
  detectDecimalStyle,
  detectDelimiter,
  detectHeaderRow,
  guessMapping,
  parseAmount,
  parseCsv,
  parseDate,
} from './import-parser'

describe('parseAmount', () => {
  it('lee formatos comunes de bancos', () => {
    expect(parseAmount('S/ -1,234.56', 'dot')).toBe(-1234.56)
    expect(parseAmount('1.234,56', 'comma')).toBe(1234.56)
    expect(parseAmount('(45.00)', 'dot')).toBe(-45)
    expect(parseAmount('45.00-', 'dot')).toBe(-45)
    expect(parseAmount('US$ 20', 'dot')).toBe(20)
    expect(parseAmount(-12.5, 'dot')).toBe(-12.5)
    expect(parseAmount('', 'dot')).toBeNull()
    expect(parseAmount('Saldo', 'dot')).toBeNull()
  })

  it('detecta coma o punto decimal por mayoría', () => {
    expect(detectDecimalStyle(['1.234,56', '12,00', '3,5'])).toBe('comma')
    expect(detectDecimalStyle(['1,234.56', '12.00'])).toBe('dot')
  })
})

describe('parseDate', () => {
  it('interpreta día/mes/año, año-mes-día y meses en texto', () => {
    expect(parseDate('22/09/2026', 'DMY')).toBe('2026-09-22')
    expect(parseDate('22-09-26', 'DMY')).toBe('2026-09-22')
    expect(parseDate('2026-09-22', 'YMD')).toBe('2026-09-22')
    expect(parseDate('22 set 2026', 'DMY')).toBe('2026-09-22')
    expect(parseDate('22-Sep-2026', 'DMY')).toBe('2026-09-22')
    expect(parseDate('22SEP2026', 'DMY')).toBe('2026-09-22')
    expect(parseDate(new Date(2026, 8, 22), 'DMY')).toBe('2026-09-22')
  })

  it('rechaza fechas imposibles', () => {
    expect(parseDate('31/02/2026', 'DMY')).toBeNull()
    expect(parseDate('Saldo anterior', 'DMY')).toBeNull()
  })

  it('prefiere día/mes/año cuando es ambiguo y detecta mes/día/año cuando no', () => {
    expect(detectDateFormat(['01/02/2026', '03/04/2026'])).toBe('DMY')
    expect(detectDateFormat(['09/22/2026', '09/23/2026'])).toBe('MDY')
    expect(detectDateFormat(['2026-09-22'])).toBe('YMD')
  })
})

describe('CSV', () => {
  it('detecta ; como separador y respeta comillas', () => {
    const text = 'Fecha;Descripción;Monto\n22/09/2026;"PLAZA VEA; SURCO";-120,40\n'
    expect(detectDelimiter(text)).toBe(';')
    expect(parseCsv(text)[1]).toEqual(['22/09/2026', 'PLAZA VEA; SURCO', '-120,40'])
  })

  it('decodifica Windows-1252 si no es UTF-8', () => {
    const latin1 = new Uint8Array([0x44, 0x65, 0x73, 0x63, 0x72, 0x69, 0x70, 0x63, 0x69, 0xf3, 0x6e])
    expect(decodeText(latin1.buffer)).toBe('Descripción')
  })
})

describe('encabezados y filas', () => {
  // Estado de cuenta con líneas previas y columnas cargo/abono
  const bank = parseCsv(
    [
      'Banco de Ejemplo',
      'Cuenta: 191-12345678-0-12',
      'Fecha operación,Fecha valuta,Descripción,Cargo,Abono,Saldo',
      '20/09/2026,20/09/2026,PLAZA VEA SURCO,120.40,,2879.60',
      '21/09/2026,21/09/2026,ABONO SUELDO,,3000.00,5879.60',
      '21/09/2026,21/09/2026,Saldo final,,,5879.60',
    ].join('\n'),
  )

  it('encuentra el encabezado y las columnas', () => {
    const h = detectHeaderRow(bank)
    expect(h).toBe(2)
    expect(guessMapping(bank[h])).toEqual({
      date: 0,
      description: 2,
      amount: null,
      debit: 3,
      credit: 4,
    })
  })

  it('arma filas con signo y salta saldos', () => {
    const h = detectHeaderRow(bank)
    const { rows, skipped } = buildRows(bank, h, guessMapping(bank[h]), {
      dateFormat: 'DMY',
      decimal: 'dot',
      positiveIsIncome: true,
    })
    expect(rows).toEqual([
      { line: 4, date: '2026-09-20', description: 'PLAZA VEA SURCO', amount: -120.4 },
      { line: 5, date: '2026-09-21', description: 'ABONO SUELDO', amount: 3000 },
    ])
    expect(skipped).toBe(1)
  })

  it('en tarjeta de crédito los consumos positivos son gastos', () => {
    const card = parseCsv('Fecha,Comercio,Importe\n20/09/2026,NETFLIX,44.90\n21/09/2026,PAGO RECIBIDO,-300.00')
    const { rows } = buildRows(card, 0, guessMapping(card[0]), {
      dateFormat: 'DMY',
      decimal: 'dot',
      positiveIsIncome: false,
    })
    expect(rows.map((r) => r.amount)).toEqual([-44.9, 300])
  })

  it('no toma "Saldo" como monto', () => {
    expect(guessMapping(['Fecha', 'Detalle', 'Saldo', 'Importe']).amount).toBe(3)
  })
})

describe('columnLetter', () => {
  it('sigue el estilo de Excel', () => {
    expect([0, 25, 26, 27, 701].map(columnLetter)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ'])
  })
})
