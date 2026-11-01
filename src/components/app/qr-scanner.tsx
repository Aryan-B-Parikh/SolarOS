'use client'

import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Camera, Upload, X, AlertCircle, RefreshCw } from 'lucide-react'

export interface QrScannerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onScan: (code: string) => void
  title?: string
  description?: string
}

export function extractCodeFromQr(raw: string): string {
  const trimmed = raw.trim()
  // Match URLs like http(s)://.../w/<serial_or_code>
  const urlMatch = trimmed.match(/\/w\/([^/?#\s]+)/i)
  if (urlMatch && urlMatch[1]) return urlMatch[1]

  // Match serial pattern like PNL540-26A-000500 or INV3K-24A-001873
  const serialMatch = trimmed.match(/([A-Z0-9]+-[A-Z0-9]+-[0-9]+)/i)
  if (serialMatch && serialMatch[1]) return serialMatch[1]

  return trimmed
}

export function QrScannerModal({
  open,
  onOpenChange,
  onScan,
  title = 'Scan QR Code',
  description = 'Point your camera at the QR code on the equipment or upload a photo',
}: QrScannerModalProps) {
  const [cameraActive, setCameraActive] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [isProcessingFile, setIsProcessingFile] = useState(false)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Start / stop camera based on modal open state
  useEffect(() => {
    if (!open) {
      stopCamera()
      setErrorMsg(null)
      return
    }

    startCamera(facingMode)

    return () => {
      stopCamera()
    }
  }, [open, facingMode])

  const stopCamera = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setCameraActive(false)
  }

  const startCamera = async (mode: 'environment' | 'user') => {
    stopCamera()
    setErrorMsg(null)

    if (!navigator?.mediaDevices?.getUserMedia) {
      setErrorMsg('Camera access is not supported in this browser. Please use the image upload option below.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.setAttribute('playsinline', 'true')
        await videoRef.current.play()
        setCameraActive(true)
        scanFrame()
      }
    } catch (err: any) {
      console.warn('Camera access failed:', err)
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMsg('Camera permission was denied. Please allow camera permissions in browser settings or upload a QR image.')
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setErrorMsg('No camera device found on this computer. Please upload a QR image instead.')
      } else {
        setErrorMsg('Could not open camera. You can still scan by uploading an image.')
      }
      setCameraActive(false)
    }
  }

  const scanFrame = () => {
    if (!videoRef.current || !canvasRef.current || !streamRef.current) return

    const video = videoRef.current
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d', { willReadFrequently: true })

      if (ctx) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        })

        if (code && code.data) {
          const extracted = extractCodeFromQr(code.data)
          if (extracted) {
            stopCamera()
            onScan(extracted)
            onOpenChange(false)
            return
          }
        }
      }
    }

    animationFrameRef.current = requestAnimationFrame(scanFrame)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsProcessingFile(true)
    setErrorMsg(null)

    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          setIsProcessingFile(false)
          setErrorMsg('Failed to process image canvas')
          return
        }

        ctx.drawImage(img, 0, 0)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(imageData.data, imageData.width, imageData.height)

        setIsProcessingFile(false)
        if (code && code.data) {
          const extracted = extractCodeFromQr(code.data)
          stopCamera()
          onScan(extracted)
          onOpenChange(false)
        } else {
          setErrorMsg('No valid QR code found in the selected image. Please try another image with a clearer code.')
        }
      }
      img.onerror = () => {
        setIsProcessingFile(false)
        setErrorMsg('Failed to load image file')
      }
      img.src = event.target?.result as string
    }
    reader.readAsDataURL(file)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-5">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Camera className="h-5 w-5 text-blue-600" /> {title}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Camera Viewport */}
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-slate-950 flex items-center justify-center border shadow-inner">
            <video
              ref={videoRef}
              className={`w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
              playsInline
              muted
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* Target Reticle Overlay when camera is active */}
            {cameraActive && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="relative w-52 h-52 border-2 border-emerald-400/80 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]">
                  {/* Corner accents */}
                  <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-emerald-400 rounded-tl" />
                  <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-emerald-400 rounded-tr" />
                  <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-emerald-400 rounded-bl" />
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-emerald-400 rounded-br" />
                  {/* Animated laser line */}
                  <div className="absolute left-2 right-2 h-0.5 bg-emerald-400/90 shadow-[0_0_8px_#34d399] animate-pulse top-1/2 -translate-y-1/2" />
                </div>
                <div className="absolute bottom-3 text-center text-xs text-white/90 font-medium px-3 py-1 rounded-full bg-black/60 backdrop-blur-sm">
                  Align QR code within the square
                </div>
              </div>
            )}

            {/* Fallback placeholder when camera is not running */}
            {!cameraActive && (
              <div className="text-center p-6 text-slate-400 space-y-2">
                <Camera className="h-12 w-12 mx-auto stroke-1 opacity-50" />
                <p className="text-xs">Camera is not streaming</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800"
                  onClick={() => startCamera(facingMode)}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Retry Camera
                </Button>
              </div>
            )}
          </div>

          {/* Error notice */}
          {errorMsg && (
            <div className="flex items-start gap-2 p-3 text-xs bg-amber-50 text-amber-900 border border-amber-200 rounded-lg">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Action buttons: Switch Camera & File Upload */}
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />
            <Button
              type="button"
              variant="outline"
              className="flex-1 text-xs h-9"
              disabled={isProcessingFile}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              {isProcessingFile ? 'Analyzing Image…' : 'Upload QR Image'}
            </Button>

            {cameraActive && (
              <Button
                type="button"
                variant="outline"
                className="text-xs h-9 px-3"
                title="Switch camera"
                onClick={() => setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Flip
              </Button>
            )}

            <Button
              type="button"
              variant="ghost"
              className="text-xs h-9 px-3 text-slate-500 hover:text-slate-800"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
