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
import {
  DEFAULT_MINERU_CONFIG,
  DEFAULT_OPENDATALOADER_CONFIG,
  DEFAULT_VLM_CONFIG,
} from "@/lib/engines/types";

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

  const [openDataLoaderConfig, setOpenDataLoaderConfig] = useState({
    command: DEFAULT_OPENDATALOADER_CONFIG.command,
    hybrid: DEFAULT_OPENDATALOADER_CONFIG.hybrid,
    hybridMode: DEFAULT_OPENDATALOADER_CONFIG.hybridMode,
    useStructTree: DEFAULT_OPENDATALOADER_CONFIG.useStructTree,
    keepLineBreaks: DEFAULT_OPENDATALOADER_CONFIG.keepLineBreaks,
    hybridTimeoutMs: DEFAULT_OPENDATALOADER_CONFIG.hybridTimeoutMs,
    hybridFallback: DEFAULT_OPENDATALOADER_CONFIG.hybridFallback,
    maxRetries: DEFAULT_OPENDATALOADER_CONFIG.maxRetries,
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
      const config =
        engineType === "mineru"
          ? mineruConfig
          : engineType === "vlm"
            ? vlmConfig
            : openDataLoaderConfig;
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
  }, [
    serverId,
    engineType,
    mineruConfig,
    vlmConfig,
    openDataLoaderConfig,
    documentId,
    onExtractionStarted,
  ]);

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
              { value: "opendataloader", label: "OpenDataLoader PDF" },
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

      {engineType === "opendataloader" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">CLI 命令</Label>
            <Input
              value={openDataLoaderConfig.command}
              onChange={(e) =>
                setOpenDataLoaderConfig((c) => ({ ...c, command: e.target.value }))
              }
              placeholder="opendataloader-pdf"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hybrid</Label>
            <Select
              value={openDataLoaderConfig.hybrid}
              onChange={(e) =>
                setOpenDataLoaderConfig((c) => ({
                  ...c,
                  hybrid: e.target.value as "off" | "docling-fast",
                }))
              }
              options={[
                { value: "off", label: "关闭（本地模式）" },
                { value: "docling-fast", label: "docling-fast" },
              ]}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hybrid 模式</Label>
            <Select
              value={openDataLoaderConfig.hybridMode}
              onChange={(e) =>
                setOpenDataLoaderConfig((c) => ({
                  ...c,
                  hybridMode: e.target.value as "auto" | "full",
                }))
              }
              options={[
                { value: "auto", label: "Auto" },
                { value: "full", label: "Full" },
              ]}
              disabled={openDataLoaderConfig.hybrid === "off"}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">使用结构树</Label>
            <Select
              value={String(openDataLoaderConfig.useStructTree)}
              onChange={(e) =>
                setOpenDataLoaderConfig((c) => ({
                  ...c,
                  useStructTree: e.target.value === "true",
                }))
              }
              options={[
                { value: "false", label: "否" },
                { value: "true", label: "是" },
              ]}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">保留换行</Label>
            <Select
              value={String(openDataLoaderConfig.keepLineBreaks)}
              onChange={(e) =>
                setOpenDataLoaderConfig((c) => ({
                  ...c,
                  keepLineBreaks: e.target.value === "true",
                }))
              }
              options={[
                { value: "false", label: "否" },
                { value: "true", label: "是" },
              ]}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hybrid 超时 (ms)</Label>
            <Input
              type="number"
              value={openDataLoaderConfig.hybridTimeoutMs}
              onChange={(e) =>
                setOpenDataLoaderConfig((c) => ({
                  ...c,
                  hybridTimeoutMs: Number(e.target.value),
                }))
              }
              min={1000}
              step={1000}
              disabled={openDataLoaderConfig.hybrid === "off"}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">失败时回退本地</Label>
            <Select
              value={String(openDataLoaderConfig.hybridFallback)}
              onChange={(e) =>
                setOpenDataLoaderConfig((c) => ({
                  ...c,
                  hybridFallback: e.target.value === "true",
                }))
              }
              options={[
                { value: "false", label: "否" },
                { value: "true", label: "是" },
              ]}
              disabled={openDataLoaderConfig.hybrid === "off"}
            />
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">最大重试</Label>
            <Input
              type="number"
              value={openDataLoaderConfig.maxRetries}
              onChange={(e) =>
                setOpenDataLoaderConfig((c) => ({
                  ...c,
                  maxRetries: Number(e.target.value),
                }))
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
