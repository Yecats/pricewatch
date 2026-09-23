'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Plus, Pencil, Trash2, MapPin } from 'lucide-react'

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
import { useToast } from '@/hooks/use-toast'
import type { Store } from './types'

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use #RRGGBB'),
  location: z.string().trim().max(120).optional().or(z.literal('')),
})

type FormValues = z.infer<typeof schema>

const PRESET_COLORS = [
  '#8b5cf6', '#ef4444', '#f59e0b', '#06b6d4',
  '#ec4899', '#84cc16', '#dc2626', '#0ea5e9',
]

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  stores: Store[]
  onChange: () => void
}

export function StoresDialog({ open, onOpenChange, stores, onChange }: Props) {
  const { toast } = useToast()
  const [editing, setEditing] = useState<Store | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', color: '#8b5cf6', location: '' },
  })

  useEffect(() => {
    if (showForm) {
      form.reset({
        name: editing?.name ?? '',
        color: editing?.color ?? '#8b5cf6',
        location: editing?.location ?? '',
      })
    }
  }, [showForm, editing, form])

  function openAdd() {
    setEditing(null)
    setShowForm(true)
  }
  function openEdit(s: Store) {
    setEditing(s)
    setShowForm(true)
  }

  async function onSubmit(values: FormValues) {
    setSubmitting(true)
    try {
      const url = editing ? `/api/stores/${editing.id}` : '/api/stores'
      const method = editing ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to save store')
      }
      toast({
        title: editing ? 'Store updated' : 'Store added',
        description: values.name,
      })
      setShowForm(false)
      setEditing(null)
      onChange()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Something went wrong'
      toast({ variant: 'destructive', title: 'Error', description: msg })
    } finally {
      setSubmitting(false)
    }
  }

  async function onDelete(s: Store) {
    if (!confirm(`Delete "${s.name}"? This also removes its price entries.`)) return
    setDeletingId(s.id)
    try {
      const res = await fetch(`/api/stores/${s.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete store')
      toast({ title: 'Store removed', description: s.name })
      onChange()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Something went wrong'
      toast({ variant: 'destructive', title: 'Error', description: msg })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Stores</DialogTitle>
          <DialogDescription>
            Manage the stores you frequent. Each store gets a color for quick recognition.
          </DialogDescription>
        </DialogHeader>

        {!showForm ? (
          <div className="space-y-3">
            <div className="max-h-72 overflow-y-auto scrollbar-thin -mx-1 px-1 space-y-2">
              {stores.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No stores yet. Add one below.
                </p>
              ) : (
                stores.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 rounded-lg border p-2.5 pr-3 hover:bg-accent/50 transition-colors"
                  >
                    <span
                      className="h-8 w-8 shrink-0 rounded-md ring-2 ring-offset-1 ring-offset-background ring-border"
                      style={{ backgroundColor: s.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium leading-tight truncate">{s.name}</p>
                      {s.location && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
                          <MapPin className="h-3 w-3" /> {s.location}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {s._count?.prices ?? 0} price entries
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => openEdit(s)}
                      aria-label={`Edit ${s.name}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => onDelete(s)}
                      disabled={deletingId === s.id}
                      aria-label={`Delete ${s.name}`}
                    >
                      {deletingId === s.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                ))
              )}
            </div>
            <Button onClick={openAdd} className="w-full" variant="outline">
              <Plus className="mr-2 h-4 w-4" /> Add store
            </Button>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Store name *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Costco" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color</FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-2">
                        <Input type="color" className="h-9 w-12 p-1" {...field} />
                        <Input
                          className="flex-1 font-mono text-sm"
                          placeholder="#8b5cf6"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <div className="flex gap-2 mt-1.5">
                      {PRESET_COLORS.map((c) => (
                        <button
                          type="button"
                          key={c}
                          className="h-5 w-5 rounded-full ring-1 ring-border hover:scale-110 transition-transform"
                          style={{ backgroundColor: c }}
                          onClick={() => field.onChange(c)}
                          aria-label={`Pick color ${c}`}
                        />
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="123 Main St, Springfield" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setShowForm(false)
                    setEditing(null)
                  }}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editing ? 'Save changes' : 'Add store'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  )
}
