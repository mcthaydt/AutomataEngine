import { describe, expect, it } from 'vitest'
import {
  allStockPurchased,
  inRadius,
  nextPurchase,
  totalStockPrice,
  type ShopDef
} from '../src/shopCore'

const shop: ShopDef = {
  id: 's1',
  position: { x: 0, z: 0 },
  radius: 1.5,
  stock: [
    { itemId: 'catalog-2', price: 4 },
    { itemId: 'catalog-1', price: 3 },
    { itemId: 'catalog-3', price: 99 }
  ]
}

describe('shopCore', () => {
  it('returns the first unowned affordable item in itemId order', () => {
    expect(nextPurchase(shop, 10, new Set())).toEqual({
      itemId: 'catalog-1',
      price: 3
    })
  })

  it('skips owned and unaffordable items', () => {
    expect(nextPurchase(shop, 10, new Set(['catalog-1']))).toEqual({
      itemId: 'catalog-2',
      price: 4
    })
    expect(nextPurchase(shop, 3, new Set(['catalog-1', 'catalog-2']))).toBeNull()
  })

  it('inRadius respects the shop radius', () => {
    expect(inRadius(shop, { x: 1, z: 0 })).toBe(true)
    expect(inRadius(shop, { x: 5, z: 0 })).toBe(false)
  })

  it('allStockPurchased is true only when every stock id is owned', () => {
    expect(allStockPurchased([shop], new Set())).toBe(false)
    expect(allStockPurchased([shop], new Set(['catalog-1', 'catalog-2']))).toBe(false)
    expect(allStockPurchased([shop], new Set(['catalog-1', 'catalog-2', 'catalog-3']))).toBe(true)
  })

  it('allStockPurchased is vacuously true with no shops or empty stock', () => {
    expect(allStockPurchased([], new Set())).toBe(true)
    expect(allStockPurchased([{ ...shop, stock: [] }], new Set())).toBe(true)
  })

  it('totalStockPrice sums every shop', () => {
    expect(totalStockPrice([shop])).toBe(106)
    expect(totalStockPrice([])).toBe(0)
  })
})
