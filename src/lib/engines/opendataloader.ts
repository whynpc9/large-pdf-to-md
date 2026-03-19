import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { OpenDataLoaderConfig } from "./types";

const execFileAsync = promisify(execFile);

export async function extractWithOpenDataLoader(
  baseUrl: string,
  pdfBuffer: Buffer,
  filename: string,
  config: OpenDataLoaderConfig
): Promise<string> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "opendataloader-"));
  const outputDir = path.join(tempDir, "output");
  const inputPath = path.join(tempDir, filename);

  try {
    await mkdir(outputDir, { recursive: true });
    await writeFile(inputPath, pdfBuffer);

    await runCommand(config.command, buildArgs(inputPath, outputDir, baseUrl, config));

    const markdownPath = await findFirstMarkdownFile(outputDir);
    if (!markdownPath) {
      const files = await listFiles(outputDir);
      throw new Error(
        `OpenDataLoader 未生成 Markdown 输出，输出目录内容: ${files.join(", ") || "(empty)"}`
      );
    }

    const markdown = await readFile(markdownPath, "utf-8");
    if (!markdown.trim()) {
      throw new Error("OpenDataLoader 返回了空 Markdown");
    }

    return markdown.trim();
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function runCommand(command: string, args: string[]) {
  try {
    await execFileAsync(command, args, {
      timeout: 600_000,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    const execError = error as Error & {
      code?: string | number;
      stderr?: string;
      stdout?: string;
    };

    if (execError.code === "ENOENT") {
      throw new Error(`找不到命令 "${command}"，请先安装 opendataloader-pdf CLI`);
    }

    throw new Error(execError.stderr?.trim() || execError.stdout?.trim() || execError.message);
  }
}

function buildArgs(
  inputPath: string,
  outputDir: string,
  baseUrl: string,
  config: OpenDataLoaderConfig
): string[] {
  const args = [
    inputPath,
    "--output-dir",
    outputDir,
    "--format",
    "markdown",
    "--image-output",
    "off",
    "--quiet",
  ];

  if (config.useStructTree) {
    args.push("--use-struct-tree");
  }

  if (config.keepLineBreaks) {
    args.push("--keep-line-breaks");
  }

  if (config.hybrid !== "off") {
    args.push("--hybrid", config.hybrid);
    args.push("--hybrid-mode", config.hybridMode);
    args.push("--hybrid-timeout", String(config.hybridTimeoutMs));

    if (baseUrl.trim()) {
      args.push("--hybrid-url", baseUrl.trim());
    }

    if (config.hybridFallback) {
      args.push("--hybrid-fallback");
    }
  }

  return args;
}

async function findFirstMarkdownFile(dir: string): Promise<string | null> {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findFirstMarkdownFile(fullPath);
      if (nested) return nested;
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      return fullPath;
    }
  }

  return null;
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await listFiles(fullPath);
      files.push(...nested.map((file) => path.join(entry.name, file)));
    } else {
      files.push(path.relative(dir, fullPath));
    }
  }

  return files.sort();
}
