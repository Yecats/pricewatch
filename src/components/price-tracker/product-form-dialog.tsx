'use client'

import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, ScanLine, PackageCheck, X } from 'lucide-react'

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
  category: z.string().trim().max(60).optional().or(z.literal('')),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
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
  /** Called when the user clicks "Scan barcode" — parent should close this form
   *  and open the global scanner dialog (same one as the header Scan button). */
  onOpenScanner?: () => void
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
  onOpenScanner,
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
      category: '',
      notes: '',
    },
  })

  // Track whether this is the initial open of the dialog, so we don't reset
  // the form every time `initialLookup` changes after the dialog is already open.
  const prevOpenRef = useRef(false)

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      // Dialog is OPENING (transition from closed to open)
      const lookup = initialLookup
      form.reset({
        name: lookup?.name || initial?.name || '',
        category: lookup?.category ?? initial?.category ?? '',
        notes: initial?.notes ?? '',
      })
      if (lookup) {
        setBarcodeSource(lookup.source)
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
    const current = form.getValues()
    form.reset({
      name: result.name || current.name,
      category: result.category ?? current.category,
      notes: current.notes,
    })
    setBarcodeSource(result.source)
    if (result.name) {
      toast({
        title: 'Pre-filled from barcode',
        description: result.brand ? `${result.name} · ${result.brand}` : result.name,
      })
    }
  }

  async function onSubmit(values: FormValues) {
    setSubmitting(true)
    try {
      let savedId: string
      let savedName: string

      if (isEdit && initial) {
        const { localUpdateProduct } = await import('@/hooks/use-local-data')
        await localUpdateProduct(initial.id, {
          name: values.name,
          category: values.category || null,
          notes: values.notes || null,
        })
        savedId = initial.id
        savedName = values.name
      } else {
        const { localAddProduct } = await import('@/hooks/use-local-data')
        savedId = await localAddProduct({
          name: values.name,
          category: values.category || null,
          notes: values.notes || null,
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
                  onClick={() => {
                    if (onOpenScanner) {
                      // Close this form and let the parent open the global scanner
                      onOpenChange(false)
                      onOpenScanner()
                    } else {
                      // Fallback: open the local scanner (used when not wired to page.tsx)
                      setScannerOpen(true)
                    }
                  }}
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

          {/* Source banner when pre-filled from barcode */}
          {barcodeSource && (
            <div className="rounded-lg border bg-primary/5 p-3 flex gap-2">
              <PackageCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-primary">
                  {barcodeSource === 'openfoodfacts'
                    ? 'From OpenFoodFacts'
                    : barcodeSource === 'upcitemdb'
                    ? 'From UPCitemdb'
                    : 'Barcode entered'}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Brand and barcode will be added when you enter the price.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBarcodeSource(null)}
                className="text-[10px] text-muted-foreground hover:text-foreground shrink-0"
              >
                <X className="h-3 w-3" />
              </button>
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
