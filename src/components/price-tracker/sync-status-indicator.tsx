'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, Check, CloudOff, AlertCircle, Loader2 } from 'lucide-react'
import {
  getSyncState,
  subscribe,
  sync,
  type SyncStatus,
} from '@/lib/sync'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export function SyncStatusIndicator() {
  const [state, setState] = useState(getSyncState())

  useEffect(() => {
    const unsub = subscribe(setState)
    return unsub
  }, [])

  const status = state.status
  const Icon =
    status === 'syncing'
      ? Loader2
      : status === 'offline'
      ? CloudOff
      : status === 'error'
      ? AlertCircle
      : state.pendingCount > 0
      ? RefreshCw
      : Check

  const color =
    status === 'syncing'
      ? 'text-blue-500'
      : status === 'offline'
      ? 'text-muted-foreground'
      : status === 'error'
      ? 'text-red-500'
      : state.pendingCount > 0
      ? 'text-amber-500'
      : 'text-emerald-500'

  const label =
    status === 'syncing'
      ? 'Syncing…'
      : status === 'offline'
      ? 'Offline — changes saved locally'
      : status === 'error'
      ? `Sync error: ${state.lastError}`
      : state.pendingCount > 0
      ? `${state.pendingCount} change${state.pendingCount === 1 ? '' : 's'} pending`
      : 'All synced'

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => void sync()}
            disabled={status === 'syncing'}
            className="h-9 w-9 rounded-full grid place-items-center hover:bg-accent transition-colors disabled:opacity-50"
            aria-label={label}
          >
            <Icon
              className={`h-4 w-4 ${color} ${status === 'syncing' ? 'animate-spin' : ''}`}
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
