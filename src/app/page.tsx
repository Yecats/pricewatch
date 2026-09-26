'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Plus, Search, ShoppingCart, Store as StoreIcon, Package, Loader2,
  TrendingDown, Tag, Clock, Flame, ScanLine, Layers, Check,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { SyncStatusIndicator } from '@/components/price-tracker/sync-status-indicator'
import { ThemeToggle } from '@/components/price-tracker/theme-toggle'
import { StoresDialog } from '@/components/price-tracker/stores-dialog'
import { BarcodeScannerDialog } from '@/components/price-tracker/barcode-scanner-dialog'
import { ShoppingListDialog } from '@/components/price-tracker/shopping-list-dialog'
import { GroupDetailDialog } from '@/components/price-tracker/group-detail-dialog'
import { ProductFormDialog } from '@/components/price-tracker/product-form-dialog'
import { GroupFormDialog } from '@/components/price-tracker/group-form-dialog'
import { VariantPickerDialog } from '@/components/price-tracker/variant-picker-dialog'
import type { ProductGroup, Product, Store, ComputedPrice } from '@/components/price-tracker/types'
import type { BarcodeLookupResult } from '@/lib/barcode'
import {
  formatCurrency, formatPricePerUnitSmart, formatSaleCountdown, saleCountdownSeverity,
} from '@/lib/units'
import { initSync, subscribe, getSyncState, type SyncState } from '@/lib/sync'
import { localDb } from '@/lib/local-db'
import {
  useLocalGroups, useLocalProducts, useLocalStores,
  localAddGroup, localDeleteGroup, localAddProduct, localDeleteProduct,
  localAddToShoppingList, localDeleteShoppingListItem,
} from '@/hooks/use-local-data'
import { CategoryCombobox } from '@/components/price-tracker/category-combobox'

