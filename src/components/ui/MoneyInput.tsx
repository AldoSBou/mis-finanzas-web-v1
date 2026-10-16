import { useEffect, useRef, type InputHTMLAttributes } from 'react'
import { displayAmount, typeAmount } from '@/lib/cents'

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  /** Monto decimal ('12.50') o '' si está vacío */
  value: string
  onChange: (value: string) => void
  /** Permite montos negativos: escribir "-" invierte el signo */
  allowNegative?: boolean
}

/**
 * Campo de monto que se escribe desde los centavos: los dígitos entran por la derecha
 * y el punto se coloca solo (1, 2, 5, 0, 0 → 0.01, 0.12, 1.25, 12.50, 125.00).
 */
export function MoneyInput({ value, onChange, allowNegative, className, placeholder = '0.00', ...rest }: Props) {
  const ref = useRef<HTMLInputElement>(null)

  // El cursor siempre al final: los dígitos solo entran por la derecha
  useEffect(() => {
    const el = ref.current
    if (el && document.activeElement === el) el.setSelectionRange(el.value.length, el.value.length)
  }, [value])

  return (
    <input
      ref={ref}
      type="text"
      inputMode={allowNegative ? 'text' : 'decimal'}
      autoComplete="off"
      value={displayAmount(value)}
      onChange={(e) => onChange(typeAmount(value, e.target.value, allowNegative))}
      onFocus={(e) => {
        const el = e.target
        requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length))
      }}
      className={className ?? 'input'}
      placeholder={placeholder}
      {...rest}
    />
  )
}
