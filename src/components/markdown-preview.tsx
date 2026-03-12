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
  filename?: string;
  embedded?: boolean;
}

interface ResultMeta {
  status: string;
  failedPages: string[];
  completedPages: string[];
}

export function MarkdownPreview({ documentId, taskId, filename, embedded }: Props) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [meta, setMeta] = useState<ResultMeta | null>(null);
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
        if (data) setMeta({
          status: data.status,
          failedPages: data.failedPages ?? [],
          completedPages: data.completedPages ?? [],
        });
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
    a.download = filename ?? "extracted.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    const placeholder = <div className="py-8 text-center text-muted-foreground text-sm">加载中...</div>;
    if (embedded) return placeholder;
    return <Card><CardContent>{placeholder}</CardContent></Card>;
  }

  if (!markdown) {
    const placeholder = <div className="py-8 text-center text-muted-foreground text-sm">暂无提取结果</div>;
    if (embedded) return placeholder;
    return <Card><CardContent>{placeholder}</CardContent></Card>;
  }

  const toolbar = (
    <div className="flex items-center justify-between flex-shrink-0">
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
      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="sm" onClick={handleCopy} className="h-7 text-xs">
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "已复制" : "复制"}
        </Button>
        <Button variant="outline" size="sm" onClick={handleDownload} className="h-7 text-xs">
          <Download className="h-3 w-3" />
          下载
        </Button>
      </div>
    </div>
  );

  const partialBanner = meta?.status === "partial" && meta.failedPages.length > 0 && (
    <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-2.5 text-xs">
      <p className="font-medium text-amber-700 dark:text-amber-400">
        部分页面提取失败，以下为已成功内容的拼接结果
      </p>
      <p className="text-muted-foreground mt-0.5">
        缺失页码: {meta.failedPages.join(", ")}
      </p>
    </div>
  );

  const body = viewMode === "preview" ? (
    <div className="prose prose-sm max-w-none dark:prose-invert overflow-auto">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </div>
  ) : (
    <pre className="text-sm bg-muted rounded-md p-4 overflow-auto whitespace-pre-wrap">
      {markdown}
    </pre>
  );

  if (embedded) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-shrink-0 space-y-3 p-4 pb-3">
          {toolbar}
          {partialBanner}
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {body}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">提取结果</CardTitle>
          <div className="flex items-center gap-2">
            {toolbar}
          </div>
        </div>
      </CardHeader>
      {partialBanner && <div className="px-6 pb-2">{partialBanner}</div>}
      <CardContent>
        <div className="max-h-[600px] overflow-auto">{body}</div>
      </CardContent>
    </Card>
  );
}
