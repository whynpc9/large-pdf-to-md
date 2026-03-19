"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EngineServerForm } from "@/components/engine-server-form";
import { Plus, Pencil, Trash2, Server } from "lucide-react";
import type { EngineServer } from "@/lib/db/schema";
import type { EngineType } from "@/lib/engines/types";

export default function EnginesPage() {
  const [servers, setServers] = useState<EngineServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editServer, setEditServer] = useState<EngineServer | null>(null);
  const [activeTab, setActiveTab] = useState<EngineType>("mineru");

  const fetchServers = useCallback(async () => {
    try {
      const res = await fetch("/api/engines/servers");
      const data = await res.json();
      setServers(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除此服务器？")) return;
    await fetch(`/api/engines/servers/${id}`, { method: "DELETE" });
    fetchServers();
  };

  const handleEdit = (server: EngineServer) => {
    setEditServer(server);
    setFormOpen(true);
  };

  const handleAdd = () => {
    setEditServer(null);
    setFormOpen(true);
  };

  const renderServerList = (type: EngineType) => {
    const filtered = servers.filter((s) => s.engineType === type);
    if (loading) {
      return <p className="text-center py-8 text-muted-foreground">加载中...</p>;
    }
    if (filtered.length === 0) {
      return (
        <div className="text-center py-8">
          <Server className="mx-auto h-10 w-10 text-muted-foreground/50 mb-2" />
          <p className="text-muted-foreground text-sm">
            暂未配置
            {type === "mineru"
              ? "MinerU"
              : type === "vlm"
                ? "VLM"
                : "OpenDataLoader"}
            服务器
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {filtered.map((server) => {
          const config = (server.config ?? {}) as Record<string, unknown>;
          return (
            <Card key={server.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{server.name}</span>
                      {server.isActive ? (
                        <Badge variant="success" className="text-xs">活跃</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">停用</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {server.baseUrl || "本地执行（未配置 Hybrid URL）"}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {type === "mineru" && (
                        <>
                          <Badge variant="outline" className="text-xs">
                            Backend: {(config.backend as string) ?? "pipeline"}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            每块: {(config.pagesPerChunk as number) ?? 20}页
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            语言: {(config.lang as string) ?? "ch"}
                          </Badge>
                        </>
                      )}
                      {type === "vlm" && (
                        <>
                          <Badge variant="outline" className="text-xs">
                            模型: {(config.modelId as string) ?? "N/A"}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            DPI: {(config.dpi as number) ?? 150}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            每批: {(config.pagesPerBatch as number) ?? 1}页
                          </Badge>
                        </>
                      )}
                      {type === "opendataloader" && (
                        <>
                          <Badge variant="outline" className="text-xs">
                            命令: {(config.command as string) ?? "opendataloader-pdf"}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            Hybrid: {(config.hybrid as string) ?? "off"}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            StructTree: {(config.useStructTree as boolean) ? "on" : "off"}
                          </Badge>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(server)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(server.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">引擎配置</h1>
          <p className="text-sm text-muted-foreground mt-1">
            管理文本提取引擎的服务器配置
          </p>
        </div>
        <Button onClick={handleAdd}>
          <Plus className="h-4 w-4" />
          添加服务器
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as EngineType)}>
        <TabsList>
          <TabsTrigger value="mineru">MinerU (传统OCR)</TabsTrigger>
          <TabsTrigger value="vlm">视觉大模型 (VLM)</TabsTrigger>
          <TabsTrigger value="opendataloader">OpenDataLoader PDF</TabsTrigger>
        </TabsList>
        <TabsContent value="mineru">{renderServerList("mineru")}</TabsContent>
        <TabsContent value="vlm">{renderServerList("vlm")}</TabsContent>
        <TabsContent value="opendataloader">{renderServerList("opendataloader")}</TabsContent>
      </Tabs>

      <EngineServerForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={fetchServers}
        editServer={editServer}
        defaultEngineType={activeTab}
      />
    </div>
  );
}
