'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  BrowserMultiFormatReader,
  IScannerControls,
} from '@zxing/browser'
import { DecodeHintType, BarcodeFormat } from '@zxing/library'
import {
  Loader2,
  Camera,
  ScanLine,
  AlertCircle,
  Keyboard,
  CheckCircle2,
  X,
  Search,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { lookupBarcode, searchOpenFoodFacts, type BarcodeLookupResult } from '@/lib/barcode'
import { localDb } from '@/lib/local-db'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  onDetected: (result: BarcodeLookupResult) => void
  /** Called when the user selects an existing product from the search results */
  onProductSelected?: (productId: string) => void
  /** Optional title override. Default: "Scan barcode" */
  title?: string
  /** Optional description. */
  description?: string
}

type Phase = 'idle' | 'starting' | 'scanning' | 'looking-up' | 'manual' | 'error'

export function BarcodeScannerDialog({
  open,
  onOpenChange,
  onDetected,
  onProductSelected,
  title = 'Scan barcode',
  description = 'Point your camera at the product barcode. We will look it up in the OpenFoodFacts database and pre-fill the form.',
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const detectedRef = useRef(false)
  const { toast } = useToast()

  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [manualCode, setManualCode] = useState('')
  const [lastDetected, setLastDetected] = useState<string | null>(null)
  const [cameraLabel, setCameraLabel] = useState<string | null>(null)
  // Search-by-name state
  const [searchQuery, setSearchQuery] = useState('')
  // Local product results (from IndexedDB)
  const [localResults, setLocalResults] = useState<Array<{ id: string; name: string; brand?: string | null; category?: string | null }>>([])
  // OpenFoodFacts search results (from the online DB)
  const [offResults, setOffResults] = useState<BarcodeLookupResult[]>([])
  const [searching, setSearching] = useState(false)

  const stop = useCallback(() => {
    if (controlsRef.current) {
      try {
        controlsRef.current.stop()
      } catch {
        /* noop */
      }
      controlsRef.current = null
    }
    if (videoRef.current) {
      try {
        const stream = videoRef.current.srcObject as MediaStream | null
        if (stream) {
          stream.getTracks().forEach((t) => t.stop())
        }
        videoRef.current.srcObject = null
      } catch {
        /* noop */
      }
    }
  }, [])

  // Cleanup on unmount or close
  useEffect(() => {
    if (!open) {
      stop()
      // Schedule state reset on next tick to avoid cascading renders.
      // The camera is stopped synchronously; UI state can be reset lazily.
      detectedRef.current = false
      const reset = () => {
        setPhase('idle')
        setError(null)
        setManualCode('')
        setLastDetected(null)
        setCameraLabel(null)
        setSearchQuery('')
        setLocalResults([])
        setOffResults([])
        setSearching(false)
      }
      queueMicrotask(reset)
    }
  }, [open, stop])

  const handleDetected = useCallback(
    async (code: string) => {
      if (detectedRef.current) return
      detectedRef.current = true
      setLastDetected(code)
      setPhase('looking-up')
      // Stop scanning while looking up
      stop()

      try {
        const result = await lookupBarcode(code)
        if (!result) {
          // Barcode not found in OpenFoodFacts — pass it through silently.
          // The parent (handleGlobalScan) will search for similar groups by name,
          // and if the name is empty it'll just create a new product.
          // No need for a scary "not found" toast.
          onDetected({
            barcode: code,
            name: '',
            brand: null,
            category: null,
            imageUrl: null,
            sizeValue: null,
            sizeUnit: null,
            source: 'manual',
          })
        } else {
          toast({
            title: 'Product found',
            description: `${result.name}${result.brand ? ' — ' + result.brand : ''}`,
          })
          onDetected(result)
        }
        onOpenChange(false)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Lookup failed'
        setError(msg)
        setPhase('error')
        detectedRef.current = false
      }
    },
    [onDetected, onOpenChange, stop, toast]
  )

  const startCameraRef = useRef<() => Promise<void>>(async () => {})
  const startCamera = useCallback(async () => {
    setError(null)
    setPhase('starting')
    detectedRef.current = false

    if (!videoRef.current) {
      // Will retry on next render
      setTimeout(() => void startCameraRef.current(), 50)
      return
    }

    try {
      if (!readerRef.current) {
        const hints = new Map()
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
        ])
        readerRef.current = new BrowserMultiFormatReader(hints)
      }

      // List devices to pick a rear-facing camera when available
      let deviceId: string | undefined
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const videos = devices.filter((d) => d.kind === 'videoinput')
        if (videos.length > 0) {
          // Prefer back camera — label usually contains "back" or "rear" or "environment"
          const back =
            videos.find((v) => /back|rear|environment/i.test(v.label)) ?? videos[videos.length - 1]
          deviceId = back.deviceId || undefined
          setCameraLabel(back.label || null)
        }
      } catch {
        /* enumerateDevices may fail before permission granted — fine */
      }

      const controls = await readerRef.current.decodeFromVideoDevice(
        deviceId,
        videoRef.current,
        (result, err) => {
          if (result && !detectedRef.current) {
            void handleDetected(result.getText())
          }
        }
      )
      controlsRef.current = controls
      setPhase('scanning')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to start camera'
      // Common: permission denied
      if (/permission|denied|notallowed/i.test(msg)) {
        setError(
          'Camera access was blocked. Enable camera permission in your browser settings, or enter the barcode manually below.'
        )
      } else if (/notfound|no.*camera/i.test(msg)) {
        setError('No camera found on this device. Enter the barcode manually below.')
      } else {
        setError(`Could not start camera: ${msg}`)
      }
      setPhase('error')
    }
  }, [handleDetected])

  // Keep the ref in sync so we can call the latest startCamera from inside itself
  // without re-triggering the useCallback identity loop.
  useEffect(() => {
    startCameraRef.current = startCamera
  }, [startCamera])

  // Auto-start camera when dialog opens (on a delay to allow render)
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      void startCameraRef.current()
    }, 200)
    return () => clearTimeout(t)
  }, [open])

  async function submitManual() {
    const code = manualCode.trim()
    if (!/^\d{6,14}$/.test(code)) {
      toast({
        variant: 'destructive',
        title: 'Invalid barcode',
        description: 'Barcodes are 6–14 digits.',
      })
      return
    }
    await handleDetected(code)
  }

  const isBusy = phase === 'starting' || phase === 'scanning' || phase === 'looking-up'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-4 w-4 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {/* Video preview area */}
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border bg-black">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            muted
            playsInline
          />
          {/* Scan reticle */}
          {(phase === 'scanning' || phase === 'starting') && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="relative w-3/4 h-1/2 rounded-lg border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
                <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-primary animate-pulse" />
              </div>
            </div>
          )}

          {/* Status overlays */}
          {phase === 'starting' && (
            <div className="absolute inset-0 grid place-items-center bg-black/60 text-white text-sm">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span>Starting camera…</span>
              </div>
            </div>
          )}

          {phase === 'looking-up' && (
            <div className="absolute inset-0 grid place-items-center bg-black/70 text-white text-sm">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span>Looking up {lastDetected}…</span>
              </div>
            </div>
          )}

          {phase === 'error' && (
            <div className="absolute inset-0 grid place-items-center bg-black/80 p-4 text-center text-white text-xs">
              <div className="flex flex-col items-center gap-2">
                <AlertCircle className="h-6 w-6 text-red-400" />
                <span>{error}</span>
              </div>
            </div>
          )}

          {/* Top-right close-scan button (when active) */}
          {isBusy && (
            <button
              type="button"
              onClick={() => {
                stop()
                onOpenChange(false)
              }}
              className="absolute top-2 right-2 rounded-full bg-black/50 hover:bg-black/70 p-1.5 text-white"
              aria-label="Cancel scan"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          {/* Camera label badge */}
          {cameraLabel && phase === 'scanning' && (
            <div className="absolute top-2 left-2 rounded bg-black/60 px-2 py-0.5 text-[10px] text-white flex items-center gap-1 max-w-[60%] truncate">
              <Camera className="h-3 w-3" />
              <span className="truncate">{cameraLabel}</span>
            </div>
          )}
        </div>

        {/* Detected indicator */}
        {lastDetected && phase !== 'looking-up' && phase !== 'error' && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            Last detected: <span className="font-mono">{lastDetected}</span>
          </div>
        )}

        {/* Error retry / manual entry */}
        {phase === 'error' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Input
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Enter barcode digits"
                inputMode="numeric"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void submitManual()
                  }
                }}
              />
              <Button type="button" size="sm" onClick={() => void submitManual()}>
                <Keyboard className="h-3.5 w-3.5 mr-1" /> Look up
              </Button>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => void startCamera()}
            >
              <Camera className="h-3.5 w-3.5 mr-1" /> Retry camera
            </Button>
          </div>
        )}

        {/* Footer — always allow manual entry */}
        {phase !== 'error' && (
          <div className="space-y-2">
            {phase === 'scanning' && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">
                  Camera not auto-detecting? Enter the barcode manually
                </summary>
                <div className="mt-2 flex items-center gap-2">
                  <Input
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder="000000000000"
                    inputMode="numeric"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void submitManual()
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void submitManual()}
                    disabled={!/^\d{6,14}$/.test(manualCode.trim())}
                  >
                    Look up
                  </Button>
                </div>
              </details>
            )}
            {phase === 'idle' && (
              <Button type="button" className="w-full" onClick={() => void startCamera()}>
                <Camera className="h-4 w-4 mr-2" /> Start camera
              </Button>
            )}
          </div>
        )}

        {/* Search by name — searches both local products and OpenFoodFacts */}
        {onProductSelected && phase !== 'looking-up' && (
          <div className="space-y-2 border-t pt-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Search products
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={async (e) => {
                  const q = e.target.value
                  setSearchQuery(q)
                  if (q.trim().length < 3) {
                    setLocalResults([])
                    setOffResults([])
                    setSearching(false)
                    return
                  }
                  // Search local products (instant)
                  const all = await localDb.products.toArray()
                  const filtered = all
                    .filter((p) => !p.deletedAt)
                    .filter((p) =>
                      p.name.toLowerCase().includes(q.toLowerCase()) ||
                      (p.brand && p.brand.toLowerCase().includes(q.toLowerCase()))
                    )
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .slice(0, 3)
                  setLocalResults(filtered)
                  // Search OpenFoodFacts (debounced, online)
                  setSearching(true)
                  try {
                    const offResults = await searchOpenFoodFacts(q)
                    setOffResults(offResults)
                  } catch {
                    setOffResults([])
                  } finally {
                    setSearching(false)
                  }
                }}
                placeholder="Type a product name to search online..."
                className="pl-8 text-sm"
              />
              {searching && (
                <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* Local product results (from your database) */}
            {localResults.length > 0 && (
              <div>
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-medium mb-1">
                  Your products
                </div>
                <div className="rounded-lg border divide-y">
                  {localResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        onProductSelected(p.id)
                        onOpenChange(false)
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-accent transition-colors flex items-center gap-2"
                    >
                      <span className="text-sm font-medium truncate">{p.name}</span>
                      {p.brand && (
                        <span className="text-[10px] text-muted-foreground">· {p.brand}</span>
                      )}
                      {p.category && (
                        <span className="text-[10px] text-muted-foreground/60 ml-auto">{p.category}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* OpenFoodFacts results (from the online database) */}
            {offResults.length > 0 && (
              <div>
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-medium mb-1">
                  From OpenFoodFacts
                </div>
                <div className="rounded-lg border divide-y max-h-48 overflow-y-auto scrollbar-thin">
                  {offResults.map((r, i) => (
                    <button
                      key={`${r.barcode}-${i}`}
                      type="button"
                      onClick={() => {
                        // Treat this like a barcode lookup result — pass to onDetected
                        // which will check if the barcode exists locally, show variant
                        // picker if needed, or create a new product
                        onDetected(r)
                        onOpenChange(false)
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-accent transition-colors flex items-center gap-2"
                    >
                      {r.imageUrl && (
                        <div className="h-8 w-8 shrink-0 rounded overflow-hidden border bg-muted">
                          {/* Using a plain img because URL comes from a third-party API */}
                          <img
                            src={r.imageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              ;(e.target as HTMLImageElement).style.display = 'none'
                            }}
                          />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{r.name}</div>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          {r.brand && <span>{r.brand}</span>}
                          {r.sizeValue && r.sizeUnit && (
                            <>
                              <span>·</span>
                              <span>{r.sizeValue} {r.sizeUnit}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* No results message */}
            {searchQuery.trim().length >= 3 && !searching && localResults.length === 0 && offResults.length === 0 && (
              <div className="text-xs text-muted-foreground italic py-1">
                No results found. Try a different search term, or scan the barcode instead.
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              stop()
              onOpenChange(false)
            }}
            disabled={phase === 'looking-up'}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
