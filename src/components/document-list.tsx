"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DocumentUploadDialog } from "@/components/document-upload-dialog";
import { Plus, Trash2, FileText, Eye, Play } from "lucide-react";
import { formatFileSize, formatDate } from "@/lib/utils";
import type { Document } from "@/lib/db/schema";

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" | "info" }> = {
  uploaded: { label: "已上传", variant: "secondary" },
  processing: { label: "处理中", variant: "info" },
  completed: { label: "已完成", variant: "success" },
  partial: { label: "部分完成", variant: "warning" },
  failed: { label: "失败", variant: "destructive" },
};

export function DocumentList() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch("/api/documents");
      const data = await res.json();
      setDocuments(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
    const interval = setInterval(fetchDocuments, 5000);
    return () => clearInterval(interval);
  }, [fetchDocuments]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("确定要删除此文档吗？")) return;
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
    fetchDocuments();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">文档管理</h1>
          <p className="text-sm text-muted-foreground mt-1">
            上传 PDF 文档并提取文本内容为 Markdown
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)}>
          <Plus className="h-4 w-4" />
          上传文档
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">加载中...</div>
      ) : documents.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">暂无文档，点击上方按钮上传</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 text-sm font-medium">文档名称</th>
                <th className="text-left px-4 py-3 text-sm font-medium">文件名</th>
                <th className="text-right px-4 py-3 text-sm font-medium">页数</th>
                <th className="text-right px-4 py-3 text-sm font-medium">大小</th>
                <th className="text-center px-4 py-3 text-sm font-medium">状态</th>
                <th className="text-left px-4 py-3 text-sm font-medium">上传时间</th>
                <th className="text-right px-4 py-3 text-sm font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => {
                const status = statusMap[doc.status] ?? statusMap.uploaded;
                return (
                  <tr key={doc.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/documents/${doc.id}`}
                        className="font-medium text-sm hover:underline"
                      >
                        {doc.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {doc.originalFilename}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {doc.pageCount ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {formatFileSize(doc.fileSize)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {formatDate(doc.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {doc.status === "uploaded" && (
                          <Link href={`/documents/${doc.id}?autoExtract=true`}>
                            <Button variant="ghost" size="sm" title="开始提取" className="gap-1 text-primary">
                              <Play className="h-3.5 w-3.5" />
                              开始提取
                            </Button>
                          </Link>
                        )}
                        <Link href={`/documents/${doc.id}`}>
                          <Button variant="ghost" size="icon" title="查看详情">
                            <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => handleDelete(doc.id, e)}
                          title="删除文档"
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <DocumentUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={fetchDocuments}
      />
    </div>
  );
}
