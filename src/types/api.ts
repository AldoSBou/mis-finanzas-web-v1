// ===== Enums (deben coincidir con el backend) =====
export type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER'

/** Tipos con categoría (las transferencias no llevan) */
export type CategoryType = 'INCOME' | 'EXPENSE'

export type AccountType =
  | 'CASH'
  | 'BANK'
  | 'CREDIT_CARD'
  | 'EWALLET'
  | 'SAVINGS'
  | 'INVESTMENT'

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
  type: CategoryType
  defaultBucket: AllocationBucket
  color: string | null
  icon: string | null
  archived: boolean
}

export interface CategoryRequest {
  name: string
  type: CategoryType
  defaultBucket?: AllocationBucket
  color?: string
  icon?: string
}

// ===== Accounts =====
export interface Account {
  id: number
  name: string
  type: AccountType
  currency: string
  initialBalance: string
  /** Saldo actual en la moneda de la cuenta (negativo en tarjetas = deuda) */
  balance: string
  color: string | null
  icon: string | null
  archived: boolean
}

export interface AccountRequest {
  name: string
  type: AccountType
  currency: string
  initialBalance?: string | number
  color?: string
  icon?: string
}

// ===== Transactions =====
export interface Transaction {
  id: number
  type: TransactionType
  accountId: number
  accountName: string | null
  toAccountId: number | null
  toAccountName: string | null
  categoryId: number | null
  categoryName: string | null
  categoryColor: string | null
  /** En la moneda de la cuenta origen */
  amount: string
  currency: string
  /** Solo transferencias: monto recibido en la moneda destino */
  toAmount: string | null
  toCurrency: string | null
  exchangeRate: string
  /** Monto convertido a la moneda base */
  amountBase: string
  transactionDate: string
  description: string | null
  paymentMethod: string | null
  /** Recurrente que generó el movimiento */
  recurringId: number | null
  createdAt: string
}

/** La moneda la define la cuenta; no se envía. */
export interface TransactionRequest {
  type: TransactionType
  accountId: number
  categoryId?: number
  toAccountId?: number
  amount: string | number
  toAmount?: string | number
  exchangeRate?: string | number
  transactionDate: string
  description?: string
  paymentMethod?: string
}

// ===== Recurring =====
export type Frequency = 'WEEKLY' | 'MONTHLY' | 'YEARLY'

export interface Recurring {
  id: number
  type: TransactionType
  accountId: number
  accountName: string | null
  toAccountId: number | null
  toAccountName: string | null
  categoryId: number | null
  categoryName: string | null
  categoryColor: string | null
  amount: string
  currency: string | null
  toAmount: string | null
  exchangeRate: string | null
  description: string | null
  frequency: Frequency
  nextDate: string
  endDate: string | null
  autoCreate: boolean
  active: boolean
}

export interface RecurringRequest {
  type: TransactionType
  accountId: number
  categoryId?: number
  toAccountId?: number
  amount: string | number
  toAmount?: string | number
  exchangeRate?: string | number
  description?: string
  frequency: Frequency
  /** Primera ocurrencia (o próxima, al editar) */
  startDate: string
  endDate?: string
  autoCreate: boolean
}

export interface RegisterOccurrenceRequest {
  amount?: string | number
  exchangeRate?: string | number
  date?: string
}

export interface UpcomingItem {
  recurringId: number
  type: TransactionType
  description: string | null
  categoryName: string | null
  accountName: string | null
  toAccountName: string | null
  amount: string
  currency: string
  amountBase: string
  date: string
  /** Ya venció y espera confirmación */
  overdue: boolean
  autoCreate: boolean
}

export interface ExchangeRate {
  currency: string
  baseCurrency: string
  rate: string
  date: string | null
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
  baseCurrency: string
  income: string
  /** Consumo: gastos sin ahorro ni inversión */
  expenses: string
  /** Ahorro neto del mes (transferencias a cuentas de ahorro/inversión) */
  savings: string
  /** income - expenses - savings */
  balance: string
  savingsYearToDate: string
  expectedIncome: string         // NUEVO
  budgetConfigured: boolean      // NUEVO
  activeRule: AllocationRule | null
  bucketSummaries: BucketSummary[]
  topCategories: CategoryTotal[]
  /** Solo mes actual: recurrentes pendientes y por venir */
  upcoming: UpcomingItem[]
  /** Solo mes actual: disponible estimado a fin de mes */
  projectedBalance: string | null
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
