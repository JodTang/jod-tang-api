import type { messagingApi } from '@line/bot-sdk'
import type { Category, Transaction, TransactionType } from '../db/schema.ts'

interface BuildTransactionResultOptions {
  category?: Pick<Category, 'name' | 'icon'> | null
}

export function buildTransactionResultFlexMessage(
  transaction: Pick<Transaction, 'amount' | 'note' | 'transactedAt' | 'type'>,
  options: BuildTransactionResultOptions = {},
): messagingApi.FlexMessage {
  const transactionLabel = transaction.type === 'expense' ? 'รายจ่าย' : 'รายรับ'
  const amountText = Number(transaction.amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const categoryLabel = options.category
    ? `${options.category.icon?.trim() || '🏷️'} ${options.category.name}`
    : 'ยังไม่ระบุ'
  const noteLabel = transaction.note?.trim() || '-'
  const theme = getTransactionTheme(transaction.type)

  return {
    type: 'flex',
    altText: `บันทึก${transactionLabel} ${amountText} บาท`,
    contents: {
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
            text: `บันทึก${transactionLabel}สำเร็จ`,
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
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: '16px',
        backgroundColor: theme.bodyBackground,
        contents: [
          buildSummaryRow('วันที่', transaction.transactedAt),
          buildSummaryRow('หมวดหมู่', categoryLabel),
          buildSummaryRow('รายละเอียด', noteLabel, true),
        ],
      },
    },
  }
}

function buildSummaryRow(label: string, value: string, wrap = false): messagingApi.FlexBox {
  return {
    type: 'box',
    layout: 'vertical',
    spacing: 'xs',
    contents: [
      {
        type: 'text',
        text: label,
        size: 'xs',
        color: '#64748B',
      },
      {
        type: 'text',
        text: value,
        size: 'sm',
        weight: 'bold',
        color: '#0F172A',
        wrap,
      },
    ],
  }
}

function getTransactionTheme(type: TransactionType) {
  if (type === 'expense') {
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
