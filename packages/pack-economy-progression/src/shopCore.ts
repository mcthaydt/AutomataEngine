/** Buy-only shop stock. IDs are catalog-only—not placed inventory items. */
export interface ShopStockItem {
  itemId: string
  price: number
}

export interface ShopDef {
  id: string
  position: { x: number; z: number }
  radius: number
  stock: readonly ShopStockItem[]
}

const byItemId = (left: ShopStockItem, right: ShopStockItem): number =>
  left.itemId < right.itemId ? -1 : left.itemId > right.itemId ? 1 : 0

/** First unowned, affordable stock item by itemId order; null if none qualify. */
export function nextPurchase(
  shop: ShopDef,
  balance: number,
  owned: ReadonlySet<string>
): ShopStockItem | null {
  return [...shop.stock]
    .filter((entry) => !owned.has(entry.itemId) && entry.price <= balance)
    .sort(byItemId)[0] ?? null
}

export function inRadius(
  shop: ShopDef,
  player: { x: number; z: number }
): boolean {
  return Math.hypot(
    shop.position.x - player.x,
    shop.position.z - player.z
  ) <= shop.radius
}

/** Half of the economy objective: every shop's stock has been bought. */
export function allStockPurchased(
  shops: readonly ShopDef[],
  purchased: ReadonlySet<string>
): boolean {
  return shops.every((shop) =>
    shop.stock.every((entry) => purchased.has(entry.itemId))
  )
}

/** Compose-time affordability input: the currency needed to clear every shop. */
export function totalStockPrice(shops: readonly ShopDef[]): number {
  return shops.reduce(
    (sum, shop) =>
      sum + shop.stock.reduce((inner, entry) => inner + entry.price, 0),
    0
  )
}
