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
    list: (search: object, page: number, size: number) =>
      ['transactions', 'list', search, { page, size }] as const,
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
  imports: {
    recent: ['imports'] as const,
  },
  categorizationRules: {
    all: ['categorization-rules'] as const,
  },
  goals: {
    all: ['goals'] as const,
    contributions: (id: number) => ['goals', id, 'contributions'] as const,
  },
  reports: {
    range: (months: number) => ['reports', months] as const,
  },
  dashboard: {
    period: (period: string) => ['dashboard', period] as const,
  },
}
