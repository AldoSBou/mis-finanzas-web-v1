import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Calendar,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Delete,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  Mic,
  Pencil,
  RefreshCw,
  Send,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { accountsApi, categoriesApi, overviewApi, transactionsApi, voiceApi } from '@/api/services'
import { InstallHint } from '@/components/InstallHint'
import { TransactionFormModal } from '@/features/transactions/TransactionFormModal'
import { useAuth } from '@/features/auth/AuthProvider'
import { getErrorMessage } from '@/lib/api-client'
import { categoryIcon } from '@/lib/category-icons'
import { MAX_DIGITS, toDigits } from '@/lib/cents'
import { formatCurrency, shortDate, todayIso } from '@/lib/format'
import { flush, recordEntry, recordError, Stopwatch, type EntrySource } from '@/lib/metrics'
import { pickPhoto, type PhotoSource } from '@/lib/photo'
import { queryKeys } from '@/lib/query-keys'
import { cancelListening, speechAvailable, startListening, stopListening } from '@/lib/speech'
import { lastAccount, rankCategories, recordUse, saveLastAccount } from '@/lib/usage'
import { parseUtterance, type VoiceHistory, type VoiceParse } from '@/lib/voice-parse'
import type { Category, Transaction, TransactionRequest, TransactionType } from '@/types/api'

/** Categorías en la pantalla (3 × 3 con "Más"). */
const QUICK = 8
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '⌫']

type Toast =
  | { kind: 'saved'; tx: Transaction; text: string }
  | { kind: 'error'; text: string; retry: () => void }
  | { kind: 'info'; text: string }

/** Qué muestra la hoja inferior: todas las categorías o el teclado de una. */
type Sheet = { mode: 'all' } | { mode: 'amount'; category: Category } | null

interface Prefill {
  digits: string
  note: string
  date?: string | null
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Tecla del teclado: los dígitos entran por la derecha; ⌫ borra el último. */
function typeKey(current: string, key: string): string {
  if (key === '⌫') return current.slice(0, -1)
  const next = (current + key).replace(/^0+/, '')
  return next.length > MAX_DIGITS ? current : next
}

function digitsToValue(digits: string): number {
  return digits ? parseInt(digits, 10) / 100 : 0
}

function amountToDigits(amount: string | number): string {
  return toDigits(String(amount))
}

/**
 * Registro rápido: la misma pantalla que la app Android, para la PWA en iPhone.
 * Tocar una categoría abre el teclado; con el monto escrito, Guardar cierra todo.
 * También se puede dictar/escribir una frase o leer una foto del voucher.
 */
export function QuickEntryPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const base = user?.currencyDefault ?? 'PEN'

  const [type, setType] = useState<TransactionType>('EXPENSE')
  const [accountId, setAccountId] = useState<number | null>(() => lastAccount())
  const [toast, setToast] = useState<Toast | null>(null)
  const [fullForm, setFullForm] = useState(false)

