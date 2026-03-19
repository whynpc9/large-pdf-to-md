export type EngineType = "mineru" | "vlm" | "opendataloader";

export interface MinerUConfig {
  backend: string;
  pagesPerChunk: number;
  maxRetries: number;
  lang: string;
}

export interface VLMConfig {
  modelId: string;
  dpi: number;
  pagesPerBatch: number;
  maxRetries: number;
  systemPrompt: string;
}

export interface OpenDataLoaderConfig {
  command: string;
  hybrid: "off" | "docling-fast";
  hybridMode: "auto" | "full";
  useStructTree: boolean;
  keepLineBreaks: boolean;
  hybridTimeoutMs: number;
  hybridFallback: boolean;
  maxRetries: number;
}

export const DEFAULT_MINERU_CONFIG: MinerUConfig = {
  backend: "pipeline",
  pagesPerChunk: 20,
  maxRetries: 3,
  lang: "ch",
};

export const DEFAULT_VLM_CONFIG: VLMConfig = {
  modelId: "Qwen/Qwen3-VL-4B-Instruct",
  dpi: 150,
  pagesPerBatch: 1,
  maxRetries: 3,
  systemPrompt: `你是一个文档文本提取助手。你的任务是从给定的文档页面图片中准确提取所有文本内容，并转换为格式良好的Markdown文本。

规则：
1. 保留文档结构，包括标题、段落、列表和表格
2. 将表格转换为Markdown表格格式
3. 将数学公式保留为LaTeX格式（使用 $...$ 表示行内公式，$$...$$ 表示块级公式）
4. 保持内容的阅读顺序
5. 不要添加原始文档中不存在的任何内容
6. 仅输出提取的Markdown文本，不要附加任何额外的解释说明`,
};

export const DEFAULT_OPENDATALOADER_CONFIG: OpenDataLoaderConfig = {
  command: "opendataloader-pdf",
  hybrid: "off",
  hybridMode: "auto",
  useStructTree: false,
  keepLineBreaks: false,
  hybridTimeoutMs: 30_000,
  hybridFallback: false,
  maxRetries: 2,
};

function getString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function getNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function getMinerUConfig(config: Record<string, unknown>): MinerUConfig {
  return {
    backend: getString(config.backend, DEFAULT_MINERU_CONFIG.backend),
    pagesPerChunk: getNumber(config.pagesPerChunk, DEFAULT_MINERU_CONFIG.pagesPerChunk),
    maxRetries: getNumber(config.maxRetries, DEFAULT_MINERU_CONFIG.maxRetries),
    lang: getString(config.lang, DEFAULT_MINERU_CONFIG.lang),
  };
}

export function getVLMConfig(config: Record<string, unknown>): VLMConfig {
  return {
    modelId: getString(config.modelId, DEFAULT_VLM_CONFIG.modelId),
    dpi: getNumber(config.dpi, DEFAULT_VLM_CONFIG.dpi),
    pagesPerBatch: getNumber(config.pagesPerBatch, DEFAULT_VLM_CONFIG.pagesPerBatch),
    maxRetries: getNumber(config.maxRetries, DEFAULT_VLM_CONFIG.maxRetries),
    systemPrompt: getString(config.systemPrompt, DEFAULT_VLM_CONFIG.systemPrompt),
  };
}

export function getOpenDataLoaderConfig(
  config: Record<string, unknown>
): OpenDataLoaderConfig {
  return {
    command: getString(config.command, DEFAULT_OPENDATALOADER_CONFIG.command),
    hybrid:
      config.hybrid === "docling-fast"
        ? "docling-fast"
        : DEFAULT_OPENDATALOADER_CONFIG.hybrid,
    hybridMode:
      config.hybridMode === "full"
        ? "full"
        : DEFAULT_OPENDATALOADER_CONFIG.hybridMode,
    useStructTree: getBoolean(
      config.useStructTree,
      DEFAULT_OPENDATALOADER_CONFIG.useStructTree
    ),
    keepLineBreaks: getBoolean(
      config.keepLineBreaks,
      DEFAULT_OPENDATALOADER_CONFIG.keepLineBreaks
    ),
    hybridTimeoutMs: getNumber(
      config.hybridTimeoutMs,
      DEFAULT_OPENDATALOADER_CONFIG.hybridTimeoutMs
    ),
    hybridFallback: getBoolean(
      config.hybridFallback,
      DEFAULT_OPENDATALOADER_CONFIG.hybridFallback
    ),
    maxRetries: getNumber(config.maxRetries, DEFAULT_OPENDATALOADER_CONFIG.maxRetries),
  };
}
