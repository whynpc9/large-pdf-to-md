"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";

interface Props {
  documentId: string;
}

export function PdfViewer({ documentId }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/documents/${documentId}/presigned-url`)
      .then((r) => r.json())
      .then((data) => setUrl(data.url))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [documentId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        加载中...
      </div>
    );
  }

  if (!url) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        无法加载 PDF
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <iframe
        src={url}
        className="flex-1 w-full border-0 rounded"
        title="PDF Preview"
      />
    </div>
  );
}
