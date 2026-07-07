const { Pool } = require("pg");

const localUrl = process.env.LOCAL_DATABASE_URL;
const neonUrl = process.env.NEON_DATABASE_URL;

if (!localUrl || !neonUrl) {
  console.error("Missing LOCAL_DATABASE_URL or NEON_DATABASE_URL.");
  console.error("Set both environment variables before running npm run sync:students.");
  process.exit(1);
}

const localPool = new Pool({ connectionString: localUrl });
const neonPool = new Pool({
  connectionString: neonUrl,
  ssl: neonUrl.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined
});

async function main() {
  const students = await readLocalStudents();
  await ensureNeonStudentSeed();
  const synced = await upsertNeonStudents(students);
  console.log(`Synced ${synced} student(s) to Neon.`);
}

async function readLocalStudents() {
  const { rows } = await localPool.query(`
    select
      s."StudentId"::text as student_external_id,
      s."StudentFullName" as display_name,
      s."Email" as email,
      s."Status"::text as status,
      g."GradeName" as grade_level,
      null::text as section,
      sc."SchoolName" as school_name
    from public."Student" s
    left join public."Grade" g
      on g."GradeId" = s."GradeId"
    left join public."School" sc
      on sc."SchoolId" = s."SchoolId"
    order by s."StudentFullName"
  `);

  return rows;
}

async function ensureNeonStudentSeed() {
  await neonPool.query(`
    create table if not exists test_engine_student_seed (
      student_external_id text primary key,
      display_name text not null,
      email text,
      status text,
      grade_level text,
      section text,
      school_name text,
      synced_at timestamptz not null default now()
    );

    alter table test_engine_student_seed
      add column if not exists synced_at timestamptz not null default now();

    create or replace view test_engine_registered_students as
    select
      student_external_id,
      display_name,
      email,
      status,
      grade_level,
      section,
      school_name
    from test_engine_student_seed;
  `);
}

async function upsertNeonStudents(students) {
  const client = await neonPool.connect();
  try {
    await client.query("begin");

    for (const student of students) {
      await client.query(`
        insert into test_engine_student_seed (
          student_external_id,
          display_name,
          email,
          status,
          grade_level,
          section,
          school_name,
          synced_at
        )
        values ($1,$2,$3,$4,$5,$6,$7,now())
        on conflict (student_external_id) do update set
          display_name = excluded.display_name,
          email = excluded.email,
          status = excluded.status,
          grade_level = excluded.grade_level,
          section = excluded.section,
          school_name = excluded.school_name,
          synced_at = now()
      `, [
        student.student_external_id,
        student.display_name,
        student.email,
        student.status,
        student.grade_level,
        student.section,
        student.school_name
      ]);
    }

    await client.query("commit");
    return students.length;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await localPool.end();
    await neonPool.end();
  });
