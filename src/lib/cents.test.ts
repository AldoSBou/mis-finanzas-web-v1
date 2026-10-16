import { describe, expect, it } from 'vitest'
import { displayAmount, fromDigits, toDigits, typeAmount } from './cents'

describe('ingreso desde los centavos', () => {
  it('coloca el punto decimal solo, dígito a dígito', () => {
    let v = ''
    for (const [key, expected] of [
      ['1', '0.01'],
      ['2', '0.12'],
      ['5', '1.25'],
      ['0', '12.50'],
      ['0', '125.00'],
    ]) {
      v = typeAmount(v, displayAmount(v) + key)
      expect(v).toBe(expected)
    }
  })

  it('borrar quita el último dígito', () => {
    expect(typeAmount('125.00', '125.0')).toBe('12.50')
    expect(typeAmount('0.01', '0.0')).toBe('')
    expect(typeAmount('12.50', '')).toBe('')
  })

  it('un millón no se confunde con cien mil', () => {
    expect(fromDigits('100000000')).toBe('1000000.00')
    expect(fromDigits('10000000')).toBe('100000.00')
  })

  it('ignora lo que no sea dígito y respeta el tope', () => {
    expect(fromDigits('12a.b3')).toBe('1.23')
    expect(fromDigits('1234567890123')).toBe('1234567.89')
    expect(typeAmount('', '1,234.56')).toBe('1234.56') // pegado
  })

  it('formatea con separador de miles', () => {
    expect(displayAmount('1234.5')).toBe('1,234.50')
    expect(displayAmount('-20')).toBe('-20.00')
    expect(displayAmount('')).toBe('')
  })

  it('un "-" invierte el signo solo si se permite', () => {
    expect(typeAmount('12.00', '12.00-', true)).toBe('-12.00')
    expect(typeAmount('-12.00', '-12.00-', true)).toBe('12.00')
    expect(typeAmount('-12.00', '-12.005', true)).toBe('-120.05')
    expect(typeAmount('12.00', '12.00-')).toBe('12.00')
    expect(typeAmount('-5.00', '-5.00')).toBe('5.00') // sin permiso, se descarta el signo
  })

  it('convierte montos existentes a dígitos', () => {
    expect(toDigits('12.50')).toBe('1250')
    expect(toDigits('0')).toBe('')
    expect(toDigits('')).toBe('')
  })
})
