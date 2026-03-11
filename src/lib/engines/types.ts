export type EngineType = "mineru" | "vlm";

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

export function getMinerUConfig(config: Record<string, unknown>): MinerUConfig {
  return {
    backend: (config.backend as string) ?? DEFAULT_MINERU_CONFIG.backend,
    pagesPerChunk: (config.pagesPerChunk as number) ?? DEFAULT_MINERU_CONFIG.pagesPerChunk,
    maxRetries: (config.maxRetries as number) ?? DEFAULT_MINERU_CONFIG.maxRetries,
    lang: (config.lang as string) ?? DEFAULT_MINERU_CONFIG.lang,
  };
}

export function getVLMConfig(config: Record<string, unknown>): VLMConfig {
  return {
    modelId: (config.modelId as string) ?? DEFAULT_VLM_CONFIG.modelId,
    dpi: (config.dpi as number) ?? DEFAULT_VLM_CONFIG.dpi,
    pagesPerBatch: (config.pagesPerBatch as number) ?? DEFAULT_VLM_CONFIG.pagesPerBatch,
    maxRetries: (config.maxRetries as number) ?? DEFAULT_VLM_CONFIG.maxRetries,
    systemPrompt: (config.systemPrompt as string) ?? DEFAULT_VLM_CONFIG.systemPrompt,
  };
}
