const http = require("http");
const { randomUUID } = require("crypto");
const { Pool } = require("pg");

const port = Number(process.env.API_PORT || process.env.PORT || 8787);
const host = process.env.API_HOST || "127.0.0.1";
const allowedOrigin = process.env.CORS_ORIGIN || "*";
const studentView = process.env.STUDENT_VIEW || "";
const safeStudentView = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/.test(studentView)
  ? studentView
  : "";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined
});

const server = http.createServer(async (request, response) => {
  setCors(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === "GET" && url.pathname === "/health") {
      await pool.query("select 1");
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/attempts") {
      const attempts = await listAttempts();
      sendJson(response, 200, attempts);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/attempts") {
      const payload = await readJson(request);
      const saved = await saveAttempt(payload);
      sendJson(response, 201, saved);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/assignments") {
      const assignments = await listAssignments();
      sendJson(response, 200, assignments);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/assignments") {
      const payload = await readJson(request);
      const saved = await saveAssignments(payload);
      sendJson(response, 201, saved);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/students") {
      const students = await listStudents({
        search: url.searchParams.get("search") || "",
        school: url.searchParams.get("school") || "",
        grade: url.searchParams.get("grade") || "",
        limit: Number(url.searchParams.get("limit") || 1000),
        offset: Number(url.searchParams.get("offset") || 0),
        paged: url.searchParams.get("paged") === "1"
      });
      sendJson(response, 200, students);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/student-filters") {
      const filters = await listStudentFilters();
      sendJson(response, 200, filters);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/students") {
      const payload = await readJson(request);
      sendJson(response, 200, {
        id: payload.id,
        name: payload.name,
        message: "Student registration is owned by the existing PostgreSQL student system."
      });
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, {
      error: "Server error",
      detail: process.env.NODE_ENV === "production" ? undefined : error.message
    });
  }
});

server.listen(port, host, () => {
  console.log(`Assessment API running at http://${host}:${port}/`);
});

