'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Plus,
  Search,
  ShoppingCart,
  Store as StoreIcon,
  Package,
  Loader2,
  TrendingDown,
  Pencil,
  Trash2,
  PackageSearch,
  Tag,
  Clock,
  Flame,
  ScanLine,
  Download,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { ProductFormDialog } from '@/components/price-tracker/product-form-dialog'
import { StoresDialog } from '@/components/price-tracker/stores-dialog'
import { ProductCard } from '@/components/price-tracker/product-card'
import { ProductDetailDialog } from '@/components/price-tracker/product-detail-dialog'
import { ThemeToggle } from '@/components/price-tracker/theme-toggle'
import { BarcodeScannerDialog } from '@/components/price-tracker/barcode-scanner-dialog'
import { ShoppingListDialog } from '@/components/price-tracker/shopping-list-dialog'
import { SyncStatusIndicator } from '@/components/price-tracker/sync-status-indicator'
import type { ComputedPrice, Product } from '@/components/price-tracker/types'
import type { BarcodeLookupResult } from '@/lib/barcode'
import {
  formatCurrency,
  formatPricePerUnitSmart,
  formatSaleCountdown,
  saleCountdownSeverity,
} from '@/lib/units'
import { initSync, subscribe, getSyncState, type SyncState } from '@/lib/sync'
import { localDb } from '@/lib/local-db'
import {
  useLocalProducts,
  useLocalStores,
  localAddProduct,
  localDeleteProduct,
  localAddToShoppingList,
} from '@/hooks/use-local-data'

