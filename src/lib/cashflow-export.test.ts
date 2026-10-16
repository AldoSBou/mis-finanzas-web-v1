import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { buildWorkbook, gridRows, monthLabel, movementRows, workbookFileName } from './cashflow-export'
import type { CashflowResponse, Transaction } from '@/types/api'

const L = (p: string) => monthLabel(p)

const three: CashflowResponse = {
  baseCurrency: 'PEN',
  periods: ['2026-08', '2026-09', '2026-10'],
  income: [{ id: 1, name: 'Salario', color: null, monthly: ['4500', '4500', '4500'], total: '13500' }],
  expenses: [
    { id: 2, name: 'Vivienda', color: null, monthly: ['1200', '1200', '1200'], total: '3600' },
    { id: 3, name: 'Transporte', color: null, monthly: ['96', '0', '80.5'], total: '176.5' },
  ],
  savings: [{ id: 9, name: 'Ahorros BCP', color: null, monthly: ['600', '600', '600'], total: '1800' }],
  totalIncome: ['4500', '4500', '4500'],
  totalExpenses: ['1296', '1200', '1280.5'],
  totalSavings: ['600', '600', '600'],
  net: ['2604', '2700', '2619.5'],
  cumulative: ['2604', '5304', '7923.5'],
}

describe('exportación del flujo de caja', () => {
  it('arma la grilla con total y promedio cuando hay varios meses', () => {
    const rows = gridRows(three, 'PEN')
    expect(rows[0]).toEqual(['Flujo de caja (PEN)'])
    expect(rows[2]).toEqual(['Concepto', L('2026-08'), L('2026-09'), L('2026-10'), 'Total', 'Promedio'])
    const transporte = rows.find((r) => r[0] === 'Transporte')!
    expect(transporte).toEqual(['Transporte', 96, 0, 80.5, 176.5, 58.83])
    const totalGastos = rows.find((r) => r[0] === 'Total gastos')!
    expect(totalGastos).toEqual(['Total gastos', 1296, 1200, 1280.5, 3776.5, 1258.83])
    expect(rows.find((r) => r[0] === 'Acumulado')).toEqual(['Acumulado', 2604, 5304, 7923.5])
  })

  it('con un solo mes no hay total ni acumulado', () => {
    const one: CashflowResponse = {
      ...three,
      periods: ['2026-10'],
      income: [{ id: 1, name: 'Salario', color: null, monthly: ['4500'], total: '4500' }],
      expenses: [],
      savings: [],
      totalIncome: ['4500'],
      totalExpenses: ['0'],
      totalSavings: ['0'],
      net: ['4500'],
      cumulative: ['4500'],
    }
    const rows = gridRows(one, 'PEN')
    expect(rows[2]).toEqual(['Concepto', L('2026-10')])
    expect(rows.find((r) => r[0] === 'Acumulado')).toBeUndefined()
    expect(workbookFileName(one)).toBe('flujo-de-caja-2026-10.xlsx')
    expect(workbookFileName(three)).toBe('flujo-de-caja-2026-08_2026-10.xlsx')
  })

  it('genera un libro legible con las dos hojas', () => {
    const tx = {
      id: 1,
      type: 'EXPENSE',
      transactionDate: '2026-10-05',
      categoryName: 'Vivienda',
      accountName: 'Principal',
      toAccountName: null,
      description: 'Alquiler',
      amount: '1200.00',
      currency: 'PEN',
      amountBase: '1200.00',
    } as unknown as Transaction
    const wb = buildWorkbook(three, 'PEN', [tx])
    expect(wb.SheetNames).toEqual(['Flujo de caja', 'Movimientos'])
    const bin = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    const back = XLSX.read(bin, { type: 'array', cellNF: true })
    const grid = XLSX.utils.sheet_to_json<(string | number)[]>(back.Sheets['Flujo de caja'], { header: 1 })
    expect(grid[2]).toEqual(['Concepto', L('2026-08'), L('2026-09'), L('2026-10'), 'Total', 'Promedio'])
    const cell = back.Sheets['Flujo de caja']['B5']
    expect(cell.t).toBe('n')
    expect(cell.z).toBe('#,##0.00')
    expect(movementRows([tx])[1]).toEqual(['2026-10-05', 'Gasto', 'Vivienda', 'Principal', 'Alquiler', 1200, 'PEN', 1200])
  })
})
