// ===== Enums (deben coincidir con el backend) =====
export type TransactionType = 'INCOME' | 'EXPENSE'

export type AllocationBucket =
  | 'NEEDS'
  | 'WANTS'
  | 'SAVINGS'
  | 'INVESTMENT'
  | 'DEBT'
  | 'UNCATEGORIZED'

// ===== Auth =====
export interface User {
  id: number
  email: string
  displayName: string | null
  currencyDefault: string
}

export interface TokenResponse {
  token: string
  expiresInSeconds: number
  user: User
}

// ===== Categories =====
export interface Category {
  id: number
  name: string
  type: TransactionType
  defaultBucket: AllocationBucket
  color: string | null
  icon: string | null
  archived: boolean
}

export interface CategoryRequest {
  name: string
  type: TransactionType
  defaultBucket?: AllocationBucket
  color?: string
  icon?: string
}

// ===== Transactions =====
export interface Transaction {
  id: number
  categoryId: number
  categoryName: string | null
  categoryColor: string | null
  amount: string
  type: TransactionType
  transactionDate: string
  description: string | null
  paymentMethod: string | null
  currency: string
  createdAt: string
}

export interface TransactionRequest {
  categoryId: number
  amount: string | number
  type: TransactionType
  transactionDate: string
  description?: string
  paymentMethod?: string
  currency?: string
}

export interface TransactionPage {
  items: Transaction[]
  total: number
  page: number
  size: number
}

// ===== Allocation Rules =====
export interface AllocationRule {
  id: number
  name: string
  description: string | null
  percentages: Record<string, number>
  template: boolean
}

export interface AllocationRuleRequest {
  name: string
  description?: string
  percentages: Record<string, number>
}

// ===== Budget =====
export interface MonthlyBudget {
  id: number
  year: number
  month: number
  expectedIncome: string
  activeRuleId: number | null
  activeRuleName: string | null
}

export interface MonthlyBudgetRequest {
  year: number
  month: number
  expectedIncome: number
  activeRuleId?: number | null
}

// ===== Dashboard =====
export interface BucketSummary {
  bucket: AllocationBucket
  allocated: string
  spent: string
  percentageUsed: string
}

export interface CategoryTotal {
  categoryId: number
  categoryName: string
  total: string
}

export interface DashboardResponse {
  year: number
  month: number
  income: string
  expenses: string
  balance: string
  savingsYearToDate: string
  expectedIncome: string         // NUEVO
  budgetConfigured: boolean      // NUEVO
  activeRule: AllocationRule | null
  bucketSummaries: BucketSummary[]
  topCategories: CategoryTotal[]
}

// ===== Errors (RFC 7807) =====
export interface ProblemDetail {
  type: string
  title: string
  status: number
  detail: string
  timestamp: string
  errors?: Array<{ field: string; message: string }>
}
