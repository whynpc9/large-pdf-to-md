import OpenAI from "openai";
import type { VLMConfig } from "./types";

export async function extractWithVLM(
  baseUrl: string,
  imageUrls: string[],
  config: VLMConfig
): Promise<string> {
  const client = new OpenAI({
    baseURL: `${baseUrl.replace(/\/$/, "")}/v1`,
    apiKey: "not-needed",
  });

  const imageContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] =
    imageUrls.map((url) => ({
      type: "image_url" as const,
      image_url: { url, detail: "high" as const },
    }));

  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    ...imageContent,
    {
      type: "text" as const,
      text:
        imageUrls.length === 1
          ? "请提取这个文档页面中的所有文本内容，转换为Markdown格式。"
          : `请按顺序提取这${imageUrls.length}个文档页面中的所有文本内容，转换为Markdown格式。`,
    },
  ];

  const response = await client.chat.completions.create({
    model: config.modelId,
    messages: [
      { role: "system", content: config.systemPrompt },
      { role: "user", content: userContent },
    ],
    max_tokens: 8192,
    temperature: 0.1,
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("VLM returned empty response");
  }

  return cleanMarkdownResponse(content);
}

function cleanMarkdownResponse(content: string): string {
  let cleaned = content.trim();
  if (cleaned.startsWith("```markdown")) {
    cleaned = cleaned.slice("```markdown".length);
  } else if (cleaned.startsWith("```md")) {
    cleaned = cleaned.slice("```md".length);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}
