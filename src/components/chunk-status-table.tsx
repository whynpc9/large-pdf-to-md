"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import type { Chunk, ExtractionTask } from "@/lib/db/schema";

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" | "info" }> = {
  pending: { label: "等待中", variant: "secondary" },
  processing: { label: "处理中", variant: "info" },
  completed: { label: "已完成", variant: "success" },
  failed: { label: "失败", variant: "destructive" },
  partial: { label: "部分完成", variant: "warning" },
  retrying: { label: "重试中", variant: "info" },
};

interface Props {
  task: ExtractionTask | null;
  chunks: Chunk[];
  onRetry: (pagesPerChunk?: number) => void;
  retrying: boolean;
  embedded?: boolean;
}

export function ChunkStatusTable({ task, chunks, onRetry, retrying, embedded }: Props) {
  const [showErrorReport, setShowErrorReport] = useState(false);

  if (!task) return null;

  const taskConfig = (task.config ?? {}) as Record<string, unknown>;
  const originalPagesPerChunk = (taskConfig.pagesPerChunk as number) ?? 20;

  const status = statusMap[task.status] ?? statusMap.pending;
  const total = task.totalChunks ?? 0;
  const completed = task.completedChunks ?? 0;
  const failed = task.failedChunks ?? 0;
  const progress = total > 0 ? ((completed + failed) / total) * 100 : 0;
  const hasFailed = chunks.some((c) => c.status === "failed");
  const failedChunks = chunks.filter((c) => c.status === "failed");
  const maxFailedPages = failedChunks.length > 0
    ? Math.max(...failedChunks.map((c) => c.endPage - c.startPage + 1))
    : originalPagesPerChunk;

  const [retryPagesPerChunk, setRetryPagesPerChunk] = useState(
    Math.max(1, Math.floor(maxFailedPages / 2))
  );

  const content = (
    <div className="space-y-3">
      {/* progress bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={status.variant}>{status.label}</Badge>
          <span className="text-xs text-muted-foreground">
            {completed}/{total} 完成
            {failed > 0 && <span className="text-destructive ml-2">{failed} 失败</span>}
          </span>
        </div>
        {hasFailed && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRetry(retryPagesPerChunk)}
            disabled={retrying}
            className="h-7 text-xs"
          >
            <RefreshCw className={`h-3 w-3 ${retrying ? "animate-spin" : ""}`} />
            重试失败块
          </Button>
        )}
      </div>
      <Progress value={progress} className="h-2" />

      {/* retry config */}
      {hasFailed && (
        <div className="rounded-md bg-muted/50 p-2.5 space-y-1.5">
          <p className="text-xs text-muted-foreground">
            {failed} 个块失败（最大 {maxFailedPages} 页/块），可减小页数后重试
          </p>
          <div className="flex items-center gap-2">
            <Label className="text-xs whitespace-nowrap">每块页数</Label>
            <Input
              type="number"
              className="w-20 h-7 text-xs"
              value={retryPagesPerChunk}
              onChange={(e) =>
                setRetryPagesPerChunk(Math.max(1, Math.min(100, Number(e.target.value))))
              }
              min={1}
              max={100}
            />
            <span className="text-xs text-muted-foreground">(原: {originalPagesPerChunk})</span>
          </div>
        </div>
      )}

      {/* error report (collapsible) */}
      {task.errorReport && (
        <div>
          <button
            className="flex items-center gap-1 text-xs text-destructive hover:underline cursor-pointer"
            onClick={() => setShowErrorReport(!showErrorReport)}
          >
            {showErrorReport ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            错误报告
          </button>
          {showErrorReport && (
            <pre className="mt-1 rounded-md bg-destructive/10 p-2.5 text-xs text-destructive whitespace-pre-wrap max-h-[200px] overflow-y-auto">
              {task.errorReport}
            </pre>
          )}
        </div>
      )}

      {/* chunk table */}
      {chunks.length > 0 && (
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-2.5 py-1.5 font-medium">页码</th>
                <th className="text-center px-2.5 py-1.5 font-medium">状态</th>
                <th className="text-center px-2.5 py-1.5 font-medium">重试</th>
                <th className="text-left px-2.5 py-1.5 font-medium">错误</th>
              </tr>
            </thead>
            <tbody>
              {chunks.map((chunk) => {
                const cs = statusMap[chunk.status] ?? statusMap.pending;
                return (
                  <tr key={chunk.id} className="border-b last:border-0">
                    <td className="px-2.5 py-1.5">
                      p{chunk.startPage + 1}-{chunk.endPage + 1}
                    </td>
                    <td className="px-2.5 py-1.5 text-center">
                      <Badge variant={cs.variant} className="text-[10px] px-1.5 py-0">
                        {cs.label}
                      </Badge>
                    </td>
                    <td className="px-2.5 py-1.5 text-center">{chunk.retryCount}</td>
                    <td className="px-2.5 py-1.5 text-muted-foreground truncate max-w-[180px]">
                      {chunk.errorMessage || "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  if (embedded) return content;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">提取进度</CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}