export default function Home() {
  const { toast } = useToast()
  const { products, loading: productsLoading, reload: reloadProducts } = useLocalProducts()
  const { stores, reload: reloadStores } = useLocalStores()
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)

  const [productFormOpen, setProductFormOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [storesDialogOpen, setStoresDialogOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [globalScannerOpen, setGlobalScannerOpen] = useState(false)
  const [pendingLookup, setPendingLookup] = useState<BarcodeLookupResult | null>(null)
  const [shoppingListOpen, setShoppingListOpen] = useState(false)
  const [shoppingListCount, setShoppingListCount] = useState(0)
  const [onListIds, setOnListIds] = useState<Set<string>>(new Set())

  // Read shopping list items from local IndexedDB — used to show count badge
  // and which products are already on the list.
  const loadShoppingListIds = useCallback(async () => {
    try {
      const items = await localDb.shoppingListItems.toArray()
      const ids = new Set<string>()
      let count = 0
      for (const item of items) {
        if (!item.purchased && !item.deletedAt) {
          ids.add(item.productId)
          count++
        }
      }
      setOnListIds(ids)
      setShoppingListCount(count)
    } catch {
      // ignore — local DB might not be initialized yet
    }
  }, [])

  // === Sync initialization + listener ===
  // Trigger initial sync on app open, and re-read local data whenever sync completes
  const [syncState, setSyncState] = useState<SyncState>(getSyncState())

  useEffect(() => {
    initSync()
    const unsub = subscribe((state) => {
      setSyncState(state)
      // When sync completes (idle), reload local data to reflect any server changes
      if (state.status === 'idle') {
        void reloadProducts()
        void reloadStores()
        void loadShoppingListIds()
      }
    })
    return unsub
  }, [reloadProducts, reloadStores, loadShoppingListIds])

  // Re-load local data on mount — runs once on mount, not on dependency changes
  useEffect(() => {
    let cancelled = false
    Promise.all([
      reloadProducts(),
      reloadStores(),
      // Inline the shopping list count read so we don't trigger the
      // set-state-in-effect lint rule via loadShoppingListIds.
      localDb.shoppingListItems.toArray().then((items) => {
        if (cancelled) return
        const ids = new Set<string>()
        let count = 0
        for (const item of items) {
          if (!item.purchased && !item.deletedAt) {
            ids.add(item.productId)
            count++
          }
        }
        queueMicrotask(() => {
          if (cancelled) return
          setOnListIds(ids)
          setShoppingListCount(count)
          setLoading(false)
        })
      }),
    ]).catch(() => {
      queueMicrotask(() => {
        if (!cancelled) setLoading(false)
      })
    })
    return () => {
      cancelled = true
    }
    // reloadProducts/reloadStores are stable useCallbacks; we intentionally run
    // this effect only once on mount to avoid re-fetching on every sync cycle.
    // The sync listener above handles post-sync refreshes.
  }, [])

  const handleCountChange = useCallback(
    (count: number) => {
      setShoppingListCount(count)
      void loadShoppingListIds()
    },
    [loadShoppingListIds]
  )

  const categories = useMemo(() => {
    const set = new Set<string>()
    products.forEach((p) => {
      if (p.category) set.add(p.category)
    })
    return Array.from(set).sort()
  }, [products])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products.filter((p) => {
      if (categoryFilter && p.category !== categoryFilter) return false
      if (!q) return true
      const haystack = [p.name, p.brand, p.category, p.notes]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [products, query, categoryFilter])

  // Aggregate stats
  const stats = useMemo(() => {
    const totalProducts = products.length
    const totalStores = stores.length
    const totalPrices = products.reduce((sum, p) => sum + p.priceCount, 0)

    let bestDeal: {
      product: Product
      pricePerBaseUnit: number
      category: 'weight' | 'volume' | 'count'
      storeName: string
      storeColor: string
      price: number
      quantity: number
      isSale: boolean
      saleExpiresAt?: string | null
    } | null = null

    for (const p of products) {
      if (!p.bestPerCategory) continue
      for (const b of Object.values(p.bestPerCategory)) {
        if (!b) continue
        if (!bestDeal || b.pricePerBaseUnit < bestDeal.pricePerBaseUnit) {
          bestDeal = {
            product: p,
            pricePerBaseUnit: b.pricePerBaseUnit,
            category: b.category,
            storeName: b.storeName,
            storeColor: b.storeColor,
            price: b.price,
            quantity: b.quantity,
            isSale: b.isSale,
            saleExpiresAt: b.saleExpiresAt,
          }
        }
      }
    }

    const activeSales: Array<{ product: Product; price: ComputedPrice }> = []
    for (const p of products) {
      for (const pr of p.prices) {
        if (pr.isSale) {
          activeSales.push({ product: p, price: pr })
        }
      }
    }
    activeSales.sort((a, b) => {
      const aT = a.price.saleExpiresAt ? new Date(a.price.saleExpiresAt).getTime() : Infinity
      const bT = b.price.saleExpiresAt ? new Date(b.price.saleExpiresAt).getTime() : Infinity
      return aT - bT
    })

    return { totalProducts, totalStores, totalPrices, bestDeal, activeSales }
  }, [products, stores])

  async function deleteProduct(p: Product) {
    if (!confirm(`Delete "${p.name}"? This removes all its price entries.`)) return
    try {
      await localDeleteProduct(p.id)
      toast({ title: 'Product removed', description: p.name })
      await reloadProducts()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong'
      toast({ variant: 'destructive', title: 'Error', description: msg })
    }
  }

  function openProduct(p: Product) {
    setSelectedProduct(p)
  }

  async function addToShoppingList(productId: string) {
    try {
      await localAddToShoppingList(productId, 1)
      setOnListIds((prev) => new Set(prev).add(productId))
      setShoppingListCount((c) => c + 1)
      toast({
        title: 'Added to shopping list',
        description: syncState.status === 'offline'
          ? 'Saved locally — will sync when online'
          : 'Find the best store in the shopping list view',
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong'
      toast({ variant: 'destructive', title: 'Error', description: msg })
    }
  }

  async function handleGlobalScan(result: BarcodeLookupResult) {
    try {
      // Check local DB first (instant)
      const localProducts = await localDb.products.toArray()
      const existing = localProducts.find(
        (p) => p.barcode === result.barcode && !p.deletedAt
      )
      if (existing) {
        toast({
          title: 'Existing product found',
          description: `Opening ${existing.name} — add a new price entry for this variant.`,
        })
        await reloadProducts()
        const full = products.find((p) => p.id === existing.id)
        if (full) setSelectedProduct(full)
        return
      }
    } catch {
      // ignore — fall through to new-product flow
    }
    setEditingProduct(null)
    setPendingLookup(result)
    setProductFormOpen(true)
  }

  // Handle product form save (writes to local DB, triggers sync)
  async function handleProductSaved(savedProduct: { id: string; name: string }) {
    await reloadProducts()
    // Update the shopping list IDs in case the product was added to the list
    await loadShoppingListIds()
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2.5 mr-auto">
            <div className="h-9 w-9 rounded-xl bg-primary text-primary-foreground grid place-items-center shadow-sm">
              <TrendingDown className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <h1 className="font-bold text-base sm:text-lg">Pricewatch</h1>
              <p className="text-[10px] text-muted-foreground hidden sm:block">
                {syncState.status === 'offline'
                  ? 'Offline mode — changes saved locally'
                  : syncState.status === 'syncing'
                  ? 'Syncing…'
                  : 'Local price comparison'}
              </p>
            </div>
          </div>

          <SyncStatusIndicator />

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShoppingListOpen(true)}
          >
            <ShoppingCart className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">List</span>
            {shoppingListCount > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-[10px] h-4.5">
                {shoppingListCount}
              </Badge>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setStoresDialogOpen(true)}
          >
            <StoreIcon className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">Stores</span>
            {stores.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-[10px] h-4.5">
                {stores.length}
              </Badge>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setGlobalScannerOpen(true)}
          >
            <ScanLine className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">Scan</span>
          </Button>

          <Button
            size="sm"
            onClick={() => {
              setEditingProduct(null)
              setPendingLookup(null)
              setProductFormOpen(true)
            }}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            <span className="hidden sm:inline">Add product</span>
            <span className="sm:hidden">Add</span>
          </Button>

          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 py-6 space-y-6">
        {/* Stats overview */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            icon={<Package className="h-4 w-4" />}
            label="Products"
            value={stats.totalProducts.toString()}
          />
          <StatCard
            icon={<StoreIcon className="h-4 w-4" />}
            label="Stores"
            value={stats.totalStores.toString()}
          />
          <StatCard
            icon={<ShoppingCart className="h-4 w-4" />}
            label="Prices tracked"
            value={stats.totalPrices.toString()}
          />
          {stats.bestDeal ? (
            <Card
              className={`p-3 ${
                stats.bestDeal.isSale
                  ? 'border-amber-400/60 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/30'
                  : 'border-primary/30 bg-primary/5'
              }`}
            >
              <div
                className={`flex items-center gap-2 text-[10px] uppercase tracking-wider font-semibold ${
                  stats.bestDeal.isSale
                    ? 'text-amber-700 dark:text-amber-300'
                    : 'text-primary'
                }`}
              >
                {stats.bestDeal.isSale ? (
                  <Tag className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {stats.bestDeal.isSale ? 'Sale — best deal' : 'Best deal'}
              </div>
              <div className="mt-1 text-lg font-bold leading-tight truncate">
                {formatPricePerUnitSmart(stats.bestDeal.pricePerBaseUnit, stats.bestDeal.category).text}
              </div>
              <div className="text-[10px] text-muted-foreground truncate">
                {stats.bestDeal.product.name} @ {stats.bestDeal.storeName}
              </div>
              {stats.bestDeal.isSale && stats.bestDeal.saleExpiresAt && (
                <div
                  className={`mt-1 inline-flex items-center gap-0.5 text-[10px] font-medium ${
                    saleCountdownSeverity(stats.bestDeal.saleExpiresAt) === 'urgent'
                      ? 'text-red-600 dark:text-red-400'
                      : saleCountdownSeverity(stats.bestDeal.saleExpiresAt) === 'warning'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-muted-foreground'
                  }`}
                >
                  <Clock className="h-2.5 w-2.5" />
                  {formatSaleCountdown(stats.bestDeal.saleExpiresAt)}
                </div>
              )}
            </Card>
          ) : (
            <StatCard
              icon={<TrendingDown className="h-4 w-4" />}
              label="Best deal"
              value="—"
            />
          )}
        </section>

        {/* Active sales strip */}
        {stats.activeSales.length > 0 && (
          <section
            aria-label="Active sales"
            className="rounded-xl border border-amber-300/60 dark:border-amber-800/50 bg-amber-50/70 dark:bg-amber-950/20 p-3"
          >
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300 mb-2">
              <Flame className="h-3 w-3" />
              Active sales ending soon
            </div>
            <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1">
              {stats.activeSales.slice(0, 8).map(({ product, price }) => {
                const severity = saleCountdownSeverity(price.saleExpiresAt)
                const countdown = formatSaleCountdown(price.saleExpiresAt) ?? ''
                return (
                  <button
                    key={price.id}
                    type="button"
                    onClick={() => openProduct(product)}
                    className="group shrink-0 w-56 text-left rounded-lg border bg-card hover:shadow-sm hover:border-amber-400 dark:hover:border-amber-700/60 transition-all p-2.5"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="inline-block h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: price.storeColor }}
                      />
                      <span className="font-medium text-xs truncate">{product.name}</span>
                    </div>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="font-semibold text-sm">{formatCurrency(price.price)}</span>
                      <span className="text-[10px] text-muted-foreground">
                        @ {price.storeName}
                      </span>
                    </div>
                    <div
                      className={`mt-1 inline-flex items-center gap-0.5 text-[10px] font-medium ${
                        severity === 'urgent'
                          ? 'text-red-600 dark:text-red-400'
                          : severity === 'warning'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-muted-foreground'
                      }`}
                    >
                      <Clock className="h-2.5 w-2.5" />
                      {countdown}
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* Search & filters */}
        <section className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products, brands, categories..."
              className="pl-9"
            />
          </div>
          {categories.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-1 sm:pb-0">
              <FilterChip
                active={categoryFilter === null}
                onClick={() => setCategoryFilter(null)}
              >
                All
              </FilterChip>
              {categories.map((c) => (
                <FilterChip
                  key={c}
                  active={categoryFilter === c}
                  onClick={() => setCategoryFilter(c === categoryFilter ? null : c)}
                >
                  {c}
                </FilterChip>
              ))}
            </div>
          )}
        </section>

        {/* Product grid */}
        {loading || productsLoading ? (
          <div className="text-center py-20">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">Loading products…</p>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            hasProducts={products.length > 0}
            onAdd={() => {
              setEditingProduct(null)
              setProductFormOpen(true)
            }}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {filtered.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                onOpen={() => openProduct(p)}
                onEdit={() => {
                  setEditingProduct(p)
                  setProductFormOpen(true)
                }}
                onDelete={() => deleteProduct(p)}
                onAddToList={addToShoppingList}
                isOnList={onListIds.has(p.id)}
              />
            ))}
          </div>
        )}
      </main>

      <footer className="border-t mt-auto">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Pricewatch · Local price tracker</span>
          <div className="flex items-center gap-3">
            <a
              href="/pricewatch.zip"
              download
              className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
              title="Download the project source code as a ZIP"
            >
              <Download className="h-3 w-3" />
              <span className="hidden sm:inline">Source code</span>
              <span className="sm:hidden">Code</span>
            </a>
            <span className="hidden sm:inline">
              {syncState.status === 'offline'
                ? 'Offline — changes saved locally and will sync when you reconnect'
                : syncState.pendingCount > 0
                ? `${syncState.pendingCount} change${syncState.pendingCount === 1 ? '' : 's'} pending sync`
                : 'All changes synced'}
            </span>
          </div>
        </div>
      </footer>

      <ProductFormDialog
        open={productFormOpen}
        onOpenChange={setProductFormOpen}
        initial={editingProduct}
        initialLookup={pendingLookup}
        onLookupConsumed={() => setPendingLookup(null)}
        onSaved={handleProductSaved}
      />
      <StoresDialog
        open={storesDialogOpen}
        onOpenChange={setStoresDialogOpen}
        stores={stores}
        onChange={() => reloadStores()}
      />
      <ProductDetailDialog
        open={!!selectedProduct}
        onOpenChange={(v) => {
          if (!v) setSelectedProduct(null)
        }}
        product={selectedProduct}
        stores={stores}
        onPricesChanged={reloadProducts}
        onAddToList={async (id) => {
          await addToShoppingList(id)
          await loadShoppingListIds()
        }}
        isOnList={selectedProduct ? onListIds.has(selectedProduct.id) : false}
      />
      <BarcodeScannerDialog
        open={globalScannerOpen}
        onOpenChange={setGlobalScannerOpen}
        onDetected={(result) => void handleGlobalScan(result)}
        title="Scan product barcode"
        description="Point your camera at any product barcode. We'll look it up on OpenFoodFacts and either open the existing product (to add a variant price) or pre-fill a new product form."
      />
      <ShoppingListDialog
        open={shoppingListOpen}
        onOpenChange={setShoppingListOpen}
        onCountChange={handleCountChange}
      />
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-bold leading-tight">{value}</div>
    </Card>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
      }`}
    >
      {children}
    </button>
  )
}

function EmptyState({ hasProducts, onAdd }: { hasProducts: boolean; onAdd: () => void }) {
  return (
    <div className="text-center py-16 px-6">
      <div className="mx-auto h-14 w-14 rounded-full bg-muted grid place-items-center">
        {hasProducts ? (
          <PackageSearch className="h-7 w-7 text-muted-foreground" />
        ) : (
          <Package className="h-7 w-7 text-muted-foreground" />
        )}
      </div>
      <h3 className="mt-4 font-semibold">
        {hasProducts ? 'No matches' : 'No products yet'}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
        {hasProducts
          ? 'Try a different search term or clear the category filter.'
          : 'Add a product like "Mac & Cheese", then add its prices across stores — the app normalizes ounces, pounds, milliliters, counts and highlights the best value.'}
      </p>
      {!hasProducts && (
        <Button className="mt-4" onClick={onAdd}>
          <Plus className="mr-1 h-4 w-4" /> Add your first product
        </Button>
      )}
    </div>
  )
}
