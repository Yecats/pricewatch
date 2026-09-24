'use client'

import { useState } from 'react'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

// Common grocery categories — used to populate the dropdown.
// Users can still type a custom value if their category isn't in the list.
export const COMMON_CATEGORIES = [
  'Pantry',
  'Dairy',
  'Meat',
  'Seafood',
  'Produce',
  'Frozen',
  'Bakery',
  'Beverages',
  'Snacks',
  'Condiments & Sauces',
  'Spices & Seasonings',
  'Canned Goods',
  'Pasta & Grains',
  'Cereal & Breakfast',
  'Baking',
  'Deli',
  'Health & Beauty',
  'Household',
  'Pet Supplies',
  'Baby',
  'Other',
]

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Additional categories to show at the top of the list (e.g. from existing products) */
  existingCategories?: string[]
}

export function CategoryCombobox({
  value,
  onChange,
  placeholder = 'Select category…',
  existingCategories = [],
}: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  // Merge common categories with any existing categories (deduped, sorted)
  const allCategories = Array.from(
    new Set([...COMMON_CATEGORIES, ...existingCategories])
  ).sort((a, b) => a.localeCompare(b))

  // Filter categories based on search
  const filtered = allCategories.filter((c) =>
    c.toLowerCase().includes(search.toLowerCase())
  )

  // Determine if the current search is a custom (new) value
  const isCustomValue =
    search.length > 0 &&
    !allCategories.some((c) => c.toLowerCase() === search.toLowerCase())

  function handleSelect(selected: string) {
    onChange(selected === value ? '' : selected)
    setOpen(false)
    setSearch('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={value ? 'text-foreground' : 'text-muted-foreground'}>
            {value || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search or type a new category…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {isCustomValue ? `Press Enter to add "${search}"` : 'No category found.'}
            </CommandEmpty>
            <CommandGroup heading="Categories">
              {filtered.map((c) => (
                <CommandItem
                  key={c}
                  value={c}
                  onSelect={() => handleSelect(c)}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === c ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  {c}
                </CommandItem>
              ))}
            </CommandGroup>
            {isCustomValue && (
              <CommandGroup heading="Add new">
                <CommandItem
                  value={search}
                  onSelect={() => handleSelect(search)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Use "{search}"
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