function setCors(response) {
  response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        request.destroy();
        reject(new Error("Request body too large"));
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

async function listAttempts() {
  const { rows } = await pool.query(`
    select raw_attempt
    from test_engine_attempts
    order by submitted_at desc
    limit 1000
  `);
  return rows.map((row) => row.raw_attempt).filter(Boolean);
}

async function listAssignments() {
  const { rows } = await pool.query(`
    select
      a.id,
      a.student_external_id,
      a.assigned_at,
      a.due_at,
      a.attempt_limit,
      a.status,
      a.metadata,
      ass.external_assessment_key,
      ass.title as assessment_title
    from test_engine_assignments a
    join test_engine_assessments ass
      on ass.id = a.assessment_id
    order by a.assigned_at desc
    limit 2000
  `);

  return rows.map((row) => ({
    id: row.id,
    studentId: row.student_external_id,
    assignedAt: row.assigned_at,
    dueAt: row.due_at,
    attemptLimit: row.attempt_limit,
    status: row.status,
    assessmentKey: row.external_assessment_key,
    assessmentTitle: row.assessment_title,
    metadata: row.metadata || {}
  }));
}

async function saveAssignments(payload) {
  const assessment = payload.assessment || {};
  const studentIds = Array.isArray(payload.studentIds) ? payload.studentIds.filter(Boolean) : [];
  if (!studentIds.length) return { ok: true, assigned: 0 };

  const client = await pool.connect();
  try {
    await client.query("begin");

    const assessmentResult = await client.query(`
      insert into test_engine_assessments (
        external_assessment_key,
        title,
        source_document,
        duration_minutes,
        status,
        input_format_version,
        tools,
        instructions
      )
      values ($1,$2,$3,$4,'published',$5,$6,$7)
      on conflict (external_assessment_key) do update set
        title = excluded.title,
        source_document = excluded.source_document,
        duration_minutes = excluded.duration_minutes,
        input_format_version = excluded.input_format_version,
        tools = excluded.tools,
        instructions = excluded.instructions,
        updated_at = now()
      returning id
    `, [
      assessment.key || "pre-test-for-demo",
      assessment.title || "Pre-Test",
      assessment.sourceDocument || null,
      assessment.durationMinutes || 30,
      assessment.inputFormatVersion || "mvp-1",
      JSON.stringify(assessment.tools || {}),
      JSON.stringify(assessment.instructions || [])
    ]);

    const assessmentId = assessmentResult.rows[0].id;
    const dueAt = payload.dueAt || null;
    const attemptLimit = Number(payload.attemptLimit || 1);
    const assignedBy = payload.assignedBy || "admin";
    let assigned = 0;

    for (const studentId of studentIds) {
      await client.query(`
        insert into test_engine_assignments (
          assessment_id,
          student_external_id,
          assigned_by,
          due_at,
          attempt_limit,
          status,
          metadata
        )
        values ($1,$2,$3,$4,$5,'assigned',$6)
        on conflict (assessment_id, student_external_id) do update set
          assigned_by = excluded.assigned_by,
          due_at = excluded.due_at,
          attempt_limit = excluded.attempt_limit,
          status = 'assigned',
          metadata = excluded.metadata
      `, [
        assessmentId,
        String(studentId),
        assignedBy,
        dueAt,
        attemptLimit,
        JSON.stringify(payload.metadata || {})
      ]);
      assigned += 1;
    }

    await client.query("commit");
    return { ok: true, assigned };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function saveAttempt(attempt) {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const score = attempt.score || {};
    const timing = attempt.timing || {};
    const student = attempt.student || {};
    const assessment = attempt.assessment || {};
    const attemptKey = attempt.attemptId || attempt.id || randomUUID();
    const submittedAt = attempt.submittedAt || new Date().toISOString();

    const attemptResult = await client.query(`
      insert into test_engine_attempts (
        attempt_key,
        assessment_title,
        student_external_id,
        student_name,
        started_at,
        submitted_at,
        score_correct,
        score_total,
        percentage,
        answered,
        unanswered,
        time_used_seconds,
        time_remaining_seconds,
        summary,
        raw_attempt
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      on conflict (attempt_key) do update set
        submitted_at = excluded.submitted_at,
        score_correct = excluded.score_correct,
        score_total = excluded.score_total,
        percentage = excluded.percentage,
        answered = excluded.answered,
        unanswered = excluded.unanswered,
        time_used_seconds = excluded.time_used_seconds,
        time_remaining_seconds = excluded.time_remaining_seconds,
        summary = excluded.summary,
        raw_attempt = excluded.raw_attempt
      returning id
    `, [
      attemptKey,
      assessment.title || attempt.assessmentTitle || "Assessment",
      student.id || attempt.studentId || "unknown-student",
      student.name || attempt.studentName || "Student",
      attempt.startedAt || null,
      submittedAt,
      score.correct || 0,
      score.total || 0,
      score.percentage || 0,
      score.answered || 0,
      score.unanswered || 0,
      timing.timeUsedSeconds || 0,
      timing.timeRemainingSeconds || 0,
      JSON.stringify(attempt.summary || {}),
      JSON.stringify({ ...attempt, attemptId: attemptKey, id: attemptKey, submittedAt })
    ]);

    const attemptId = attemptResult.rows[0].id;
    await client.query("delete from test_engine_responses where attempt_id = $1", [attemptId]);

    for (const response of attempt.responses || []) {
      await client.query(`
        insert into test_engine_responses (
          attempt_id,
          question_external_id,
          question_number,
          topic,
          selected_answer,
          selected_label,
          correct_answer,
          correct_label,
          is_correct,
          explanation,
          distractor_feedback
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      `, [
        attemptId,
        response.questionId || null,
        response.number || null,
        response.topic || null,
        response.selected || null,
        response.selectedLabel || null,
        response.correctAnswer || null,
        response.correctLabel || null,
        Boolean(response.isCorrect),
        response.explanation || null,
        JSON.stringify(response.distractorFeedback || null)
      ]);
    }

    if (attempt.ilp) {
      await client.query("delete from test_engine_ilp_plans where attempt_id = $1", [attemptId]);
      await client.query(`
        insert into test_engine_ilp_plans (
          attempt_id,
          student_external_id,
          readiness_level,
          strengths,
          needs_review,
          priority_skills,
          teacher_notes,
          student_plan,
          raw_ilp
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `, [
        attemptId,
        student.id || attempt.studentId || "unknown-student",
        attempt.ilp.readinessLevel || null,
        JSON.stringify(attempt.summary?.strengths || []),
        JSON.stringify(attempt.summary?.needsReview || []),
        JSON.stringify(attempt.ilp.prioritySkills || []),
        JSON.stringify(attempt.ilp.teacherNotes || []),
        JSON.stringify(attempt.ilp.studentPlan || []),
        JSON.stringify(attempt.ilp)
      ]);
    }

    await client.query("commit");
    return { ok: true, attemptId: attemptKey };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function listStudents(options = {}) {
  if (!safeStudentView) return [];

  const search = options.search || "";
  const school = options.school || "";
  const grade = options.grade || "";
  const limit = Math.min(Math.max(Number(options.limit || 50), 1), 100);
  const offset = Math.max(Number(options.offset || 0), 0);
  const conditions = [];
  const params = [];

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(display_name ilike $${params.length} or student_external_id ilike $${params.length} or coalesce(email, '') ilike $${params.length})`);
  }
  if (school) {
    params.push(school);
    conditions.push(`coalesce(school_name, '') = $${params.length}`);
  }
  if (grade) {
    params.push(grade);
    conditions.push(`coalesce(grade_level, '') = $${params.length}`);
  }

  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
  const countResult = options.paged
    ? await pool.query(`select count(*)::int as total from ${safeStudentView} ${where}`, params)
    : null;
  const queryParams = [...params, limit, offset];
  const { rows } = await pool.query(`
    select *
    from ${safeStudentView}
    ${where}
    order by display_name
    limit $${queryParams.length - 1}
    offset $${queryParams.length}
  `, queryParams);

  const items = rows.map((row) => ({
    id: row.student_external_id,
    name: row.display_name,
    username: row.email || row.student_external_id,
    email: row.email,
    status: row.status,
    gradeLevel: row.grade_level,
    section: row.section,
    schoolName: row.school_name
  }));

  if (!options.paged) return items;
  return {
    items,
    total: countResult?.rows?.[0]?.total || 0,
    limit,
    offset
  };
}

async function listStudentFilters() {
  if (!safeStudentView) return { schools: [], grades: [], totalStudents: 0 };

  const [schools, grades, total] = await Promise.all([
    pool.query(`
      select distinct school_name
      from ${safeStudentView}
      where school_name is not null and school_name <> ''
      order by school_name
    `),
    pool.query(`
      select distinct grade_level
      from ${safeStudentView}
      where grade_level is not null and grade_level <> ''
      order by grade_level
    `),
    pool.query(`select count(*)::int as total from ${safeStudentView}`)
  ]);

  return {
    schools: schools.rows.map((row) => row.school_name),
    grades: grades.rows.map((row) => row.grade_level),
    totalStudents: total.rows[0]?.total || 0
  };
}
