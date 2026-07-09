const fs = require("node:fs/promises");
const path = require("node:path");
const { Pool } = require("pg");

const migrationPath = path.join(__dirname, "..", "database", "assignment-model.sql");

function getTargets() {
  const targets = [];
  if (process.env.DATABASE_URL) {
    targets.push({ name: "DATABASE_URL", connectionString: process.env.DATABASE_URL });
  }
  if (process.env.LOCAL_DATABASE_URL) {
    targets.push({ name: "LOCAL_DATABASE_URL", connectionString: process.env.LOCAL_DATABASE_URL });
  }
  if (process.env.NEON_DATABASE_URL) {
    targets.push({ name: "NEON_DATABASE_URL", connectionString: process.env.NEON_DATABASE_URL });
  }
  return targets;
}

function shouldUseSsl(connectionString) {
  return /sslmode=require|neon\.tech|supabase\.co|render\.com/i.test(connectionString);
}

async function runMigration(target, sql) {
  const pool = new Pool({
    connectionString: target.connectionString,
    ssl: shouldUseSsl(target.connectionString) ? { rejectUnauthorized: false } : false
  });

  try {
    await pool.query(sql);
    console.log(`Assignment model migration applied to ${target.name}.`);
  } finally {
    await pool.end();
  }
}

async function main() {
  const targets = getTargets();
  if (!targets.length) {
    throw new Error("Set DATABASE_URL, or set LOCAL_DATABASE_URL and/or NEON_DATABASE_URL.");
  }

  const sql = await fs.readFile(migrationPath, "utf8");
  for (const target of targets) {
    await runMigration(target, sql);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
