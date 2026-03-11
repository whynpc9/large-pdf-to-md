"use client";

import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check, Download } from "lucide-react";

interface Props {
  documentId: string;
  taskId?: string;
}

export function MarkdownPreview({ documentId, taskId }: Props) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<"preview" | "source">("preview");

  useEffect(() => {
    const url = taskId
      ? `/api/documents/${documentId}/result?taskId=${taskId}`
      : `/api/documents/${documentId}/result`;

    fetch(url)
      .then((r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((data) => {
        if (data?.markdown) setMarkdown(data.markdown);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [documentId, taskId]);

  const handleCopy = async () => {
    if (!markdown) return;
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!markdown) return;
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "extracted.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          加载中...
        </CardContent>
      </Card>
    );
  }

  if (!markdown) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          暂无提取结果
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">提取结果</CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex border rounded-md">
              <button
                className={`px-3 py-1 text-xs cursor-pointer ${viewMode === "preview" ? "bg-muted" : ""}`}
                onClick={() => setViewMode("preview")}
              >
                预览
              </button>
              <button
                className={`px-3 py-1 text-xs cursor-pointer ${viewMode === "source" ? "bg-muted" : ""}`}
                onClick={() => setViewMode("source")}
              >
                源码
              </button>
            </div>
            <Button variant="outline" size="sm" onClick={handleCopy}>
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "已复制" : "复制"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="h-3 w-3" />
              下载
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {viewMode === "preview" ? (
          <div className="prose prose-sm max-w-none dark:prose-invert overflow-auto max-h-[600px]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
          </div>
        ) : (
          <pre className="text-sm bg-muted rounded-md p-4 overflow-auto max-h-[600px] whitespace-pre-wrap">
            {markdown}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
