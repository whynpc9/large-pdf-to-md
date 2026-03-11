# PDF to Markdown

将大型 PDF 文档转换为 Markdown 文本的 Web 应用。支持两种提取引擎：MinerU（传统 OCR）和兼容 OpenAI API 的视觉大模型（如 Qwen-VL）。

核心能力：对大型 PDF 自动分块处理，逐块提取后合并结果，支持断点恢复和失败重试。

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 16 (App Router, Turbopack) |
| 数据库 | PostgreSQL 16 + Drizzle ORM |
| 对象存储 | MinIO (S3 兼容) |
| OCR 引擎 | MinerU (FastAPI `/file_parse`) |
| 视觉大模型 | Qwen-VL 等 (vLLM, OpenAI API 兼容) |
| UI | Tailwind CSS 4 + shadcn/ui 风格组件 |

## 项目结构

```
src/
├── app/
│   ├── documents/          # 文档管理页面
│   │   └── [id]/           # 文档详情（PDF 预览 + 提取控制）
│   ├── engines/            # 引擎服务器配置页面
│   └── api/
│       ├── documents/      # 文档 CRUD、提取触发、进度查询、结果获取
│       └── engines/        # 引擎服务器 CRUD
├── lib/
│   ├── db/                 # Drizzle schema + 连接
│   ├── engines/            # MinerU / VLM 引擎客户端
│   ├── extraction/         # 分块提取流水线
│   ├── minio.ts            # MinIO 客户端封装
│   └── pdf-utils.ts        # PDF 拆分、页数统计、转 PNG
└── components/             # React UI 组件
```

## 快速开始

### 前置依赖

- Node.js >= 20
- Docker (用于 PostgreSQL)
- poppler-utils（VLM 引擎需要 `pdftoppm` 将 PDF 转为 PNG）

```bash
# macOS
brew install poppler

# Ubuntu/Debian
sudo apt install poppler-utils
```

### 1. 安装依赖

```bash
npm install
```

### 2. 启动 PostgreSQL

```bash
docker compose up -d
```

### 3. 配置环境变量

编辑 `.env.local`，根据实际环境修改：

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pdf_to_md

MINIO_ENDPOINT=your-minio-host
MINIO_PORT=8090          # 必须是 S3 API 端口，非 Console 端口
MINIO_ACCESS_KEY=your-access-key
MINIO_SECRET_KEY=your-secret-key
MINIO_BUCKET=ocr-workspace
MINIO_USE_SSL=false
```

> **注意**：`MINIO_PORT` 必须指向 MinIO 的 S3 API 端口。如果 Console 在 `:8090`，S3 API 通常在 `:9000`。

### 4. 初始化数据库

```bash
npm run db:push
```

### 5. 启动开发服务器

```bash
npm run dev
```

打开 http://localhost:3000 即可使用。

## 使用流程

### 配置引擎服务器

进入 **引擎配置** 页面（`/engines`），为每种引擎添加至少一个服务器：

**MinerU 服务器配置：**
- Base URL: MinerU FastAPI 服务地址（如 `http://your-mineru-host:8523`）
- Backend: `pipeline` / `hybrid-auto-engine` / `vlm-auto-engine`
- 每块页数: 大 PDF 拆分为多少页一块（默认 20）
- 语言: OCR 识别语言

**VLM 服务器配置：**
- Base URL: vLLM 服务地址（如 `http://your-vllm-host:8101`）
- 模型 ID: 如 `Qwen/Qwen3-VL-4B-Instruct`
- DPI: PDF 转 PNG 的分辨率（最大 200）
- 每批页数: 每次 API 调用处理的页数

### 上传并提取文档

1. 在 **文档管理** 页面上传 PDF
2. 点击文档进入详情页
3. 左侧为 PDF 在线预览，右侧选择引擎和服务器
4. 调整参数后点击 **开始提取**
5. 下方实时显示分块处理进度
6. 处理完成后查看 Markdown 结果，支持预览/源码切换、复制、下载

### 失败重试

提取过程中失败的分块会被记录。进度面板会显示错误报告，点击 **重试失败块** 即可重新处理。

## 提取引擎工作原理

### MinerU（传统 OCR）

```
原始 PDF → 按 N 页拆分为多个小 PDF → 逐块 POST 到 MinerU /file_parse → 合并 Markdown
```

大文件直接发送会导致 MinerU 服务崩溃，因此必须先拆分。每块作为独立 PDF 文件上传至 MinIO 后发送给 MinerU。

### 视觉大模型（VLM）

```
原始 PDF → 逐页转换为 PNG → 上传到 MinIO → 生成 presigned URL → 调用 VLM Chat API → 合并 Markdown
```

每页图片通过 MinIO presigned URL 提供给 vLLM 服务访问。系统 Prompt 引导模型保留文档结构、表格、公式等格式。

## MinIO 存储结构

```
ocr-workspace/
└── documents/{document_id}/
    ├── original.pdf            # 原始上传文件
    ├── chunks/
    │   ├── chunk_000.pdf       # MinerU 用的拆分 PDF
    │   └── ...
    ├── pages/
    │   ├── page_000.png        # VLM 用的页面图片
    │   └── ...
    └── results/
        ├── chunk_000.md        # 各块提取结果
        └── merged.md           # 合并后的最终结果
```

## 数据库表

| 表 | 说明 |
|----|------|
| `documents` | PDF 文档元数据（名称、大小、页数、状态、MinIO 路径） |
| `engine_servers` | 引擎服务器配置（类型、地址、参数） |
| `extraction_tasks` | 提取任务（关联文档和服务器，跟踪整体进度） |
| `chunks` | 分块记录（页码范围、状态、重试次数、结果内容） |

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/documents` | 文档列表 |
| POST | `/api/documents` | 上传文档 (multipart/form-data) |
| GET | `/api/documents/:id` | 文档详情 + 关联任务 |
| DELETE | `/api/documents/:id` | 删除文档及 MinIO 数据 |
| POST | `/api/documents/:id/extract` | 启动提取任务 |
| GET | `/api/documents/:id/chunks` | 分块状态查询 |
| GET | `/api/documents/:id/result` | 获取合并后的 Markdown |
| POST | `/api/documents/:id/retry` | 重试失败的分块 |
| GET | `/api/documents/:id/presigned-url` | 获取 PDF 预签名 URL |
| GET | `/api/engines/servers` | 引擎服务器列表 |
| POST | `/api/engines/servers` | 添加服务器 |
| PUT | `/api/engines/servers/:id` | 更新服务器配置 |
| DELETE | `/api/engines/servers/:id` | 删除服务器 |

## 端到端测试

测试使用 `assets/` 目录下的 PDF 文件，覆盖两种引擎的完整提取流程：

```bash
# 安装 Playwright 浏览器（首次）
npx playwright install

# 运行测试（需要先启动 dev server 和外部服务）
npm run test:e2e
```

## 常用命令

```bash
npm run dev          # 启动开发服务器 (Turbopack)
npm run build        # 生产构建
npm run start        # 启动生产服务器
npm run db:push      # 将 schema 同步到数据库
npm run db:generate  # 生成 migration 文件
npm run db:studio    # 打开 Drizzle Studio
npm run test:e2e     # 运行 Playwright 测试
```
