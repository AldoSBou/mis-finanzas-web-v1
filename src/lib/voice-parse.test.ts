import { describe, expect, it } from 'vitest'
import { findAmount, normalize, parseUtterance, wordsToNumber, type VoiceCategory } from './voice-parse'

const CATS: VoiceCategory[] = [
  { id: 1, name: 'Alimentación', type: 'EXPENSE' },
  { id: 2, name: 'Restaurantes', type: 'EXPENSE' },
  { id: 3, name: 'Transporte', type: 'EXPENSE' },
  { id: 4, name: 'Salud', type: 'EXPENSE' },
  { id: 5, name: 'Servicios', type: 'EXPENSE' },
  { id: 6, name: 'Otros', type: 'EXPENSE' },
  { id: 7, name: 'Salario', type: 'INCOME' },
  { id: 8, name: 'Freelance', type: 'INCOME' },
]

describe('wordsToNumber', () => {
  it('convierte números en palabras', () => {
    expect(wordsToNumber(['veinte'])).toBe(20)
    expect(wordsToNumber(['cuarenta', 'y', 'cinco'])).toBe(45)
    expect(wordsToNumber(['ciento', 'veinte'])).toBe(120)
    expect(wordsToNumber(['dos', 'mil', 'trescientos', 'cuarenta', 'y', 'cinco'])).toBe(2345)
    expect(wordsToNumber(['mil'])).toBe(1000)
  })
  it('rechaza lo que no es número', () => {
    expect(wordsToNumber(['almuerzo'])).toBeNull()
    expect(wordsToNumber([])).toBeNull()
  })
})

describe('findAmount', () => {
  const words = (s: string) => normalize(s).split(' ')
  it('cifras con y sin decimales', () => {
    expect(findAmount(words('taxi 12 soles'))?.value).toBe(12)
    expect(findAmount(words('20.50 almuerzo'))?.value).toBe(20.5)
    expect(findAmount(words('20,5 almuerzo'))?.value).toBe(20.5)
    expect(findAmount(words('1,200 alquiler'))?.value).toBe(1200)
  })
  it('"con" para los centavos', () => {
    expect(findAmount(words('20 con 50 almuerzo'))?.value).toBe(20.5)
    expect(findAmount(words('veinte con cincuenta almuerzo'))?.value).toBe(20.5)
    expect(findAmount(words('veinte soles con cincuenta'))?.value).toBe(20.5)
  })
  it('palabras largas', () => {
    expect(findAmount(words('mil quinientos de freelance'))?.value).toBe(1500)
  })
  it('sin monto', () => {
    expect(findAmount(words('almuerzo con amigos'))).toBeNull()
  })
})

describe('parseUtterance', () => {
  it('monto y categoría por palabra clave', () => {
    const p = parseUtterance('veinte con cincuenta almuerzo', CATS)
    expect(p.digits).toBe('2050')
    expect(p.categoryId).toBe(2)
    expect(p.type).toBe('EXPENSE')
    expect(p.matchedBy).toBe('keyword')
  })
  it('categoría por nombre', () => {
    const p = parseUtterance('gasté 35 en transporte', CATS)
    expect(p.digits).toBe('3500')
    expect(p.categoryId).toBe(3)
    expect(p.matchedBy).toBe('name')
    expect(p.note).toBe('')
  })
  it('la nota conserva lo que no es monto ni relleno ni categoría', () => {
    const p = parseUtterance('taxi al aeropuerto 45 soles', CATS)
    expect(p.digits).toBe('4500')
    expect(p.categoryId).toBe(3)
    expect(p.note).toBe('taxi aeropuerto')
  })
  it('ingreso por pista y categoría', () => {
    const p = parseUtterance('me pagaron 1500 de freelance', CATS)
    expect(p.digits).toBe('150000')
    expect(p.type).toBe('INCOME')
    expect(p.categoryId).toBe(8)
  })
  it('dólares', () => {
    const p = parseUtterance('50 dólares farmacia', CATS)
    expect(p.currency).toBe('USD')
    expect(p.categoryId).toBe(4)
  })
  it('categoría por historial de descripciones', () => {
    const p = parseUtterance('12 donde lucho', CATS, [{ description: 'donde Lucho', categoryId: 2 }])
    expect(p.categoryId).toBe(2)
    expect(p.matchedBy).toBe('history')
  })
  it('sin categoría reconocida deja el monto', () => {
    const p = parseUtterance('treinta cosas raras', CATS)
    expect(p.digits).toBe('3000')
    expect(p.categoryId).toBe(6) // "cosas" → Otros
  })
  it('no entendió nada', () => {
    const p = parseUtterance('hola qué tal', CATS)
    expect(p.digits).toBe('')
    expect(p.categoryId).toBeNull()
  })
})
