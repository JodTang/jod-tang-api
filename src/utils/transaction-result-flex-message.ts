import type { messagingApi } from '@line/bot-sdk'
import type { Category, Transaction, TransactionType } from '../db/schema.ts'

interface BuildTransactionCategoryOptions {
  category?: Pick<Category, 'name' | 'icon'> | null
}

interface BuildTransactionResultOptions extends BuildTransactionCategoryOptions {
  altText?: string
  headerTitle?: string
}

interface BuildTransactionResultItem extends BuildTransactionCategoryOptions {
  transaction: Pick<Transaction, 'amount' | 'note' | 'transactedAt' | 'type'>
}

export function buildTransactionResultFlexMessage(
  input:
    | Pick<Transaction, 'amount' | 'note' | 'transactedAt' | 'type'>
    | BuildTransactionResultItem[],
  options: BuildTransactionResultOptions = {},
): messagingApi.FlexMessage {
  const items = Array.isArray(input) ? input : [{ transaction: input, category: options.category }]

  return {
    type: 'flex',
    altText: options.altText || buildAltText(items),
    contents: buildTransactionResultBubble(items, options),
  }
}

function buildTransactionResultBubble(
  items: BuildTransactionResultItem[],
  options: BuildTransactionResultOptions,
): messagingApi.FlexBubble {
  const theme = getResultTheme(items)
  const headerTitle = options.headerTitle || 'บันทึกรายการสำเร็จ'

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
          text: headerTitle,
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF',
        },
        {
          type: 'text',
          text: `${items.length} รายการ`,
          margin: 'sm',
          weight: 'bold',
          size: 'xl',
          color: '#FFFFFF',
        },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      paddingAll: '16px',
      backgroundColor: theme.bodyBackground,
      contents: items.map(buildTransactionRow),
    },
  }
}

function buildTransactionRow(
  item: BuildTransactionResultItem,
  index: number,
): messagingApi.FlexBox {
  const transactionLabel = item.transaction.type === 'expense' ? 'รายจ่าย' : 'รายรับ'
  const categoryLabel = item.category
    ? `${item.category.icon?.trim() || '🏷️'} ${item.category.name}`
    : 'ยังไม่ระบุ'
  const noteLabel = item.transaction.note?.trim() || '-'
  const amountText = `${formatMoney(item.transaction.amount)} บาท`
  const amountColor = item.transaction.type === 'expense' ? '#C2410C' : '#047857'

  return {
    type: 'box',
    layout: 'vertical',
    spacing: 'sm',
    paddingAll: '14px',
    cornerRadius: '14px',
    backgroundColor: '#FFFFFF',
    borderWidth: '1px',
    borderColor: '#E2E8F0',
    contents: [
      {
        type: 'box',
        layout: 'horizontal',
        alignItems: 'center',
        spacing: 'sm',
        contents: [
          {
            type: 'text',
            text: `#${index + 1}`,
            flex: 0,
            size: 'xs',
            weight: 'bold',
            color: '#64748B',
          },
          buildTypePill(transactionLabel, item.transaction.type),
          {
            type: 'text',
            text: amountText,
            align: 'end',
            flex: 1,
            size: 'md',
            weight: 'bold',
            color: amountColor,
          },
        ],
      },
      {
        type: 'text',
        text: `วันที่ ${item.transaction.transactedAt}`,
        size: 'sm',
        color: '#334155',
      },
      {
        type: 'text',
        text: `หมวดหมู่ ${categoryLabel}`,
        size: 'sm',
        color: '#334155',
        wrap: true,
      },
      {
        type: 'text',
        text: `รายละเอียด ${noteLabel}`,
        size: 'sm',
        color: '#334155',
        wrap: true,
      },
    ],
  }
}

function formatMoney(amount: string) {
  return Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function buildTypePill(label: string, type: TransactionType): messagingApi.FlexBox {
  return {
    type: 'box',
    layout: 'horizontal',
    flex: 0,
    paddingTop: '4px',
    paddingBottom: '4px',
    paddingStart: '10px',
    paddingEnd: '10px',
    cornerRadius: '999px',
    backgroundColor: type === 'expense' ? '#FFEDD5' : '#DCFCE7',
    contents: [
      {
        type: 'text',
        text: label,
        size: 'sm',
        weight: 'bold',
        color: type === 'expense' ? '#C2410C' : '#047857',
        flex: 0,
      },
    ],
  }
}

function buildAltText(items: BuildTransactionResultItem[]) {
  if (items.length === 1) {
    const transaction = items[0].transaction
    const transactionLabel = transaction.type === 'expense' ? 'รายจ่าย' : 'รายรับ'
    return `บันทึก${transactionLabel} ${formatMoney(transaction.amount)} บาท`
  }

  return `บันทึก ${items.length} รายการสำเร็จ`
}

function getResultTheme(items: BuildTransactionResultItem[]) {
  const hasExpense = items.some((item) => item.transaction.type === 'expense')
  const hasIncome = items.some((item) => item.transaction.type === 'income')

  if (hasExpense && hasIncome) {
    return {
      headerBackground: '#1D4ED8',
      bodyBackground: '#EFF6FF',
    }
  }

  if (hasExpense) {
    return {
      headerBackground: '#C2410C',
      bodyBackground: '#FFF7ED',
    }
  }

  return {
    headerBackground: '#047857',
    bodyBackground: '#ECFDF5',
  }
}