  // Hoja del teclado
  const [sheet, setSheet] = useState<Sheet>(null)
  const [amount, setAmount] = useState('')
  const [yesterday, setYesterday] = useState(false)
  /** Fecha leída de un comprobante (si no es hoy ni ayer); manda sobre el chip Hoy/Ayer */
  const [dateOverride, setDateOverride] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)
  const [pickAccount, setPickAccount] = useState(false)
  /** Tipo de cambio cuando la cuenta no está en la moneda base (1 unidad = ? en base) */
  const [rate, setRate] = useState('')
  const [rateOpen, setRateOpen] = useState(false)

  // Voz: hoja con el texto reconocido o escrito
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [listening, setListening] = useState(false)
  const [voiceText, setVoiceText] = useState('')
  const [voiceHint, setVoiceHint] = useState<string | null>(null)
  const [interpreting, setInterpreting] = useState(false)
  /** Lo que el intérprete entendió (voz o foto), para saber si la persona lo corrigió al guardar */
  const heardRef = useRef<{ digits: string; categoryId: number | null; kind: 'voice' | 'photo' } | null>(null)
  const [photoSheet, setPhotoSheet] = useState(false)
  const [reading, setReading] = useState(false)
  /** Monto, nota y fecha entendidos cuando la categoría no se reconoció: se aplican al elegirla */
  const [pendingVoice, setPendingVoice] = useState<Prefill | null>(null)
  const history = useRef<VoiceHistory | null>(null)

  // Medición: desde que aparece la pantalla hasta que se toca Guardar
  const [watch] = useState(() => new Stopwatch())
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const today = todayIso()

  const { data: categories = [], error: categoriesError } = useQuery({
    queryKey: queryKeys.categories.list(false),
    queryFn: () => categoriesApi.list(false),
  })
  const { data: accounts = [] } = useQuery({
    queryKey: queryKeys.accounts.list(false),
    queryFn: () => accountsApi.list(false),
  })
  const { data: todayPage } = useQuery({
    queryKey: queryKeys.transactions.list({ from: today, to: today }, 0, 50),
    queryFn: () => transactionsApi.list({ from: today, to: today }, 0, 50),
  })
  const { data: overview } = useQuery({
    queryKey: queryKeys.overview.all,
    queryFn: overviewApi.get,
  })

  const usableAccounts = useMemo(() => accounts.filter((a) => !a.archived), [accounts])
  const account = usableAccounts.find((a) => a.id === accountId) ?? null
  /** La cuenta elegida está en otra moneda: el monto va en esa moneda y hace falta tipo de cambio */
  const foreign = !!account && account.currency !== base
  const currency = account?.currency ?? base
  const value = digitsToValue(amount)

  const ranked = useMemo(
    () => rankCategories(categories.filter((c) => c.type === type && !c.archived)),
    [categories, type],
  )

  const todayList = useMemo(() => todayPage?.items ?? null, [todayPage])
  const todayTotal = useMemo(
    () =>
      todayList
        ?.filter((t) => t.type === 'EXPENSE' && t.currency === base)
        .reduce((s, t) => s + Number(t.amount), 0) ?? null,
    [todayList, base],
  )

  // Cuenta por defecto: la última usada; si no, la primera de gastos del día a día en moneda base
  useEffect(() => {
    if (usableAccounts.length === 0) return
    if (accountId !== null && usableAccounts.some((a) => a.id === accountId)) return
    const spending = usableAccounts.filter(
      (a) => a.type !== 'SAVINGS' && a.type !== 'INVESTMENT' && a.currency === base,
    )
    setAccountId((spending[0] ?? usableAccounts[0]).id)
  }, [usableAccounts, accountId, base])

  // Al pasar a una cuenta en otra moneda, se prellena el último tipo de cambio usado
  useEffect(() => {
    if (!foreign || !account) return
    let current = true
    transactionsApi
      .latestExchangeRate(account.currency)
      .then((r) => current && r && setRate((v) => v || String(parseFloat(r.rate))))
      .catch(() => {})
    return () => {
      current = false
    }
  }, [foreign, account])

  // Cronómetro y cola de métricas: al abrir y cada vez que se vuelve a la app
  useEffect(() => {
    watch.reset()
    void flush()
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        watch.reset()
        void flush()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [watch])

  // Al salir de la pantalla no queda nada escuchando
  useEffect(() => () => cancelListening(), [])

  const showToast = (t: Toast, ms = 5000) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(t)
    toastTimer.current = setTimeout(() => setToast(null), ms)
  }

  const invalidateAfterChange = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all })
    queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all })
    queryClient.invalidateQueries({ queryKey: queryKeys.categoryBudgets.all })
    queryClient.invalidateQueries({ queryKey: ['reports'] })
    queryClient.invalidateQueries({ queryKey: ['goals'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    queryClient.invalidateQueries({ queryKey: ['overview'] })
    queryClient.invalidateQueries({ queryKey: ['cashflow'] })
    queryClient.invalidateQueries({ queryKey: ['liquidity'] })
  }

  const openCategory = (category: Category, prefill?: Prefill) => {
    const p = prefill ?? pendingVoice
    setPendingVoice(null)
    setAmount(p?.digits ?? '')
    setNote(p?.note ?? '')
    setNoteOpen(false)
    setRate('')
    setRateOpen(false)
    const d = p?.date ?? null
    setYesterday(d === daysAgo(1))
    setDateOverride(d && d !== today && d !== daysAgo(1) ? d : null)
    setPickAccount(false)
    setSheet({ mode: 'amount', category })
  }

  const closeSheet = () => {
    setSheet(null)
    heardRef.current = null
    setPendingVoice(null)
  }

  // ---------- Voz ----------

  const loadHistory = () => {
    // Descripciones anteriores: "menú donde Lucho" ya sabe a qué categoría va
    if (history.current) return
    transactionsApi
      .list({ from: daysAgo(90), to: today }, 0, 100)
      .then((page) => {
        history.current = page.items
          .filter((t) => t.description && t.categoryId)
          .map((t) => ({ description: t.description!, categoryId: t.categoryId! }))
      })
      .catch(() => {
        history.current = []
      })
  }

  const beginListening = () => {
    setVoiceHint(null)
    const ok = startListening({
      onResult: (text) => setVoiceText(text),
      onError: (code) => {
        setListening(false)
        if (code === 'no-speech') setVoiceHint('No escuché nada. Toca el micrófono y habla, o escríbelo abajo.')
        else if (code === 'not-allowed' || code === 'service-not-allowed') {
          setVoiceHint('Sin permiso de micrófono. Escríbelo abajo o usa el dictado del teclado.')
        } else if (code !== 'aborted') {
          recordError('voice', code)
          setVoiceHint('No se pudo escuchar. Escríbelo abajo o usa el dictado del teclado.')
        }
      },
      onEnd: () => setListening(false),
    })
    setListening(ok)
  }

  const openVoice = () => {
    loadHistory()
    setVoiceText('')
    setVoiceOpen(true)
    if (speechAvailable) beginListening()
    else setVoiceHint('Escribe la frase o toca el micrófono del teclado para dictarla.')
  }

  const closeVoice = () => {
    cancelListening()
    setListening(false)
    setVoiceOpen(false)
  }

  /** Enviar: deja de escuchar e interpreta lo dicho o escrito. */
  const sendVoice = () => {
    const text = voiceText.trim()
    if (!text) return
    if (listening) stopListening()
    setListening(false)
    void handleUtterance(text)
  }

  /**
   * Si el comprobante está en otra moneda, elige una cuenta en esa moneda.
   * Devuelve false (y avisa) si no hay ninguna.
   */
  const applyCurrency = (c: string | null | undefined): boolean => {
    if (!c || c === base) {
      if (account && account.currency !== base) {
        const home = usableAccounts.find(
          (a) => a.currency === base && a.type !== 'SAVINGS' && a.type !== 'INVESTMENT',
        )
        if (home) setAccountId(home.id)
      }
      return true
    }
    const inCurrency = usableAccounts.filter((a) => a.currency === c)
    if (inCurrency.length === 0) {
      showToast(
        { kind: 'info', text: `El comprobante está en ${c} y no tienes una cuenta en esa moneda. Créala en Cuentas y vuelve a intentar.` },
        6000,
      )
      return false
    }
    if (!inCurrency.some((a) => a.id === accountId)) setAccountId(inCurrency[0].id)
    return true
  }

  /** Interpreta la frase: reglas locales primero; si no se reconoce la categoría, el backend. */
  const handleUtterance = async (text: string) => {
    const active = categories.filter((c) => !c.archived)
    let parsed: VoiceParse = parseUtterance(text, active, history.current ?? [])
    if (!parsed.digits && !parsed.categoryId) {
      setVoiceHint(`No entendí «${text}». Di el monto y en qué fue, p. ej. «veinte con cincuenta almuerzo».`)
      return
    }
    if (!parsed.categoryId) {
      setInterpreting(true)
      try {
        const r = await voiceApi.parse(text)
        parsed = {
          ...parsed,
          currency: parsed.currency ?? (r.currency && r.currency !== base ? (r.currency as VoiceParse['currency']) : null),
          digits: parsed.digits || (r.amount ? amountToDigits(r.amount) : ''),
          categoryId: r.categoryId,
          type: r.categoryId ? (r.type === 'INCOME' ? 'INCOME' : 'EXPENSE') : parsed.type,
          note: r.description || parsed.note,
          matchedBy: r.categoryId ? 'keyword' : null,
        }
      } catch {
        // Sin intérprete en el servidor: la persona elige la categoría
      } finally {
        setInterpreting(false)
      }
    }
    const category = active.find((c) => c.id === parsed.categoryId) ?? null
    setVoiceOpen(false)
    if (!applyCurrency(parsed.currency)) return
    setType(parsed.type)
    heardRef.current = { digits: parsed.digits, categoryId: category?.id ?? null, kind: 'voice' }
    if (category) {
      openCategory(category, { digits: parsed.digits, note: parsed.note })
    } else {
      setPendingVoice({ digits: parsed.digits, note: parsed.note })
      setSheet({ mode: 'all' })
    }
  }

  // ---------- Foto ----------

  /** Foto del voucher o captura de Yape: el backend lee monto, categoría, descripción y fecha. */
  const readPhoto = async (source: PhotoSource) => {
    setPhotoSheet(false)
    let picked: Awaited<ReturnType<typeof pickPhoto>>
    try {
      picked = await pickPhoto(source)
    } catch (e) {
      showToast({ kind: 'info', text: e instanceof Error ? e.message : 'No se pudo abrir la imagen' }, 4000)
      return
    }
    if (!picked) return
    setReading(true)
    try {
      const r = await voiceApi.parseImage(picked.base64, picked.mediaType)
      const active = categories.filter((c) => !c.archived)
      const category = active.find((c) => c.id === r.categoryId) ?? null
      const digits = r.amount ? amountToDigits(r.amount) : ''
      if (!digits && !category) {
        showToast(
          { kind: 'info', text: 'No pude leer un monto en esa imagen. Prueba con una foto más cerca o anótalo con el teclado.' },
          5000,
        )
        return
      }
      if (!applyCurrency(r.currency)) return
      setType(r.type)
      heardRef.current = { digits, categoryId: category?.id ?? null, kind: 'photo' }
      const prefill: Prefill = { digits, note: r.description ?? '', date: r.date }
      if (category) openCategory(category, prefill)
      else {
        setPendingVoice(prefill)
        setSheet({ mode: 'all' })
      }
    } catch (e) {
      const msg = getErrorMessage(e)
      recordError('photo', msg)
      showToast({ kind: 'info', text: msg }, 5000)
    } finally {
      setReading(false)
    }
  }

  // ---------- Guardar ----------

  const create = useMutation({
    mutationFn: ({ payload }: { payload: TransactionRequest; category: Category }) =>
      transactionsApi.create(payload),
    onSuccess: (tx, { payload, category }) => {
      recordUse(category.id)
      saveLastAccount(payload.accountId)
      const isToday = payload.transactionDate === today
      const newTotal =
        payload.type === 'EXPENSE' && isToday && todayTotal !== null ? todayTotal + Number(payload.amount) : null
      invalidateAfterChange()
      showToast({
        kind: 'saved',
        tx,
        text:
          `${formatCurrency(payload.amount, tx.currency)} · ${category.name}` +
          (newTotal !== null ? ` · Hoy llevas ${formatCurrency(newTotal, base)}` : ''),
      })
    },
    onError: (e, vars) => {
      const text = getErrorMessage(e)
      recordError('save', text)
      showToast({ kind: 'error', text, retry: () => create.mutate(vars) }, 10000)
    },
  })

  const save = () => {
    if (sheet?.mode !== 'amount' || create.isPending) return
    if (value <= 0) return
    if (!account) {
      setPickAccount(true)
      return
    }
    if (foreign && !(parseFloat(rate) > 0)) {
      setRateOpen(true)
      return
    }
    const heard = heardRef.current
    const source: EntrySource = !heard
      ? watch.source
      : heard.digits === amount && heard.categoryId === sheet.category.id
        ? heard.kind
        : `${heard.kind}-edited`
    recordEntry(watch.elapsed(), source)
    const payload: TransactionRequest = {
      type,
      accountId: account.id,
      categoryId: sheet.category.id,
      amount: value.toFixed(2),
      transactionDate: dateOverride ?? (yesterday ? daysAgo(1) : today),
      description: note.trim() || undefined,
      exchangeRate: foreign ? rate : undefined,
    }
    const category = sheet.category
    // Se cierra al toque: la siguiente anotación empieza de cero
    closeSheet()
    watch.reset('app')
    create.mutate({ payload, category })
  }

  const undo = async (tx: Transaction) => {
    setToast(null)
    try {
      await transactionsApi.delete(tx.id)
      invalidateAfterChange()
      showToast({ kind: 'info', text: 'Registro deshecho' }, 2000)
    } catch (e) {
      showToast({ kind: 'info', text: getErrorMessage(e) }, 3000)
    }
  }

  const press = (key: string) => setAmount((a) => typeKey(a, key))

  const quick = ranked.slice(0, QUICK)
  const hasMore = ranked.length > QUICK
  const recent = (todayList ?? []).filter((t) => t.type !== 'TRANSFER').slice(0, 3)
  const remaining = overview ? parseFloat(overview.remaining) : null

  return (
    <div className="max-w-md mx-auto px-4 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-6">
      {/* Tipo y accesos a foto / voz */}
      <div className="flex items-center justify-center gap-3 pt-2">
        <div className="grid grid-cols-2 gap-1 bg-gray-200/70 rounded-full p-1 flex-1 max-w-[220px]">
          {(['EXPENSE', 'INCOME'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`py-1.5 text-sm font-medium rounded-full ${
                type === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'
              }`}
            >
              {t === 'EXPENSE' ? 'Gasto' : 'Ingreso'}
            </button>
          ))}
        </div>
        <RoundButton label="Registrar desde una foto" onClick={() => setPhotoSheet(true)}>
          <Camera className="w-5 h-5" />
        </RoundButton>
        <RoundButton label="Registrar por voz" onClick={openVoice}>
          <Mic className="w-5 h-5" />
        </RoundButton>
      </div>

      {/* Resumen del día */}
      <div className="text-center mt-5">
        <p className="text-xs uppercase tracking-wide text-gray-500">Hoy llevas</p>
        <p className="text-3xl font-semibold tabular-nums mt-0.5">
          {todayTotal !== null ? formatCurrency(todayTotal, base) : '—'}
        </p>
        {overview && remaining !== null && (
          <Link
            to="/"
            className={`inline-block mt-1 text-sm font-medium ${remaining < 0 ? 'text-red-600' : 'text-brand-700'}`}
          >
            Te quedan {formatCurrency(overview.remaining, base)} · {overview.daysLeft}{' '}
            {overview.daysLeft === 1 ? 'día' : 'días'}
          </Link>
        )}
        <p className="text-sm text-gray-500 mt-2">
          {type === 'EXPENSE' ? '¿En qué gastaste?' : '¿De dónde vino el ingreso?'}
        </p>
      </div>

      {categoriesError && ranked.length === 0 && (
        <p className="mt-4 text-sm text-red-600 text-center">{getErrorMessage(categoriesError)}</p>
      )}

      {/* Categorías: tocar una abre el teclado */}
      <div className="grid grid-cols-3 gap-3 mt-5">
        {quick.map((c) => (
          <CategoryTile key={c.id} category={c} onPress={() => openCategory(c)} />
        ))}
        {hasMore && (
          <button
            type="button"
            onClick={() => setSheet({ mode: 'all' })}
            className="flex flex-col items-center gap-2 py-3 rounded-2xl active:scale-95 transition-transform"
          >
            <span className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center text-gray-500">
              <LayoutGrid className="w-6 h-6" />
            </span>
            <span className="text-xs font-medium text-gray-700">Más</span>
          </button>
        )}
      </div>

      {/* Últimos registros de hoy */}
      {recent.length > 0 && (
        <div className="card mt-6 p-0 divide-y divide-gray-100">
          <p className="px-4 pt-3 pb-2 text-xs uppercase tracking-wide text-gray-500">Últimos de hoy</p>
          {recent.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.categoryColor ?? '#9CA3AF' }} />
              <span className="flex-1 min-w-0 truncate text-sm">{t.description || t.categoryName}</span>
              <span className={`text-sm tabular-nums ${t.type === 'INCOME' ? 'text-brand-700' : 'text-gray-900'}`}>
                {t.type === 'INCOME' ? '+ ' : ''}
                {formatCurrency(t.amount, t.currency)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex justify-center">
        <button
          type="button"
          onClick={() => setFullForm(true)}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500"
        >
          <SlidersHorizontal className="w-4 h-4" />
          Más opciones (cuotas, repetir, fecha)
        </button>
      </div>

      <InstallHint className="mt-6" />

      {/* Aviso flotante: guardado, error o información */}
      {toast && (
        <div
          role="status"
          className={`fixed left-4 right-4 md:left-auto md:right-6 md:max-w-sm bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-6 z-40 rounded-xl px-4 py-3 text-sm text-white shadow-lg flex items-center gap-3 ${
            toast.kind === 'error' ? 'bg-red-600' : 'bg-gray-900'
          }`}
        >
          <span className="flex-1">{toast.kind === 'saved' ? `✓ ${toast.text}` : toast.text}</span>
          {toast.kind === 'saved' && (
            <button type="button" onClick={() => undo(toast.tx)} className="font-semibold underline underline-offset-2">
              Deshacer
            </button>
          )}
          {toast.kind === 'error' && (
            <button
              type="button"
              onClick={() => {
                setToast(null)
                toast.retry()
              }}
              className="font-semibold underline underline-offset-2"
            >
              Reintentar
            </button>
          )}
        </div>
      )}

      {/* Foto: de dónde sale la imagen */}
      <BottomSheet open={photoSheet} onClose={() => setPhotoSheet(false)} title="Registrar desde una imagen">
        <p className="text-sm text-gray-500 px-1">
          Voucher, boleta, captura de Yape o Plin. Se lee el monto, el comercio y la fecha.
        </p>
        <button type="button" onClick={() => readPhoto('camera')} className="sheet-row">
          Tomar foto
          <Camera className="w-5 h-5 text-brand-500" />
        </button>
        <button type="button" onClick={() => readPhoto('library')} className="sheet-row">
          Elegir de la galería
          <ImageIcon className="w-5 h-5 text-brand-500" />
        </button>
      </BottomSheet>

      {/* Leyendo la foto */}
      {reading && (
        <CenterCard>
          <span className="w-14 h-14 rounded-full bg-brand-500 text-white flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin" />
          </span>
          <p className="font-semibold mt-3">Leyendo la imagen…</p>
          <p className="text-sm text-gray-500">Unos segundos.</p>
        </CenterCard>
      )}

      {/* Voz: escuchando o escribiendo la frase */}
      {voiceOpen && (
        <CenterCard onClose={interpreting ? undefined : closeVoice}>
          <button
            type="button"
            onClick={listening ? stopListening : beginListening}
            disabled={!speechAvailable || interpreting}
            className={`w-14 h-14 rounded-full flex items-center justify-center text-white ${
              interpreting ? 'bg-gray-400' : listening ? 'bg-brand-500 animate-pulse' : 'bg-gray-400'
            }`}
            aria-label={listening ? 'Dejar de escuchar' : 'Escuchar'}
          >
            {interpreting ? <Loader2 className="w-6 h-6 animate-spin" /> : <Mic className="w-7 h-7" />}
          </button>
          <p className="font-semibold mt-3">
            {interpreting ? 'Interpretando…' : listening ? 'Escuchando…' : 'Dime el gasto'}
          </p>
          <form
            className="w-full mt-3"
            onSubmit={(e) => {
              e.preventDefault()
              sendVoice()
            }}
          >
            <input
              type="text"
              className="input text-center"
              placeholder="veinte con cincuenta almuerzo"
              value={voiceText}
              onChange={(e) => setVoiceText(e.target.value)}
              autoFocus={!speechAvailable}
              disabled={interpreting}
              enterKeyHint="send"
              autoComplete="off"
            />
            {voiceHint && <p className="text-xs text-gray-500 mt-2">{voiceHint}</p>}
            {!interpreting && (
              <div className="flex gap-2 mt-4">
                <button type="button" onClick={closeVoice} className="btn-secondary flex-1">
                  Cancelar
                </button>
                <button type="submit" disabled={!voiceText.trim()} className="btn-primary flex-1">
                  <Send className="w-4 h-4 mr-1.5" />
                  Enviar
                </button>
              </div>
            )}
          </form>
        </CenterCard>
      )}

      {/* Hoja inferior: todas las categorías o el teclado */}
      <BottomSheet
        open={sheet !== null}
        onClose={closeSheet}
        title={
          sheet?.mode === 'all'
            ? pendingVoice
              ? `¿En qué fue? · ${formatCurrency(digitsToValue(pendingVoice.digits), base)}`
              : 'Todas las categorías'
            : undefined
        }
      >
        {sheet?.mode === 'all' && (
          <div className="grid grid-cols-3 gap-3 max-h-[60dvh] overflow-y-auto pb-2">
            {ranked.map((c) => (
              <CategoryTile key={c.id} category={c} onPress={() => openCategory(c)} />
            ))}
          </div>
        )}

        {sheet?.mode === 'amount' && (
          <>
            <div className="flex items-center gap-3">
              <span
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: (sheet.category.color ?? '#6B7280') + '22', color: sheet.category.color ?? '#6B7280' }}
              >
                {(() => {
                  const Icon = categoryIcon(sheet.category.icon)
                  return <Icon className="w-5 h-5" />
                })()}
              </span>
              <span className="font-medium truncate flex-1">{sheet.category.name}</span>
              <span
                className={`text-2xl font-semibold tabular-nums truncate ${
                  !amount ? 'text-gray-400' : type === 'INCOME' ? 'text-brand-700' : 'text-gray-900'
                }`}
              >
                {formatCurrency(value, currency)}
              </span>
            </div>

            <div className="flex flex-wrap gap-2 mt-3">
              {usableAccounts.length > 1 && (
                <Chip onClick={() => setPickAccount((p) => !p)}>
                  <CreditCard className="w-3.5 h-3.5" />
                  <span className="truncate max-w-[9rem]">
                    {account ? (foreign ? `${account.name} · ${account.currency}` : account.name) : 'Cuenta'}
                  </span>
                  {pickAccount ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </Chip>
              )}
              <Chip
                onClick={() => {
                  // Con fecha del comprobante, tocar vuelve a Hoy; si no, alterna Hoy/Ayer
                  if (dateOverride) setDateOverride(null)
                  else setYesterday((y) => !y)
                }}
              >
                <Calendar className="w-3.5 h-3.5" />
                {dateOverride ? shortDate(dateOverride) : yesterday ? 'Ayer' : 'Hoy'}
              </Chip>
              {foreign && (
                <Chip onClick={() => setRateOpen((o) => !o)} warn={!(parseFloat(rate) > 0)}>
                  <RefreshCw className="w-3.5 h-3.5" />
                  {parseFloat(rate) > 0 ? `1 ${currency} = ${formatCurrency(parseFloat(rate), base)}` : 'Tipo de cambio'}
                </Chip>
              )}
              <Chip onClick={() => setNoteOpen((o) => !o)}>
                <Pencil className="w-3.5 h-3.5" />
                <span className="truncate max-w-[9rem]">{note || 'Nota'}</span>
              </Chip>
            </div>

            {noteOpen && (
              <input
                type="text"
                className="input mt-3"
                placeholder="Nota (opcional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                autoFocus
                maxLength={200}
                enterKeyHint="done"
                onKeyDown={(e) => e.key === 'Enter' && setNoteOpen(false)}
              />
            )}

            {rateOpen && foreign && (
              <div className="mt-3">
                <input
                  type="text"
                  inputMode="decimal"
                  className="input"
                  placeholder={`¿Cuánto vale 1 ${currency} en ${base}? Ej. 3.75`}
                  value={rate}
                  onChange={(e) => setRate(e.target.value.replace(',', '.').replace(/[^0-9.]/g, ''))}
                  autoFocus
                  enterKeyHint="done"
                  onKeyDown={(e) => e.key === 'Enter' && setRateOpen(false)}
                />
                {parseFloat(rate) > 0 && value > 0 && (
                  <p className="text-xs text-gray-500 mt-1">≈ {formatCurrency(value * parseFloat(rate), base)} en tus reportes</p>
                )}
              </div>
            )}

            {pickAccount ? (
              <div className="mt-3">
                <p className="text-sm text-gray-500 px-1 pb-1">¿Con qué pagaste?</p>
                {usableAccounts.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="sheet-row"
                    onClick={() => {
                      setAccountId(a.id)
                      setPickAccount(false)
                    }}
                  >
                    {a.currency !== base ? `${a.name} · ${a.currency}` : a.name}
                    {a.id === accountId && <Check className="w-5 h-5 text-brand-500" />}
                  </button>
                ))}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 mt-4">
                  {KEYS.map((k) => (
                    <Key key={k} label={k} onPress={() => press(k)} onLongPress={k === '⌫' ? () => setAmount('') : undefined} />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={save}
                  disabled={value <= 0 || create.isPending}
                  className="btn-primary w-full mt-3 py-3 text-base rounded-xl disabled:opacity-40"
                >
                  Guardar
                </button>
              </>
            )}
          </>
        )}
      </BottomSheet>

      <TransactionFormModal open={fullForm} onClose={() => setFullForm(false)} onSuccess={() => setFullForm(false)} />
    </div>
  )
}

// ---------- Piezas ----------

function RoundButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="w-11 h-11 rounded-full bg-white border border-gray-200 text-brand-500 flex items-center justify-center shadow-sm active:bg-brand-50"
    >
      {children}
    </button>
  )
}

