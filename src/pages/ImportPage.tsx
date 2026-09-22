import { useMemo, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, FileSpreadsheet } from 'lucide-react'
import { accountsApi, categoriesApi, importsApi, transactionsApi } from '@/api/services'
import { ErrorState, Loading } from '@/components/ui/States'
import { useAuth } from '@/features/auth/AuthProvider'
import { ImportSidebar } from '@/features/import/ImportSidebar'
import { ReviewStep, type ReviewRow } from '@/features/import/ReviewStep'
import { getErrorMessage } from '@/lib/api-client'
import { currencySymbol, formatCurrency, shortDate } from '@/lib/format'
import {
  buildRows,
  columnLabel,
  detectDateFormat,
  detectDecimalStyle,
  detectHeaderRow,
  guessMapping,
  readFile,
  reconcile,
  referenceDateFromText,
  type Cell,
  type ColumnMapping,
  type DateFormat,
  type DecimalStyle,
} from '@/lib/import-parser'
import { PdfPasswordError } from '@/lib/pdf-parser'
import { BANK_PROFILES, applyProfile, detectProfile, profileById } from '@/lib/bank-profiles'
import { queryKeys } from '@/lib/query-keys'
import type { Account, ImportBatch } from '@/types/api'

type Step = 'file' | 'map' | 'review' | 'done'

interface SavedSetup {
  header: string
  mapping: ColumnMapping
  dateFormat: DateFormat
  decimal: DecimalStyle
  positiveIsIncome: boolean
}

const MAX_ROWS = 1000

