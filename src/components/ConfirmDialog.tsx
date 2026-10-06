import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  cancelLabel?: string
  /** Styles the confirm button red for irreversible actions. */
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * In-app replacement for window.confirm. Focus starts on Cancel so a stray
 * Enter/Space never triggers the destructive action; Escape and a click on the
 * backdrop also cancel.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="bg-bg-panel border border-bg-line rounded-xl w-full max-w-sm p-5 flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          id="confirm-dialog-title"
          className="text-lg font-semibold text-white"
        >
          {title}
        </h3>
        <div className="text-sm text-gray-300 flex flex-col gap-2">
          {children}
        </div>
        <div className="flex justify-end gap-2 mt-1">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md border border-bg-line text-gray-300 hover:text-white hover:bg-bg-elev"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-3 py-1.5 rounded-md font-semibold text-white ${
              destructive
                ? 'bg-red-600 hover:bg-red-500'
                : 'bg-accent hover:bg-accent/90'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
