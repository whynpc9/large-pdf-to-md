/**
 * Lightweight migration runner that executes drizzle SQL files
 * against the database. No drizzle-kit dependency needed at runtime.
 */
import fs from "fs";
import path from "path";
import postgres from "postgres";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/pdf_to_md";

async function run() {
  const sql = postgres(DATABASE_URL, { max: 1 });

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS __drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash TEXT NOT NULL UNIQUE,
        created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)
      )
    `;

    const migrationsDir = path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      "../drizzle"
    );

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const hash = file.replace(/\.sql$/, "");
      const existing =
        await sql`SELECT id FROM __drizzle_migrations WHERE hash = ${hash}`;

      if (existing.length > 0) {
        console.log(`[migrate] skip ${file} (already applied)`);
        continue;
      }

      const content = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
      const statements = content
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean);

      for (const stmt of statements) {
        try {
          await sql.unsafe(stmt);
        } catch (e) {
          if (e.code === "42P07" || e.code === "42710") {
            // relation or constraint already exists — safe to skip
            continue;
          }
          throw e;
        }
      }

      await sql`INSERT INTO __drizzle_migrations (hash) VALUES (${hash})`;
      console.log(`[migrate] applied ${file}`);
    }

    console.log("[migrate] done");
  } finally {
    await sql.end();
  }
}

run().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
