'use client'

import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, ScanLine, PackageCheck, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { CategoryCombobox } from './category-combobox'
import { useToast } from '@/hooks/use-toast'
import { localAddProduct, localUpdateProduct } from '@/hooks/use-local-data'
import type { Product, ProductGroup } from './types'
import type { BarcodeLookupResult } from '@/lib/barcode'

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  brand: z.string().trim().max(80).optional().or(z.literal('')),
  category: z.string().trim().max(60).optional().or(z.literal('')),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
  barcode: z.string().max(40).optional().or(z.literal('')),
  imageUrl: z.string().max(500).optional().or(z.literal('')),
  groupId: z.string().optional().or(z.literal('')),
})
type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  initial?: Product | null
  initialLookup?: BarcodeLookupResult | null
  onLookupConsumed?: () => void
  onSaved: (p: { id: string; name: string }) => void
  /** Required when the "Scan barcode" button should be visible — caller owns the scanner instance. */
  onOpenScanner?: () => void
  existingCategories?: string[]
  groups?: ProductGroup[]
}

export function ProductFormDialog({
  open, onOpenChange, initial, initialLookup, onLookupConsumed, onSaved, onOpenScanner, existingCategories = [], groups = [],
}: Props) {
  const { toast } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [barcodeSource, setBarcodeSource] = useState<string | null>(null)
  const isEdit = !!initial

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', brand: '', category: '', notes: '', barcode: '', imageUrl: '', groupId: '' },
  })

  const prevOpenRef = useRef(false)

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      const lookup = initialLookup
      form.reset({
        name: lookup?.name || initial?.name || '',
        brand: lookup?.brand ?? initial?.brand ?? '',
        category: lookup?.category ?? initial?.category ?? '',
        notes: initial?.notes ?? '',
        barcode: lookup?.barcode ?? initial?.barcode ?? '',
        imageUrl: lookup?.imageUrl ?? initial?.imageUrl ?? '',
        groupId: '',
      })
      if (lookup) { setBarcodeSource(lookup.source); if (onLookupConsumed) onLookupConsumed() }
      else setBarcodeSource(null)
    }
    prevOpenRef.current = open
  }, [open, initial, initialLookup, form, onLookupConsumed])

  async function onSubmit(values: FormValues) {
    setSubmitting(true)
    try {
      let savedId: string
      if (isEdit && initial) {
        await localUpdateProduct(initial.id, {
          name: values.name, brand: values.brand || null,
          category: values.category || null, notes: values.notes || null,
          barcode: values.barcode || null, imageUrl: values.imageUrl || null,
        })
        savedId = initial.id
      } else {
        savedId = await localAddProduct({
          name: values.name, brand: values.brand || null,
          barcode: values.barcode || null, imageUrl: values.imageUrl || null,
          category: values.category || null, notes: values.notes || null,
          groupId: values.groupId || null,
        })
      }
      toast({ title: isEdit ? 'Product updated' : 'Product added', description: values.name })
      onSaved({ id: savedId, name: values.name })
      onOpenChange(false)
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e instanceof Error ? e.message : 'Failed' })
    } finally { setSubmitting(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <span>{isEdit ? 'Edit product' : 'Add product'}</span>
            {!isEdit && onOpenScanner && (
              <Button type="button" size="sm" variant="outline"
                onClick={() => { onOpenChange(false); onOpenScanner() }}>
                <ScanLine className="h-3.5 w-3.5 mr-1.5" />Scan barcode
              </Button>
            )}
          </DialogTitle>
          <DialogDescription>{isEdit ? 'Update product details.' : 'Add a product — you can link it to a group now or later.'}</DialogDescription>
        </DialogHeader>

        {barcodeSource && (
          <div className="rounded-lg border bg-primary/5 p-3 flex gap-2">
            <PackageCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-primary">
                {barcodeSource === 'openfoodfacts' ? 'From OpenFoodFacts' : barcodeSource === 'upcitemdb' ? 'From UPCitemdb' : 'Barcode entered'}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Brand, barcode, and image will be saved on this product.</p>
            </div>
            <button type="button" onClick={() => setBarcodeSource(null)} className="text-muted-foreground hover:text-foreground shrink-0"><X className="h-3 w-3" /></button>
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem><FormLabel>Product name *</FormLabel><FormControl><Input placeholder="e.g. Kraft Mac & Cheese 18-Pack" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="brand" render={({ field }) => (
              <FormItem><FormLabel>Brand</FormLabel><FormControl><Input placeholder="Kraft" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="category" render={({ field }) => (
              <FormItem><FormLabel>Category</FormLabel><FormControl>
                <CategoryCombobox value={field.value ?? ''} onChange={field.onChange} placeholder="Select category…" existingCategories={existingCategories} />
              </FormControl><FormMessage /></FormItem>
            )} />
            {!isEdit && groups.length > 0 && (
              <FormField control={form.control} name="groupId" render={({ field }) => (
                <FormItem><FormLabel>Add to group (optional)</FormLabel>
                  <FormControl>
                    <select className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm" {...field}>
                      <option value="">No group (add later)</option>
                      {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </FormControl><FormMessage /></FormItem>
              )} />
            )}
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem><FormLabel>Notes</FormLabel><FormControl><Textarea placeholder="Optional notes" rows={2} {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
              <Button type="submit" disabled={submitting}>{submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{isEdit ? 'Save changes' : 'Add product'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
