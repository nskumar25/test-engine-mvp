const http = require("http");
const { randomUUID } = require("crypto");
const { Pool } = require("pg");

const port = Number(process.env.API_PORT || process.env.PORT || 8787);
const host = process.env.API_HOST || "127.0.0.1";
const allowedOrigin = process.env.CORS_ORIGIN || "*";
const studentView = process.env.STUDENT_VIEW || "test_engine_registered_students";
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

    if (request.method === "GET" && url.pathname === "/") {
      sendJson(response, 200, {
        ok: true,
        service: "Assessment Test Engine API",
        routes: ["/health", "/api/student-filters", "/api/students", "/api/assessments", "/api/assignment-events"]
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/health") {
      await pool.query("select 1");
      sendJson(response, 200, {
        ok: true,
        studentView: safeStudentView || null
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/debug") {
      const debug = await getDebugSummary();
      sendJson(response, 200, debug);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/attempts") {
      const attempts = await listAttempts();
      sendJson(response, 200, attempts);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/assessments") {
      const assessments = await listAssessments();
      sendJson(response, 200, assessments);
      return;
    }

    const assessmentStatusMatch = url.pathname.match(/^\/api\/assessments\/([^/]+)\/status$/);
    if (request.method === "POST" && assessmentStatusMatch) {
      const payload = await readJson(request);
      const saved = await updateAssessmentStatus(decodeURIComponent(assessmentStatusMatch[1]), payload.status);
      sendJson(response, 200, saved);
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

    if (request.method === "GET" && url.pathname === "/api/assignment-events") {
      const events = await listAssignmentEvents();
      sendJson(response, 200, events);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/assignments") {
      const payload = await readJson(request);
      const saved = await saveAssignments(payload);
      sendJson(response, 201, saved);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/assignments/cancel") {
      const payload = await readJson(request);
      const saved = await cancelAssignments(payload);
      sendJson(response, 200, saved);
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

function trimValue(value) {
  return value == null ? "" : String(value).trim();
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

async function listAssessments() {
  const { rows } = await pool.query(`
    select
      a.external_assessment_key,
      a.title,
      a.source_document,
      a.duration_minutes,
      a.status,
      a.input_format_version,
      coalesce(a.assignment_type_code, 'assessment') as assignment_type_code,
      at.display_name as assignment_type_label,
      at.supports_attempts,
      at.supports_due_date,
      at.supports_reassignment,
      at.supports_result,
      at.completion_rule,
      a.tools,
      a.instructions,
      count(aq.question_id)::int as question_count
    from test_engine_assessments a
    left join test_engine_assignment_types at
      on at.code = a.assignment_type_code
    left join test_engine_assessment_questions aq
      on aq.assessment_id = a.id
    where a.status <> 'archived'
    group by
      a.id,
      at.display_name,
      at.supports_attempts,
      at.supports_due_date,
      at.supports_reassignment,
      at.supports_result,
      at.completion_rule
    order by a.title
  `);

  return rows.map((row) => ({
    key: row.external_assessment_key,
    title: row.title,
    sourceDocument: row.source_document,
    durationMinutes: row.duration_minutes,
    status: row.status,
    inputFormatVersion: row.input_format_version,
    assignmentType: row.assignment_type_code,
    assignmentTypeLabel: row.assignment_type_label || formatAssignmentTypeLabel(row.assignment_type_code),
    assignmentTypeConfig: {
      code: row.assignment_type_code,
      displayName: row.assignment_type_label || formatAssignmentTypeLabel(row.assignment_type_code),
      supportsAttempts: row.supports_attempts !== false,
      supportsDueDate: row.supports_due_date !== false,
      supportsReassignment: row.supports_reassignment !== false,
      supportsResult: row.supports_result !== false,
      completionRule: row.completion_rule || "submission"
    },
    tools: row.tools || {},
    instructions: row.instructions || [],
    questionCount: row.question_count
  }));
}

function formatAssignmentTypeLabel(code) {
  const labels = {
    assessment: "Assessment",
    pretest: "Pre-test",
    worksheet: "Worksheet",
    practice: "Practice",
    diagnostic: "Diagnostic Test",
    benchmark: "Benchmark",
    quiz: "Quiz"
  };
  return labels[String(code || "assessment").toLowerCase()] || "Assessment";
}

async function updateAssessmentStatus(key, status) {
  const allowed = new Set(["draft", "published", "archived"]);
  const nextStatus = String(status || "").toLowerCase();
  if (!allowed.has(nextStatus)) {
    const error = new Error("Invalid assessment status");
    error.statusCode = 400;
    throw error;
  }

  const result = await pool.query(`
    update test_engine_assessments
    set status = $2,
        updated_at = now()
    where external_assessment_key = $1
    returning external_assessment_key, title, status
  `, [key, nextStatus]);

  if (!result.rows.length) {
    const error = new Error("Assessment was not found");
    error.statusCode = 404;
    throw error;
  }

  return {
    ok: true,
    key: result.rows[0].external_assessment_key,
    title: result.rows[0].title,
    status: result.rows[0].status
  };
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
      ass.title as assessment_title,
      count(distinct t.id)::int as assessment_attempt_count,
      count(distinct current_t.id)::int as current_assignment_attempt_count
    from test_engine_assignments a
    join test_engine_assessments ass
      on ass.id = a.assessment_id
    left join test_engine_attempts t
      on (t.assessment_id = a.assessment_id or (t.assessment_id is null and t.assessment_title = ass.title))
      and t.student_external_id = a.student_external_id
      and t.status in ('submitted', 'scored')
    left join test_engine_attempts current_t
      on current_t.assessment_id = a.assessment_id
      and current_t.student_external_id = a.student_external_id
      and current_t.raw_attempt->>'assignmentKey' = a.id::text
      and current_t.status in ('submitted', 'scored')
    group by
      a.id,
      a.student_external_id,
      a.assigned_at,
      a.due_at,
      a.attempt_limit,
      a.status,
      a.metadata,
      ass.external_assessment_key,
      ass.title
    order by a.assigned_at desc
    limit 2000
  `);

  return rows.map((row) => {
    const totalAssessmentAttemptCount = Number(row.assessment_attempt_count || 0);
    const attemptBaseline = getAssignmentAttemptBaselineFromMetadata(row.metadata || {});
    const attemptCount = Math.max(0, totalAssessmentAttemptCount - attemptBaseline);
    const status = row.status === "cancelled"
      ? "cancelled"
      : attemptCount >= Number(row.attempt_limit || 1)
      ? "completed"
      : row.status;
    return {
    id: row.id,
    studentId: row.student_external_id,
    assignedAt: row.assigned_at,
    dueAt: row.due_at,
    attemptLimit: row.attempt_limit,
    status,
    assessmentKey: row.external_assessment_key,
    assessmentTitle: row.assessment_title,
    attemptCount,
    totalAssessmentAttemptCount,
    metadata: {
      ...(row.metadata || {}),
      attemptBaseline
    }
    };
  });
}

function getAssignmentAttemptBaselineFromMetadata(metadata = {}) {
  if (metadata.attemptBaseline !== undefined && metadata.attemptBaseline !== null && metadata.attemptBaseline !== "") {
    return Number(metadata.attemptBaseline) || 0;
  }
  const history = Array.isArray(metadata.assignmentHistory) ? metadata.assignmentHistory : [];
  const lastHistory = history[history.length - 1] || {};
  return Number(lastHistory.totalAttemptCount ?? lastHistory.attemptCount ?? 0) || 0;
}

async function listAssignmentEvents() {
  const { rows } = await pool.query(`
    select
      e.id,
      e.assignment_id,
      e.student_external_id,
      e.event_type,
      e.event_note,
      e.event_by,
      e.event_at,
      e.metadata,
      ass.external_assessment_key,
      ass.title as assessment_title,
      ass.assignment_type_code
    from test_engine_assignment_events e
    left join test_engine_assignments a
      on a.id = e.assignment_id
    left join test_engine_assessments ass
      on ass.id = a.assessment_id
    order by e.event_at desc
    limit 3000
  `);

  return rows.map((row) => ({
    id: row.id,
    assignmentId: row.assignment_id,
    studentId: row.student_external_id,
    eventType: row.event_type,
    eventNote: row.event_note || "",
    eventBy: row.event_by || "",
    eventAt: row.event_at,
    assessmentKey: row.external_assessment_key || row.metadata?.assessmentKey || "",
    assessmentTitle: row.assessment_title || row.metadata?.assessmentTitle || "",
    assignmentType: row.assignment_type_code || row.metadata?.assignmentType || "assessment",
    metadata: row.metadata || {}
  }));
}

async function insertAssignmentEvent(client, event) {
  await client.query(`
    insert into test_engine_assignment_events (
      assignment_id,
      student_external_id,
      event_type,
      event_note,
      event_by,
      metadata
    )
    values ($1,$2,$3,$4,$5,$6)
  `, [
    event.assignmentId || null,
    String(event.studentId || ""),
    event.eventType,
    event.eventNote || null,
    event.eventBy || null,
    JSON.stringify(event.metadata || {})
  ]);
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
        assignment_type_code,
        tools,
        instructions
      )
      values ($1,$2,$3,$4,'published',$5,$6,$7,$8)
      on conflict (external_assessment_key) do update set
        title = excluded.title,
        source_document = excluded.source_document,
        duration_minutes = excluded.duration_minutes,
        input_format_version = excluded.input_format_version,
        assignment_type_code = excluded.assignment_type_code,
        tools = excluded.tools,
        instructions = excluded.instructions,
        updated_at = now()
      returning id
    `, [
      assessment.key || "pre-test-for-demo",
      assessment.title || "Assessment",
      assessment.sourceDocument || null,
      assessment.durationMinutes || 30,
      assessment.inputFormatVersion || "mvp-1",
      assessment.assignmentType || payload.metadata?.assignmentType || "assessment",
      JSON.stringify(assessment.tools || {}),
      JSON.stringify(assessment.instructions || [])
    ]);

    const assessmentId = assessmentResult.rows[0].id;
    const dueAt = payload.dueAt || null;
    const attemptLimit = Number(payload.attemptLimit || 1);
    const assignedBy = payload.assignedBy || "admin";
    const perStudentSettings = payload.perStudentSettings || {};
    let assigned = 0;

    for (const studentId of studentIds) {
      const metadata = {
        ...(payload.metadata || {}),
        ...(perStudentSettings[String(studentId)] || perStudentSettings[studentId] || {}),
        assignmentType: payload.metadata?.assignmentType || assessment.assignmentType || "assessment",
        assessment
      };
      const existingResult = await client.query(`
        select
          a.id,
          a.assigned_at,
          a.attempt_limit,
          a.status,
          a.metadata,
          count(t.id)::int as total_attempt_count
        from test_engine_assignments a
        left join test_engine_attempts t
          on t.assessment_id = a.assessment_id
          and t.student_external_id = a.student_external_id
          and t.status in ('submitted', 'scored')
        where a.assessment_id = $1
          and a.student_external_id = $2
        group by
          a.id,
          a.assigned_at,
          a.attempt_limit,
          a.status,
          a.metadata
      `, [assessmentId, String(studentId)]);

      const existing = existingResult.rows[0];
      if (existing) {
        const previousMetadata = existing.metadata || {};
        const totalAttemptCount = Number(existing.total_attempt_count || 0);
        const previousBaseline = getAssignmentAttemptBaselineFromMetadata(previousMetadata);
        const previousWindowAttempts = Math.max(0, totalAttemptCount - previousBaseline);
        const previousHistory = Array.isArray(previousMetadata.assignmentHistory)
          ? previousMetadata.assignmentHistory
          : [];
        const nextMetadata = {
          ...previousMetadata,
          ...metadata,
          attemptBaseline: totalAttemptCount,
          assignmentHistory: [
            ...previousHistory,
            {
              assignedAt: existing.assigned_at,
              attemptLimit: existing.attempt_limit,
              status: existing.status,
              attemptBaseline: previousBaseline,
              attemptCount: previousWindowAttempts,
              totalAttemptCount,
              replacedAt: new Date().toISOString()
            }
          ]
        };

        await client.query(`
          update test_engine_assignments
          set assigned_by = $1,
              assigned_at = now(),
              due_at = $2,
              attempt_limit = $3,
              status = 'assigned',
              metadata = $4
          where id = $5
        `, [
          assignedBy,
          dueAt,
          attemptLimit,
          JSON.stringify(nextMetadata),
          existing.id
        ]);
        await insertAssignmentEvent(client, {
          assignmentId: existing.id,
          studentId,
          eventType: "reassigned",
          eventBy: assignedBy,
          eventNote: "Assignment access window was reassigned.",
          metadata: {
            assessmentKey: assessment.key || "pre-test-for-demo",
            assessmentTitle: assessment.title || "Assessment",
            previousAttemptLimit: existing.attempt_limit,
            attemptLimit,
            previousWindowAttempts,
            totalAttemptCount
          }
        });
        assigned += 1;
        continue;
      }

      const insertedAssignment = await client.query(`
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
        returning id
      `, [
        assessmentId,
        String(studentId),
        assignedBy,
        dueAt,
        attemptLimit,
        JSON.stringify(metadata)
      ]);
      await insertAssignmentEvent(client, {
        assignmentId: insertedAssignment.rows[0]?.id,
        studentId,
        eventType: "assigned",
        eventBy: assignedBy,
        eventNote: "Assignment was assigned.",
        metadata: {
          assessmentKey: assessment.key || "pre-test-for-demo",
          assessmentTitle: assessment.title || "Assessment",
          attemptLimit
        }
      });
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

async function cancelAssignments(payload) {
  const assignmentIds = Array.isArray(payload.assignmentIds) ? payload.assignmentIds.filter(Boolean) : [];
  if (!assignmentIds.length) return { ok: true, cancelled: 0 };

  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await client.query(`
    update test_engine_assignments
    set status = 'cancelled'
    where id = any($1::uuid[])
    returning id, student_external_id
  `, [assignmentIds]);

    for (const row of result.rows) {
      await insertAssignmentEvent(client, {
        assignmentId: row.id,
        studentId: row.student_external_id,
        eventType: "unassigned",
        eventBy: "admin",
        eventNote: "Assignment access was removed.",
        metadata: {}
      });
    }

    await client.query("commit");
    return { ok: true, cancelled: result.rowCount };
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
    const assignmentId = attempt.assignmentKey || attempt.assessment?.assignmentKey || null;
    let assessmentId = null;

    if (assignmentId) {
      const assignmentResult = await client.query(`
        select assessment_id
        from test_engine_assignments
        where id = $1
      `, [assignmentId]);
      assessmentId = assignmentResult.rows[0]?.assessment_id || null;
    }

    if (!assessmentId && assessment.key) {
      const assessmentResult = await client.query(`
        select id
        from test_engine_assessments
        where external_assessment_key = $1
      `, [assessment.key]);
      assessmentId = assessmentResult.rows[0]?.id || null;
    }

    const attemptResult = await client.query(`
      insert into test_engine_attempts (
        attempt_key,
        assessment_id,
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
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      on conflict (attempt_key) do update set
        assessment_id = excluded.assessment_id,
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
      assessmentId,
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

    if (assignmentId && assessmentId) {
      const statusResult = await client.query(`
        update test_engine_assignments a
        set status = case
          when greatest(0, completed.count - coalesce(nullif(a.metadata->>'attemptBaseline', '')::int, 0)) >= a.attempt_limit then 'completed'
          else 'assigned'
        end
        from (
          select count(*)::int as count
          from test_engine_attempts
          where assessment_id = $1
            and student_external_id = $2
            and status in ('submitted', 'scored')
        ) completed
        where a.id = $3
        returning a.status
      `, [
        assessmentId,
        student.id || attempt.studentId || "unknown-student",
        assignmentId
      ]);
      const nextStatus = statusResult.rows[0]?.status || "assigned";
      if (attempt.startedAt) {
        await insertAssignmentEvent(client, {
          assignmentId,
          studentId: student.id || attempt.studentId || "unknown-student",
          eventType: "started",
          eventBy: "student",
          eventNote: "Student started assignment attempt.",
          metadata: {
            attemptKey,
            startedAt: attempt.startedAt,
            assessmentTitle: assessment.title || attempt.assessmentTitle || "Assessment"
          }
        });
      }
      await insertAssignmentEvent(client, {
        assignmentId,
        studentId: student.id || attempt.studentId || "unknown-student",
        eventType: "submitted",
        eventBy: "student",
        eventNote: "Student submitted assignment attempt.",
        metadata: {
          attemptKey,
          assessmentTitle: assessment.title || attempt.assessmentTitle || "Assessment",
          scorePercentage: score.percentage || 0
        }
      });
      if (nextStatus === "completed") {
        await insertAssignmentEvent(client, {
          assignmentId,
          studentId: student.id || attempt.studentId || "unknown-student",
          eventType: "completed",
          eventBy: "system",
          eventNote: "Assignment was marked completed.",
          metadata: {
            attemptKey,
            assessmentTitle: assessment.title || attempt.assessmentTitle || "Assessment",
            scorePercentage: score.percentage || 0
          }
        });
      }
    }

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

  const search = String(options.search || "").trim();
  const school = options.school || "";
  const grade = options.grade || "";
  const limit = Math.min(Math.max(Number(options.limit || 50), 1), 100);
  const offset = Math.max(Number(options.offset || 0), 0);
  const conditions = [];
  const params = [];

  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    conditions.push(`(lower(trim(display_name)) like $${params.length} or lower(trim(student_external_id)) like $${params.length} or lower(trim(coalesce(email, ''))) like $${params.length})`);
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
    id: trimValue(row.student_external_id),
    name: trimValue(row.display_name),
    username: trimValue(row.email || row.student_external_id),
    email: trimValue(row.email),
    status: trimValue(row.status),
    gradeId: trimValue(row.grade_external_id),
    gradeLevel: trimValue(row.grade_level),
    section: trimValue(row.section),
    schoolId: trimValue(row.school_external_id),
    schoolName: trimValue(row.school_name)
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

async function getDebugSummary() {
  const result = {
    ok: true,
    studentView: safeStudentView || null,
    registeredStudentViewExists: false,
    totalStudents: 0,
    schools: [],
    assessments: 0
  };

  const viewCheck = await pool.query(`
    select to_regclass($1) as view_name
  `, [safeStudentView || ""]);
  result.registeredStudentViewExists = Boolean(viewCheck.rows[0]?.view_name);

  if (safeStudentView && result.registeredStudentViewExists) {
    const filters = await listStudentFilters();
    result.totalStudents = filters.totalStudents;
    result.schools = filters.schools;
    result.grades = filters.grades;
  }

  const assessmentCheck = await pool.query(`
    select to_regclass('public.test_engine_assessments') as table_name
  `);
  if (assessmentCheck.rows[0]?.table_name) {
    const assessmentCount = await pool.query("select count(*)::int as total from test_engine_assessments");
    result.assessments = assessmentCount.rows[0]?.total || 0;
  }

  return result;
}
