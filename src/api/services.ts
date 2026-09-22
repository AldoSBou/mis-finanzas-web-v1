import { api } from '@/lib/api-client'
import type {
  Account,
  AccountRequest,
  AllocationRule,
  AllocationRuleRequest,
  Category,
  CategoryBudgetSummary,
  CategoryRequest,
  DashboardResponse,
  ExchangeRate,
  MonthlyBudget,
  MonthlyBudgetRequest,
  Recurring,
  RecurringRequest,
  RegisterOccurrenceRequest,
  ReportResponse,
  Transaction,
  TransactionPage,
  TransactionRequest,
  TransactionSearch,
} from '@/types/api'
import type { Meta } from '@/types/envelope'

/**
 * Nota: el interceptor de Axios desempaca el envelope automáticamente.
 * Por eso `r.data` ya es el DTO real (no el ApiResponse).
 *
 * Para colecciones paginadas, el backend desempaca el TransactionPage en:
 *   data: items[]
 *   meta.pagination: { page, size, total, totalPages }
 * Por eso reconstruimos el TransactionPage desde response.meta.
 */

export const categoriesApi = {
  list: (includeArchived = false) =>
    api
      .get<Category[]>('/categories', { params: { includeArchived } })
      .then((r) => r.data),
  create: (req: CategoryRequest) =>
    api.post<Category>('/categories', req).then((r) => r.data),
  update: (id: number, req: CategoryRequest) =>
    api.put<Category>(`/categories/${id}`, req).then((r) => r.data),
  archive: (id: number) => api.delete<void>(`/categories/${id}`).then((r) => r.data),
}

export const accountsApi = {
  list: (includeArchived = false) =>
    api
      .get<Account[]>('/accounts', { params: { includeArchived } })
      .then((r) => r.data),
  create: (req: AccountRequest) => api.post<Account>('/accounts', req).then((r) => r.data),
  update: (id: number, req: AccountRequest) =>
    api.put<Account>(`/accounts/${id}`, req).then((r) => r.data),
  archive: (id: number) => api.delete<void>(`/accounts/${id}`).then((r) => r.data),
}

export const transactionsApi = {
  list: async (search: TransactionSearch, page = 0, size = 20): Promise<TransactionPage> => {
    const r = await api.get<Transaction[]>('/transactions', {
      params: { ...search, page, size },
    })
    const meta = (r as { meta?: Meta }).meta
    const pag = meta?.pagination
    return {
      items: r.data,
      total: pag?.total ?? r.data.length,
      page: pag?.page ?? page,
      size: pag?.size ?? size,
    }
  },
  get: (id: number) => api.get<Transaction>(`/transactions/${id}`).then((r) => r.data),
  create: (req: TransactionRequest) =>
    api.post<Transaction>('/transactions', req).then((r) => r.data),
  update: (id: number, req: TransactionRequest) =>
    api.put<Transaction>(`/transactions/${id}`, req).then((r) => r.data),
  delete: (id: number) => api.delete<void>(`/transactions/${id}`).then((r) => r.data),
  /** Descarga un CSV con los movimientos que cumplen los filtros. */
  exportCsv: async (search: TransactionSearch): Promise<void> => {
    const r = await api.get<Blob>('/transactions/export', {
      params: search,
      responseType: 'blob',
    })
    const disposition = String(r.headers['content-disposition'] ?? '')
    const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'movimientos.csv'
    const url = URL.createObjectURL(r.data)
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    URL.revokeObjectURL(url)
  },
  /** Último tipo de cambio usado para la moneda; null si nunca se usó (204). */
  latestExchangeRate: async (currency: string): Promise<ExchangeRate | null> => {
    const r = await api.get<ExchangeRate | ''>('/transactions/exchange-rate', {
      params: { currency },
    })
    if (r.status === 204) return null
    return r.data as ExchangeRate
  },
}

export const recurringApi = {
  list: () => api.get<Recurring[]>('/recurring').then((r) => r.data),
  create: (req: RecurringRequest) => api.post<Recurring>('/recurring', req).then((r) => r.data),
  update: (id: number, req: RecurringRequest) =>
    api.put<Recurring>(`/recurring/${id}`, req).then((r) => r.data),
  delete: (id: number) => api.delete<void>(`/recurring/${id}`).then((r) => r.data),
  register: (id: number, req: RegisterOccurrenceRequest = {}) =>
    api.post<void>(`/recurring/${id}/register`, req).then((r) => r.data),
  skip: (id: number) => api.post<void>(`/recurring/${id}/skip`).then((r) => r.data),
}

export const categoryBudgetsApi = {
  summary: (period: string) =>
    api
      .get<CategoryBudgetSummary>('/category-budgets', { params: { period } })
      .then((r) => r.data),
  set: (categoryId: number, amount: string | number) =>
    api.put<void>(`/category-budgets/${categoryId}`, { amount }).then((r) => r.data),
  remove: (categoryId: number) =>
    api.delete<void>(`/category-budgets/${categoryId}`).then((r) => r.data),
}

export const allocationRulesApi = {
  list: () => api.get<AllocationRule[]>('/allocation-rules').then((r) => r.data),
  create: (req: AllocationRuleRequest) =>
    api.post<AllocationRule>('/allocation-rules', req).then((r) => r.data),
  update: (id: number, req: AllocationRuleRequest) =>
    api.put<AllocationRule>(`/allocation-rules/${id}`, req).then((r) => r.data),
  delete: (id: number) =>
    api.delete<void>(`/allocation-rules/${id}`).then((r) => r.data),
}

export const budgetsApi = {
  /** Devuelve null si no hay budget configurado (204 No Content del backend). */
  get: async (period: string): Promise<MonthlyBudget | null> => {
    const r = await api.get<MonthlyBudget | ''>('/budgets', { params: { period } })
    if (r.status === 204) return null
    return r.data as MonthlyBudget
  },
  upsert: (req: MonthlyBudgetRequest) =>
    api.post<MonthlyBudget>('/budgets', req).then((r) => r.data),
}

export const reportsApi = {
  get: (months: number, until?: string) =>
    api
      .get<ReportResponse>('/reports', { params: { months, until } })
      .then((r) => r.data),
}

export const dashboardApi = {
  get: (period: string) =>
    api
      .get<DashboardResponse>('/dashboard', { params: { period } })
      .then((r) => r.data),
}
