import type { messagingApi } from '@line/bot-sdk'
import type { Transaction } from '../db/schema.ts'

interface BuildTodaySummaryFlexMessageOptions {
  date: string
  transactions: Pick<Transaction, 'amount' | 'note' | 'sourceText' | 'type'>[]
}

export function buildTodaySummaryFlexMessage(
  options: BuildTodaySummaryFlexMessageOptions,
): messagingApi.FlexMessage {
  const incomeTotal = options.transactions
    .filter((transaction) => transaction.type === 'income')
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0)
  const expenseTotal = options.transactions
    .filter((transaction) => transaction.type === 'expense')
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0)
  const netTotal = incomeTotal - expenseTotal
  const recentItems = options.transactions.slice(0, 5)

  return {
    type: 'flex',
    altText: `สรุปวันนี้ ${options.date}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '18px',
        backgroundColor: '#0F172A',
        contents: [
          {
            type: 'text',
            text: 'สรุปวันนี้',
            weight: 'bold',
            size: 'lg',
            color: '#FFFFFF',
          },
          {
            type: 'text',
            text: options.date,
            margin: 'sm',
            size: 'sm',
            color: '#CBD5E1',
          },
          {
            type: 'text',
            text: `${options.transactions.length} รายการ`,
            margin: 'md',
            size: 'xs',
            color: '#94A3B8',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: '16px',
        backgroundColor: '#F8FAFC',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            contents: [
              buildStatCard('รายรับ', formatCurrency(incomeTotal), '#ECFDF5', '#047857'),
              buildStatCard('รายจ่าย', formatCurrency(expenseTotal), '#FFF7ED', '#C2410C'),
            ],
          },
          buildNetSection(netTotal),
          {
            type: 'separator',
            margin: 'sm',
            color: '#E2E8F0',
          },
          {
            type: 'text',
            text: 'รายการล่าสุด',
            weight: 'bold',
            size: 'sm',
            color: '#0F172A',
          },
          ...recentItems.map((transaction) => buildRecentItem(transaction)),
        ],
      },
    },
  }
}

export function buildEmptyTodaySummaryFlexMessage(date: string): messagingApi.FlexMessage {
  return {
    type: 'flex',
    altText: `สรุปวันนี้ ${date}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '18px',
        backgroundColor: '#1D4ED8',
        contents: [
          {
            type: 'text',
            text: 'สรุปวันนี้',
            weight: 'bold',
            size: 'lg',
            color: '#FFFFFF',
          },
          {
            type: 'text',
            text: date,
            margin: 'sm',
            size: 'sm',
            color: '#DBEAFE',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: '16px',
        backgroundColor: '#EFF6FF',
        contents: [
          {
            type: 'text',
            text: 'ยังไม่มีรายการรายรับหรือรายจ่ายของวันนี้',
            wrap: true,
            color: '#1E3A8A',
            size: 'sm',
          },
          {
            type: 'box',
            layout: 'vertical',
            spacing: 'xs',
            paddingAll: '12px',
            backgroundColor: '#FFFFFF',
            cornerRadius: '12px',
            contents: [
              {
                type: 'text',
                text: 'ลองพิมพ์แบบนี้',
                weight: 'bold',
                size: 'sm',
                color: '#0F172A',
              },
              {
                type: 'text',
                text: 'ข้าวกลางวัน 80',
                size: 'sm',
                color: '#334155',
              },
              {
                type: 'text',
                text: 'ค่าแท็กซี่ 120',
                size: 'sm',
                color: '#334155',
              },
              {
                type: 'text',
                text: 'เงินเดือน 25000',
                size: 'sm',
                color: '#334155',
              },
            ],
          },
        ],
      },
    },
  }
}

function buildStatCard(
  label: string,
  value: string,
  backgroundColor: string,
  accentColor: string,
): messagingApi.FlexBox {
  return {
    type: 'box',
    layout: 'vertical',
    flex: 1,
    spacing: 'xs',
    paddingAll: '12px',
    backgroundColor,
    cornerRadius: '12px',
    contents: [
      {
        type: 'text',
        text: label,
        size: 'xs',
        color: accentColor,
        weight: 'bold',
      },
      {
        type: 'text',
        text: value,
        size: 'sm',
        color: '#0F172A',
        weight: 'bold',
        wrap: true,
      },
    ],
  }
}

function buildNetSection(netTotal: number): messagingApi.FlexBox {
  const isPositive = netTotal >= 0

  return {
    type: 'box',
    layout: 'vertical',
    spacing: 'xs',
    paddingAll: '12px',
    backgroundColor: '#FFFFFF',
    cornerRadius: '12px',
    contents: [
      {
        type: 'text',
        text: 'สุทธิ',
        size: 'xs',
        color: '#64748B',
        weight: 'bold',
      },
      {
        type: 'text',
        text: formatCurrency(netTotal),
        size: 'lg',
        color: isPositive ? '#047857' : '#C2410C',
        weight: 'bold',
      },
    ],
  }
}

function buildRecentItem(
  transaction: Pick<Transaction, 'amount' | 'note' | 'sourceText' | 'type'>,
): messagingApi.FlexBox {
  const label = transaction.note?.trim() || transaction.sourceText?.trim() || 'ไม่ระบุรายละเอียด'
  const prefix = transaction.type === 'income' ? '+' : '-'
  const accentColor = transaction.type === 'income' ? '#047857' : '#C2410C'

  return {
    type: 'box',
    layout: 'baseline',
    spacing: 'sm',
    contents: [
      {
        type: 'text',
        text: prefix,
        flex: 0,
        size: 'sm',
        weight: 'bold',
        color: accentColor,
      },
      {
        type: 'text',
        text: label,
        flex: 1,
        size: 'sm',
        color: '#0F172A',
        wrap: true,
      },
      {
        type: 'text',
        text: formatCurrency(Number(transaction.amount)),
        flex: 0,
        size: 'sm',
        weight: 'bold',
        color: accentColor,
        align: 'end',
      },
    ],
  }
}

function formatCurrency(value: number) {
  return `${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} บาท`
}
