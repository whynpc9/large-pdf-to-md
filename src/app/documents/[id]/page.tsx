"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { PdfViewer } from "@/components/pdf-viewer";
import { ExtractionPanel } from "@/components/extraction-panel";
import { ChunkStatusTable } from "@/components/chunk-status-table";
import { MarkdownPreview } from "@/components/markdown-preview";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft } from "lucide-react";
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
  const id = params.id as string;

  const [doc, setDoc] = useState<(Document & { tasks: ExtractionTask[] }) | null>(null);
  const [task, setTask] = useState<ExtractionTask | null>(null);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [retrying, setRetrying] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

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
    const isActive = task?.status === "processing" || task?.status === "pending";
    if (!isActive) return;

    const interval = setInterval(() => {
      fetchDoc();
      fetchChunks();
    }, 3000);
    return () => clearInterval(interval);
  }, [task?.status, fetchDoc, fetchChunks]);

  const handleExtractionStarted = () => {
    setTimeout(() => {
      fetchDoc();
      fetchChunks();
      setRefreshKey((k) => k + 1);
    }, 1000);
  };

  const handleRetry = async () => {
    if (!task) return;
    setRetrying(true);
    try {
      await fetch(`/api/documents/${id}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id }),
      });
      setTimeout(() => {
        fetchDoc();
        fetchChunks();
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
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/documents"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          返回列表
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{doc.name}</h1>
          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
            <span>{doc.originalFilename}</span>
            <span>{formatFileSize(doc.fileSize)}</span>
            {doc.pageCount && <span>{doc.pageCount} 页</span>}
            <span>{formatDate(doc.createdAt)}</span>
          </div>
        </div>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-[600px] border rounded-lg overflow-hidden bg-muted/30">
          <PdfViewer documentId={id} />
        </div>

        <div className="space-y-4">
          <ExtractionPanel
            documentId={id}
            onExtractionStarted={handleExtractionStarted}
          />

          {task && (
            <ChunkStatusTable
              task={task}
              chunks={chunks}
              onRetry={handleRetry}
              retrying={retrying}
            />
          )}
        </div>
      </div>

      {showResults && (
        <MarkdownPreview
          key={refreshKey}
          documentId={id}
          taskId={task?.id}
        />
      )}
    </div>
  );
}
