import { api } from '@/lib/api-client'
import type {
  AllocationRule,
  AllocationRuleRequest,
  Category,
  CategoryRequest,
  DashboardResponse,
  MonthlyBudget,
  MonthlyBudgetRequest,
  Transaction,
  TransactionPage,
  TransactionRequest,
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

export const transactionsApi = {
  list: async (period: string, page = 0, size = 20): Promise<TransactionPage> => {
    const r = await api.get<Transaction[]>('/transactions', { params: { period, page, size } })
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

export const dashboardApi = {
  get: (period: string) =>
    api
      .get<DashboardResponse>('/dashboard', { params: { period } })
      .then((r) => r.data),
}
