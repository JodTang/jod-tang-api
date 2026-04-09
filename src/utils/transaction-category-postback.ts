import type { messagingApi } from '@line/bot-sdk'
import type { Category, Transaction, TransactionType } from '../db/schema.ts'

const transactionCategoryAction = 'assign-transaction-category'

interface TransactionCategoryPostbackPayload {
  categoryId: string
  transactionId: string
}

export function buildTransactionCategoryFlexMessage(
  transaction: Pick<Transaction, 'id' | 'amount' | 'type'>,
  categories: Pick<Category, 'id' | 'icon' | 'name'>[],
): messagingApi.FlexMessage {
  const transactionLabel = getTransactionLabel(transaction.type)
  const amountText = Number(transaction.amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const categoryChunks = chunkCategories(categories, 8)

  return {
    type: 'flex',
    altText: `เลือกหมวดหมู่${transactionLabel} ${amountText} บาท`,
    contents:
      categoryChunks.length === 1
        ? buildTransactionCategoryBubble(
            transaction,
            categoryChunks[0],
            transactionLabel,
            amountText,
            1,
            1,
          )
        : {
            type: 'carousel',
            contents: categoryChunks.map((chunk, index) =>
              buildTransactionCategoryBubble(
                transaction,
                chunk,
                transactionLabel,
                amountText,
                index + 1,
                categoryChunks.length,
              ),
            ),
          },
  }
}

function buildTransactionCategoryBubble(
  transaction: Pick<Transaction, 'id' | 'type'>,
  categories: Pick<Category, 'id' | 'icon' | 'name'>[],
  transactionLabel: string,
  amountText: string,
  page: number,
  totalPages: number,
): messagingApi.FlexBubble {
  const theme = getTransactionTheme(transaction.type)

  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '18px',
      backgroundColor: theme.headerBackground,
      contents: [
        {
          type: 'text',
          text: `บันทึก${transactionLabel}แล้ว`,
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF',
        },
        {
          type: 'text',
          text: `${amountText} บาท`,
          margin: 'sm',
          weight: 'bold',
          size: 'xxl',
          color: '#FFFFFF',
        },
        {
          type: 'text',
          text: 'เลือกหมวดหมู่ที่ต้องการให้รายการนี้',
          margin: 'md',
          size: 'sm',
          color: '#F8FAFC',
          wrap: true,
        },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '16px',
      spacing: 'sm',
      backgroundColor: theme.bodyBackground,
      contents: [
        ...(totalPages > 1
          ? [
              {
                type: 'text' as const,
                text: `หน้า ${page}/${totalPages}`,
                size: 'xs',
                color: '#64748B',
                align: 'end' as const,
              },
            ]
          : []),
        ...categories.map((category) =>
          buildCategoryOption(transaction.id, category, theme.accentColor),
        ),
      ],
    },
  }
}

function buildCategoryOption(
  transactionId: string,
  category: Pick<Category, 'id' | 'icon' | 'name'>,
  accentColor: string,
): messagingApi.FlexBox {
  const icon = category.icon?.trim() || '🏷️'

  return {
    type: 'box',
    layout: 'horizontal',
    alignItems: 'center',
    spacing: 'md',
    paddingAll: '12px',
    cornerRadius: '12px',
    backgroundColor: '#FFFFFF',
    borderWidth: '1px',
    borderColor: '#E2E8F0',
    action: {
      type: 'postback',
      label: `${icon} ${category.name}`.slice(0, 20),
      data: buildTransactionCategoryPostbackData({
        transactionId,
        categoryId: category.id,
      }),
      displayText: `เลือกหมวด ${category.name}`,
    },
    contents: [
      {
        type: 'text',
        text: icon,
        flex: 0,
        size: 'xl',
      },
      {
        type: 'text',
        text: category.name,
        flex: 1,
        weight: 'bold',
        size: 'sm',
        color: '#0F172A',
        wrap: true,
      },
      {
        type: 'text',
        text: 'เลือก',
        flex: 0,
        size: 'xs',
        color: accentColor,
        weight: 'bold',
      },
    ],
  }
}

export function buildTransactionCategoryPostbackData(payload: TransactionCategoryPostbackPayload) {
  return new URLSearchParams({
    action: transactionCategoryAction,
    transactionId: payload.transactionId,
    categoryId: payload.categoryId,
  }).toString()
}

export function parseTransactionCategoryPostbackData(data: string) {
  const params = new URLSearchParams(data)
  if (params.get('action') !== transactionCategoryAction) {
    return null
  }

  const transactionId = params.get('transactionId')
  const categoryId = params.get('categoryId')

  if (!transactionId || !categoryId) {
    return null
  }

  return {
    transactionId,
    categoryId,
  }
}

export function canAssignCategoryToTransaction(
  category: Pick<Category, 'type'>,
  transaction: Pick<Transaction, 'type'>,
) {
  return category.type === 'both' || category.type === transaction.type
}

function getTransactionLabel(type: TransactionType) {
  return type === 'expense' ? 'รายจ่าย' : 'รายรับ'
}

function getTransactionTheme(type: TransactionType) {
  if (type === 'expense') {
    return {
      headerBackground: '#C2410C',
      bodyBackground: '#FFF7ED',
      accentColor: '#C2410C',
    }
  }

  return {
    headerBackground: '#047857',
    bodyBackground: '#ECFDF5',
    accentColor: '#047857',
  }
}

function chunkCategories<T>(items: T[], size: number) {
  const chunks: T[][] = []

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
}
