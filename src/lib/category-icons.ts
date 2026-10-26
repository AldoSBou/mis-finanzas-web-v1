import {
  Book,
  Briefcase,
  Car,
  CreditCard,
  Film,
  Heart,
  Home,
  Laptop,
  MoreHorizontal,
  Percent,
  PlusCircle,
  Repeat,
  Shirt,
  ShoppingCart,
  Tag,
  Utensils,
  Zap,
  type LucideIcon,
} from 'lucide-react'

/** Las categorías guardan el nombre del icono de Lucide; los que no existen caen en una etiqueta. */
const ICONS: Record<string, LucideIcon> = {
  home: Home,
  'shopping-cart': ShoppingCart,
  car: Car,
  heart: Heart,
  zap: Zap,
  book: Book,
  film: Film,
  utensils: Utensils,
  shirt: Shirt,
  'credit-card': CreditCard,
  repeat: Repeat,
  'more-horizontal': MoreHorizontal,
  briefcase: Briefcase,
  laptop: Laptop,
  percent: Percent,
  'plus-circle': PlusCircle,
}

export function categoryIcon(icon: string | null | undefined): LucideIcon {
  return (icon && ICONS[icon]) || Tag
}
