export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
  },
  categories: {
    all: ['categories'] as const,
    list: (includeArchived: boolean) => ['categories', { includeArchived }] as const,
  },
  transactions: {
    all: ['transactions'] as const,
    list: (period: string, page: number, size: number) =>
      ['transactions', period, { page, size }] as const,
    detail: (id: number) => ['transactions', id] as const,
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
