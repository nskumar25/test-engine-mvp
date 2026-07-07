const { Pool } = require("pg");

const localUrl = process.env.LOCAL_DATABASE_URL;
const neonUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

if (!localUrl || !neonUrl) {
  console.error("Missing LOCAL_DATABASE_URL and NEON_DATABASE_URL/DATABASE_URL.");
  console.error("Set both before running npm run verify:neon.");
  process.exit(1);
}

const localPool = new Pool({ connectionString: localUrl });
const neonPool = new Pool({
  connectionString: neonUrl,
  ssl: neonUrl.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined
});

async function main() {
  await printConnection("Local", localPool);
  await printConnection("Neon", neonPool);
  await printLocalStudents();
  await printNeonStudents();
  await printNeonPretests();
}

async function printConnection(label, pool) {
  const { rows } = await pool.query(`
    select
      current_database() as database_name,
      current_user as user_name,
      inet_server_addr()::text as server_address,
      inet_server_port() as server_port
  `);
  const row = rows[0];
  console.log(`${label}: ${row.database_name} / ${row.user_name} / ${row.server_address || "local"}:${row.server_port || ""}`);
}

async function printLocalStudents() {
  const { rows } = await localPool.query(`
    select
      count(*)::int as students,
      count(distinct s."SchoolId")::int as schools,
      count(distinct s."GradeId")::int as grades
    from public."Student" s
  `);
  console.log(`Local students: ${rows[0].students}, schools: ${rows[0].schools}, grades: ${rows[0].grades}`);

  const sample = await localPool.query(`
    select
      s."StudentId"::text as id,
      s."StudentFullName" as name,
      g."GradeName" as grade,
      sc."SchoolName" as school
    from public."Student" s
    left join public."Grade" g on g."GradeId" = s."GradeId"
    left join public."School" sc on sc."SchoolId" = s."SchoolId"
    order by s."StudentFullName"
    limit 10
  `);
  console.table(sample.rows);
}

async function printNeonStudents() {
  const tableResult = await neonPool.query(`
    select to_regclass('public.test_engine_registered_students') as student_view
  `);
  if (!tableResult.rows[0].student_view) {
    console.log("Neon students: test_engine_registered_students does not exist yet.");
    return;
  }

  const { rows } = await neonPool.query(`
    select
      count(*)::int as students,
      count(distinct school_external_id)::int as schools,
      count(distinct grade_external_id)::int as grades
    from test_engine_registered_students
  `);
  console.log(`Neon students: ${rows[0].students}, schools: ${rows[0].schools}, grades: ${rows[0].grades}`);

  const schoolRows = await neonPool.query(`
    select school_name, count(*)::int as students
    from test_engine_registered_students
    group by school_name
    order by school_name
  `);
  console.table(schoolRows.rows);

  const sample = await neonPool.query(`
    select student_external_id as id, display_name as name, grade_level as grade, school_name as school
    from test_engine_registered_students
    order by display_name
    limit 10
  `);
  console.table(sample.rows);
}

async function printNeonPretests() {
  const tableResult = await neonPool.query(`
    select to_regclass('public.test_engine_assessments') as assessments_table
  `);
  if (!tableResult.rows[0].assessments_table) {
    console.log("Neon pretests: test_engine_assessments does not exist yet.");
    return;
  }

  const { rows } = await neonPool.query(`
    select
      a.external_assessment_key as key,
      a.title,
      count(aq.question_id)::int as questions
    from test_engine_assessments a
    left join test_engine_assessment_questions aq on aq.assessment_id = a.id
    group by a.id
    order by a.title
  `);
  console.log(`Neon pretests: ${rows.length}`);
  console.table(rows);
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