const plainText = (c: Cell) =>
  String(c ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')

const isSolesColumn = (c: Cell) => /soles|s\/|\bpen\b/.test(plainText(c))
const isDollarColumn = (c: Cell) => /dolar|us\$|\busd\b/.test(plainText(c))

/**
 * Estados de cuenta bimoneda (columnas Soles y Dólares): se importa la columna de la
 * moneda de la cuenta destino.
 */
function amountColumnFor(header: Cell[], account: Account, guess: number | null): number | null {
  const soles = header.findIndex(isSolesColumn)
  const dollars = header.findIndex(isDollarColumn)
  if (soles < 0 || dollars < 0) return guess
  return account.currency === 'USD' ? dollars : soles
}
const setupKey = (accountId: string) => `mis-finanzas:import-setup:${accountId}`
const profileKey = (accountId: string) => `mis-finanzas:import-profile:${accountId}`
const paymentKey = (accountId: string) => `mis-finanzas:import-payment-account:${accountId}`

function readPref(key: string): string {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function writePref(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    // Sin storage: solo se pierde la preferencia
  }
}

function loadSetup(accountId: string): SavedSetup | null {
  try {
    const raw = localStorage.getItem(setupKey(accountId))
    return raw ? (JSON.parse(raw) as SavedSetup) : null
  } catch {
    return null
  }
}

function saveSetup(accountId: string, setup: SavedSetup) {
  try {
    localStorage.setItem(setupKey(accountId), JSON.stringify(setup))
  } catch {
    // Sin storage: la próxima vez se vuelve a detectar
  }
}

export function ImportPage() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const baseCurrency = user?.currencyDefault ?? 'PEN'

  const [step, setStep] = useState<Step>('file')
  const [accountId, setAccountId] = useState('')
  const [fileName, setFileName] = useState('')
  const [cells, setCells] = useState<Cell[][]>([])
  const [headerIndex, setHeaderIndex] = useState(0)
  const [mapping, setMapping] = useState<ColumnMapping>({
    date: null,
    description: null,
    amount: null,
    debit: null,
    credit: null,
  })
  const [dateFormat, setDateFormat] = useState<DateFormat>('DMY')
  const [decimal, setDecimal] = useState<DecimalStyle>('dot')
  const [positiveIsIncome, setPositiveIsIncome] = useState(true)
  // Para fechas sin año ("23-Jul"): la fecha más reciente escrita completa en el archivo
  const [referenceDate, setReferenceDate] = useState<string | undefined>(undefined)
  const [review, setReview] = useState<ReviewRow[]>([])
  const [exchangeRate, setExchangeRate] = useState('')
  const [result, setResult] = useState<ImportBatch | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  // PDF con contraseña: se guarda el archivo para reintentar con la clave
  const [lockedPdf, setLockedPdf] = useState<File | null>(null)
  const [pdfPassword, setPdfPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [profileId, setProfileId] = useState('auto')
  const [detectedName, setDetectedName] = useState<string | null>(null)
  // Tarjetas: cuenta desde la que se paga, para marcar los pagos como transferencia
  const [paymentAccountId, setPaymentAccountId] = useState('')

  const { data: accounts = [] } = useQuery({
    queryKey: queryKeys.accounts.list(false),
    queryFn: () => accountsApi.list(false),
  })
  const { data: categories = [] } = useQuery({
    queryKey: queryKeys.categories.list(false),
    queryFn: () => categoriesApi.list(false),
  })
  const account = accounts.find((a) => String(a.id) === accountId)
  const needsRate = !!account && account.currency !== baseCurrency
  const profile = profileById(profileId)
  const isCard = account?.type === 'CREDIT_CARD'
  const paymentAccounts = accounts.filter(
    (a) => account && a.id !== account.id && a.currency === account.currency && a.type !== 'CREDIT_CARD',
  )

  const selectAccount = (id: string) => {
    setAccountId(id)
    setProfileId(readPref(profileKey(id)) || 'auto')
    setPaymentAccountId(readPref(paymentKey(id)))
  }

  const header = cells[headerIndex] ?? []
  const columnCount = Math.max(0, ...cells.slice(headerIndex, headerIndex + 30).map((r) => r.length))
  const parsed = useMemo(
    () => buildRows(cells, headerIndex, mapping, { dateFormat, decimal, positiveIsIncome, referenceDate }),
    [cells, headerIndex, mapping, dateFormat, decimal, positiveIsIncome, referenceDate],
  )
  // Cuadre con el saldo inicial y final del archivo (si los trae)
  const reconciliation = useMemo(
    () =>
      reconcile(
        cells,
        headerIndex,
        mapping,
        { dateFormat, decimal, positiveIsIncome, referenceDate },
        parsed.rows,
        { opening: profile.openingPattern, closing: profile.closingPattern },
      ),
    [cells, headerIndex, mapping, dateFormat, decimal, positiveIsIncome, referenceDate, parsed.rows, profile],
  )

  const invalidateData = () => {
    for (const key of [['transactions'], ['accounts'], ['dashboard'], ['reports'], ['category-budgets']]) {
      queryClient.invalidateQueries({ queryKey: key })
    }
  }

  // ---------- Paso 1: archivo ----------
  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) void openFile(file)
  }

  const openFile = async (file: File, password?: string) => {
    if (!account) return
    setReadError(null)
    setPasswordError(null)
    try {
      const { rows, text } = await readFile(file, password)
      setLockedPdf(null)
      setPdfPassword('')
      // Si el archivo es de un banco con perfil verificado, se usa ese perfil aunque se haya
      // elegido (o recordado) otro: el archivo manda
      let active = profileById(profileId)
      const detected = detectProfile(text)
      setDetectedName(null)
      if (detected && detected.id !== profileId) {
        active = detected
        setProfileId(detected.id)
        setDetectedName(detected.name)
      }
      if (rows.length === 0) throw new Error('El archivo está vacío')
      const h = detectHeaderRow(rows)
      const headerSig = JSON.stringify(rows[h])
      const saved = loadSetup(accountId)
      const guess = guessMapping(rows[h])
      const colValues = (col: number | null) => (col === null ? [] : rows.slice(h + 1).map((r) => r[col] ?? null))
      const moneyCol = guess.amount ?? guess.debit

      setFileName(file.name)
      setReferenceDate(referenceDateFromText(text) ?? undefined)
      setCells(rows)
      setHeaderIndex(h)
      if (saved && saved.header === headerSig) {
        // Mismo formato que la última vez con esta cuenta
        setMapping(saved.mapping)
        setDateFormat(saved.dateFormat)
        setDecimal(saved.decimal)
        setPositiveIsIncome(saved.positiveIsIncome)
      } else if (active.id !== 'auto') {
        const mapped = applyProfile(active, rows[h], account.currency, guess)
        setMapping(mapped)
        setDateFormat(detectDateFormat(colValues(mapped.date)))
        setDecimal(detectDecimalStyle(colValues(mapped.amount ?? mapped.debit)))
        setPositiveIsIncome(active.positiveIsIncome ?? account.type !== 'CREDIT_CARD')
      } else {
        guess.amount = guess.amount !== null ? amountColumnFor(rows[h], account, guess.amount) : null
        setMapping(guess)
        setDateFormat(detectDateFormat(colValues(guess.date)))
        setDecimal(detectDecimalStyle([...colValues(moneyCol), ...colValues(guess.credit)]))
        setPositiveIsIncome(account.type !== 'CREDIT_CARD')
      }
      setStep('map')
    } catch (err) {
      if (err instanceof PdfPasswordError) {
        setLockedPdf(file)
        setPasswordError(err.incorrect ? 'Contraseña incorrecta. Intenta de nuevo.' : null)
        return
      }
      setReadError(
        `No se pudo leer el archivo${err instanceof Error ? `: ${err.message}` : ''}. Usa PDF, CSV o Excel (.xlsx, .xls).`,
      )
    }
  }

  // ---------- Paso 2 → 3: vista previa en el servidor ----------
  const previewMutation = useMutation({
    mutationFn: async () => {
      const rows = parsed.rows.slice(0, MAX_ROWS)
      const suggestions = await importsApi.preview(
        Number(accountId),
        rows.map(({ date, description, amount }) => ({ date, description, amount })),
      )
      if (needsRate && !exchangeRate) {
        const latest = await transactionsApi.latestExchangeRate(account!.currency)
        if (latest) setExchangeRate(String(parseFloat(latest.rate)))
      }
      return rows.map<ReviewRow>((r, i) => {
        const s = suggestions[i]
        // Pago de la tarjeta (entra dinero a la tarjeta): transferencia desde la cuenta de pago
        const isPayment =
          isCard && !!paymentAccountId && r.amount > 0 && profile.paymentPattern.test(r.description)
        return {
          ...r,
          include: !s.duplicate,
          choice: isPayment
            ? `t:${paymentAccountId}`
            : s.suggestedCategoryId
              ? `c:${s.suggestedCategoryId}`
              : '',
          source: isPayment ? 'PAYMENT' : s.source,
          duplicate: s.duplicate,
        }
      })
    },
    onSuccess: (rows) => {
      writePref(profileKey(accountId), profileId === 'auto' ? '' : profileId)
      writePref(paymentKey(accountId), paymentAccountId)
      saveSetup(accountId, {
        header: JSON.stringify(header),
        mapping,
        dateFormat,
        decimal,
        positiveIsIncome,
      })
      setReview(rows)
      setStep('review')
    },
  })

  // ---------- Paso 3: importar ----------
  const commitMutation = useMutation({
    mutationFn: () =>
      importsApi.commit({
        accountId: Number(accountId),
        fileName,
        exchangeRate: needsRate ? exchangeRate : undefined,
        rows: review
          .filter((r) => r.include)
          .map((r) => {
            const [kind, id] = r.choice.split(':')
            return {
              date: r.date,
              description: r.description,
              amount: r.amount,
              categoryId: kind === 'c' ? Number(id) : undefined,
              transferAccountId: kind === 't' ? Number(id) : undefined,
            }
          }),
      }),
    onSuccess: (batch) => {
      setResult(batch)
      setStep('done')
      invalidateData()
      queryClient.invalidateQueries({ queryKey: queryKeys.imports.recent })
    },
  })

  const undoMutation = useMutation({
    mutationFn: (id: number) => importsApi.undo(id),
    onSuccess: () => {
      invalidateData()
      queryClient.invalidateQueries({ queryKey: queryKeys.imports.recent })
      reset()
    },
  })

  const reset = () => {
    setStep('file')
    setCells([])
    setReview([])
    setResult(null)
    commitMutation.reset()
    previewMutation.reset()
  }

  const included = review.filter((r) => r.include)
  const missing = included.filter((r) => !r.choice).length
  const hasAmountColumns = mapping.amount !== null || (mapping.debit !== null && mapping.credit !== null)

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Importar estado de cuenta</h1>
        <p className="text-sm text-gray-500">
          CSV o Excel de tu banco. El archivo se lee en tu navegador; solo se guardan los
          movimientos que confirmes.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Steps current={step} />

          {step === 'file' && (
            <section className="card space-y-4">
              <div>
                <label className="label">Cuenta del estado de cuenta</label>
                <select
                  value={accountId}
                  onChange={(e) => selectAccount(e.target.value)}
                  className="input"
                >
                  <option value="">Selecciona...</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.currency}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Banco y producto</label>
                  <select
                    value={profileId}
                    onChange={(e) => setProfileId(e.target.value)}
                    className="input"
                  >
                    {BANK_PROFILES.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.verified ? ' ✓' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                {isCard && (
                  <div>
                    <label className="label">Pagas la tarjeta desde</label>
                    <select
                      value={paymentAccountId}
                      onChange={(e) => setPaymentAccountId(e.target.value)}
                      className="input"
                    >
                      <option value="">No marcar pagos</option>
                      {paymentAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500">
                {profile.hint}
                {profile.id === 'auto' &&
                  ' ¿Tu banco no aparece? La detección automática funciona con la mayoría; si algo no cuadra, se puede agregar un perfil para tu banco con un estado de cuenta de muestra.'}
              </p>
              {account && profile.kind === 'CREDIT_CARD' && !isCard && (
                <p className="text-xs text-amber-700">
                  Este perfil es para tarjetas de crédito y la cuenta elegida no es una tarjeta.
                </p>
              )}
              {isCard && paymentAccountId && (
                <p className="text-xs text-gray-500">
                  Los pagos de la tarjeta se registrarán como transferencia desde esa cuenta (no
                  como ingreso).
                </p>
              )}
              <label
                className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg py-10 text-center ${
                  account
                    ? 'border-gray-300 hover:border-brand-500 cursor-pointer'
                    : 'border-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                <FileSpreadsheet className="w-8 h-8 text-gray-400" />
                <span className="text-sm font-medium">
                  {account ? 'Elegir archivo (.pdf, .csv, .xlsx, .xls)' : 'Primero elige la cuenta'}
                </span>
                <span className="text-xs text-gray-500">
                  El estado de cuenta en PDF que te envía el banco, o los movimientos en Excel/CSV
                  de la banca por internet
                </span>
                <input
                  type="file"
                  accept=".pdf,.csv,.txt,.xlsx,.xls"
                  onChange={onFile}
                  disabled={!account}
                  className="sr-only"
                />
              </label>
              {lockedPdf && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void openFile(lockedPdf, pdfPassword)
                  }}
                  className="rounded-md border border-gray-200 p-3 space-y-2"
                >
                  <p className="text-sm">
                    <strong>{lockedPdf.name}</strong> tiene contraseña (suele ser tu DNI). Se usa
                    solo en tu navegador para abrirlo; no se guarda ni se envía.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={pdfPassword}
                      onChange={(e) => setPdfPassword(e.target.value)}
                      autoFocus
                      autoComplete="off"
                      className="input py-1.5"
                      aria-label="Contraseña del PDF"
                    />
                    <button type="submit" disabled={!pdfPassword} className="btn-primary py-1.5">
                      Abrir
                    </button>
                  </div>
                  {passwordError && <p className="text-xs text-red-600">{passwordError}</p>}
                </form>
              )}
              {readError && <ErrorState message={readError} />}
            </section>
          )}

          {step === 'map' && (
            <section className="card space-y-4">
              <p className="text-sm text-gray-600">
                <strong>{fileName}</strong> · Revisa que las columnas sean correctas.
              </p>
              {detectedName && (
                <p className="text-xs text-brand-700 bg-brand-50 rounded px-3 py-2">
                  Reconocimos un estado de cuenta de <strong>{detectedName}</strong>: se usa su
                  perfil verificado.
                </p>
              )}
              <ReconciliationNote result={reconciliation} currency={account?.currency ?? baseCurrency} />
              {header.some(isSolesColumn) && header.some(isDollarColumn) && (
                <p className="text-xs text-brand-700 bg-brand-50 rounded px-3 py-2">
                  Este estado de cuenta tiene montos en soles y en dólares. Se importa la columna
                  elegida en "Monto"; para la otra moneda, vuelve a importar el mismo archivo en tu
                  cuenta en esa moneda.
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Fila de encabezados</label>
                  <select
                    value={headerIndex}
                    onChange={(e) => {
                      const h = Number(e.target.value)
                      setHeaderIndex(h)
                      setMapping(guessMapping(cells[h] ?? []))
                    }}
                    className="input"
                  >
                    {cells.slice(0, 20).map((r, i) => (
                      <option key={i} value={i}>
                        Fila {i + 1}: {r.filter((c) => c !== null).slice(0, 3).map(String).join(' · ').slice(0, 60)}
                      </option>
                    ))}
                  </select>
                </div>
                <ColumnSelect
                  label="Fecha"
                  value={mapping.date}
                  header={header}
                  count={columnCount}
                  onChange={(v) => setMapping({ ...mapping, date: v })}
                />
                <ColumnSelect
                  label="Descripción"
                  value={mapping.description}
                  header={header}
                  count={columnCount}
                  onChange={(v) => setMapping({ ...mapping, description: v })}
                  optional
                />
                <div>
                  <label className="label">Montos</label>
                  <select
                    value={mapping.amount !== null ? 'single' : 'pair'}
                    onChange={(e) =>
                      setMapping(
                        e.target.value === 'single'
                          ? { ...mapping, amount: mapping.debit ?? 0, debit: null, credit: null }
                          : { ...mapping, amount: null, debit: mapping.amount ?? 0, credit: null },
                      )
                    }
                    className="input"
                  >
                    <option value="single">Una columna con signo</option>
                    <option value="pair">Dos columnas: cargo y abono</option>
                  </select>
                </div>
                {mapping.amount !== null ? (
                  <>
                    <ColumnSelect
                      label="Monto"
                      value={mapping.amount}
                      header={header}
                      count={columnCount}
                      onChange={(v) => setMapping({ ...mapping, amount: v })}
                    />
                    <div>
                      <label className="label">Montos positivos son</label>
                      <select
                        value={positiveIsIncome ? 'in' : 'out'}
                        onChange={(e) => setPositiveIsIncome(e.target.value === 'in')}
                        className="input"
                      >
                        <option value="in">Entradas (cuenta bancaria)</option>
                        <option value="out">Consumos (tarjeta de crédito)</option>
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    <ColumnSelect
                      label="Cargo (sale dinero)"
                      value={mapping.debit}
                      header={header}
                      count={columnCount}
                      onChange={(v) => setMapping({ ...mapping, debit: v })}
                    />
                    <ColumnSelect
                      label="Abono (entra dinero)"
                      value={mapping.credit}
                      header={header}
                      count={columnCount}
                      onChange={(v) => setMapping({ ...mapping, credit: v })}
                    />
                  </>
                )}
                <div>
                  <label className="label">Formato de fecha</label>
                  <select
                    value={dateFormat}
                    onChange={(e) => setDateFormat(e.target.value as DateFormat)}
                    className="input"
                  >
                    <option value="DMY">Día/mes/año (22/09/2026)</option>
                    <option value="YMD">Año-mes-día (2026-09-22)</option>
                    <option value="MDY">Mes/día/año (09/22/2026)</option>
                  </select>
                </div>
                <div>
                  <label className="label">Decimales</label>
                  <select
                    value={decimal}
                    onChange={(e) => setDecimal(e.target.value as DecimalStyle)}
                    className="input"
                  >
                    <option value="dot">Punto (1,234.56)</option>
                    <option value="comma">Coma (1.234,56)</option>
                  </select>
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-500 mb-2">
                  {parsed.rows.length} movimientos reconocidos
                  {parsed.skipped > 0 && ` · ${parsed.skipped} filas omitidas (sin fecha o monto, como saldos)`}
                  {parsed.rows.length > MAX_ROWS && ` · se importarán los primeros ${MAX_ROWS}`}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <tbody>
                      {parsed.rows.slice(0, 5).map((r) => (
                        <tr key={r.line} className="border-b border-gray-100">
                          <td className="py-1.5 pr-3 text-gray-500 whitespace-nowrap">{shortDate(r.date)}</td>
                          <td className="py-1.5 pr-3 truncate max-w-[300px]">{r.description || '—'}</td>
                          <td
                            className={`py-1.5 text-right tabular-nums ${r.amount > 0 ? 'text-brand-700' : ''}`}
                          >
                            {formatCurrency(r.amount, account?.currency ?? baseCurrency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {previewMutation.error && <ErrorState message={getErrorMessage(previewMutation.error)} />}
              <div className="flex justify-between gap-2">
                <button type="button" onClick={reset} className="btn-secondary">
                  Cambiar archivo
                </button>
                <button
                  type="button"
                  onClick={() => previewMutation.mutate()}
                  disabled={!hasAmountColumns || mapping.date === null || parsed.rows.length === 0 || previewMutation.isPending}
                  className="btn-primary"
                >
                  {previewMutation.isPending ? 'Analizando...' : 'Continuar'}
                </button>
              </div>
            </section>
          )}

          {step === 'review' && account && (
            <>
              {needsRate && (
                <div className="card">
                  <label className="label">
                    Tipo de cambio (1 {currencySymbol(account.currency)} = ? {currencySymbol(baseCurrency)})
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(e.target.value)}
                    className="input w-40"
                  />
                  <p className="text-xs text-gray-500 mt-1">Se usa para sumar estos movimientos a tus reportes.</p>
                </div>
              )}
              <ReconciliationNote result={reconciliation} currency={account.currency} />
              <ReviewStep
                rows={review}
                onChange={setReview}
                account={account}
                accounts={accounts}
                categories={categories}
              />
              {commitMutation.error && <ErrorState message={getErrorMessage(commitMutation.error)} />}
              <div className="flex flex-wrap justify-between items-center gap-2">
                <button type="button" onClick={() => setStep('map')} className="btn-secondary">
                  Volver a columnas
                </button>
                <div className="flex items-center gap-3">
                  {missing > 0 && <span className="text-sm text-amber-700">{missing} sin categoría</span>}
                  <button
                    type="button"
                    onClick={() => commitMutation.mutate()}
                    disabled={
                      included.length === 0 ||
                      missing > 0 ||
                      (needsRate && !exchangeRate) ||
                      commitMutation.isPending
                    }
                    className="btn-primary"
                  >
                    {commitMutation.isPending
                      ? 'Importando...'
                      : `Importar ${included.length} ${included.length === 1 ? 'movimiento' : 'movimientos'}`}
                  </button>
                </div>
              </div>
            </>
          )}

          {step === 'done' && result && (
            <section className="card text-center py-8 space-y-3">
              <CheckCircle2 className="w-10 h-10 text-brand-500 mx-auto" />
              <p className="text-lg font-semibold">
                Se importaron {result.rowCount} movimientos en {result.accountName}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Link to={`/movimientos?cuenta=${result.accountId}`} className="btn-primary">
                  Ver movimientos
                </Link>
                <button type="button" onClick={reset} className="btn-secondary">
                  Importar otro archivo
                </button>
                <button
                  type="button"
                  onClick={() => undoMutation.mutate(result.id)}
                  disabled={undoMutation.isPending}
                  className="btn-secondary text-red-600"
                >
                  Deshacer
                </button>
              </div>
              {undoMutation.error && <ErrorState message={getErrorMessage(undoMutation.error)} />}
            </section>
          )}

          {step === 'file' && accounts.length === 0 && <Loading />}
        </div>

        <ImportSidebar categories={categories} onUndone={invalidateData} />
      </div>
    </div>
  )
}

/** "✓ Cuadra con el estado de cuenta" o cuánto falta, si el archivo trae saldo inicial y final. */
function ReconciliationNote({
  result,
  currency,
}: {
  result: ReturnType<typeof reconcile>
  currency: string
}) {
  if (!result) return null
  const fmt = (v: number) => formatCurrency(v, currency)
  return result.ok ? (
    <p className="text-xs text-brand-700 bg-brand-50 rounded px-3 py-2">
      ✓ Cuadra con el estado de cuenta: saldo inicial {fmt(result.opening)} → final{' '}
      {fmt(result.closing)}.
    </p>
  ) : (
    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
      ⚠ No cuadra por {fmt(Math.abs(result.difference))}: saldo inicial {fmt(result.opening)}, final{' '}
      {fmt(result.closing)}, y los movimientos leídos suman {fmt(result.change)}. Revisa las columnas o
      si faltan filas.
    </p>
  )
}

function Steps({ current }: { current: Step }) {
  const steps: Array<[Step, string]> = [
    ['file', 'Archivo'],
    ['map', 'Columnas'],
    ['review', 'Revisar'],
  ]
  const order: Step[] = ['file', 'map', 'review', 'done']
  const at = order.indexOf(current)
  return (
    <ol className="flex items-center gap-2 text-sm">
      {steps.map(([key, label], i) => (
        <li key={key} className="flex items-center gap-2">
          <span
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
              i <= at ? 'bg-brand-500 text-white' : 'bg-gray-200 text-gray-600'
            }`}
          >
            {i + 1}
          </span>
          <span className={i === at ? 'font-medium' : 'text-gray-500'}>{label}</span>
          {i < steps.length - 1 && <span className="text-gray-300">—</span>}
        </li>
      ))}
    </ol>
  )
}

function ColumnSelect({
  label,
  value,
  header,
  count,
  onChange,
  optional,
}: {
  label: string
  value: number | null
  header: Cell[]
  count: number
  onChange: (v: number | null) => void
  optional?: boolean
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className={`input ${value === null && !optional ? 'border-amber-400' : ''}`}
      >
        <option value="">{optional ? 'Ninguna' : 'Elegir columna...'}</option>
        {Array.from({ length: count }, (_, i) => (
          <option key={i} value={i}>
            {columnLabel(header, i)}
          </option>
        ))}
      </select>
    </div>
  )
}
