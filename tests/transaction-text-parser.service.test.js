import assert from 'node:assert/strict'
import test from 'node:test'

import {
  parseBankTransactionMessage,
  resolveChosenCategory,
} from '../dist/services/transaction-text-parser.service.js'

test('parseBankTransactionMessage parses outgoing bank notifications', () => {
  const result = parseBankTransactionMessage('09-04@13:45 KPLUS: เงินออก 120.00บ ใช้ได้ 999.00บ')

  assert.ok(result)
  assert.equal(result.type, 'expense')
  assert.equal(result.amount, '120.00')
  assert.equal(result.categoryId, null)
  assert.equal(result.note, null)
  assert.match(result.transactedAt, /^\d{4}-04-09$/)
})

test('parseBankTransactionMessage infers income from positive adjustment', () => {
  const result = parseBankTransactionMessage('09-04@13:45 SCB: ปรับปรุง + 500.00บ')

  assert.ok(result)
  assert.equal(result.type, 'income')
  assert.equal(result.amount, '500.00')
})

test('resolveChosenCategory rejects categories with mismatched transaction type', () => {
  const result = resolveChosenCategory(
    'salary',
    [
      { id: 'food', name: 'Food', icon: null, type: 'expense' },
      { id: 'salary', name: 'Salary', icon: null, type: 'income' },
    ],
    { type: 'expense' },
  )

  assert.equal(result, null)
})
