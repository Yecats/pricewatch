'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Info, Tag, CalendarClock, ScanLine, Globe } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useToast } from '@/hooks/use-toast'
import {
  UNITS_BY_CATEGORY,
  UNIT_LABELS,
  computePrice,
  formatCurrency,
  formatPricePerUnitSmart,
  formatSaleCountdown,
  BASE_UNIT_LABEL,
} from '@/lib/units'
import type { ComputedPrice, Product, Store } from './types'
import { BarcodeScannerDialog } from './barcode-scanner-dialog'
import type { BarcodeLookupResult } from '@/lib/barcode'

const schema = z.object({
  storeId: z.string().min(1, 'Pick a store'),
  price: z.coerce.number().min(0, 'Price must be ≥ 0'),
  quantity: z.coerce.number().min(0.0001, 'Quantity must be > 0'),
  sizeValue: z.coerce.number().min(0.0001, 'Size value must be > 0'),
  sizeUnit: z.string().min(1, 'Pick a unit'),
  notes: z.string().max(300).optional().or(z.literal('')),
  dateChecked: z.string().optional().or(z.literal('')),
  isSale: z.boolean().default(false),
  saleExpiresAt: z.string().optional().or(z.literal('')),
  isOnline: z.boolean().default(false),
  // Optional — variant barcode (different size / packaging of the same product)
  barcode: z.string().max(40).optional().or(z.literal('')),
})

type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  product: Product
  stores: Store[]
  initial?: ComputedPrice | null
  /** When set, pre-fills the form with these values but creates a NEW price entry
   *  (not editing). Used for the "fork/copy as new" feature. */
  forkFrom?: ComputedPrice | null
  onSaved: () => void
}

