"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { EngineServer } from "@/lib/db/schema";
import type { EngineType } from "@/lib/engines/types";
import { DEFAULT_MINERU_CONFIG, DEFAULT_VLM_CONFIG } from "@/lib/engines/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editServer?: EngineServer | null;
  defaultEngineType?: EngineType;
}

export function EngineServerForm({
  open,
  onOpenChange,
  onSaved,
  editServer,
  defaultEngineType = "mineru",
}: Props) {
  const isEdit = !!editServer;
  const [engineType, setEngineType] = useState<EngineType>(
    (editServer?.engineType as EngineType) ?? defaultEngineType
  );
  const [name, setName] = useState(editServer?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(editServer?.baseUrl ?? "");
  const [saving, setSaving] = useState(false);

  const existingConfig = (editServer?.config ?? {}) as Record<string, unknown>;

  const [mineruBackend, setMineruBackend] = useState(
    (existingConfig.backend as string) ?? DEFAULT_MINERU_CONFIG.backend
  );
  const [mineruPagesPerChunk, setMineruPagesPerChunk] = useState(
    (existingConfig.pagesPerChunk as number) ?? DEFAULT_MINERU_CONFIG.pagesPerChunk
  );
  const [mineruLang, setMineruLang] = useState(
    (existingConfig.lang as string) ?? DEFAULT_MINERU_CONFIG.lang
  );
  const [mineruMaxRetries, setMineruMaxRetries] = useState(
    (existingConfig.maxRetries as number) ?? DEFAULT_MINERU_CONFIG.maxRetries
  );

  const [vlmModelId, setVlmModelId] = useState(
    (existingConfig.modelId as string) ?? DEFAULT_VLM_CONFIG.modelId
  );
  const [vlmDpi, setVlmDpi] = useState(
    (existingConfig.dpi as number) ?? DEFAULT_VLM_CONFIG.dpi
  );
  const [vlmPagesPerBatch, setVlmPagesPerBatch] = useState(
    (existingConfig.pagesPerBatch as number) ?? DEFAULT_VLM_CONFIG.pagesPerBatch
  );
  const [vlmMaxRetries, setVlmMaxRetries] = useState(
    (existingConfig.maxRetries as number) ?? DEFAULT_VLM_CONFIG.maxRetries
  );
  const [vlmSystemPrompt, setVlmSystemPrompt] = useState(
    (existingConfig.systemPrompt as string) ?? DEFAULT_VLM_CONFIG.systemPrompt
  );

  const handleSave = async () => {
    if (!name || !baseUrl) return;
    setSaving(true);

    const config =
      engineType === "mineru"
        ? {
            backend: mineruBackend,
            pagesPerChunk: mineruPagesPerChunk,
            lang: mineruLang,
            maxRetries: mineruMaxRetries,
          }
        : {
            modelId: vlmModelId,
            dpi: vlmDpi,
            pagesPerBatch: vlmPagesPerBatch,
            maxRetries: vlmMaxRetries,
            systemPrompt: vlmSystemPrompt,
          };

    try {
      const url = isEdit
        ? `/api/engines/servers/${editServer.id}`
        : "/api/engines/servers";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engineType, name, baseUrl, config }),
      });
      if (!res.ok) throw new Error("Save failed");
      onOpenChange(false);
      onSaved();
    } catch {
      alert("保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)} className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑服务器" : "添加服务器"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!isEdit && (
            <div className="space-y-2">
              <Label>引擎类型</Label>
              <Select
                value={engineType}
                onChange={(e) => setEngineType(e.target.value as EngineType)}
                options={[
                  { value: "mineru", label: "MinerU (传统OCR)" },
                  { value: "vlm", label: "视觉大模型 (VLM)" },
                ]}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>服务器名称</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：MinerU 主服务器" />
          </div>

          <div className="space-y-2">
            <Label>服务地址 (Base URL)</Label>
            <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://your-mineru-host:8523" />
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-3">引擎参数配置</p>

            {engineType === "mineru" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Backend</Label>
                  <Select
                    value={mineruBackend}
                    onChange={(e) => setMineruBackend(e.target.value)}
                    options={[
                      { value: "pipeline", label: "Pipeline" },
                      { value: "hybrid-auto-engine", label: "Hybrid Auto" },
                      { value: "vlm-auto-engine", label: "VLM Auto" },
                    ]}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">每块页数</Label>
                  <Input
                    type="number"
                    value={mineruPagesPerChunk}
                    onChange={(e) => setMineruPagesPerChunk(Number(e.target.value))}
                    min={1}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">语言</Label>
                  <Select
                    value={mineruLang}
                    onChange={(e) => setMineruLang(e.target.value)}
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
                    value={mineruMaxRetries}
                    onChange={(e) => setMineruMaxRetries(Number(e.target.value))}
                    min={0}
                  />
                </div>
              </div>
            )}

            {engineType === "vlm" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">模型 ID</Label>
                    <Input value={vlmModelId} onChange={(e) => setVlmModelId(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">DPI (最大200)</Label>
                    <Input
                      type="number"
                      value={vlmDpi}
                      onChange={(e) => setVlmDpi(Math.min(200, Number(e.target.value)))}
                      min={72}
                      max={200}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">每批页数</Label>
                    <Input
                      type="number"
                      value={vlmPagesPerBatch}
                      onChange={(e) => setVlmPagesPerBatch(Number(e.target.value))}
                      min={1}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">最大重试</Label>
                    <Input
                      type="number"
                      value={vlmMaxRetries}
                      onChange={(e) => setVlmMaxRetries(Number(e.target.value))}
                      min={0}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">系统 Prompt</Label>
                  <Textarea
                    value={vlmSystemPrompt}
                    onChange={(e) => setVlmSystemPrompt(e.target.value)}
                    rows={6}
                    className="text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            <Button onClick={handleSave} disabled={!name || !baseUrl || saving}>
              {saving ? "保存中..." : "保存"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
