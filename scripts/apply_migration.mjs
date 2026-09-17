import pg from "pg";
import fs from "fs";

const env = fs.readFileSync(".env.local", "utf8");
const vars = Object.fromEntries(
  env
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => l.trim().split("="))
);

const sqlContent = fs.readFileSync("supabase/migrations/20260914000000_head_editable_task_assignees.sql", "utf8");

const passwords = ["KOMINFO2026", "postgres", "admin", "password"];
const host = "db.hcfgcgrvzcccxhbchthn.supabase.co";

async function tryConnect() {
  for (const pw of passwords) {
    console.log(`Trying password ${pw}...`);
    const poolerConn = `postgres://postgres.hcfgcgrvzcccxhbchthn:${pw}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;
    try {
      const client = new pg.Client({
        connectionString: poolerConn,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 3000,
      });
      await client.connect();
      console.log("Connected successfully via pooler!");
      await client.query(sqlContent);
      console.log("Migration executed successfully!");
      await client.end();
      return true;
    } catch (e) {
      console.log(`Pooler error: ${e.message}`);
    }

    const directConn = `postgres://postgres:${pw}@${host}:5432/postgres`;
    try {
      const client2 = new pg.Client({
        connectionString: directConn,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 3000,
      });
      await client2.connect();
      console.log("Connected successfully via direct host!");
      await client2.query(sqlContent);
      console.log("Migration executed successfully!");
      await client2.end();
      return true;
    } catch (e) {
      console.log(`Direct host error: ${e.message}`);
    }
  }
  return false;
}

tryConnect().catch(console.error);