/** Returns YYYY-MM-DD for "tomorrow" in local time. */
function tomorrowDateInput(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

function LabelWithHint({
  children,
  hint,
}: {
  children: React.ReactNode
  hint: string
}) {
  return (
    <FormLabel className="flex items-center gap-1">
      {children}
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="More info"
              tabIndex={-1}
            >
              <Info className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs max-w-[200px]">
            {hint}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </FormLabel>
  )
}

export function PriceFormDialog({
  open,
  onOpenChange,
  product,
  stores,
  initial,
  forkFrom,
  onSaved,
}: Props) {
  const { toast } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const isEdit = !!initial
  // Use forkFrom for pre-filling if no initial (edit) is set
  const prefillSource = initial ?? forkFrom

  const today = new Date().toISOString().slice(0, 10)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      storeId: '',
      price: 0,
      quantity: 1,
      sizeValue: 1,
      sizeUnit: 'count',
      notes: '',
      dateChecked: today,
      isSale: false,
      saleExpiresAt: tomorrowDateInput(),
      isOnline: false,
      barcode: '',
    },
  })

  const watched = form.watch()
  const isSale = watched.isSale
  const watchedBarcode = watched.barcode

  useEffect(() => {
    if (open) {
      form.reset({
        storeId: prefillSource?.storeId ?? '',
        price: prefillSource?.price ?? 0,
        quantity: prefillSource?.quantity ?? 1,
        sizeValue: prefillSource?.sizeValue ?? 1,
        sizeUnit: prefillSource?.sizeUnit ?? 'count',
        notes: prefillSource?.notes ?? '',
        dateChecked: prefillSource?.dateChecked
          ? new Date(prefillSource.dateChecked).toISOString().slice(0, 10)
          : today,
        isSale: prefillSource?.isSale ?? false,
        saleExpiresAt: prefillSource?.saleExpiresAt
          ? new Date(prefillSource.saleExpiresAt).toISOString().slice(0, 10)
          : tomorrowDateInput(),
        isOnline: prefillSource?.isOnline ?? false,
        barcode: '',
      })
    }
  }, [open, prefillSource, form, today])

  function handleBarcodeLookup(result: BarcodeLookupResult) {
    const updates: Partial<FormValues> = {
      barcode: result.barcode,
    }
    if (result.sizeValue != null && result.sizeValue > 0) {
      updates.sizeValue = result.sizeValue
    }
    if (result.sizeUnit) {
      updates.sizeUnit = result.sizeUnit
    }
    // If the lookup reveals this is a different size variant, mention it in notes
    if (result.name && result.name !== product.name) {
      const cur = form.getValues('notes')
      const noteLine = `Variant: ${result.name}`
      updates.notes = cur ? `${cur}\n${noteLine}` : noteLine
    }
    const current = form.getValues()
    form.reset({ ...current, ...updates })
    toast({
      title: 'Pre-filled from barcode',
      description: result.sizeValue
        ? `Set size to ${result.sizeValue} ${UNIT_LABELS[result.sizeUnit ?? ''] ?? ''}`
        : `Barcode ${result.barcode} captured`,
    })
  }

  const preview = computePrice({
    price: Number(watched.price) || 0,
    quantity: Number(watched.quantity) || 0,
    sizeValue: Number(watched.sizeValue) || 0,
    sizeUnit: watched.sizeUnit || 'count',
  })

  async function onSubmit(values: FormValues) {
    setSubmitting(true)
    try {
      const { localAddPrice, localUpdatePrice } = await import('@/hooks/use-local-data')
      const saleExpiresAt = !values.isSale
        ? null
        : values.saleExpiresAt
        ? new Date(values.saleExpiresAt).toISOString()
        : new Date(new Date().setDate(new Date().getDate() + 1)).toISOString()

      if (isEdit && initial) {
        await localUpdatePrice(initial.id, {
          storeId: values.storeId,
          price: values.price,
          quantity: values.quantity,
          sizeValue: values.sizeValue,
          sizeUnit: values.sizeUnit,
          notes: values.notes || null,
          isSale: values.isSale,
          saleExpiresAt,
          isOnline: values.isOnline,
          barcode: values.barcode?.trim() || null,
          dateChecked: values.dateChecked || new Date().toISOString(),
        })
      } else {
        await localAddPrice(product.id, {
          storeId: values.storeId,
          price: values.price,
          quantity: values.quantity,
          sizeValue: values.sizeValue,
          sizeUnit: values.sizeUnit,
          notes: values.notes || null,
          isSale: values.isSale,
          saleExpiresAt,
          isOnline: values.isOnline,
          barcode: values.barcode?.trim() || null,
          dateChecked: values.dateChecked || new Date().toISOString(),
        })
      }
      toast({
        title: isEdit ? 'Price updated' : 'Price added',
        description: `${product.name} at ${stores.find((s) => s.id === values.storeId)?.name ?? ''}`,
      })
      onSaved()
      onOpenChange(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Something went wrong'
      toast({ variant: 'destructive', title: 'Error', description: msg })
    } finally {
      setSubmitting(false)
    }
  }

  const saleCountdownText = isSale && watched.saleExpiresAt
    ? formatSaleCountdown(watched.saleExpiresAt)
    : null

  return (
    <>
    <BarcodeScannerDialog
      open={scannerOpen}
      onOpenChange={setScannerOpen}
      onDetected={handleBarcodeLookup}
      title="Scan variant barcode"
      description={`This is a different size / packaging of "${product.name}". Scan the barcode to look it up and pre-fill the size info.`}
    />
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <span>{isEdit ? 'Edit price' : forkFrom ? 'Copy price' : 'Add price entry'}</span>
            {!isEdit && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setScannerOpen(true)}
              >
                <ScanLine className="h-3.5 w-3.5 mr-1.5" />
                {watchedBarcode ? 'Re-scan' : 'Scan barcode'}
              </Button>
            )}
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{product.name}</span>
            {product.brand ? ` · ${product.brand}` : ''}
            {' — '}enter the pack details and price you paid.
          </DialogDescription>
        </DialogHeader>

        {/* Barcode captured banner */}
        {watchedBarcode && (
          <div className="rounded-lg border bg-primary/5 p-2.5 flex items-center gap-2">
            <ScanLine className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-primary">
                Variant barcode captured
              </div>
              <div className="text-xs font-mono truncate">{watchedBarcode}</div>
            </div>
            <button
              type="button"
              onClick={() => form.setValue('barcode', '')}
              className="text-[10px] text-muted-foreground hover:text-foreground shrink-0"
            >
              Clear
            </button>
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="storeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Store *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Pick a store" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {stores.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          <span className="inline-flex items-center gap-2">
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: s.color }}
                            />
                            {s.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* All four numeric/date fields aligned on one row, no per-field helper text */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <LabelWithHint hint="Total price paid for the entire pack.">
                      Total price *
                    </LabelWithHint>
                    <FormControl>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">$</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          inputMode="decimal"
                          className="pl-6"
                          aria-label="Total price"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <LabelWithHint hint="Number of items in the pack — e.g. 18 for an 18-count bulk box, 1 for a single box.">
                      Pack count *
                    </LabelWithHint>
                    <FormControl>
                      <Input
                        type="number"
                        step="1"
                        min="1"
                        inputMode="numeric"
                        aria-label="Pack count"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sizeValue"
                render={({ field }) => (
                  <FormItem>
                    <LabelWithHint hint="Size of one item in the pack — e.g. 7.5 for 7.5 oz each.">
                      Each item size *
                    </LabelWithHint>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        inputMode="decimal"
                        aria-label="Each item size"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sizeUnit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                            Count
                          </SelectLabel>
                          {UNITS_BY_CATEGORY.count.map((u) => (
                            <SelectItem key={u} value={u}>
                              {UNIT_LABELS[u]}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                        <SelectGroup>
                          <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                            Weight
                          </SelectLabel>
                          {UNITS_BY_CATEGORY.weight.map((u) => (
                            <SelectItem key={u} value={u}>
                              {UNIT_LABELS[u]}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                        <SelectGroup>
                          <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                            Volume
                          </SelectLabel>
                          {UNITS_BY_CATEGORY.volume.map((u) => (
                            <SelectItem key={u} value={u}>
                              {UNIT_LABELS[u]}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Tags row — Deal and Online as clean clickable chips */}
            <div>
              <FormLabel className="block mb-1.5">Tags</FormLabel>
              <div className="flex gap-2 flex-wrap">
                <FormField
                  control={form.control}
                  name="isSale"
                  render={({ field }) => (
                    <FormItem className="space-y-0">
                      <FormControl>
                        <button
                          type="button"
                          onClick={() => field.onChange(!field.value)}
                          className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-sm font-medium border transition-colors ${
                            field.value
                              ? 'border-amber-500 bg-amber-500 text-white dark:bg-amber-600 dark:border-amber-600'
                              : 'border-input bg-background hover:bg-accent text-muted-foreground'
                          }`}
                        >
                          <Tag className="h-3.5 w-3.5" />
                          Deal
                        </button>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="isOnline"
                  render={({ field }) => (
                    <FormItem className="space-y-0">
                      <FormControl>
                        <button
                          type="button"
                          onClick={() => field.onChange(!field.value)}
                          className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-sm font-medium border transition-colors ${
                            field.value
                              ? 'border-sky-500 bg-sky-500 text-white dark:bg-sky-600 dark:border-sky-600'
                              : 'border-input bg-background hover:bg-accent text-muted-foreground'
                          }`}
                        >
                          <Globe className="h-3.5 w-3.5" />
                          Online Price
                        </button>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Date checked — on its own row so it's not cramped */}
            <FormField
              control={form.control}
              name="dateChecked"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date checked</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Conditional expiration date field */}
            {isSale && (
              <FormField
                control={form.control}
                name="saleExpiresAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5">
                      <CalendarClock className="h-3.5 w-3.5 text-primary" />
                      Sale expires on
                    </FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    {saleCountdownText && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {saleCountdownText}
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Live preview */}
            <div className="rounded-lg border border-dashed bg-muted/40 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Total {BASE_UNIT_LABEL[preview.category]}:</span>
                <span className="font-mono">
                  {preview.totalBaseUnits.toFixed(preview.totalBaseUnits < 10 ? 2 : 0)}{' '}
                  {BASE_UNIT_LABEL[preview.category]}
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-muted-foreground">Price per {BASE_UNIT_LABEL[preview.category]}:</span>
                <span className="font-mono font-semibold text-primary">
                  {preview.pricePerBaseUnit > 0
                    ? formatPricePerUnitSmart(preview.pricePerBaseUnit, preview.category).text
                    : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                <span>Per single item:</span>
                <span className="font-mono">
                  {Number(watched.quantity) > 0
                    ? formatCurrency(Number(watched.price) / Number(watched.quantity))
                    : '—'}
                </span>
              </div>
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Optional notes — e.g. club-only pack, clearance, etc."
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEdit ? 'Save changes' : forkFrom ? 'Add copy' : 'Add price'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
    </>
  )
}