function CategoryTile({ category, onPress }: { category: Category; onPress: () => void }) {
  const tint = category.color ?? '#6B7280'
  const Icon = categoryIcon(category.icon)
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={`Registrar en ${category.name}`}
      className="flex flex-col items-center gap-2 py-3 rounded-2xl active:scale-95 transition-transform"
    >
      <span className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: tint + '22', color: tint }}>
        <Icon className="w-6 h-6" />
      </span>
      <span className="text-xs font-medium text-gray-700 truncate max-w-full">{category.name}</span>
    </button>
  )
}

function Chip({ children, onClick, warn }: { children: ReactNode; onClick: () => void; warn?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs text-gray-700 bg-white ${
        warn ? 'border-red-400' : 'border-gray-200'
      }`}
    >
      {children}
    </button>
  )
}

/** Tecla grande; mantener presionada ⌫ borra todo. */
function Key({ label, onPress, onLongPress }: { label: string; onPress: () => void; onLongPress?: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longFired = useRef(false)
  const start = () => {
    if (!onLongPress) return
    longFired.current = false
    timer.current = setTimeout(() => {
      longFired.current = true
      onLongPress()
    }, 500)
  }
  const end = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  return (
    <button
      type="button"
      onPointerDown={start}
      onPointerUp={end}
      onPointerLeave={end}
      onPointerCancel={end}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (longFired.current) {
          longFired.current = false
          return
        }
        onPress()
      }}
      aria-label={label === '⌫' ? 'Borrar' : label === '00' ? 'Doble cero' : label}
      className="h-14 rounded-xl bg-gray-100 active:bg-gray-200 text-2xl font-medium text-gray-900 flex items-center justify-center select-none touch-manipulation"
    >
      {label === '⌫' ? <Delete className="w-6 h-6" /> : label}
    </button>
  )
}

function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl px-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4 max-h-[92dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto w-10 h-1 rounded-full bg-gray-300 mb-3 sm:hidden" aria-hidden />
        {title && (
          <div className="flex items-center justify-between mb-2">
            <p className="font-semibold">{title}</p>
            <button type="button" onClick={onClose} className="p-2 -mr-2 text-gray-500" aria-label="Cerrar">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

function CenterCard({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <div
        role="dialog"
        className="bg-white rounded-2xl w-full max-w-xs p-6 flex flex-col items-center text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
