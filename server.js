const http = require("http");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const root = __dirname;
const port = Number(process.env.PORT || 5173);
const host = "0.0.0.0";

const STUDENT_VIEW = process.env.STUDENT_VIEW || "test_engine_registered_students";
const ASSIGNMENTS_TABLE = process.env.ASSIGNMENTS_TABLE || "test_engine_assignments";
const ATTEMPTS_TABLE = process.env.ATTEMPTS_TABLE || "test_engine_attempts";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false }
});

pool.on("error", (error) => console.error("PostgreSQL error:", error));

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

function sendError(res, status, message, error) {
  console.error(message, error || "");
  sendJson(res, status, {
    error: message,
    details: process.env.NODE_ENV === "development"
      ? String(error?.message || error || "")
      : undefined
  });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });

    req.on("error", reject);
  });
}

function first(row, keys, fallback = "") {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
      return row[key];
    }
  }
  return fallback;
}

function normalizeStudent(row) {
  const firstName = first(row, ["first_name", "firstName", "FirstName"]);
  const lastName = first(row, ["last_name", "lastName", "LastName"]);
  const fallbackName = [firstName, lastName].filter(Boolean).join(" ");

  return {
    id: String(first(row, ["id", "student_id", "studentId", "StudentId", "StudentID"])),
    name: String(first(row, ["name", "student_name", "studentName", "full_name", "fullName", "FullName"], fallbackName)),
    username: String(first(row, ["username", "user_name", "userName", "Username", "email"])),
    email: String(first(row, ["email", "email_address", "emailAddress", "Email"])),
    gradeLevel: String(first(row, ["grade_level", "gradeLevel", "grade", "GradeLevel"])),
    section: String(first(row, ["section", "section_name", "sectionName"])),
    schoolName: String(first(row, ["school_name", "schoolName", "school", "SchoolName"]))
  };
}

function normalizeAssignment(row) {
  return {
    id: String(first(row, ["id", "assignment_id", "assignmentId"])),
    studentId: String(first(row, ["student_id", "studentId"])),
    assessmentKey: String(first(row, ["assessment_key", "assessmentKey"])),
    assessmentTitle: String(first(row, ["assessment_title", "assessmentTitle"])),
    assignedAt: first(row, ["assigned_at", "assignedAt"], null),
    dueAt: first(row, ["due_at", "dueAt"], null),
    attemptLimit: Number(first(row, ["attempt_limit", "attemptLimit"], 1)),
    status: String(first(row, ["status"], "assigned")),
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {}
  };
}

async function getStudents(url) {
  const search = String(url.searchParams.get("search") || "").trim().toLowerCase();
  const school = String(url.searchParams.get("school") || "").trim();
  const grade = String(url.searchParams.get("grade") || "").trim();

  const result = await pool.query(`SELECT * FROM ${STUDENT_VIEW}`);
  let students = result.rows.map(normalizeStudent);

  if (search) {
    students = students.filter((student) =>
      [student.id, student.name, student.username, student.email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search))
    );
  }

  if (school) {
    students = students.filter((student) => student.schoolName === school);
  }

  if (grade) {
    students = students.filter((student) => student.gradeLevel === grade);
  }

  return students;
}

async function handleStudents(req, url, res) {
  if (req.method === "GET") {
    try {
      const students = await getStudents(url);
      const paged = url.searchParams.get("paged") === "1";

      if (!paged) {
        sendJson(res, 200, students);
        return;
      }

      const limit = Math.min(
        10000,
        Math.max(1, Number(url.searchParams.get("limit") || 25))
      );

      const offset = Math.max(
        0,
        Number(url.searchParams.get("offset") || 0)
      );

      sendJson(res, 200, {
        items: students.slice(offset, offset + limit),
        total: students.length,
        limit,
        offset
      });

      return;
    } catch (error) {
      sendError(res, 500, "Could not load students", error);
      return;
    }
  }

  if (req.method === "POST") {
    sendJson(res, 501, {
      error: "Direct student creation is not enabled in this service."
    });
    return;
  }

  sendJson(res, 405, { error: "Method not allowed" });
}

async function handleStudentFilters(res) {
  try {
    const result = await pool.query(`SELECT * FROM ${STUDENT_VIEW}`);
    const students = result.rows.map(normalizeStudent);

    sendJson(res, 200, {
      schools: [...new Set(students.map((s) => s.schoolName).filter(Boolean))].sort(),
      grades: [...new Set(students.map((s) => s.gradeLevel).filter(Boolean))].sort(),
      totalStudents: students.length
    });
  } catch (error) {
    sendError(res, 500, "Could not load student filters", error);
  }
}

