"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Play } from "lucide-react";
import type { EngineServer } from "@/lib/db/schema";
import type { EngineType } from "@/lib/engines/types";
import { DEFAULT_MINERU_CONFIG, DEFAULT_VLM_CONFIG } from "@/lib/engines/types";

interface Props {
  documentId: string;
  autoStart?: boolean;
  onExtractionStarted: () => void;
  embedded?: boolean;
}

export function ExtractionPanel({ documentId, autoStart, onExtractionStarted, embedded }: Props) {
  const [engineType, setEngineType] = useState<EngineType>("mineru");
  const [servers, setServers] = useState<EngineServer[]>([]);
  const [serverId, setServerId] = useState("");
  const [starting, setStarting] = useState(false);
  const autoStartTriggered = useRef(false);

  const [mineruConfig, setMineruConfig] = useState({
    pagesPerChunk: DEFAULT_MINERU_CONFIG.pagesPerChunk,
    backend: DEFAULT_MINERU_CONFIG.backend,
    lang: DEFAULT_MINERU_CONFIG.lang,
    maxRetries: DEFAULT_MINERU_CONFIG.maxRetries,
  });

  const [vlmConfig, setVlmConfig] = useState({
    dpi: DEFAULT_VLM_CONFIG.dpi,
    pagesPerBatch: DEFAULT_VLM_CONFIG.pagesPerBatch,
    maxRetries: DEFAULT_VLM_CONFIG.maxRetries,
  });

  useEffect(() => {
    fetch(`/api/engines/servers?engineType=${engineType}`)
      .then((r) => r.json())
      .then((data: EngineServer[]) => {
        setServers(data);
        if (data.length > 0) setServerId(data[0].id);
        else setServerId("");
      });
  }, [engineType]);

  const handleStart = useCallback(async () => {
    if (!serverId) return;
    setStarting(true);
    try {
      const config = engineType === "mineru" ? mineruConfig : vlmConfig;
      const res = await fetch(`/api/documents/${documentId}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engineType, serverId, config }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to start extraction");
      }
      onExtractionStarted();
    } catch (err) {
      alert(err instanceof Error ? err.message : "启动提取失败");
    } finally {
      setStarting(false);
    }
  }, [serverId, engineType, mineruConfig, vlmConfig, documentId, onExtractionStarted]);

  useEffect(() => {
    if (autoStart && serverId && !autoStartTriggered.current) {
      autoStartTriggered.current = true;
      handleStart();
    }
  }, [autoStart, serverId, handleStart]);

  const content = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">提取引擎</Label>
          <Select
            value={engineType}
            onChange={(e) => setEngineType(e.target.value as EngineType)}
            options={[
              { value: "mineru", label: "MinerU (传统OCR)" },
              { value: "vlm", label: "视觉大模型 (VLM)" },
            ]}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">服务器</Label>
          {servers.length > 0 ? (
            <Select
              value={serverId}
              onChange={(e) => setServerId(e.target.value)}
              options={servers.map((s) => ({
                value: s.id,
                label: `${s.name}`,
              }))}
            />
          ) : (
            <p className="text-xs text-muted-foreground pt-1">
              未配置，请先在
              <a href="/engines" className="text-primary underline ml-1">引擎配置</a>
              中添加
            </p>
          )}
        </div>
      </div>

      {engineType === "mineru" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">每块页数</Label>
            <Input
              type="number"
              value={mineruConfig.pagesPerChunk}
              onChange={(e) =>
                setMineruConfig((c) => ({ ...c, pagesPerChunk: Number(e.target.value) }))
              }
              min={1}
              max={100}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Backend</Label>
            <Select
              value={mineruConfig.backend}
              onChange={(e) =>
                setMineruConfig((c) => ({ ...c, backend: e.target.value }))
              }
              options={[
                { value: "pipeline", label: "Pipeline" },
                { value: "hybrid-auto-engine", label: "Hybrid Auto" },
                { value: "vlm-auto-engine", label: "VLM Auto" },
              ]}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">语言</Label>
            <Select
              value={mineruConfig.lang}
              onChange={(e) =>
                setMineruConfig((c) => ({ ...c, lang: e.target.value }))
              }
              options={[
                { value: "ch", label: "中文" },
                { value: "en", label: "English" },
                { value: "japan", label: "日本語" },
                { value: "korean", label: "한국어" },
              ]}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">最大重试</Label>
            <Input
              type="number"
              value={mineruConfig.maxRetries}
              onChange={(e) =>
                setMineruConfig((c) => ({ ...c, maxRetries: Number(e.target.value) }))
              }
              min={0}
              max={10}
            />
          </div>
        </div>
      )}

      {engineType === "vlm" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">DPI</Label>
            <Input
              type="number"
              value={vlmConfig.dpi}
              onChange={(e) =>
                setVlmConfig((c) => ({ ...c, dpi: Math.min(200, Number(e.target.value)) }))
              }
              min={72}
              max={200}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">每批页数</Label>
            <Input
              type="number"
              value={vlmConfig.pagesPerBatch}
              onChange={(e) =>
                setVlmConfig((c) => ({ ...c, pagesPerBatch: Number(e.target.value) }))
              }
              min={1}
              max={10}
            />
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">最大重试</Label>
            <Input
              type="number"
              value={vlmConfig.maxRetries}
              onChange={(e) =>
                setVlmConfig((c) => ({ ...c, maxRetries: Number(e.target.value) }))
              }
              min={0}
              max={10}
            />
          </div>
        </div>
      )}

      <Button
        className="w-full"
        onClick={handleStart}
        disabled={!serverId || starting}
      >
        <Play className="h-4 w-4" />
        {starting ? "启动中..." : "开始提取"}
      </Button>
    </div>
  );

  if (embedded) return content;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">文本提取</CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}
