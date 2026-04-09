import type { messagingApi } from '@line/bot-sdk'
import type { Category } from '../db/schema.ts'

export function buildCategoriesFlexMessage(categories: Category[]): messagingApi.FlexMessage {
  const expenseCategories = categories.filter((category) => category.type === 'expense')
  const incomeCategories = categories.filter((category) => category.type === 'income')
  const sharedCategories = categories.filter((category) => category.type === 'both')
  const expenseSection = buildCategorySection('รายจ่าย', expenseCategories, '#FFF7ED', '#C2410C')
  const incomeSection = buildCategorySection('รายรับ', incomeCategories, '#ECFDF5', '#047857')
  const summarySections: messagingApi.FlexComponent[] = []

  if (expenseSection) {
    summarySections.push(expenseSection)
  }

  if (incomeSection) {
    summarySections.push(incomeSection)
  }

  const bodyContents: messagingApi.FlexComponent[] = [
    {
      type: 'box',
      layout: 'baseline',
      justifyContent: 'space-between',
      alignItems: 'center',
      contents: [
        {
          type: 'text',
          text: 'หมวดหมู่ทั้งหมด',
          weight: 'bold',
          size: 'xl',
          color: '#1F2937',
          flex: 1,
        },
        {
          type: 'text',
          text: `${categories.length} รายการ`,
          size: 'sm',
          color: '#6B7280',
          flex: 0,
          align: 'end',
        },
      ],
    },
  ]

  if (summarySections.length > 0) {
    bodyContents.push({
      type: 'box',
      layout: 'horizontal',
      margin: 'md',
      spacing: 'sm',
      contents: summarySections,
    })
  }

  if (sharedCategories.length > 0) {
    const sharedSection = buildCategorySection(
      'ใช้ได้ทั้งสองแบบ',
      sharedCategories,
      '#EFF6FF',
      '#1D4ED8',
    )

    if (sharedSection) {
      bodyContents.push({
        ...sharedSection,
        margin: 'md',
      })
    }
  }

  return {
    type: 'flex',
    altText: `หมวดหมู่ทั้งหมด ${categories.length} รายการ`,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '16px',
        contents: bodyContents,
      },
    },
  }
}

function buildCategorySection(
  title: string,
  categories: Category[],
  backgroundColor: string,
  accentColor: string,
): messagingApi.FlexBox | null {
  if (categories.length === 0) {
    return null
  }

  return {
    type: 'box',
    layout: 'vertical',
    flex: 1,
    paddingAll: '8px',
    backgroundColor,
    cornerRadius: '10px',
    spacing: 'xs',
    contents: [
      {
        type: 'text',
        text: title,
        weight: 'bold',
        size: 'sm',
        color: accentColor,
      },
      ...categories.map((category) => ({
        type: 'text' as const,
        text: `${category.icon ? `${category.icon} ` : ''}${category.name}`,
        size: 'xs',
        color: '#1F2937',
        wrap: true,
        margin: 'xs',
      })),
    ],
  }
}