async function handleAssignments(req, res) {
  if (req.method === "GET") {
    try {
      const result = await pool.query(`
        SELECT *
        FROM ${ASSIGNMENTS_TABLE}
        ORDER BY assigned_at DESC NULLS LAST
      `);

      sendJson(res, 200, result.rows.map(normalizeAssignment));
    } catch (error) {
      sendError(res, 500, "Could not load assignments", error);
    }

    return;
  }

  if (req.method === "POST") {
    const client = await pool.connect();

    try {
      const body = await readJson(req);
      const assessment = body.assessment || {};
      const studentIds = Array.isArray(body.studentIds) ? body.studentIds : [];

      if (!studentIds.length) {
        sendJson(res, 400, { error: "studentIds is required" });
        return;
      }

      await client.query("BEGIN");

      let assigned = 0;

      for (const studentId of studentIds) {
        const studentSettings = body.perStudentSettings?.[studentId] || {};

        const metadata = {
          ...(body.metadata || {}),
          ...studentSettings,
          assessment
        };

        await client.query(`
          INSERT INTO ${ASSIGNMENTS_TABLE}
          (
            student_id,
            assessment_key,
            assessment_title,
            assigned_at,
            due_at,
            attempt_limit,
            status,
            metadata
          )
          VALUES ($1, $2, $3, NOW(), $4, $5, 'assigned', $6::jsonb)
        `, [
          String(studentId),
          String(assessment.key || ""),
          String(assessment.title || ""),
          body.dueAt || null,
          Number(body.attemptLimit || 1),
          JSON.stringify(metadata)
        ]);

        assigned += 1;
      }

      await client.query("COMMIT");
      sendJson(res, 201, { ok: true, assigned });
    } catch (error) {
      await client.query("ROLLBACK");
      sendError(res, 500, "Could not save assignments", error);
    } finally {
      client.release();
    }

    return;
  }

  sendJson(res, 405, { error: "Method not allowed" });
}

async function handleAttempts(req, res) {
  if (req.method === "GET") {
    try {
      const result = await pool.query(`
        SELECT *
        FROM ${ATTEMPTS_TABLE}
        ORDER BY submitted_at DESC NULLS LAST
      `);

      const attempts = result.rows.map((row) =>
        row.attempt_json ||
        row.raw_attempt ||
        row.payload ||
        row
      );

      sendJson(res, 200, attempts);
    } catch (error) {
      sendError(res, 500, "Could not load attempts", error);
    }

    return;
  }

  if (req.method === "POST") {
    try {
      const attempt = await readJson(req);

      await pool.query(`
        INSERT INTO ${ATTEMPTS_TABLE}
        (
          attempt_id,
          student_id,
          student_name,
          assessment_key,
          assessment_title,
          submitted_at,
          attempt_json
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      `, [
        attempt.attemptId || attempt.id,
        attempt.student?.id || attempt.studentId,
        attempt.student?.name || attempt.studentName,
        attempt.assessment?.key || "",
        attempt.assessment?.title || attempt.assessmentTitle || "",
        attempt.submittedAt || new Date().toISOString(),
        JSON.stringify(attempt)
      ]);

      sendJson(res, 201, attempt);
    } catch (error) {
      sendError(res, 500, "Could not save attempt", error);
    }

    return;
  }

  sendJson(res, 405, { error: "Method not allowed" });
}

function handleAssessments(res) {
  const catalogPath = path.join(root, "input", "assessment-catalog.json");

  fs.readFile(catalogPath, "utf8", (error, content) => {
    if (error) {
      sendJson(res, 200, []);
      return;
    }

    try {
      const payload = JSON.parse(content);
      const assessments = Array.isArray(payload)
        ? payload
        : payload.assessments || payload.items || [];

      sendJson(res, 200, assessments);
    } catch (error) {
      sendError(res, 500, "Assessment catalog contains invalid JSON", error);
    }
  });
}

async function handleHealth(res) {
  try {
    await pool.query("SELECT 1");

    sendJson(res, 200, {
      ok: true,
      database: "connected",
      environment: process.env.NODE_ENV || "development"
    });
  } catch (error) {
    sendError(res, 500, "Database connection failed", error);
  }
}

function serveStatic(url, res) {
  let requestPath = url.pathname === "/" ? "/index.html" : url.pathname;

  try {
    requestPath = decodeURIComponent(requestPath);
  } catch {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }

  const filePath = path.normalize(path.join(root, requestPath));
  const relative = path.relative(root, filePath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, {
        "Content-Type": "text/plain; charset=utf-8"
      });

      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type":
        contentTypes[path.extname(filePath).toLowerCase()] ||
        "application/octet-stream",

      "Cache-Control":
        path.basename(filePath) === "config.js" ||
        path.extname(filePath) === ".json"
          ? "no-store"
          : "public, max-age=60"
    });

    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(
    req.url,
    `http://${req.headers.host || `${host}:${port}`}`
  );

  const route = url.pathname;

  console.log(req.method, route);

  if (route === "/api/health" && req.method === "GET") {
    await handleHealth(res);
    return;
  }

  if (route === "/api/student-filters" && req.method === "GET") {
    await handleStudentFilters(res);
    return;
  }

  if (route === "/api/students") {
    await handleStudents(req, url, res);
    return;
  }

  if (route === "/api/assignments") {
    await handleAssignments(req, res);
    return;
  }

  if (route === "/api/attempts") {
    await handleAttempts(req, res);
    return;
  }

  if (route === "/api/assessments" && req.method === "GET") {
    handleAssessments(res);
    return;
  }

  if (route.startsWith("/api/")) {
    sendJson(res, 404, {
      error: `API route not found: ${req.method} ${route}`
    });
    return;
  }

  serveStatic(url, res);
});

server.listen(port, host, () => {
  console.log(`Assessment Engine running on port ${port}`);
  console.log(`Health check: /api/health`);
});

async function shutdown() {
  console.log("Shutting down...");

  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);