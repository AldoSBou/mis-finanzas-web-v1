export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
  },
  categories: {
    all: ['categories'] as const,
    list: (includeArchived: boolean) => ['categories', { includeArchived }] as const,
  },
  accounts: {
    all: ['accounts'] as const,
    list: (includeArchived: boolean) => ['accounts', { includeArchived }] as const,
  },
  transactions: {
    all: ['transactions'] as const,
    list: (period: string, page: number, size: number, accountId?: number) =>
      ['transactions', period, { page, size, accountId }] as const,
    detail: (id: number) => ['transactions', id] as const,
    exchangeRate: (currency: string) => ['transactions', 'exchange-rate', currency] as const,
  },
  categoryBudgets: {
    all: ['category-budgets'] as const,
    period: (period: string) => ['category-budgets', period] as const,
  },
  recurring: {
    all: ['recurring'] as const,
  },
  rules: {
    all: ['allocation-rules'] as const,
  },
  budgets: {
    period: (period: string) => ['budgets', period] as const,
  },
  dashboard: {
    period: (period: string) => ['dashboard', period] as const,
  },
}
