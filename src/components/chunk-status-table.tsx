"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw } from "lucide-react";
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
  onRetry: () => void;
  retrying: boolean;
}

export function ChunkStatusTable({ task, chunks, onRetry, retrying }: Props) {
  if (!task) return null;

  const status = statusMap[task.status] ?? statusMap.pending;
  const total = task.totalChunks ?? 0;
  const completed = task.completedChunks ?? 0;
  const failed = task.failedChunks ?? 0;
  const progress = total > 0 ? ((completed + failed) / total) * 100 : 0;
  const hasFailed = chunks.some((c) => c.status === "failed");

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">提取进度</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={status.variant}>{status.label}</Badge>
            {hasFailed && (
              <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying}>
                <RefreshCw className={`h-3 w-3 ${retrying ? "animate-spin" : ""}`} />
                重试失败块
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>进度: {completed}/{total} 完成</span>
            {failed > 0 && <span className="text-destructive">{failed} 失败</span>}
          </div>
          <Progress value={progress} />
        </div>

        {task.errorReport && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <p className="font-medium mb-1">错误报告:</p>
            <pre className="whitespace-pre-wrap text-xs">{task.errorReport}</pre>
          </div>
        )}

        {chunks.length > 0 && (
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-3 py-2 text-xs font-medium">块</th>
                  <th className="text-left px-3 py-2 text-xs font-medium">页码范围</th>
                  <th className="text-center px-3 py-2 text-xs font-medium">状态</th>
                  <th className="text-center px-3 py-2 text-xs font-medium">重试次数</th>
                  <th className="text-left px-3 py-2 text-xs font-medium">错误信息</th>
                </tr>
              </thead>
              <tbody>
                {chunks.map((chunk) => {
                  const cs = statusMap[chunk.status] ?? statusMap.pending;
                  return (
                    <tr key={chunk.id} className="border-b last:border-0">
                      <td className="px-3 py-2">#{chunk.chunkIndex}</td>
                      <td className="px-3 py-2">
                        {chunk.startPage} - {chunk.endPage}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Badge variant={cs.variant} className="text-xs">
                          {cs.label}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-center">{chunk.retryCount}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[200px]">
                        {chunk.errorMessage || "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
