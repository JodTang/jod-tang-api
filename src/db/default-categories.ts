import type { CategoryType, NewCategory } from './schema.ts'

type DefaultCategoryDefinition = {
  icon: string
  name: string
  type: CategoryType
}

export const DEFAULT_USER_CATEGORIES: DefaultCategoryDefinition[] = [
  { name: 'อาหาร', icon: '🍜', type: 'expense' },
  { name: 'เดินทาง', icon: '🚗', type: 'expense' },
  { name: 'ที่พัก', icon: '🏠', type: 'expense' },
  { name: 'ช้อปปิ้ง', icon: '🛍️', type: 'expense' },
  { name: 'สุขภาพ', icon: '💊', type: 'expense' },
  { name: 'บันเทิง', icon: '🎮', type: 'expense' },
  { name: 'เงินเดือน', icon: '💰', type: 'income' },
  { name: 'งาน freelance', icon: '💼', type: 'income' },
  { name: 'รับเงินโอน', icon: '🎁', type: 'income' },
  { name: 'ลงทุน', icon: '📈', type: 'income' },
  { name: 'อื่นๆ', icon: '📦', type: 'both' },
]

export function buildDefaultCategoriesForUser(userId: string): NewCategory[] {
  return DEFAULT_USER_CATEGORIES.map((category) => ({
    userId,
    name: category.name,
    icon: category.icon,
    type: category.type,
    isDefault: true,
  }))
}
