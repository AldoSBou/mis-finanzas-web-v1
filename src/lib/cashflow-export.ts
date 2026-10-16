import * as XLSX from 'xlsx'
import type { CashflowResponse, CashflowRow, Transaction } from '@/types/api'

type Cell = string | number | null

/** Etiqueta corta de columna: '2026-10' → 'oct. 2026' */
export function monthLabel(period: string): string {
  const [y, m] = period.split('-').map(Number)
  return new Intl.DateTimeFormat('es-PE', { month: 'short', year: 'numeric' }).format(new Date(y, m - 1, 1))
}

function num(v: string): number {
  return Math.round(parseFloat(v) * 100) / 100
}

/** Filas de la grilla tal como van a la hoja: título, cabecera, secciones con totales, saldo y acumulado. */
export function gridRows(data: CashflowResponse, currency: string): Cell[][] {
  const n = data.periods.length
  const single = n === 1
  const header: Cell[] = ['Concepto', ...data.periods.map(monthLabel)]
  if (!single) header.push('Total', 'Promedio')
  const rows: Cell[][] = [[`Flujo de caja (${currency})`], [], header]

  const section = (title: string, list: CashflowRow[], totals: string[], totalLabel: string) => {
    rows.push([title])
    for (const r of list) {
      const line: Cell[] = [r.name, ...r.monthly.map(num)]
      if (!single) line.push(num(r.total), Math.round((parseFloat(r.total) / n) * 100) / 100)
      rows.push(line)
    }
    const t: Cell[] = [totalLabel, ...totals.map(num)]
    if (!single) {
      const sum = totals.reduce((s, v) => s + parseFloat(v), 0)
      t.push(Math.round(sum * 100) / 100, Math.round((sum / n) * 100) / 100)
    }
    rows.push(t, [])
  }
  section('Ingresos', data.income, data.totalIncome, 'Total ingresos')
  section('Gastos', data.expenses, data.totalExpenses, 'Total gastos')
  section('Ahorro e inversión', data.savings, data.totalSavings, 'Total ahorro')
  rows.push(['Saldo del mes', ...data.net.map(num)])
  if (!single) rows.push(['Acumulado', ...data.cumulative.map(num)])
  return rows
}

export function gridSheet(data: CashflowResponse, currency: string): XLSX.WorkSheet {
  const rows = gridRows(data, currency)
  const ws = XLSX.utils.aoa_to_sheet(rows)
  // Formato de moneda en todas las celdas numéricas
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = 1; C <= range.e.c; C++) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })]
      if (cell && cell.t === 'n') cell.z = '#,##0.00'
    }
  }
  ws['!cols'] = [{ wch: 28 }, ...rows[2].slice(1).map(() => ({ wch: 14 }))]
  return ws
}

export function movementRows(txs: Transaction[]): Cell[][] {
  const rows: Cell[][] = [['Fecha', 'Tipo', 'Categoría', 'Cuenta', 'Descripción', 'Monto', 'Moneda', 'Monto en moneda base']]
  for (const t of [...txs].sort((a, b) => a.transactionDate.localeCompare(b.transactionDate))) {
    rows.push([
      t.transactionDate,
      t.type === 'INCOME' ? 'Ingreso' : t.type === 'EXPENSE' ? 'Gasto' : 'Transferencia',
      t.categoryName ?? (t.type === 'TRANSFER' ? `→ ${t.toAccountName ?? ''}` : ''),
      t.accountName ?? '',
      t.description ?? '',
      num(t.amount),
      t.currency,
      num(t.amountBase),
    ])
  }
  return rows
}

export function movementsSheet(txs: Transaction[]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(movementRows(txs))
  ws['!cols'] = [{ wch: 12 }, { wch: 13 }, { wch: 18 }, { wch: 16 }, { wch: 32 }, { wch: 12 }, { wch: 8 }, { wch: 18 }]
  return ws
}

/** Arma el libro completo: la grilla y, con un solo mes, la hoja de movimientos. */
export function buildWorkbook(data: CashflowResponse, currency: string, movements?: Transaction[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, gridSheet(data, currency), 'Flujo de caja')
  if (movements) XLSX.utils.book_append_sheet(wb, movementsSheet(movements), 'Movimientos')
  return wb
}

export function workbookFileName(data: CashflowResponse): string {
  const first = data.periods[0]
  const last = data.periods[data.periods.length - 1]
  return `flujo-de-caja-${first}${data.periods.length === 1 ? '' : `_${last}`}.xlsx`
}
