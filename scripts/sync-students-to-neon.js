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
      s."GradeId"::text as grade_external_id,
      g."GradeName" as grade_level,
      null::text as section,
      s."SchoolId"::text as school_external_id,
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
    create table if not exists test_engine_school_seed (
      school_external_id text primary key,
      school_name text not null,
      synced_at timestamptz not null default now()
    );

    create table if not exists test_engine_grade_seed (
      grade_external_id text primary key,
      grade_level text not null,
      synced_at timestamptz not null default now()
    );

    create table if not exists test_engine_student_seed (
      student_external_id text primary key,
      display_name text not null,
      email text,
      status text,
      grade_external_id text references test_engine_grade_seed(grade_external_id) on update cascade on delete set null,
      grade_level text,
      section text,
      school_external_id text references test_engine_school_seed(school_external_id) on update cascade on delete set null,
      school_name text,
      synced_at timestamptz not null default now()
    );

    alter table test_engine_student_seed
      add column if not exists grade_external_id text;

    alter table test_engine_student_seed
      add column if not exists school_external_id text;

    alter table test_engine_student_seed
      add column if not exists synced_at timestamptz not null default now();

    do $$
    begin
      alter table test_engine_student_seed
        add constraint test_engine_student_seed_grade_fk
        foreign key (grade_external_id)
        references test_engine_grade_seed(grade_external_id)
        on update cascade
        on delete set null;
    exception when duplicate_object then
      null;
    end $$;

    do $$
    begin
      alter table test_engine_student_seed
        add constraint test_engine_student_seed_school_fk
        foreign key (school_external_id)
        references test_engine_school_seed(school_external_id)
        on update cascade
        on delete set null;
    exception when duplicate_object then
      null;
    end $$;

    create index if not exists test_engine_student_seed_school_idx
      on test_engine_student_seed(school_external_id);

    create index if not exists test_engine_student_seed_grade_idx
      on test_engine_student_seed(grade_external_id);

    drop view if exists test_engine_registered_students;

    create view test_engine_registered_students as
    select
      st.student_external_id,
      st.display_name,
      st.email,
      st.status,
      coalesce(gr.grade_level, st.grade_level) as grade_level,
      st.section,
      coalesce(sc.school_name, st.school_name) as school_name,
      st.grade_external_id,
      st.school_external_id
    from test_engine_student_seed st
    left join test_engine_grade_seed gr
      on gr.grade_external_id = st.grade_external_id
    left join test_engine_school_seed sc
      on sc.school_external_id = st.school_external_id;
  `);
}

async function upsertNeonStudents(students) {
  const client = await neonPool.connect();
  try {
    await client.query("begin");

    for (const student of students) {
      if (student.school_external_id && student.school_name) {
        await client.query(`
          insert into test_engine_school_seed (
            school_external_id,
            school_name,
            synced_at
          )
          values ($1,$2,now())
          on conflict (school_external_id) do update set
            school_name = excluded.school_name,
            synced_at = now()
        `, [
          student.school_external_id,
          student.school_name
        ]);
      }

      if (student.grade_external_id && student.grade_level) {
        await client.query(`
          insert into test_engine_grade_seed (
            grade_external_id,
            grade_level,
            synced_at
          )
          values ($1,$2,now())
          on conflict (grade_external_id) do update set
            grade_level = excluded.grade_level,
            synced_at = now()
        `, [
          student.grade_external_id,
          student.grade_level
        ]);
      }

      await client.query(`
        insert into test_engine_student_seed (
          student_external_id,
          display_name,
          email,
          status,
          grade_external_id,
          grade_level,
          section,
          school_external_id,
          school_name,
          synced_at
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
        on conflict (student_external_id) do update set
          display_name = excluded.display_name,
          email = excluded.email,
          status = excluded.status,
          grade_external_id = excluded.grade_external_id,
          grade_level = excluded.grade_level,
          section = excluded.section,
          school_external_id = excluded.school_external_id,
          school_name = excluded.school_name,
          synced_at = now()
      `, [
        student.student_external_id,
        student.display_name,
        student.email,
        student.status,
        student.grade_external_id,
        student.grade_level,
        student.section,
        student.school_external_id,
        student.school_name
      ]);
    }

    const localStudentIds = students.map((student) => String(student.student_external_id));
    if (localStudentIds.length) {
      await client.query(`
        delete from test_engine_student_seed
        where student_external_id <> all($1::text[])
      `, [localStudentIds]);
    } else {
      await client.query("delete from test_engine_student_seed");
    }

    await client.query(`
      delete from test_engine_school_seed sc
      where not exists (
        select 1
        from test_engine_student_seed st
        where st.school_external_id = sc.school_external_id
      )
    `);

    await client.query(`
      delete from test_engine_grade_seed gr
      where not exists (
        select 1
        from test_engine_student_seed st
        where st.grade_external_id = gr.grade_external_id
      )
    `);

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
