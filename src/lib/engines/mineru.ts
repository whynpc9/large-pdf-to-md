import type { MinerUConfig } from "./types";

interface MinerUResponse {
  backend: string;
  version: string;
  results: Record<string, { md_content?: string }>;
}

export async function extractWithMinerU(
  baseUrl: string,
  pdfBuffer: Buffer,
  filename: string,
  config: MinerUConfig
): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, "")}/file_parse`;

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(pdfBuffer)], { type: "application/pdf" });
  formData.append("files", blob, filename);
  formData.append("backend", config.backend);
  formData.append("lang_list", config.lang);
  formData.append("return_md", "true");
  formData.append("return_images", "false");
  formData.append("start_page_id", "0");
  formData.append("end_page_id", "99999");

  const response = await fetch(url, {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(600_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`MinerU API error ${response.status}: ${text}`);
  }

  const json: MinerUResponse = await response.json();
  const stem = filename.replace(/\.pdf$/i, "");
  const result = json.results?.[stem];

  if (!result?.md_content) {
    throw new Error(`MinerU returned no markdown content for ${filename}`);
  }

  return result.md_content;
}
