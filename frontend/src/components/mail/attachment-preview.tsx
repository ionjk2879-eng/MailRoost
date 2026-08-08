import { AlertTriangle, Download, Loader2, X } from "lucide-react"
import { useEffect, useState } from "react"
import { attachmentDownloadUrl } from "@/lib/api"
import type { Mail, MailAttachment } from "@/types/mail"

export function isPreviewableAttachment(mimeType: string): boolean {
  return mimeType.startsWith("image/") || mimeType === "application/pdf"
}

interface AttachmentPreviewProps {
  mail: Mail
  attachment: MailAttachment
  onClose: () => void
}

// 다운로드 대신 미리보기용으로 쓰려고 fetch로 바이트를 받아 blob URL을 직접 만든다.
// (다운로드 라우트는 Content-Disposition: attachment라서 그냥 링크로 열면 강제 다운로드된다.)
export function AttachmentPreview({ mail, attachment, onClose }: AttachmentPreviewProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    let url: string | null = null
    setBlobUrl(null)
    setError(false)
    fetch(attachmentDownloadUrl(mail.id, mail.accountId, attachment))
      .then((res) => {
        if (!res.ok) throw new Error("failed")
        return res.blob()
      })
      .then((blob) => {
        if (cancelled) return
        url = URL.createObjectURL(new Blob([blob], { type: attachment.mimeType }))
        setBlobUrl(url)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [mail.id, mail.accountId, attachment.id, attachment.mimeType])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose])

  const isImage = attachment.mimeType.startsWith("image/")
  const isPdf = attachment.mimeType === "application/pdf"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="bg-background flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-lg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5">
          <span className="truncate text-sm font-medium">{attachment.filename}</span>
          <div className="flex shrink-0 items-center gap-1">
            {blobUrl && (
              <a
                href={blobUrl}
                download={attachment.filename}
                aria-label="다운로드"
                className="hover:bg-accent flex size-8 items-center justify-center rounded-md transition-colors"
              >
                <Download className="size-4" />
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="hover:bg-accent flex size-8 items-center justify-center rounded-md transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="bg-muted/30 flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
          {error ? (
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-16 text-sm">
              <AlertTriangle className="size-6" />
              미리보기를 불러오지 못했습니다.
            </div>
          ) : !blobUrl ? (
            <Loader2 className="text-muted-foreground size-6 animate-spin" />
          ) : isImage ? (
            <img src={blobUrl} alt={attachment.filename} className="max-h-[75vh] max-w-full object-contain" />
          ) : isPdf ? (
            <iframe title={attachment.filename} src={blobUrl} className="h-[75vh] w-full border-0" />
          ) : null}
        </div>
      </div>
    </div>
  )
}
