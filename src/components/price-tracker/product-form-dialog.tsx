'use client'

import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, ScanLine, PackageCheck, Image as ImageIcon, X } from 'lucide-react'

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
import { Badge } from '@/components/ui/badge'
import { CategoryCombobox } from './category-combobox'
import { useToast } from '@/hooks/use-toast'
import type { Product } from './types'
import { BarcodeScannerDialog } from './barcode-scanner-dialog'
import type { BarcodeLookupResult } from '@/lib/barcode'

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  brand: z.string().trim().max(80).optional().or(z.literal('')),
  category: z.string().trim().max(60).optional().or(z.literal('')),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
  // Optional — set when a barcode lookup was used
  barcode: z.string().max(40).optional().or(z.literal('')),
  imageUrl: z.string().max(500).optional().or(z.literal('')),
})

type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  initial?: Product | null
  onSaved: (p: { id: string; name: string }) => void
  /** When set, opens the scanner dialog immediately on mount. */
  openScannerOnMount?: boolean
  /** When set, pre-fills the form with this lookup result on open. */
  initialLookup?: BarcodeLookupResult | null
  /** Notify parent when the lookup has been consumed (so it can be cleared). */
  onLookupConsumed?: () => void
  /** Existing categories from the user's products — shown at the top of the dropdown */
  existingCategories?: string[]
}

export function ProductFormDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
  openScannerOnMount,
  initialLookup,
  onLookupConsumed,
  existingCategories = [],
}: Props) {
  const { toast } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [barcodeSource, setBarcodeSource] = useState<BarcodeLookupResult['source'] | null>(null)
  const isEdit = !!initial

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      brand: '',
      category: '',
      notes: '',
      barcode: '',
      imageUrl: '',
    },
  })

  // Watch imageUrl so we can show a preview
  const imageUrl = form.watch('imageUrl')
  const watchedBarcode = form.watch('barcode')

  // Track whether this is the initial open of the dialog, so we don't reset
  // the form every time `initialLookup` changes after the dialog is already open.
  const prevOpenRef = useRef(false)

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      // Dialog is OPENING (transition from closed to open)
      const lookup = initialLookup
      form.reset({
        name: lookup?.name || initial?.name || '',
        brand: lookup?.brand ?? initial?.brand ?? '',
        category: lookup?.category ?? initial?.category ?? '',
        notes: initial?.notes ?? '',
        barcode: lookup?.barcode ?? '',
        imageUrl: lookup?.imageUrl ?? initial?.imageUrl ?? '',
      })
      if (lookup) {
        setBarcodeSource(lookup.source)
        // Notify parent that the lookup has been consumed so it can clear it
        if (onLookupConsumed) onLookupConsumed()
      } else {
        setBarcodeSource(null)
      }
      // Optionally auto-open the scanner
      if (openScannerOnMount && !initial) {
        setScannerOpen(true)
      }
    }
    if (!open && prevOpenRef.current) {
      // Dialog is CLOSING
      setScannerOpen(false)
    }
    prevOpenRef.current = open
  }, [open, initial, openScannerOnMount, initialLookup, form, onLookupConsumed])

  function applyLookupResult(result: BarcodeLookupResult) {
    // Pre-fill the form, but only set fields that have a value (don't overwrite what user typed
    // before scanning — though in practice the form is empty when scanning fresh)
    const current = form.getValues()
    form.reset({
      name: result.name || current.name,
      brand: result.brand ?? current.brand,
      category: result.category ?? current.category,
      notes: current.notes,
      barcode: result.barcode,
      imageUrl: result.imageUrl ?? current.imageUrl,
    })
    setBarcodeSource(result.source)
    if (result.name) {
      toast({
        title: 'Pre-filled from barcode',
        description: `${result.name}${result.brand ? ' · ' + result.brand : ''}`,
      })
    }
  }

  async function onSubmit(values: FormValues) {
    setSubmitting(true)
    try {
      let savedId: string
      let savedName: string

      if (isEdit && initial) {
        // Update existing product in local DB
        const { localUpdateProduct } = await import('@/hooks/use-local-data')
        await localUpdateProduct(initial.id, {
          name: values.name,
          brand: values.brand || null,
          category: values.category || null,
          notes: values.notes || null,
          imageUrl: values.imageUrl || null,
          barcode: values.barcode || null,
        })
        savedId = initial.id
        savedName = values.name
      } else {
        // Create new product in local DB
        const { localAddProduct } = await import('@/hooks/use-local-data')
        savedId = await localAddProduct({
          name: values.name,
          brand: values.brand || null,
          category: values.category || null,
          notes: values.notes || null,
          imageUrl: values.imageUrl || null,
          barcode: values.barcode || null,
        })
        savedName = values.name
      }

      toast({
        title: isEdit ? 'Product updated' : 'Product added',
        description: savedName,
      })
      onSaved({ id: savedId, name: savedName })
      onOpenChange(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Something went wrong'
      toast({ variant: 'destructive', title: 'Error', description: msg })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                {isEdit ? 'Edit product' : 'Add product'}
              </span>
              {!isEdit && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setScannerOpen(true)}
                >
                  <ScanLine className="h-3.5 w-3.5 mr-1.5" />
                  Scan barcode
                </Button>
              )}
            </DialogTitle>
            <DialogDescription>
              {isEdit
                ? 'Update the details for this product.'
                : 'Add a new product to track across your stores. Scan a barcode to auto-fill from OpenFoodFacts.'}
            </DialogDescription>
          </DialogHeader>

          {/* Barcode-found banner with image preview */}
          {watchedBarcode && (
            <div className="rounded-lg border bg-primary/5 p-3 flex gap-3">
              {imageUrl ? (
                <div className="relative h-16 w-16 shrink-0 rounded-md overflow-hidden border bg-muted">
                  {/* Using a plain <img> because the URL comes from a third-party API
                      and we want to avoid Next/Image domain configuration. */}
                  <img
                    src={imageUrl}
                    alt="Product"
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                </div>
              ) : (
                <div className="h-16 w-16 shrink-0 rounded-md border bg-muted grid place-items-center">
                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-primary">
                  <PackageCheck className="h-3 w-3" />
                  {barcodeSource === 'openfoodfacts'
                    ? 'From OpenFoodFacts'
                    : barcodeSource === 'upcitemdb'
                    ? 'From UPCitemdb'
                    : 'Barcode entered'}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground font-mono break-all">
                  {watchedBarcode}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    form.setValue('barcode', '')
                    form.setValue('imageUrl', '')
                    setBarcodeSource(null)
                  }}
                  className="mt-1 inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                >
                  <X className="h-2.5 w-2.5" /> Clear barcode
                </button>
              </div>
            </div>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product name *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Mac & Cheese" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="brand"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Brand</FormLabel>
                      <FormControl>
                        <Input placeholder="Kraft" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <FormControl>
                        <CategoryCombobox
                          value={field.value ?? ''}
                          onChange={field.onChange}
                          placeholder="Select category…"
                          existingCategories={existingCategories}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Optional notes — e.g. family favorite, bulk vs single, etc."
                        rows={3}
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
                  {isEdit ? 'Save changes' : 'Add product'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <BarcodeScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDetected={applyLookupResult}
        title="Scan product barcode"
      />
    </>
  )
}
