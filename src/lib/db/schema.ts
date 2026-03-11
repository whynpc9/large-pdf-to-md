import {
  pgTable,
  uuid,
  varchar,
  bigint,
  integer,
  text,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

export const documents = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  originalFilename: varchar("original_filename", { length: 255 }).notNull(),
  fileSize: bigint("file_size", { mode: "number" }).notNull(),
  pageCount: integer("page_count"),
  minioPath: varchar("minio_path", { length: 512 }).notNull(),
  status: varchar("status", { length: 50 }).default("uploaded").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const engineServers = pgTable("engine_servers", {
  id: uuid("id").defaultRandom().primaryKey(),
  engineType: varchar("engine_type", { length: 50 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  baseUrl: varchar("base_url", { length: 512 }).notNull(),
  config: jsonb("config").default({}).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const extractionTasks = pgTable("extraction_tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentId: uuid("document_id")
    .references(() => documents.id, { onDelete: "cascade" })
    .notNull(),
  engineType: varchar("engine_type", { length: 50 }).notNull(),
  serverId: uuid("server_id")
    .references(() => engineServers.id)
    .notNull(),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  config: jsonb("config").default({}).notNull(),
  totalChunks: integer("total_chunks"),
  completedChunks: integer("completed_chunks").default(0).notNull(),
  failedChunks: integer("failed_chunks").default(0).notNull(),
  errorReport: text("error_report"),
  resultMinioPath: varchar("result_minio_path", { length: 512 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const chunks = pgTable("chunks", {
  id: uuid("id").defaultRandom().primaryKey(),
  taskId: uuid("task_id")
    .references(() => extractionTasks.id, { onDelete: "cascade" })
    .notNull(),
  documentId: uuid("document_id")
    .references(() => documents.id, { onDelete: "cascade" })
    .notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  startPage: integer("start_page").notNull(),
  endPage: integer("end_page").notNull(),
  minioInputPath: varchar("minio_input_path", { length: 512 }),
  minioResultPath: varchar("minio_result_path", { length: 512 }),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  resultMd: text("result_md"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type EngineServer = typeof engineServers.$inferSelect;
export type NewEngineServer = typeof engineServers.$inferInsert;
export type ExtractionTask = typeof extractionTasks.$inferSelect;
export type NewExtractionTask = typeof extractionTasks.$inferInsert;
export type Chunk = typeof chunks.$inferSelect;
export type NewChunk = typeof chunks.$inferInsert;
