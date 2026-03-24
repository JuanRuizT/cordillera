"use client"

import { useRef, useState, useCallback, useEffect } from "react"
import {
  Upload,
  FileText,
  ImageIcon,
  Trash2,
  Send,
  Bot,
  User,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle,
  Clock,
  ExternalLink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

type DocStatus = "processing" | "ready" | "error"

interface RagDoc {
  id: string
  name: string
  originalName: string
  mimeType: string
  status: DocStatus
  pageCount: number | null
  errorMessage: string | null
  createdAt: string | Date
  _count: { chunks: number }
}

interface RagSource {
  id: string
  documentId: string
  name: string
  mimeType: string
  pageNumber: number | null
  content: string
  similarity: number
  signedUrl: string
}

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
}

interface RagDashboardProps {
  initialDocuments: RagDoc[]
  isConfigured: boolean
}

function generateId() {
  return Math.random().toString(36).slice(2)
}

export function RagDashboard({ initialDocuments, isConfigured }: RagDashboardProps) {
  const [documents, setDocuments] = useState<RagDoc[]>(initialDocuments)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sourcesMap, setSourcesMap] = useState<Record<string, RagSource[]>>({})
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({})
  const [expandedPreviews, setExpandedPreviews] = useState<Record<string, boolean>>({})
  const [input, setInput] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const hasReadyDocs = documents.some((d) => d.status === "ready")

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const refreshDocuments = useCallback(async () => {
    try {
      const res = await fetch("/api/rag/documents")
      const data = await res.json()
      if (data.documents) {
        setDocuments(
          (data.documents as Array<RagDoc & { status: string }>).map((d) => ({
            ...d,
            status: d.status as DocStatus,
          }))
        )
      }
    } catch {
      // ignore
    }
  }, [])

  const handleUpload = useCallback(
    async (file: File) => {
      setUploadError(null)
      setUploading(true)
      const formData = new FormData()
      formData.append("file", file)
      try {
        const res = await fetch("/api/rag/upload", { method: "POST", body: formData })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Upload failed")
        await refreshDocuments()
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Upload failed")
      } finally {
        setUploading(false)
      }
    },
    [refreshDocuments]
  )

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleUpload(file)
    e.target.value = ""
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleUpload(file)
  }

  const handleDelete = async (docId: string) => {
    await fetch(`/api/rag/documents/${docId}`, { method: "DELETE" })
    setDocuments((prev) => prev.filter((d) => d.id !== docId))
  }

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return

      const userMsg: ChatMessage = { id: generateId(), role: "user", content: text }
      const assistantId = generateId()
      const assistantMsg: ChatMessage = { id: assistantId, role: "assistant", content: "" }

      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setInput("")
      setIsStreaming(true)

      try {
        const history = [...messages, userMsg].map((m) => ({
          role: m.role,
          content: m.content,
        }))

        const res = await fetch("/api/rag/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history }),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Chat failed" }))
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: `Error: ${err.error}` } : m
            )
          )
          return
        }

        // Parse sources from headers
        const sourcesHeader = res.headers.get("X-Rag-Sources")
        if (sourcesHeader) {
          try {
            const sources: RagSource[] = JSON.parse(sourcesHeader)
            setSourcesMap((prev) => ({ ...prev, [assistantId]: sources }))
          } catch {
            // ignore
          }
        }

        // Stream text chunks
        const reader = res.body?.getReader()
        const decoder = new TextDecoder()
        if (!reader) return

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + chunk } : m
            )
          )
        }
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: `Error: ${err instanceof Error ? err.message : "Unknown error"}` }
              : m
          )
        )
      } finally {
        setIsStreaming(false)
      }
    },
    [messages, isStreaming]
  )

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Demo RAG</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Sube documentos y conversa con ellos usando Gemini + Embeddings 2.0
        </p>
      </div>

      {!isConfigured && <SetupBanner />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-220px)] min-h-[500px]">
        {/* Document Panel */}
        <Card className="flex flex-col overflow-hidden">
          <CardHeader className="pb-3 shrink-0">
            <CardTitle className="text-base">Documentos</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 flex-1 overflow-hidden p-4 pt-0">
            {/* Upload Zone */}
            <div
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50"
              } ${uploading ? "opacity-60 pointer-events-none" : ""}`}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={handleFileChange}
              />
              <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
              {uploading ? (
                <p className="text-sm text-muted-foreground">Procesando documento...</p>
              ) : (
                <>
                  <p className="text-sm font-medium">Arrastra un archivo o haz clic</p>
                  <p className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG, WebP</p>
                </>
              )}
            </div>

            {uploadError && (
              <div className="flex items-center gap-2 text-destructive text-xs p-2 rounded bg-destructive/10">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Document List */}
            <div className="flex-1 overflow-y-auto space-y-2">
              {documents.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No hay documentos aún
                </p>
              ) : (
                documents.map((doc) => (
                  <DocumentCard key={doc.id} doc={doc} onDelete={handleDelete} />
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Chat Panel */}
        <Card className="lg:col-span-2 flex flex-col overflow-hidden">
          <CardHeader className="pb-3 shrink-0">
            <CardTitle className="text-base">Chat con documentos</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col flex-1 overflow-hidden p-4 pt-0 gap-3">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                  <Bot className="h-12 w-12 mb-3 opacity-30" />
                  <p className="text-sm">Haz una pregunta sobre tus documentos</p>
                </div>
              )}

              {messages.map((message) => (
                <ChatMessageItem
                  key={message.id}
                  message={message}
                  sources={sourcesMap[message.id] ?? []}
                  expandedSources={expandedSources}
                  expandedPreviews={expandedPreviews}
                  onToggleSources={(id) =>
                    setExpandedSources((prev) => ({ ...prev, [id]: !prev[id] }))
                  }
                  onTogglePreview={(key) =>
                    setExpandedPreviews((prev) => ({ ...prev, [key]: !prev[key] }))
                  }
                />
              ))}

              {isStreaming && messages[messages.length - 1]?.content === "" && (
                <div className="flex gap-2 items-start">
                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="bg-muted rounded-lg px-3 py-2">
                    <div className="flex gap-1">
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleFormSubmit} className="flex gap-2 shrink-0">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  !hasReadyDocs ? "Sube un documento primero..." : "Escribe tu pregunta..."
                }
                disabled={isStreaming || !hasReadyDocs}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage(input)
                  }
                }}
              />
              <Button type="submit" size="icon" disabled={isStreaming || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function DocumentCard({
  doc,
  onDelete,
}: {
  doc: RagDoc
  onDelete: (id: string) => void
}) {
  const isPdf = doc.mimeType === "application/pdf"
  return (
    <div className="flex items-start gap-2 p-2 rounded-md border bg-card hover:bg-muted/30 transition-colors group">
      <div className="shrink-0 mt-0.5">
        {isPdf ? (
          <FileText className="h-4 w-4 text-red-500" />
        ) : (
          <ImageIcon className="h-4 w-4 text-blue-500" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{doc.name}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <StatusBadge status={doc.status} />
          {doc.pageCount && (
            <span className="text-xs text-muted-foreground">{doc.pageCount} pág.</span>
          )}
          {doc.status === "ready" && doc._count.chunks > 0 && (
            <span className="text-xs text-muted-foreground">{doc._count.chunks} chunks</span>
          )}
        </div>
        {doc.status === "error" && doc.errorMessage && (
          <p className="text-xs text-destructive mt-1 truncate">{doc.errorMessage}</p>
        )}
      </div>
      <button
        onClick={() => onDelete(doc.id)}
        className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function StatusBadge({ status }: { status: DocStatus }) {
  if (status === "ready") {
    return (
      <span className="flex items-center gap-0.5 text-xs text-green-600">
        <CheckCircle className="h-3 w-3" /> Listo
      </span>
    )
  }
  if (status === "processing") {
    return (
      <span className="flex items-center gap-0.5 text-xs text-yellow-600">
        <Clock className="h-3 w-3 animate-pulse" /> Procesando
      </span>
    )
  }
  return (
    <span className="flex items-center gap-0.5 text-xs text-destructive">
      <AlertCircle className="h-3 w-3" /> Error
    </span>
  )
}

function ChatMessageItem({
  message,
  sources,
  expandedSources,
  expandedPreviews,
  onToggleSources,
  onTogglePreview,
}: {
  message: ChatMessage
  sources: RagSource[]
  expandedSources: Record<string, boolean>
  expandedPreviews: Record<string, boolean>
  onToggleSources: (id: string) => void
  onTogglePreview: (key: string) => void
}) {
  const isUser = message.role === "user"

  return (
    <div className={`flex gap-2 items-start ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${
          isUser ? "bg-primary" : "bg-primary/10"
        }`}
      >
        {isUser ? (
          <User className="h-4 w-4 text-primary-foreground" />
        ) : (
          <Bot className="h-4 w-4 text-primary" />
        )}
      </div>

      <div
        className={`flex flex-col gap-1 max-w-[85%] ${isUser ? "items-end" : "items-start"}`}
      >
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
          }`}
        >
          {message.content ? (
            isUser ? (
              <div className="whitespace-pre-wrap">{message.content}</div>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-ul:my-2 prose-li:my-0">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
              </div>
            )
          ) : (
            <span className="opacity-40 italic">...</span>
          )}
        </div>

        {!isUser && sources.length > 0 && (
          <div className="w-full">
            <button
              onClick={() => onToggleSources(message.id)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {expandedSources[message.id] ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
              {sources.length} fuente{sources.length !== 1 ? "s" : ""}
            </button>

            {expandedSources[message.id] && (
              <div className="mt-2 space-y-2">
                {sources.map((source, idx) => {
                  const previewKey = `${message.id}-${idx}`
                  const isPreviewOpen = expandedPreviews[previewKey]
                  const srcIsPdf = source.mimeType === "application/pdf"
                  const srcIsImage = source.mimeType.startsWith("image/")

                  return (
                    <div key={source.id} className="border rounded-md overflow-hidden bg-card">
                      <div className="flex items-center gap-2 px-3 py-2 bg-muted/50">
                        <span className="text-xs font-semibold text-primary">[{idx + 1}]</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{source.name}</p>
                          {source.pageNumber && (
                            <p className="text-xs text-muted-foreground">
                              Página {source.pageNumber}
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {Math.round(source.similarity * 100)}% relevancia
                        </span>
                        <button
                          onClick={() => onTogglePreview(previewKey)}
                          className="text-xs text-primary hover:underline shrink-0 flex items-center gap-1"
                        >
                          {isPreviewOpen ? "Ocultar" : "Ver"}
                          {!isPreviewOpen && <ExternalLink className="h-3 w-3" />}
                        </button>
                      </div>

                      <div className="px-3 py-2">
                        <p className="text-xs text-muted-foreground line-clamp-3">
                          {source.content}
                        </p>
                      </div>

                      {isPreviewOpen && (
                        <div className="border-t">
                          {srcIsPdf ? (
                            <embed
                              src={`${source.signedUrl}${source.pageNumber ? `#page=${source.pageNumber}` : ""}`}
                              type="application/pdf"
                              className="w-full"
                              style={{ height: "320px" }}
                            />
                          ) : srcIsImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={source.signedUrl}
                              alt={source.name}
                              className="w-full object-contain max-h-[320px]"
                            />
                          ) : null}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function SetupBanner() {
  return (
    <div className="border border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg p-4 text-sm">
      <div className="flex items-start gap-2">
        <AlertCircle className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-yellow-800 dark:text-yellow-400">
            Configuración requerida
          </p>
          <p className="text-yellow-700 dark:text-yellow-500 mt-1">
            Agrega estas variables en tu archivo{" "}
            <code className="font-mono bg-yellow-100 dark:bg-yellow-900 px-1 rounded">.env</code>:
          </p>
          <div className="mt-2 space-y-1 font-mono text-xs bg-yellow-100 dark:bg-yellow-900 rounded p-2">
            <p>
              GOOGLE_GENERATIVE_AI_API_KEY=
              <span className="text-muted-foreground"> # aistudio.google.com/app/apikey</span>
            </p>
            <p>
              GOOGLE_CLOUD_PROJECT_ID=
              <span className="text-muted-foreground"> # ID del proyecto GCS</span>
            </p>
            <p>
              GOOGLE_CLOUD_BUCKET_NAME=
              <span className="text-muted-foreground"> # Nombre del bucket</span>
            </p>
            <p>
              GOOGLE_CLOUD_SA_KEY=
              <span className="text-muted-foreground">
                {" "}
                # base64 del JSON: base64 -w0 key.json
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