export default function Home() {
  const { toast } = useToast()
  const { groups, loading: groupsLoading, reload: reloadGroups } = useLocalGroups()
  const { products, loading: productsLoading, reload: reloadProducts } = useLocalProducts()
  const { stores, reload: reloadStores } = useLocalStores()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'groups' | 'products'>('groups')
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)

  const [groupFormOpen, setGroupFormOpen] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<ProductGroup | null>(null)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [productFormOpen, setProductFormOpen] = useState(false)
  const [storesDialogOpen, setStoresDialogOpen] = useState(false)
  const [globalScannerOpen, setGlobalScannerOpen] = useState(false)
  const [pendingLookup, setPendingLookup] = useState<BarcodeLookupResult | null>(null)
  const [variantPickerOpen, setVariantPickerOpen] = useState(false)
  const [variantMatches, setVariantMatches] = useState<Array<{ id: string; name: string; category?: string | null; priceCount: number; score: number }>>([])
  const [shoppingListOpen, setShoppingListOpen] = useState(false)
  const [shoppingListCount, setShoppingListCount] = useState(0)
  const [onListIds, setOnListIds] = useState<Set<string>>(new Set())
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set())

  const [syncState, setSyncState] = useState<SyncState>(getSyncState())
  const lastSyncCountRef = useRef(syncState.syncCount)

  const loadShoppingListIds = useCallback(async () => {
    try {
      const items = await localDb.shoppingListItems.toArray()
      const ids = new Set<string>()
      let count = 0
      for (const item of items) {
        if (!item.purchased && !item.deletedAt) { ids.add(item.groupId); count++ }
      }
      setOnListIds(ids); setShoppingListCount(count)
    } catch {}
  }, [])

  const handleCountChange = useCallback((count: number) => {
    setShoppingListCount(count); void loadShoppingListIds()
  }, [loadShoppingListIds])

  useEffect(() => {
    initSync()
    const unsub = subscribe((state) => {
      setSyncState(state)
      if (state.status === 'idle' && state.syncCount !== lastSyncCountRef.current) {
        lastSyncCountRef.current = state.syncCount
        void reloadGroups(); void reloadProducts(); void reloadStores(); void loadShoppingListIds()
      }
    })
    return unsub
  }, [reloadGroups, reloadProducts, reloadStores, loadShoppingListIds])

  useEffect(() => {
    let c = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    Promise.all([reloadGroups(), reloadProducts(), reloadStores(), loadShoppingListIds()])
      .then(() => { if (!c) queueMicrotask(() => setLoading(false)) })
    return () => { c = true }
  }, [])

  const categories = useMemo(() => {
    const set = new Set<string>()
    const source = activeTab === 'groups' ? groups : products
    source.forEach((item: any) => { if (item.category) set.add(item.category) })
    return Array.from(set).sort()
  }, [groups, products, activeTab])

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase()
    return groups.filter(g => {
      if (categoryFilter && g.category !== categoryFilter) return false
      if (!q) return true
      return [g.name, g.category, g.notes].filter(Boolean).join(' ').toLowerCase().includes(q)
    })
  }, [groups, query, categoryFilter])

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products.filter(p => {
      if (categoryFilter && p.category !== categoryFilter) return false
      if (!q) return true
      return [p.name, p.brand, p.category, p.barcode].filter(Boolean).join(' ').toLowerCase().includes(q)
    })
  }, [products, query, categoryFilter])

  const stats = useMemo(() => {
    const totalGroups = groups.length
    const totalProducts = products.length
    const totalStores = stores.length
    const totalPrices = groups.reduce((s, g) => s + (g.priceCount ?? 0), 0)
    let bestDeal: { group: ProductGroup; price: ComputedPrice } | null = null
    for (const g of groups) {
      if (g.bestPrice) {
        if (!bestDeal || g.bestPrice.pricePerBaseUnit < bestDeal.price.pricePerBaseUnit) {
          bestDeal = { group: g, price: g.bestPrice }
        }
      }
    }
    const activeSales: Array<{ group: ProductGroup; price: ComputedPrice }> = []
    for (const g of groups) {
      for (const p of g.products ?? []) {
        for (const price of p.prices) {
          if (price.isSale) activeSales.push({ group: g, price })
        }
      }
    }
    activeSales.sort((a, b) => {
      const aT = a.price.saleExpiresAt ? new Date(a.price.saleExpiresAt).getTime() : Infinity
      const bT = b.price.saleExpiresAt ? new Date(b.price.saleExpiresAt).getTime() : Infinity
      return aT - bT
    })
    return { totalGroups, totalProducts, totalStores, totalPrices, bestDeal, activeSales }
  }, [groups, products, stores])

  async function deleteGroup(g: ProductGroup) {
    try {
      await localDeleteGroup(g.id)
      toast({ title: 'Group removed', description: g.name })
      await reloadGroups()
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e instanceof Error ? e.message : 'Failed' })
    }
  }

  async function deleteProduct(p: Product) {
    try {
      await localDeleteProduct(p.id)
      toast({ title: 'Product removed', description: p.name })
      await reloadProducts()
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e instanceof Error ? e.message : 'Failed' })
    }
  }

  async function toggleShoppingList(groupId: string) {
    try {
      if (onListIds.has(groupId)) {
        const items = await localDb.shoppingListItems.where('groupId').equals(groupId).toArray()
        const active = items.find(i => !i.deletedAt && !i.purchased)
        if (active) await localDeleteShoppingListItem(active.id)
        setOnListIds(prev => { const n = new Set(prev); n.delete(groupId); return n })
        setShoppingListCount(c => Math.max(0, c - 1))
        toast({ title: 'Removed from shopping list' })
      } else {
        await localAddToShoppingList(groupId, 1)
        setOnListIds(prev => new Set(prev).add(groupId))
        setShoppingListCount(c => c + 1)
        toast({ title: 'Added to shopping list' })
      }
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e instanceof Error ? e.message : 'Failed' })
    }
  }

  async function handleGlobalScan(result: BarcodeLookupResult) {
    try {
      // Check if a product with this barcode already exists
      const localProducts = await localDb.products.toArray()
      const existing = localProducts.find(p => p.barcode === result.barcode && !p.deletedAt)
      if (existing) {
        toast({ title: 'Existing product found', description: `Opening ${existing.name}` })
        // Find which group(s) it belongs to and open the first one
        const links = await localDb.groupProducts.where('productId').equals(existing.id).toArray()
        if (links.length > 0) {
          const group = groups.find(g => g.id === links[0].groupId)
          if (group) { setSelectedGroup(group); return }
        }
        // Product exists but no group — open product detail
        setEditingProduct(products.find(p => p.id === existing.id) ?? null)
        setProductFormOpen(true)
        return
      }

      // No exact barcode match — search for similar groups by name
      const localGroups = await localDb.productGroups.toArray()
      const activeGroups = localGroups.filter(g => !g.deletedAt)
      const lookupName = result.name.toLowerCase()
      const lookupWords = lookupName.split(/\s+/).filter(w => w.length > 2)
      const matches = activeGroups.map(g => {
        const groupName = g.name.toLowerCase()
        let score = 0
        for (const word of lookupWords) { if (groupName.includes(word)) score++ }
        if (lookupName.includes(groupName) || groupName.includes(lookupName)) score += 3
        return { group: g, score }
      }).filter(m => m.score > 0).sort((a, b) => b.score - a.score).slice(0, 5)

      if (matches.length > 0) {
        const matchData = await Promise.all(matches.map(async m => {
          const links = await localDb.groupProducts.where('groupId').equals(m.group.id).toArray()
          const priceCount = await localDb.priceEntries.where('productId').anyOf(links.map(l => l.productId)).filter(p => !p.deletedAt).count()
          return { id: m.group.id, name: m.group.name, category: m.group.category, priceCount, score: m.score }
        }))
        setPendingLookup(result)
        setVariantMatches(matchData)
        setVariantPickerOpen(true)
        return
      }
    } catch {}
    // No matches — create a new product (will prompt for group in product form)
    setPendingLookup(result)
    setEditingProduct(null)
    setProductFormOpen(true)
  }

  async function handleProductSaved(savedProduct: { id: string; name: string }) {
    await reloadProducts()
    await reloadGroups()
    await loadShoppingListIds()
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2.5 mr-auto">
            <div className="h-9 w-9 rounded-xl bg-primary text-primary-foreground grid place-items-center shadow-sm">
              <TrendingDown className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <h1 className="font-bold text-base sm:text-lg">Pricewatch</h1>
              <p className="text-[10px] text-muted-foreground hidden sm:block">
                {syncState.status === 'offline' ? 'Offline mode' : syncState.status === 'syncing' ? 'Syncing…' : 'Local price comparison'}
              </p>
            </div>
          </div>
          <SyncStatusIndicator />
          <Button variant="outline" size="sm" onClick={() => setShoppingListOpen(true)}>
            <ShoppingCart className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">List</span>
            {shoppingListCount > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px] h-4.5">{shoppingListCount}</Badge>}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setStoresDialogOpen(true)}>
            <StoreIcon className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">Stores</span>
            {stores.length > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px] h-4.5">{stores.length}</Badge>}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setGlobalScannerOpen(true)}>
            <ScanLine className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">Scan</span>
          </Button>
          {activeTab === 'groups' ? (
            <Button size="sm" onClick={() => setGroupFormOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              <span className="hidden sm:inline">Add group</span>
              <span className="sm:hidden">Add</span>
            </Button>
          ) : (
            <Button size="sm" onClick={() => { setEditingProduct(null); setPendingLookup(null); setProductFormOpen(true) }}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              <span className="hidden sm:inline">Add product</span>
              <span className="sm:hidden">Add</span>
            </Button>
          )}
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 py-6 space-y-6">
        {/* Stats */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={<Layers className="h-4 w-4" />} label="Groups" value={stats.totalGroups.toString()} />
          <StatCard icon={<Package className="h-4 w-4" />} label="Products" value={stats.totalProducts.toString()} />
          <StatCard icon={<StoreIcon className="h-4 w-4" />} label="Stores" value={stats.totalStores.toString()} />
          {stats.bestDeal ? (
            <Card className={`p-3 ${stats.bestDeal.price.isSale ? 'border-amber-400/60 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/30' : 'border-primary/30 bg-primary/5'}`}>
              <div className={`flex items-center gap-2 text-[10px] uppercase tracking-wider font-semibold ${stats.bestDeal.price.isSale ? 'text-amber-700 dark:text-amber-300' : 'text-primary'}`}>
                {stats.bestDeal.price.isSale ? <Tag className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {stats.bestDeal.price.isSale ? 'Sale — best deal' : 'Best deal'}
              </div>
              <div className="mt-1 text-lg font-bold leading-tight truncate">
                {formatPricePerUnitSmart(stats.bestDeal.price.pricePerBaseUnit, stats.bestDeal.price.category).text}
              </div>
              <div className="text-[10px] text-muted-foreground truncate">{stats.bestDeal.group.name}</div>
            </Card>
          ) : <StatCard icon={<TrendingDown className="h-4 w-4" />} label="Best deal" value="—" />}
        </section>

        {/* Active sales */}
        {stats.activeSales.length > 0 && (
          <section aria-label="Active sales" className="rounded-xl border border-amber-300/60 dark:border-amber-800/50 bg-amber-50/70 dark:bg-amber-950/20 p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300 mb-2">
              <Flame className="h-3 w-3" /> Active sales ending soon
            </div>
            <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1">
              {stats.activeSales.slice(0, 8).map(({ group, price }) => {
                const sev = saleCountdownSeverity(price.saleExpiresAt)
                const cd = formatSaleCountdown(price.saleExpiresAt) ?? ''
                return (
                  <button key={price.id} type="button" onClick={() => setSelectedGroup(group)}
                    className="group shrink-0 w-56 text-left rounded-lg border bg-card hover:shadow-sm hover:border-amber-400 dark:hover:border-amber-700/60 transition-all p-2.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: price.storeColor }} />
                      <span className="font-medium text-xs truncate">{group.name}</span>
                    </div>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="font-semibold text-sm">{formatCurrency(price.price)}</span>
                      <span className="text-[10px] text-muted-foreground">@ {price.storeName}</span>
                    </div>
                    <div className={`mt-1 inline-flex items-center gap-0.5 text-[10px] font-medium ${sev === 'urgent' ? 'text-red-600 dark:text-red-400' : sev === 'warning' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                      <Clock className="h-2.5 w-2.5" />{cd}
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* Search + filters */}
        <section className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={query} onChange={e => setQuery(e.target.value)} placeholder={activeTab === 'groups' ? 'Search groups...' : 'Search products, brands, barcodes...'} className="pl-9" />
          </div>
          {categories.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-1 sm:pb-0">
              <FilterChip active={categoryFilter === null} onClick={() => setCategoryFilter(null)}>All</FilterChip>
              {categories.map(c => <FilterChip key={c} active={categoryFilter === c} onClick={() => setCategoryFilter(c === categoryFilter ? null : c)}>{c}</FilterChip>)}
            </div>
          )}
        </section>

        {/* Tab content */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'groups' | 'products')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="groups"><Layers className="h-3.5 w-3.5 mr-1.5" />Groups</TabsTrigger>
            <TabsTrigger value="products"><Package className="h-3.5 w-3.5 mr-1.5" />Products</TabsTrigger>
          </TabsList>

          <TabsContent value="groups" className="mt-4">
            {loading || groupsLoading ? (
              <div className="text-center py-20"><Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">Loading groups...</p></div>
            ) : filteredGroups.length === 0 ? (
              <EmptyState hasItems={groups.length > 0} onAdd={() => setGroupFormOpen(true)} type="groups" />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {filteredGroups.map(g => (
                  <GroupCard key={g.id} group={g} onOpen={() => setSelectedGroup(g)}
                    onEdit={() => { /* TODO: group edit */ }}
                    onDelete={() => deleteGroup(g)}
                    onAddToList={toggleShoppingList} isOnList={onListIds.has(g.id)} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="products" className="mt-4">
            {loading || productsLoading ? (
              <div className="text-center py-20"><Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">Loading products...</p></div>
            ) : filteredProducts.length === 0 ? (
              <EmptyState hasItems={products.length > 0} onAdd={() => { setEditingProduct(null); setProductFormOpen(true) }} type="products" />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {filteredProducts.map(p => (
                  <ProductCard key={p.id} product={p} groups={groups}
                    onEdit={() => { setEditingProduct(p); setProductFormOpen(true) }}
                    onDelete={() => deleteProduct(p)} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <footer className="border-t mt-auto">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Pricewatch · Local price tracker</span>
          <span className="hidden sm:inline">
            {syncState.status === 'offline' ? 'Offline — changes saved locally' : syncState.pendingCount > 0 ? `${syncState.pendingCount} change${syncState.pendingCount === 1 ? '' : 's'} pending sync` : 'All changes synced'}
          </span>
        </div>
      </footer>

      {/* Dialogs */}
      <GroupFormDialog open={groupFormOpen} onOpenChange={setGroupFormOpen} products={products} onSaved={() => reloadGroups()} />
      <GroupDetailDialog open={!!selectedGroup} onOpenChange={(v) => { if (!v) setSelectedGroup(null) }}
        group={selectedGroup} stores={stores} onPricesChanged={() => { void reloadGroups(); void reloadProducts() }}
        onAddToList={toggleShoppingList} isOnList={selectedGroup ? onListIds.has(selectedGroup.id) : false} />
      <ProductFormDialog open={productFormOpen} onOpenChange={setProductFormOpen} initial={editingProduct}
        initialLookup={pendingLookup} onLookupConsumed={() => setPendingLookup(null)} onSaved={handleProductSaved}
        onOpenScanner={() => { setProductFormOpen(false); setGlobalScannerOpen(true) }}
        existingCategories={Array.from(new Set(products.map(p => p.category).filter(Boolean) as string[])).sort()}
        groups={groups} />
      <StoresDialog open={storesDialogOpen} onOpenChange={setStoresDialogOpen} stores={stores} onChange={() => reloadStores()} />
      <BarcodeScannerDialog open={globalScannerOpen} onOpenChange={setGlobalScannerOpen}
        onDetected={(result) => void handleGlobalScan(result)}
        onProductSelected={(productId) => {
          // Find the product and open its group
          void (async () => {
            const links = await localDb.groupProducts.where('productId').equals(productId).toArray()
            if (links.length > 0) {
              const g = groups.find(g => g.id === links[0].groupId)
              if (g) { setSelectedGroup(g); return }
            }
            const p = products.find(p => p.id === productId)
            if (p) { setEditingProduct(p); setProductFormOpen(true) }
          })()
        }}
        title="Scan product barcode" description="Point your camera at any product barcode, search by name, or pick from your products." />
      <VariantPickerDialog open={variantPickerOpen} onOpenChange={setVariantPickerOpen} lookup={pendingLookup} matches={variantMatches}
        onPickExisting={(groupId) => {
          setVariantPickerOpen(false)
          // Create the product in the selected group
          if (pendingLookup) {
            void (async () => {
              await localAddProduct({
                name: pendingLookup.name, brand: pendingLookup.brand, barcode: pendingLookup.barcode,
                imageUrl: pendingLookup.imageUrl, category: pendingLookup.category, groupId,
              })
              await reloadGroups(); await reloadProducts()
              const g = groups.find(g => g.id === groupId)
              if (g) setSelectedGroup(g)
              setPendingLookup(null)
            })()
          }
        }}
        onCreateNew={() => { setVariantPickerOpen(false); setEditingProduct(null); setProductFormOpen(true) }} />
      <ShoppingListDialog open={shoppingListOpen} onOpenChange={setShoppingListOpen} onCountChange={handleCountChange} />
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <Card className="p-3"><div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{icon}{label}</div><div className="mt-1 text-lg font-bold leading-tight">{value}</div></Card>
}
function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}>{children}</button>
}
function EmptyState({ hasItems, onAdd, type }: { hasItems: boolean; onAdd: () => void; type: 'groups' | 'products' }) {
  return <div className="text-center py-16 px-6"><div className="mx-auto h-14 w-14 rounded-full bg-muted grid place-items-center"><Package className="h-7 w-7 text-muted-foreground" /></div><h3 className="mt-4 font-semibold">{hasItems ? 'No matches' : `No ${type} yet`}</h3><p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">{hasItems ? 'Try a different search.' : `Add your first ${type.slice(0, -1)} to start tracking prices.`}</p>{!hasItems && <Button className="mt-4" onClick={onAdd}><Plus className="mr-1 h-4 w-4" /> Add {type.slice(0, -1)}</Button>}</div>
}

// === Group Card ===
function GroupCard({ group, onOpen, onEdit, onDelete, onAddToList, isOnList }: {
  group: ProductGroup; onOpen: () => void; onEdit: () => void; onDelete: () => void;
  onAddToList?: (groupId: string) => Promise<void> | void; isOnList?: boolean;
}) {
  const best = group.bestPrice
  const bestIsSale = best?.isSale === true
  return (
    <Card className="group relative overflow-hidden p-4 cursor-pointer hover:shadow-md hover:border-primary/40 transition-all" onClick={onOpen}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-tight truncate">{group.name}</h3>
          {group.category && <p className="text-xs text-muted-foreground mt-0.5 truncate">{group.category}</p>}
        </div>
        <div className="flex opacity-0 group-hover:opacity-100 transition-opacity gap-0.5 -mr-1 -mt-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onDelete() }} aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
      {group.priceCount === 0 ? (
        <div className="mt-4 text-xs text-muted-foreground italic">No prices tracked yet</div>
      ) : (
        <>
          {best && (
            <div className={`mt-3 rounded-lg border px-3 py-2 ${bestIsSale ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-300/60 dark:border-amber-700/60' : 'bg-primary/8 dark:bg-primary/10 border-primary/30'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider ${bestIsSale ? 'text-amber-700 dark:text-amber-300' : 'text-primary'}`}>
                  {bestIsSale ? <Tag className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {bestIsSale ? 'Sale — best value' : 'Best value'}
                </span>
                <span className={`font-semibold text-sm ${bestIsSale ? 'text-amber-700 dark:text-amber-300' : 'text-primary'}`}>
                  {formatPricePerUnitSmart(best.pricePerBaseUnit, best.category).text}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs flex-wrap">
                <span className="font-medium">{best.storeName}</span>
                <span className="text-muted-foreground">· {formatCurrency(best.price)}</span>
              </div>
            </div>
          )}
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Package className="h-3 w-3" />{group.productCount} product{group.productCount === 1 ? '' : 's'}</span>
            <span className="inline-flex items-center gap-1"><StoreIcon className="h-3 w-3" />{group.storeCount} store{group.storeCount === 1 ? '' : 's'}</span>
          </div>
        </>
      )}
      {onAddToList && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onAddToList(group.id) }}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 rounded-full grid place-items-center hover:bg-accent"
          aria-label={isOnList ? 'Remove from shopping list' : 'Add to shopping list'}
          title={isOnList ? 'Remove from shopping list' : 'Add to shopping list'}>
          <div className="relative inline-flex">
            <ShoppingCart className={`h-3.5 w-3.5 ${isOnList ? 'text-primary' : 'text-muted-foreground'}`} />
            {isOnList && <span className="absolute -top-1.5 -right-1.5 h-3 w-3 rounded-full bg-primary flex items-center justify-center ring-1 ring-background"><Check className="h-2 w-2 text-primary-foreground" strokeWidth={4} /></span>}
          </div>
        </button>
      )}
    </Card>
  )
}

// === Product Card (Products tab) ===
function ProductCard({ product, groups, onEdit, onDelete }: {
  product: Product; groups: ProductGroup[]; onEdit: () => void; onDelete: () => void;
}) {
  const best = product.bestPrice
  const bestIsSale = best?.isSale === true
  const productGroups = (product.groupIds ?? []).map(gid => groups.find(g => g.id === gid)).filter(Boolean) as ProductGroup[]
  return (
    <Card className="group relative overflow-hidden p-4 cursor-pointer hover:shadow-md hover:border-primary/40 transition-all" onClick={onEdit}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-tight truncate">{product.name}</h3>
          {product.brand && <p className="text-xs text-muted-foreground mt-0.5 truncate">{product.brand}</p>}
        </div>
        <div className="flex opacity-0 group-hover:opacity-100 transition-opacity gap-0.5 -mr-1 -mt-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onEdit() }} aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); onDelete() }} aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
      {product.priceCount === 0 ? (
        <div className="mt-4 text-xs text-muted-foreground italic">No prices tracked yet</div>
      ) : best ? (
        <div className={`mt-3 rounded-lg border px-3 py-2 ${bestIsSale ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-300/60 dark:border-amber-700/60' : 'bg-primary/8 dark:bg-primary/10 border-primary/30'}`}>
          <div className="flex items-center justify-between gap-2">
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider ${bestIsSale ? 'text-amber-700 dark:text-amber-300' : 'text-primary'}`}>
              {bestIsSale ? <Tag className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {bestIsSale ? 'Sale — best value' : 'Best value'}
            </span>
            <span className={`font-semibold text-sm ${bestIsSale ? 'text-amber-700 dark:text-amber-300' : 'text-primary'}`}>
              {formatPricePerUnitSmart(best.pricePerBaseUnit, best.category).text}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs flex-wrap">
            <span className="font-medium">{best.storeName}</span>
            <span className="text-muted-foreground">· {formatCurrency(best.price)}</span>
          </div>
        </div>
      ) : null}
      {productGroups.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {productGroups.map(g => <span key={g.id} className="inline-flex items-center gap-1 text-[10px] rounded-full bg-muted px-1.5 py-0.5"><Layers className="h-2 w-2" />{g.name}</span>)}
        </div>
      )}
    </Card>
  )
}

// Need these imports
import { Pencil, Trash2 } from 'lucide-react'
