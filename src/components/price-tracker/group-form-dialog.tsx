'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Layers, Check } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { CategoryCombobox } from './category-combobox'
import { useToast } from '@/hooks/use-toast'
import { localAddGroup } from '@/hooks/use-local-data'
import type { Product } from './types'

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  category: z.string().trim().max(60).optional().or(z.literal('')),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
})
type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  products: Product[]
  /** Pre-selected product IDs — typically used when "Create group from selected" is clicked on the Products tab. */
  initialProductIds?: string[]
  onSaved: () => void
}

export function GroupFormDialog({ open, onOpenChange, products, initialProductIds = [], onSaved }: Props) {
  const { toast } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set())

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', category: '', notes: '' },
  })

  useEffect(() => {
    if (open) {
      form.reset({ name: '', category: '', notes: '' })
      setSelectedProductIds(new Set(initialProductIds))
    }
  }, [open, form, initialProductIds])

  async function onSubmit(values: FormValues) {
    setSubmitting(true)
    try {
      await localAddGroup({
        name: values.name,
        category: values.category || null,
        notes: values.notes || null,
        productIds: Array.from(selectedProductIds),
      })
      toast({ title: 'Group created', description: values.name })
      onSaved()
      onOpenChange(false)
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e instanceof Error ? e.message : 'Failed' })
    } finally {
      setSubmitting(false)
    }
  }

  function toggleProduct(id: string) {
    setSelectedProductIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            New group
          </DialogTitle>
          <DialogDescription>
            Create a comparison group. {initialProductIds.length > 0
              ? `${initialProductIds.length} product${initialProductIds.length === 1 ? '' : 's'} pre-selected from the Products tab.`
              : 'You can add products now or later.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Group name *</FormLabel>
                <FormControl><Input placeholder="e.g. Mac & Cheese" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="category" render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <FormControl>
                  <CategoryCombobox
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    placeholder="Select category…"
                    existingCategories={Array.from(new Set(products.map(p => p.category).filter(Boolean) as string[])).sort()}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl><Textarea placeholder="Optional notes" rows={2} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* Product picker */}
            {products.length > 0 && (
              <div>
                <FormLabel>Add products to this group (optional)</FormLabel>
                <div className="mt-1.5 max-h-40 overflow-y-auto scrollbar-thin rounded-lg border divide-y">
                  {products.map(p => (
                    <button key={p.id} type="button" onClick={() => toggleProduct(p.id)}
                      className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${selectedProductIds.has(p.id) ? 'bg-primary/5' : 'hover:bg-accent'}`}>
                      <div className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${selectedProductIds.has(p.id) ? 'bg-primary border-primary' : 'border-input'}`}>
                        {selectedProductIds.has(p.id) && <Check className="h-3 w-3 text-primary-foreground" />}
                      </div>
                      <span className="text-sm font-medium truncate">{p.name}</span>
                      {p.brand && <span className="text-[10px] text-muted-foreground">· {p.brand}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create group
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
