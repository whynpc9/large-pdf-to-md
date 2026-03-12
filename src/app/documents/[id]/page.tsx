"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PdfViewer } from "@/components/pdf-viewer";
import { ExtractionPanel } from "@/components/extraction-panel";
import { ChunkStatusTable } from "@/components/chunk-status-table";
import { MarkdownPreview } from "@/components/markdown-preview";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Settings2, ListChecks, FileText } from "lucide-react";
import { formatFileSize, formatDate } from "@/lib/utils";
import type { Document, ExtractionTask, Chunk } from "@/lib/db/schema";

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" | "info" }> = {
  uploaded: { label: "已上传", variant: "secondary" },
  processing: { label: "处理中", variant: "info" },
  completed: { label: "已完成", variant: "success" },
  partial: { label: "部分完成", variant: "warning" },
  failed: { label: "失败", variant: "destructive" },
};

export default function DocumentDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const autoExtract = searchParams.get("autoExtract") === "true";

  const [doc, setDoc] = useState<(Document & { tasks: ExtractionTask[] }) | null>(null);
  const [task, setTask] = useState<ExtractionTask | null>(null);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [retrying, setRetrying] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState("settings");

  const fetchDoc = useCallback(async () => {
    const res = await fetch(`/api/documents/${id}`);
    if (res.ok) {
      const data = await res.json();
      setDoc(data);
    }
  }, [id]);

  const fetchChunks = useCallback(async () => {
    const res = await fetch(`/api/documents/${id}/chunks`);
    if (res.ok) {
      const data = await res.json();
      if (data.task) setTask(data.task);
      if (data.chunks) setChunks(data.chunks);
    }
  }, [id]);

  useEffect(() => {
    fetchDoc();
    fetchChunks();
  }, [fetchDoc, fetchChunks]);

  useEffect(() => {
    if (!task) return;
    if (task.status === "processing" || task.status === "pending") {
      setActiveTab("progress");
    } else if (task.status === "completed" || task.status === "partial") {
      setActiveTab("result");
    }
  }, [task?.status]);

  useEffect(() => {
    const isActive = task?.status === "processing" || task?.status === "pending";
    if (!isActive) return;

    const interval = setInterval(() => {
      fetchDoc();
      fetchChunks();
    }, 3000);
    return () => clearInterval(interval);
  }, [task?.status, fetchDoc, fetchChunks]);

  const handleExtractionStarted = () => {
    setActiveTab("progress");
    setTimeout(() => {
      fetchDoc();
      fetchChunks();
      setRefreshKey((k) => k + 1);
    }, 1000);
  };

  const handleRetry = async (pagesPerChunk?: number) => {
    if (!task) return;
    setRetrying(true);
    setActiveTab("progress");
    try {
      await fetch(`/api/documents/${id}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, pagesPerChunk }),
      });
      setTimeout(() => {
        fetchDoc();
        fetchChunks();
        setRefreshKey((k) => k + 1);
      }, 1000);
    } finally {
      setRetrying(false);
    }
  };

  if (!doc) {
    return <div className="text-center py-12 text-muted-foreground">加载中...</div>;
  }

  const status = statusMap[doc.status] ?? statusMap.uploaded;
  const showResults = task && ["completed", "partial"].includes(task.status);

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 5rem)" }}>
      {/* compact header */}
      <div className="flex items-center justify-between pb-3 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/documents"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground flex-shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-lg font-semibold truncate">{doc.name}</h1>
          <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
            <span>{formatFileSize(doc.fileSize)}</span>
            {doc.pageCount && <span>{doc.pageCount} 页</span>}
            <span>{formatDate(doc.createdAt)}</span>
          </div>
        </div>
        <Badge variant={status.variant} className="flex-shrink-0">{status.label}</Badge>
      </div>

      {/* main two-column area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
        {/* left: PDF viewer */}
        <div className="border rounded-lg overflow-hidden bg-muted/30 min-h-[400px]">
          <PdfViewer documentId={id} />
        </div>

        {/* right: tabbed panel */}
        <div className="border rounded-lg flex flex-col min-h-[400px] overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
            <div className="flex-shrink-0 border-b px-3 pt-2">
              <TabsList className="w-full">
                <TabsTrigger value="settings" className="flex-1 gap-1.5">
                  <Settings2 className="h-3.5 w-3.5" />
                  提取设置
                </TabsTrigger>
                <TabsTrigger value="progress" className="flex-1 gap-1.5">
                  <ListChecks className="h-3.5 w-3.5" />
                  进度
                  {task && (task.status === "processing" || task.status === "pending") && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="result" className="flex-1 gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  结果
                  {showResults && (
                    <span className="h-2 w-2 rounded-full bg-green-500 flex-shrink-0" />
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="settings" className="flex-1 overflow-y-auto mt-0 p-4">
              <ExtractionPanel
                documentId={id}
                autoStart={autoExtract}
                onExtractionStarted={handleExtractionStarted}
                embedded
              />
            </TabsContent>

            <TabsContent value="progress" className="flex-1 overflow-y-auto mt-0 p-4">
              {task ? (
                <ChunkStatusTable
                  task={task}
                  chunks={chunks}
                  onRetry={handleRetry}
                  retrying={retrying}
                  embedded
                />
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  尚未开始提取任务
                </div>
              )}
            </TabsContent>

            <TabsContent value="result" className="flex-1 overflow-y-auto mt-0">
              {showResults ? (
                <MarkdownPreview
                  key={refreshKey}
                  documentId={id}
                  taskId={task?.id}
                  filename={doc.originalFilename.replace(/\.pdf$/i, ".md")}
                  embedded
                />
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground p-4">
                  {task ? "提取进行中，完成后可在此查看结果" : "请先在「提取设置」中启动提取"}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
