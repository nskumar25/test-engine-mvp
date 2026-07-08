const STORAGE_KEY = "assessment-engine-mvp";
const STUDENTS_STORAGE_KEY = "assessment-engine-students-v2";
const ASSIGNMENTS_STORAGE_KEY = "assessment-engine-assignments";
const ASSESSMENT_STATUS_STORAGE_KEY = "assessment-engine-assessment-status";
const RESULTS_DB_NAME = "assessment-engine-results";
const RESULTS_STORE = "attempts";
const ATTEMPT_SCHEMA_VERSION = "attempt-v1";
const CONFIGURED_DATA_PROVIDER =
  window.ASSESSMENT_DATA_PROVIDER || "local";

const CONFIGURED_API_BASE_URL =
  String(window.ASSESSMENT_API_BASE_URL || "")
    .trim()
    .replace(/\/+$/, "");

const DATA_PROVIDER =
  CONFIGURED_DATA_PROVIDER;

const API_BASE_URL =
  DATA_PROVIDER === "api"
    ? CONFIGURED_API_BASE_URL
    : "";
const QUESTION_SOURCE = "input/pre-test-for-demo.json";
const ASSESSMENT_CATALOG_SOURCE = "input/assessment-catalog.json";
const DEMO_STUDENTS = [];

const icons = {
  book: "&#9670;",
  grid: "&#9638;",
  clock: "&#128337;",
  file: "&#128196;",
  calc: "&#8721;",
  pencil: "&#9998;",
  eraser: "&#8998;",
  clear: "&#10005;",
  zoom: "&#128269;",
  shield: "&#128737;",
  warn: "&#9888;",
  fullscreen: "&#9974;",
  previous: "&#8249;",
  next: "&#8250;",
  submit: "&#10148;"
};

let questions = [];
let assessment = {};
let state = {};
let scratchTool = "pencil";
let scratchColor = "#18212b";
let drawing = false;
let calculatorValue = "";
let pendingQuestionScroll = null;
let zoomScale = 1;
let zoomImageSrc = "";
let assignmentSelectionMode = "visible";
let assignmentSelectionFilters = {};
let pendingAttemptSave = Promise.resolve();

const root = document.getElementById("root");

fetch(QUESTION_SOURCE)
  .then((response) => response.json())
  .then((payload) => {
    assessment = payload.assessment;
    questions = payload.questions;
    state = getInitialState(questions.length);
    installSecurityGuards();
    installTimer();
    render();
  })
  .catch(() => {
    root.innerHTML = `
      <main class="shell locked-shell">
        <section class="result-panel">
          <div class="result-icon">${icons.warn}</div>
          <p class="eyebrow">Could not load</p>
          <h1>Question JSON was not found</h1>
          <p>Start the local web server and open the app from the local address.</p>
        </section>
      </main>
    `;
  });

function getInitialState(total) {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed.total === total) {
        const canResumeAssignedAttempt = Boolean(parsed.assignment && parsed.student?.id);
        return {
          ...parsed,
          started: Boolean(parsed.started && canResumeAssignedAttempt),
          student: parsed.student || {
            id: assessment.studentId || "",
            name: assessment.candidate || "",
            accessCode: ""
          },
          scratchWork: parsed.scratchWork || {},
          eliminated: parsed.eliminated || {},
          visited: parsed.visited || {},
          answers: parsed.answers || {},
          toolsOpen: Boolean(parsed.toolsOpen),
          calculatorOpen: Boolean(parsed.calculatorOpen),
          scratchOpen: parsed.scratchOpen !== false,
          timerMode: parsed.timerMode || "remaining",
          studentLookupError: parsed.studentLookupError || "",
          reviewing: Boolean(parsed.reviewing)
        };
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  return {
    currentIndex: 0,
    answers: {},
    visited: {},
    eliminated: {},
    scratchWork: {},
    toolsOpen: false,
    calculatorOpen: false,
    scratchOpen: true,
    timerMode: "remaining",
    started: false,
    startedAt: null,
    student: {
      id: assessment.studentId || "",
      name: assessment.candidate || "",
      accessCode: ""
    },
    reviewing: false,
    studentLookupError: "",
    submitted: false,
    evaluation: null,
    remainingSeconds: assessment.durationMinutes * 60,
    total
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setState(patch, options = {}) {
  if (options.preserveQuestionScroll) {
    pendingQuestionScroll = document.querySelector(".question-pane")?.scrollTop ?? null;
  }
  captureScratch();
  state = { ...state, ...patch };
  saveState();
  render();
  if (pendingQuestionScroll !== null) {
    const pane = document.querySelector(".question-pane");
    if (pane) pane.scrollTop = pendingQuestionScroll;
    pendingQuestionScroll = null;
  }
}

function installSecurityGuards() {
  const guard = (event) => {
    if (isAdminMode()) return;
    event.preventDefault();
  };

  document.addEventListener("copy", guard);
  document.addEventListener("cut", guard);
  document.addEventListener("paste", guard);
  document.addEventListener("contextmenu", guard);
  document.addEventListener("selectstart", guard);
  document.addEventListener("dragstart", guard);

  document.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    const blocked =
      (event.ctrlKey || event.metaKey) &&
      ["a", "c", "p", "s", "u", "x"].includes(key);

    if (blocked || key === "printscreen") {
      guard(event);
    }
  });

  document.addEventListener("fullscreenchange", render);
}

function installTimer() {
  window.setInterval(() => {
    if (!state.started || state.submitted) return;

    if (state.remainingSeconds <= 1) {
      submitAssessment();
      return;
    }

    state.remainingSeconds -= 1;
    saveState();
    updateTimerOnly();
  }, 1000);
}

function getAnsweredCount() {
  return Object.keys(state.answers).length;
}

function minutesAndSeconds() {
  const secondsValue = state.timerMode === "elapsed"
    ? Math.max(0, assessment.durationMinutes * 60 - state.remainingSeconds)
    : state.remainingSeconds;
  const minutes = String(Math.floor(secondsValue / 60)).padStart(2, "0");
  const seconds = String(secondsValue % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function updateTimerOnly() {
  const timer = document.querySelector("[data-timer]");
  if (timer) timer.innerHTML = renderTimerContent();
}

function renderTimerContent() {
  return `${icons.clock} <span>${state.timerMode === "elapsed" ? "Elapsed" : "Time Remaining"}:</span> ${minutesAndSeconds()}`;
}

function getSkippedCount() {
  return questions.filter((question) => state.visited?.[question.id] && !state.answers[question.id]).length;
}

function render() {
  if (!questions.length) return;

  if (isAdminMode()) {
    renderAdminDashboard();
    return;
  }

  saveState();

  if (state.submitted) {
    renderSubmitted();
    return;
  }

  if (!state.started) {
    renderStartScreen();
    return;
  }

  if (state.reviewing) {
    renderSubmitReview();
    return;
  }

  renderAssessmentWorkspace();
}

function isAdminMode() {
  return new URLSearchParams(window.location.search).get("admin") === "1";
}

function renderAdminDashboard() {
  window.onhashchange = () => {
    if (isAdminMode()) renderAdminDashboard();
  };
  const sidebarCollapsed = localStorage.getItem("assessment-admin-sidebar-collapsed") === "1";

  root.innerHTML = `
    <main class="admin-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}">
      <aside class="admin-sidebar">
        <button class="sidebar-toggle" data-action="toggle-admin-sidebar" title="Toggle sidebar" aria-label="Toggle sidebar">${icons.grid}</button>
        <div class="brand">
          <div class="brand-mark">${icons.book}</div>
          <div>
            <span>Admin</span>
            <strong>Assessment Console</strong>
          </div>
        </div>
        <nav class="admin-nav">
          <a href="#overview" title="Overview"><span class="nav-icon">${icons.grid}</span><span class="nav-label">Overview</span></a>
          <a href="#assessments" title="Assignment Catalog"><span class="nav-icon">${icons.file}</span><span class="nav-label">Assignment Catalog</span></a>
          <a href="#assignments" title="Assignment Access"><span class="nav-icon">${icons.shield}</span><span class="nav-label">Assignment Access</span></a>
          <a href="#questions" title="Question Library"><span class="nav-icon">${icons.book}</span><span class="nav-label">Question Library</span></a>
          <a href="#import" title="Import"><span class="nav-icon">${icons.submit}</span><span class="nav-label">Import</span></a>
          <a href="#results" title="Results"><span class="nav-icon">${icons.clock}</span><span class="nav-label">Results</span></a>
          <a href="#ilp" title="ILP"><span class="nav-icon">${icons.pencil}</span><span class="nav-label">ILP</span></a>
          <a href="#database" title="Database"><span class="nav-icon">${icons.calc}</span><span class="nav-label">Database</span></a>
        </nav>
        <a class="admin-student-link" href="./" title="Open student test"><span class="nav-icon">${icons.next}</span><span class="nav-label">Open student test</span></a>
      </aside>
      <section class="admin-main">
        <header class="admin-header">
          <div>
            <p class="eyebrow">Local MVP Dashboard</p>
            <h1>Assessment Management</h1>
          </div>
          <div class="admin-actions">
            <button class="secondary-action" data-action="export-attempts-json">Export Attempts JSON</button>
            <button class="secondary-action" data-action="export-attempts-csv">Export Attempts CSV</button>
          </div>
        </header>
        <div class="admin-loading">Loading dashboard...</div>
      </section>
    </main>
  `;

  document.querySelector("[data-action='toggle-admin-sidebar']")?.addEventListener("click", () => {
    const shell = document.querySelector(".admin-shell");
    const collapsed = !shell?.classList.contains("sidebar-collapsed");
    shell?.classList.toggle("sidebar-collapsed", collapsed);
    localStorage.setItem("assessment-admin-sidebar-collapsed", collapsed ? "1" : "0");
  });

  loadAdminData().then(({ attempts, students, assignments, dataErrors, studentFilters, assessments }) => {
    paintAdminDashboard(attempts, students, assignments, dataErrors, studentFilters, assessments);
  });
}

async function loadAdminData() {
  const adapter = getDataAdapter();
  const [attempts, studentFilters, assignments, assessments] = await Promise.all([
    loadAdminDataset(() => adapter.listAttempts()),
    loadAdminDataset(() => adapter.listStudentFilters()),
    loadAdminDataset(() => adapter.listAssignments()),
    loadAdminDataset(() => adapter.listAssessments())
  ]);
  return {
    attempts: attempts.data,
    students: [],
    studentFilters: studentFilters.data,
    assignments: assignments.data,
    assessments: assessments.data?.length ? assessments.data : [getCurrentAssessmentPayload()],
    dataErrors: {
      attempts: attempts.error,
      students: studentFilters.error,
      assignments: assignments.error,
      assessments: assessments.error
    }
  };
}

async function loadAdminDataset(loader) {
  try {
    return { data: await loader(), error: "" };
  } catch (error) {
    return { data: [], error: error.message || "Could not load data" };
  }
}

function paintAdminDashboardLegacy(attempts, students) {
  const activePage = getAdminPage();
  const scoreAverage = attempts.length
    ? Math.round(attempts.reduce((sum, attempt) => sum + normalizeScore(attempt).percentage, 0) / attempts.length)
    : 0;
  const completedStudents = new Set(attempts.map((attempt) => normalizeStudent(attempt).id)).size;
  const latestAttempts = [...attempts].sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
  const topicRows = aggregateAttemptTopics(attempts);
  const validation = validateAssessment();
  const ilpAttempts = latestAttempts.filter((attempt) => attempt.ilp);

  document.querySelector(".admin-main").innerHTML = `
    <header class="admin-header">
      <div>
        <p class="eyebrow">Local MVP Dashboard</p>
        <h1>Assessment Management</h1>
      </div>
      <div class="admin-actions">
        <button class="secondary-action" data-action="export-attempts-json">Export Attempts JSON</button>
        <button class="secondary-action" data-action="export-attempts-csv">Export Attempts CSV</button>
      </div>
    </header>

    <section ${adminPageAttrs("overview", activePage)} id="overview">
      <article><span>Questions</span><strong>${questions.length}</strong></article>
      <article><span>Submitted</span><strong>${attempts.length}</strong></article>
      <article><span>Completed Students</span><strong>${completedStudents}</strong></article>
      <article><span>Average Score</span><strong>${scoreAverage}%</strong></article>
    </section>

    <section ${adminPageAttrs("assessments", activePage)}>
      <article class="admin-card" id="assessments">
        <div class="admin-card-head">
          <div>
            <p class="eyebrow">Assessment Settings</p>
            <h2>${escapeHtml(assessment.title)}</h2>
          </div>
        </div>
        <div class="assessment-config">
          <span>${questions.length} questions</span>
          <span>${assessment.durationMinutes} minutes</span>
          <span>Input: ${escapeHtml(assessment.inputFormatVersion || "mvp-1")}</span>
          <span>Source: ${escapeHtml(assessment.sourceDocument || "JSON")}</span>
        </div>
        <div class="settings-grid">
          ${renderSetting("Calculator", assessment.tools?.calculator)}
          ${renderSetting("Scratch pad", assessment.tools?.scratchpad !== false)}
          ${renderSetting("Image zoom", assessment.tools?.imageZoom !== false)}
          ${renderSetting("Answer eliminator", assessment.tools?.eliminator)}
        </div>
        <div class="admin-note">
          Student identity will come from your existing registration system later. This test engine only needs a student payload, assignment, and assessment code at launch.
        </div>
      </article>

      <article class="admin-card" id="validation">
        <div class="admin-card-head">
          <div>
            <p class="eyebrow">Quality Gate</p>
            <h2>Assessment Validation</h2>
          </div>
        </div>
        <div class="validation-score ${validation.errors.length ? "has-errors" : "clean"}">
          <strong>${validation.errors.length ? "Needs Review" : "Ready"}</strong>
          <span>${validation.errors.length} errors · ${validation.warnings.length} warnings</span>
        </div>
        ${renderValidationList("Errors", validation.errors, "No blocking errors.")}
        ${renderValidationList("Warnings", validation.warnings, "No warnings.")}
      </article>
    </section>

    <section ${adminPageAttrs("questions", activePage)}>
      <article class="admin-card" id="questions">
        <div class="admin-card-head">
          <div>
            <p class="eyebrow">Question Management</p>
            <h2>Question Bank View</h2>
          </div>
          <a class="secondary-action admin-link-button" href="./" target="_blank">Preview Student View</a>
        </div>
        <div class="question-admin-list">
          ${questions.map((question) => `
            <div>
              <strong>Q${question.number || questions.indexOf(question) + 1}</strong>
              <span>${escapeHtml(question.topic || "General")}</span>
              <p>${escapeHtml(question.question)}</p>
              <small>${question.options.length} options · Answer ${escapeHtml(String(question.answer || "").toUpperCase())} · ${question.image ? "Has image" : "No image"}</small>
            </div>
          `).join("")}
        </div>
      </article>
    </section>

    <section ${adminPageAttrs("import", activePage)}>
      <article class="admin-card" id="import">
        <div class="admin-card-head">
          <div>
            <p class="eyebrow">Import Pipeline</p>
            <h2>Word / JSON Intake</h2>
          </div>
        </div>
        <div class="pipeline-list">
          <div><strong>1</strong><span>Upload or place DOCX in input source.</span></div>
          <div><strong>2</strong><span>Convert to assessment JSON with images.</span></div>
          <div><strong>3</strong><span>Validate questions, answer keys, and image paths.</span></div>
          <div><strong>4</strong><span>Preview student experience before publishing.</span></div>
        </div>
        <div class="admin-note">
          For this MVP the converted file is <strong>input/pre-test-for-demo.json</strong>. Later this import step should become a dashboard upload workflow.
        </div>
      </article>
    </section>

    <section ${adminPageAttrs("results", activePage)} id="results">
      <div class="admin-card-head">
        <div>
          <p class="eyebrow">Performance</p>
          <h2>Results</h2>
        </div>
      </div>
      <div class="topic-report admin-topic-report">
        <h3>Topic Analysis</h3>
        ${
          topicRows.length
            ? topicRows.map((topic) => `
              <div class="topic-row">
                <span>${escapeHtml(topic.topic)}</span>
                <strong>${topic.correct}/${topic.total}</strong>
                <div class="topic-bar"><i style="width:${topic.percentage}%"></i></div>
                <em>${topic.percentage}%</em>
              </div>
            `).join("")
            : `<p class="empty-review">No attempt data yet.</p>`
        }
      </div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr><th>Student</th><th>ID</th><th>Score</th><th>Answered</th><th>Time Used</th><th>Submitted</th></tr>
          </thead>
          <tbody>
            ${
              latestAttempts.length
                ? latestAttempts.map((attempt) => {
                  const student = normalizeStudent(attempt);
                  const score = normalizeScore(attempt);
                  const timing = normalizeTiming(attempt);
                  return `<tr>
                    <td>${escapeHtml(student.name)}</td>
                    <td>${escapeHtml(student.id)}</td>
                    <td>${score.correct}/${score.total} (${score.percentage}%)</td>
                    <td>${score.answered}</td>
                    <td>${formatDuration(timing.timeUsedSeconds)}</td>
                    <td>${formatDateTime(attempt.submittedAt)}</td>
                  </tr>`;
                }).join("")
                : `<tr><td colspan="6">No submissions yet.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </section>

    <section ${adminPageAttrs("ilp", activePage)} id="ilp">
      <div class="admin-card-head">
        <div>
          <p class="eyebrow">Personalized Learning</p>
          <h2>Automatic ILP Review</h2>
        </div>
      </div>
      <div class="ilp-admin-list">
        ${
          ilpAttempts.length
            ? ilpAttempts.map((attempt) => renderAdminILPCard(attempt)).join("")
            : `<p class="empty-review">No ILPs yet. Submit a student attempt to generate one automatically.</p>`
        }
      </div>
    </section>

    <section ${adminPageAttrs("database", activePage)} id="database">
      <div class="admin-card-head">
        <div>
          <p class="eyebrow">Data Layer</p>
          <h2>Database Migration Plan</h2>
        </div>
      </div>
      <div class="database-plan">
        <article>
          <h3>Connected Now</h3>
          <p>Active provider: ${escapeHtml(DATA_PROVIDER)}. Students are looked up from your existing PostgreSQL registration data using only the student username.</p>
        </article>
        <article>
          <h3>Needed For This MVP</h3>
          <p>Student lookup, submitted attempts, answer responses, and generated ILPs. Questions can stay in JSON until the admin question library is ready.</p>
        </article>
        <article>
          <h3>Later</h3>
          <p>Move assessments, reusable questions, assignments, and assets into PostgreSQL when you want full admin-managed test publishing.</p>
        </article>
      </div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>Table</th><th>Purpose</th></tr></thead>
          <tbody>
            <tr><td>public."Student"</td><td>Existing registration table. The student enters username/email; the app uses the real student ID and name.</td></tr>
            <tr><td>test_engine_registered_students</td><td>View that maps your registration table into the test engine lookup shape.</td></tr>
            <tr><td>test_engine_attempts</td><td>Stores student attempt summary, score, timing, and raw attempt JSON.</td></tr>
            <tr><td>test_engine_responses</td><td>Stores every selected answer and correctness result.</td></tr>
            <tr><td>test_engine_ilp_plans</td><td>Stores generated individualized learning plans.</td></tr>
            <tr><td>Future library tables</td><td>Assessments, questions, assignments, and assets can be used later when JSON is replaced.</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  `;

  setAdminActiveNav(activePage);

  document.querySelector("[data-action='export-attempts-json']").addEventListener("click", () => {
    downloadText("assessment-attempts.json", JSON.stringify(attempts, null, 2), "application/json");
  });

  document.querySelector("[data-action='export-attempts-csv']").addEventListener("click", () => {
    downloadText("assessment-attempts.csv", buildAttemptsCsv(attempts), "text/csv");
  });

  document.querySelectorAll("[data-action='export-ilp']").forEach((button) => {
    button.addEventListener("click", () => {
      const attempt = attempts.find((item) => (item.attemptId || item.id) === button.dataset.attemptId);
      if (!attempt) return;
      const student = normalizeStudent(attempt);
      downloadText(
        `${fileSafe(student.id)}-ilp.json`,
        JSON.stringify(attempt.ilp || {}, null, 2),
        "application/json"
      );
    });
  });
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b));
}

function getCurrentAssessmentKey() {
  return String(assessment.sourceDocument || assessment.title || "pre-test-for-demo")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "pre-test-for-demo";
}

function getCurrentAssessmentPayload() {
  return {
    key: getCurrentAssessmentKey(),
    title: assessment.title,
    sourceDocument: assessment.sourceDocument || QUESTION_SOURCE,
    path: QUESTION_SOURCE,
    durationMinutes: assessment.durationMinutes,
    inputFormatVersion: assessment.inputFormatVersion || "mvp-1",
    tools: assessment.tools || {},
    instructions: assessment.instructions || []
  };
}

function getAssignmentAssessmentPayload() {
  const select = document.querySelector("[data-assignment-test]");
  const selectedOption = select?.selectedOptions?.[0];
  const selectedKey = select?.value || getCurrentAssessmentKey();
  return {
    ...getCurrentAssessmentPayload(),
    key: selectedKey,
    title: selectedOption?.dataset.title || assessment.title,
    sourceDocument: selectedOption?.dataset.sourceDocument || assessment.sourceDocument || QUESTION_SOURCE,
    path: selectedOption?.dataset.path || getAssessmentPathFromKey(selectedKey),
    durationMinutes: Number(selectedOption?.dataset.durationMinutes || assessment.durationMinutes || 30),
    inputFormatVersion: selectedOption?.dataset.inputFormatVersion || assessment.inputFormatVersion || "mvp-1"
  };
}

function getAssessmentPathFromKey(key) {
  return `input/assessments/${String(key || "pre-test-for-demo")}.json`;
}

function getAssessmentStatusOverrides() {
  return JSON.parse(localStorage.getItem(ASSESSMENT_STATUS_STORAGE_KEY) || "{}");
}

function getAdminPage() {
  const allowed = ["overview", "assessments", "assignments", "questions", "import", "results", "ilp", "database"];
  const page = window.location.hash.replace("#", "") || "overview";
  return allowed.includes(page) ? page : "overview";
}

function adminPageAttrs(page, activePage) {
  const baseClass = page === "overview"
    ? "admin-page admin-kpis"
    : page === "assessments" || page === "questions"
    ? "admin-page admin-grid"
    : "admin-page admin-card";
  return `class="${baseClass} ${page === activePage ? "active" : ""}" data-admin-page="${page}" ${page === activePage ? "" : "hidden"}`;
}

function setAdminActiveNav(activePage) {
  document.querySelectorAll(".admin-nav a").forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === `#${activePage}`);
    link.addEventListener("click", () => {
      window.setTimeout(renderAdminDashboard, 0);
    });
  });
}

async function findRegisteredStudent(username) {
  const normalized = normalizeIdentity(username);
  if (!normalized) throw new Error("Enter your username or email.");

  const students = await getDataAdapter().listStudents(username);

  if (!Array.isArray(students) || !students.length) {
    throw new Error(`No registered student matched "${username}".`);
  }

  return students.find((student) =>
    [student.username, student.email, student.id]
      .filter(Boolean)
      .some((value) => normalizeIdentity(value) === normalized)
  ) || null;
}

function normalizeIdentity(value) {
  return String(value || "").trim().toLowerCase();
}

async function findActiveAssignmentForStudent(studentId) {
  const assignments = await listAvailableAssignmentsForStudent(studentId);
  return assignments[0] || null;
}

async function listAvailableAssignmentsForStudent(studentId) {
  const data = await getStudentDashboardData(studentId);
  return data.availableAssignments;
}

async function getStudentDashboardData(studentId) {
  const [assignments, attempts] = await Promise.all([
    getDataAdapter().listAssignments(),
    getDataAdapter().listAttempts()
  ]);
  const studentAssignments = assignments.filter((assignment) =>
    normalizeIdentity(assignment.studentId) === normalizeIdentity(studentId)
      && assignment.status !== "cancelled"
  );
  const studentAttempts = attempts.filter((attempt) => {
    const student = normalizeStudent(attempt);
    return normalizeIdentity(student.id || attempt.studentId) === normalizeIdentity(studentId);
  });
  return {
    assignments: studentAssignments,
    availableAssignments: studentAssignments.filter((assignment) => !isAssignmentAttemptLimitReached(assignment, attempts)),
    completedAssignments: studentAssignments.filter((assignment) => isAssignmentAttemptLimitReached(assignment, attempts)),
    attempts: studentAttempts
  };
}

function isAssignmentAttemptLimitReached(assignment, attempts = []) {
  const limit = Number(assignment.attemptLimit || 1);
  const used = getAssignmentAttemptUsage(assignment, attempts);
  return used >= limit;
}

function getAssignmentAttemptUsage(assignment, attempts = []) {
  if (assignment.attemptCount !== undefined && assignment.attemptCount !== null) {
    return Number(assignment.attemptCount || 0);
  }
  return Math.max(0, countAttemptsForAssignment(assignment, attempts) - getAssignmentAttemptBaseline(assignment));
}

function getAssignmentAttemptBaseline(assignment) {
  const explicitBaseline = assignment.metadata?.attemptBaseline;
  if (explicitBaseline !== undefined && explicitBaseline !== null && explicitBaseline !== "") {
    return Number(explicitBaseline) || 0;
  }
  const history = Array.isArray(assignment.metadata?.assignmentHistory)
    ? assignment.metadata.assignmentHistory
    : [];
  const lastHistory = history[history.length - 1] || {};
  return Number(lastHistory.totalAttemptCount ?? lastHistory.attemptCount ?? 0) || 0;
}

function getAssignmentType(assignment = {}) {
  const explicitType = assignment.metadata?.assignmentType
    || assignment.assignmentType
    || assignment.assessment?.assignmentType
    || assignment.metadata?.assessment?.assignmentType;
  if (explicitType) return String(explicitType).toLowerCase();
  const title = String(assignment.assessmentTitle || assignment.title || assignment.metadata?.assessment?.title || "").toLowerCase();
  if (title.includes("worksheet")) return "worksheet";
  if (title.includes("practice")) return "practice";
  if (title.includes("diagnostic")) return "diagnostic";
  if (title.includes("pretest") || title.includes("pre-test")) return "pretest";
  return "assessment";
}

function formatAssignmentType(type) {
  const labels = {
    pretest: "Pre-test",
    worksheet: "Worksheet",
    practice: "Practice",
    diagnostic: "Diagnostic",
    assessment: "Assessment"
  };
  return labels[String(type || "").toLowerCase()] || "Assessment";
}

function countAttemptsForAssignment(assignment, attempts = []) {
  return (attempts || []).filter((attempt) => {
    const student = normalizeStudent(attempt);
    const sameStudent = normalizeIdentity(student.id || attempt.studentId) === normalizeIdentity(assignment.studentId);
    const sameAssignment = attempt.assignmentKey && String(attempt.assignmentKey) === String(assignment.id);
    const sameAssessment = (attempt.assessment?.key || attempt.assessmentKey) === assignment.assessmentKey;
    const sameTitle = (attempt.assessment?.title || attempt.assessmentTitle) === assignment.assessmentTitle;
    return sameStudent && (sameAssignment || sameAssessment || sameTitle);
  }).length;
}

async function applyAssignedAssessment(assignment) {
  const settings = assignment.metadata || {};
  const assessmentPath = settings.assessmentPath
    || settings.assessment?.path
    || getAssessmentPathFromKey(assignment.assessmentKey);
  try {
    const payload = await fetchAssessmentPayload(assessmentPath);
    assessment = {
      ...payload.assessment,
      key: assignment.assessmentKey || payload.assessment?.key,
      title: assignment.assessmentTitle || payload.assessment?.title || assessment.title,
      durationMinutes: Number(settings.durationMinutes || payload.assessment?.durationMinutes || assessment.durationMinutes || 30),
      tools: {
        ...(payload.assessment?.tools || assessment.tools || {}),
        ...(settings.tools || {})
      },
      resultOptions: {
        showResults: true,
        showAnswers: true,
        ...(settings.resultOptions || {})
      }
    };
    questions = payload.questions || questions;
    localStorage.removeItem(STORAGE_KEY);
    state = getInitialState(questions.length);
  } catch {
    assessment = {
      ...assessment,
      durationMinutes: Number(settings.durationMinutes || assessment.durationMinutes || 30),
      tools: {
        ...(assessment.tools || {}),
        ...(settings.tools || {})
      },
      resultOptions: {
        showResults: true,
        showAnswers: true,
        ...(settings.resultOptions || {})
      }
    };
  }
}

async function fetchAssessmentPayload(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error("Assigned assessment JSON was not found");
  return response.json();
}

function renderSubmitReview() {
  const answeredCount = getAnsweredCount();
  const unanswered = questions.filter((question) => !state.answers[question.id]);
  const hasExtraTime = state.remainingSeconds > 180;
  const confirmationNotes = [
    unanswered.length ? `${unanswered.length} question${unanswered.length === 1 ? "" : "s"} unanswered.` : "",
    hasExtraTime ? `${formatDuration(state.remainingSeconds)} remaining.` : ""
  ].filter(Boolean);

  root.innerHTML = `
    <main class="review-shell">
      <section class="submit-review-panel">
        <header class="review-header">
          <div>
            <p class="eyebrow">Submit confirmation</p>
            <h1>Are you sure?</h1>
            <p class="review-confirmation-message">
              ${confirmationNotes.length ? escapeHtml(confirmationNotes.join(" ")) : "Your assessment will be submitted now."}
            </p>
          </div>
          <div class="timer" data-timer aria-label="Time remaining">${renderTimerContent()}</div>
        </header>

        <div class="review-summary">
          <span><strong>${answeredCount}</strong> answered</span>
          <span><strong>${unanswered.length}</strong> unanswered</span>
          <span><strong>${getSkippedCount()}</strong> skipped</span>
        </div>

        <div class="review-grid-panel">
          ${questions.map((question, index) => renderReviewCell(question, index)).join("")}
        </div>

        <div class="review-sections">
          <section>
            <h2>Unanswered</h2>
            ${renderReviewList(unanswered, "No unanswered questions.")}
          </section>
        </div>

        <footer class="review-actions">
          <button class="secondary-action" data-action="return-to-test">Return to test</button>
          <button class="primary-action" data-action="confirm-submit">${icons.submit} Submit final</button>
        </footer>
      </section>
    </main>
  `;

  document.querySelectorAll("[data-review-index]").forEach((button) => {
    button.addEventListener("click", () => {
      setState({
        reviewing: false,
        currentIndex: Number(button.dataset.reviewIndex)
      });
    });
  });

  document.querySelector("[data-action='return-to-test']").addEventListener("click", () => {
    setState({ reviewing: false });
  });

  document.querySelector("[data-action='confirm-submit']").addEventListener("click", () => {
    submitAssessment();
  });
}

function renderReviewCell(question, index) {
  const answered = Boolean(state.answers[question.id]);
  const skipped = Boolean(state.visited?.[question.id]) && !answered;
  const classes = [
    "review-cell",
    answered ? "answered" : "unanswered",
    skipped ? "skipped" : ""
  ].join(" ");

  return `
    <button class="${classes}" data-review-index="${index}">
      <strong>${index + 1}</strong>
      <span>${answered ? "Answered" : skipped ? "Skipped" : "Unanswered"}</span>
    </button>
  `;
}

function renderReviewList(items, emptyText) {
  if (!items.length) return `<p class="empty-review">${emptyText}</p>`;

  return `
    <div class="review-list">
      ${items.map((question) => `
        <button data-review-index="${questions.indexOf(question)}">
          Question ${question.number || questions.indexOf(question) + 1}
        </button>
      `).join("")}
    </div>
  `;
}

function renderSetting(label, enabled) {
  return `
    <div class="setting-pill ${enabled ? "enabled" : "disabled"}">
      <strong>${escapeHtml(label)}</strong>
      <span>${enabled ? "Enabled" : "Disabled"}</span>
    </div>
  `;
}

function validateAssessment() {
  const errors = [];
  const warnings = [];
  const ids = new Set();

  if (!assessment.title) errors.push("Assessment title is missing.");
  if (!assessment.durationMinutes || assessment.durationMinutes <= 0) errors.push("Duration must be greater than 0.");
  if (!questions.length) errors.push("No questions found.");

  for (const question of questions) {
    const label = `Question ${question.number || question.id}`;
    if (!question.id) errors.push(`${label}: missing question id.`);
    if (ids.has(question.id)) errors.push(`${label}: duplicate question id ${question.id}.`);
    ids.add(question.id);
    if (question.type !== "mcq") errors.push(`${label}: only MCQ questions are supported in this MVP.`);
    if (!question.question) errors.push(`${label}: missing question text.`);
    if (!Array.isArray(question.options) || question.options.length !== 4) {
      errors.push(`${label}: expected exactly 4 options.`);
    }
    if (!question.answer) errors.push(`${label}: missing answer key.`);
    if (question.answer && !question.options.some((option) => option.id === question.answer)) {
      errors.push(`${label}: answer key does not match an option id.`);
    }
    if (!question.topic) warnings.push(`${label}: topic is missing.`);
    if (!question.explanation) warnings.push(`${label}: explanation is missing.`);
    if (!question.image && question.imageDescription) warnings.push(`${label}: has image description but no extracted image.`);
  }

  return { errors, warnings };
}

function renderValidationList(title, items, emptyText) {
  return `
    <div class="validation-list">
      <h3>${escapeHtml(title)}</h3>
      ${
        items.length
          ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
          : `<p class="empty-review">${escapeHtml(emptyText)}</p>`
      }
    </div>
  `;
}

function renderAdminILPCard(attempt) {
  const student = normalizeStudent(attempt);
  const score = normalizeScore(attempt);
  const ilp = attempt.ilp || generateILP(attempt.responses || [], attempt.summary?.topicBreakdown || [], [], []);

  return `
    <article class="ilp-card">
      <div class="ilp-card-head">
        <div>
          <strong>${escapeHtml(student.name)}</strong>
          <span>${escapeHtml(student.id)} · ${score.percentage}% · ${escapeHtml(ilp.readinessLevel)}</span>
        </div>
        <button class="secondary-action" data-action="export-ilp" data-attempt-id="${escapeAttribute(attempt.attemptId || attempt.id)}">Export ILP</button>
      </div>
      <div class="performance-panels">
        <section>
          <h2>Priority Skills</h2>
          ${
            ilp.prioritySkills?.length
              ? ilp.prioritySkills.slice(0, 4).map((skill) => `
                <div class="skill-gap">
                  <strong>${escapeHtml(skill.topic)}</strong>
                  <span>${escapeHtml(skill.lesson)}</span>
                  <p>${escapeHtml(skill.recommendation)}</p>
                </div>
              `).join("")
              : `<p class="empty-review">No priority gaps detected.</p>`
          }
        </section>
        <section>
          <h2>Teacher Notes</h2>
          ${renderTagList(ilp.teacherNotes || [], "No notes generated.")}
        </section>
      </div>
    </article>
  `;
}

function renderGridCell(question, index) {
  const isAnswered = Boolean(state.answers[question.id]);
  const isSkipped = Boolean(state.visited?.[question.id]) && !isAnswered;
  const classes = [
    "grid-cell",
    index === state.currentIndex ? "active" : "",
    isAnswered ? "answered" : "",
    isSkipped ? "skipped" : ""
  ].join(" ");

  return `<button class="${classes}" data-question-index="${index}" aria-label="Question ${index + 1}">${index + 1}</button>`;
}

function renderOption(question, option) {
  const selected = state.answers[question.id] === option.id;
  const isEliminated = Boolean(state.eliminated?.[question.id]?.[option.id]);

  return `
    <button class="option ${selected ? "selected" : ""} ${isEliminated ? "eliminated" : ""}" data-option-id="${escapeAttribute(option.id)}" ${isEliminated ? "aria-disabled=\"true\"" : ""}>
      <span class="option-letter">${escapeHtml(option.id.toUpperCase())}</span>
      <span class="option-body">
        <span>${escapeHtml(option.label)}</span>
        ${option.image ? `<img src="${escapeAttribute(assetUrl(option.image))}" alt="" draggable="false" />` : ""}
        ${isEliminated ? `<small class="eliminated-note">Eliminated</small>` : ""}
      </span>
      ${assessment.tools?.eliminator ? `<span class="eliminate" data-eliminate-id="${escapeAttribute(option.id)}" title="${isEliminated ? "Restore this option" : "Eliminate this option"}">${isEliminated ? "+" : "-"}</span>` : ""}
    </button>
  `;
}

function renderQuestionMedia(question) {
  if (question.image) {
    return `
      <figure class="question-image">
        <img src="${escapeAttribute(assetUrl(question.image))}" alt="${escapeAttribute(question.imageDescription || "")}" draggable="false" />
        ${assessment.tools?.imageZoom !== false ? `<button class="image-zoom" data-zoom-image="${escapeAttribute(assetUrl(question.image))}" title="Open image zoom">${icons.zoom} Zoom</button>` : ""}
      </figure>
    `;
  }

  if (question.imageDescription) {
    return `
      <div class="diagram-note">
        <strong>Diagram</strong>
        <span>${escapeHtml(question.imageDescription)}</span>
      </div>
    `;
  }

  return "";
}

function assetUrl(src) {
  return String(src || "").replace(/^\/+/, "");
}

function renderCalculator() {
  return `
    <section class="calculator ${state.calculatorOpen ? "open" : ""}">
      <div class="calculator-head">
        <div>
          <p class="eyebrow">Tool</p>
          <h3>Calculator</h3>
        </div>
        <button class="icon-button" data-action="toggle-calculator" title="Toggle calculator">${icons.calc}</button>
      </div>
      <div class="calculator-body">
        <input class="calculator-display" value="${escapeAttribute(calculatorValue)}" readonly aria-label="Calculator display" />
        <div class="calculator-grid">
          ${["7","8","9","/","4","5","6","*","1","2","3","-","0",".","=","+"].map((key) => `<button data-calc-key="${key}">${key}</button>`).join("")}
          <button data-calc-key="clear" class="wide">Clear</button>
        </div>
      </div>
    </section>
  `;
}

function bindActions() {
  document.querySelectorAll("[data-question-index]").forEach((button) => {
    button.addEventListener("click", () => {
      setState(markVisited({
        currentIndex: Number(button.dataset.questionIndex)
      }));
    });
  });

  document.querySelectorAll("[data-option-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const question = questions[state.currentIndex];
      const optionId = button.dataset.optionId;
      if (state.eliminated?.[question.id]?.[optionId]) return;
      setState({
        answers: { ...state.answers, [question.id]: optionId }
      }, { preserveQuestionScroll: true });
    });
  });

  document.querySelectorAll("[data-eliminate-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const question = questions[state.currentIndex];
      const optionId = button.dataset.eliminateId;
      const allEliminated = state.eliminated || {};
      const questionEliminated = allEliminated[question.id] || {};
      const nextQuestionEliminated = {
        ...questionEliminated,
        [optionId]: !questionEliminated[optionId]
      };
      const nextAnswers = { ...state.answers };
      if (nextQuestionEliminated[optionId] && nextAnswers[question.id] === optionId) {
        delete nextAnswers[question.id];
      }
      setState({
        answers: nextAnswers,
        eliminated: {
          ...allEliminated,
          [question.id]: nextQuestionEliminated
        }
      }, { preserveQuestionScroll: true });
    });
  });

  document.querySelector("[data-action='fullscreen']")?.addEventListener("click", () => {
    document.documentElement.requestFullscreen?.();
  });

  document.querySelector("[data-action='toggle-calculator']")?.addEventListener("click", () => {
    setState({ calculatorOpen: !state.calculatorOpen });
  });

  document.querySelector(".tool-dock")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    if (button.dataset.action === "open-tool") {
      const panel = button.dataset.toolPanel;
      setState({
        toolsOpen: true,
        calculatorOpen: panel === "calculator",
        scratchOpen: panel === "scratch"
      });
    }

    if (button.dataset.action === "close-tools") {
      setState({ toolsOpen: false });
    }

    if (button.dataset.action === "toggle-tools") {
      setState({ toolsOpen: !state.toolsOpen });
    }
  });

  document.querySelector("[data-action='toggle-scratch']")?.addEventListener("click", () => {
    setState({ scratchOpen: !state.scratchOpen });
  });

  document.querySelector("[data-action='toggle-timer']")?.addEventListener("click", () => {
    setState({ timerMode: state.timerMode === "elapsed" ? "remaining" : "elapsed" });
  });

  document.querySelectorAll("[data-calc-key]").forEach((button) => {
    button.addEventListener("click", () => pressCalculator(button.dataset.calcKey));
  });

  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.addEventListener("click", () => {
      scratchTool = button.dataset.tool;
      render();
    });
  });

  document.querySelectorAll("[data-color]").forEach((button) => {
    button.addEventListener("click", () => {
      scratchColor = button.dataset.color;
      scratchTool = "pencil";
      render();
    });
  });

  document.querySelector("[data-action='clear-scratch']")?.addEventListener("click", () => {
    const canvas = document.querySelector(".scratch-canvas");
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const question = questions[state.currentIndex];
    setState({
      scratchWork: { ...state.scratchWork, [question.id]: null }
    });
  });

  document.querySelectorAll("[data-zoom-image]").forEach((button) => {
    button.addEventListener("click", () => openImageZoom(button.dataset.zoomImage));
  });

  document.querySelector("[data-action='previous']")?.addEventListener("click", () => {
    setState(markVisited({ currentIndex: Math.max(0, state.currentIndex - 1) }));
  });

  document.querySelector("[data-action='next']")?.addEventListener("click", () => {
    setState(markVisited({ currentIndex: Math.min(questions.length - 1, state.currentIndex + 1) }));
  });

  document.querySelector("[data-action='submit']")?.addEventListener("click", () => {
    setState({ reviewing: true });
  });
}

function markVisited(patch = {}) {
  const question = questions[state.currentIndex];
  if (!question) return patch;
  return {
    ...patch,
    visited: {
      ...(state.visited || {}),
      [question.id]: true
    }
  };
}

function submitAssessment() {
  const evaluation = buildEvaluation();
  pendingAttemptSave = saveAttempt(evaluation);
  setState({
    remainingSeconds: Math.max(0, state.remainingSeconds),
    submitted: true,
    evaluation
  });
}

function buildEvaluation() {
  const responses = questions.map((question) => {
    const selected = state.answers[question.id] || null;
    const selectedOption = question.options.find((option) => option.id === selected);
    const correctOption = question.options.find((option) => option.id === question.answer);

    return {
      questionId: question.id,
      number: question.number,
      topic: question.topic,
      level: question.level || question.topic,
      selected,
      selectedLabel: selectedOption?.label || "",
      correctAnswer: question.answer,
      correctLabel: correctOption?.label || "",
      isCorrect: selected === question.answer,
      explanation: question.explanation || "",
      distractorFeedback: selected && question.distractors?.[selected]
        ? question.distractors[selected]
        : null
    };
  });

  const correct = responses.filter((response) => response.isCorrect).length;
  const answered = getAnsweredCount();
  const total = questions.length;
  const percentage = Math.round((correct / total) * 100);
  const submittedAt = new Date().toISOString();
  const durationSeconds = assessment.durationMinutes * 60;
  const timeUsedSeconds = Math.max(0, durationSeconds - state.remainingSeconds);
  const topicBreakdown = buildTopicBreakdown(responses);
  const attemptId = `${state.student?.id || assessment.studentId || "demo-student"}-${Date.now()}`;
  const strengths = topicBreakdown
    .filter((topic) => topic.total > 0 && topic.percentage >= 75)
    .map((topic) => topic.topic);
  const needsReview = topicBreakdown
    .filter((topic) => topic.total > 0 && topic.percentage < 75)
    .map((topic) => topic.topic);
  const ilp = generateILP(responses, topicBreakdown, strengths, needsReview);

  return {
    schemaVersion: ATTEMPT_SCHEMA_VERSION,
    id: attemptId,
    attemptId,
    studentId: state.student?.id || assessment.studentId || "demo-student",
    studentName: state.student?.name || assessment.candidate || "Demo Candidate",
    assessmentTitle: assessment.title,
    assignmentKey: state.assignment?.id || null,
    assessmentKey: state.assignment?.assessmentKey || assessment.key || null,
    assignmentType: getAssignmentType(state.assignment || { metadata: state.assignmentSettings || {}, assessmentTitle: assessment.title }),
    submittedAt,
    startedAt: state.startedAt,
    student: {
      id: state.student?.id || assessment.studentId || "demo-student",
      name: state.student?.name || assessment.candidate || "Demo Candidate",
      accessCode: state.student?.accessCode || ""
    },
    assessment: {
      title: assessment.title,
      sourceDocument: assessment.sourceDocument || null,
      durationMinutes: assessment.durationMinutes,
      questionCount: total,
      inputFormatVersion: assessment.inputFormatVersion || "mvp-1",
      assignmentKey: state.assignment?.id || null,
      assessmentKey: state.assignment?.assessmentKey || assessment.key || null,
      assignmentType: getAssignmentType(state.assignment || { metadata: state.assignmentSettings || {}, assessmentTitle: assessment.title }),
      resultOptions: assessment.resultOptions || state.assignmentSettings?.resultOptions || {},
      tools: assessment.tools || {}
    },
    timing: {
      durationSeconds,
      timeUsedSeconds,
      timeRemainingSeconds: state.remainingSeconds
    },
    score: {
      correct,
      total,
      percentage,
      answered,
      unanswered: total - answered
    },
    summary: {
      strengths,
      needsReview,
      topicBreakdown
    },
    ilp,
    responses
  };
}

function generateILP(responses, topicBreakdown, strengths, needsReview) {
  const missed = responses.filter((response) => !response.isCorrect);
  const lessonMap = new Map();

  for (const response of missed) {
    const lesson = response.distractorFeedback?.lesson || response.topic || "General review";
    const feedback = response.distractorFeedback?.feedback || response.explanation || "Review the underlying skill for this question.";
    if (!lessonMap.has(lesson)) {
      lessonMap.set(lesson, {
        lesson,
        topic: response.topic || "General",
        questions: [],
        reasons: new Set(),
        recommendation: buildRecommendation(response.topic, lesson)
      });
    }

    const item = lessonMap.get(lesson);
    item.questions.push(response.number);
    item.reasons.add(feedback);
  }

  const prioritySkills = Array.from(lessonMap.values())
    .map((item) => ({
      lesson: item.lesson,
      topic: item.topic,
      questions: item.questions,
      reasons: Array.from(item.reasons),
      recommendation: item.recommendation
    }))
    .sort((a, b) => b.questions.length - a.questions.length);

  const overallPercent = responses.length
    ? Math.round((responses.filter((response) => response.isCorrect).length / responses.length) * 100)
    : 0;

  return {
    readinessLevel: getReadinessLevel(overallPercent),
    strengths,
    needsReview,
    prioritySkills,
    teacherNotes: buildTeacherNotes(prioritySkills, topicBreakdown),
    studentPlan: buildStudentPlan(prioritySkills, needsReview)
  };
}

function buildRecommendation(topic, lesson) {
  const lower = `${topic || ""} ${lesson || ""}`.toLowerCase();
  if (lower.includes("number line")) {
    return "Practice modeling addition and subtraction on horizontal number lines, focusing on start point and direction.";
  }
  if (lower.includes("decimal") || lower.includes("nbt")) {
    return "Practice aligning decimal points, adding placeholder zeroes, and checking place-value columns before calculating.";
  }
  if (lower.includes("regroup") || lower.includes("borrow")) {
    return "Practice regrouping with decimals and annotate each borrowing step before subtracting.";
  }
  return "Review the related mini-lesson, complete guided examples, then retry similar independent practice.";
}

function getReadinessLevel(percentage) {
  if (percentage >= 85) return "Ready for enrichment";
  if (percentage >= 70) return "Near mastery";
  if (percentage >= 50) return "Needs targeted support";
  return "Needs foundational support";
}

function buildTeacherNotes(prioritySkills, topicBreakdown) {
  const notes = [];
  if (prioritySkills.length) {
    notes.push(`Prioritize ${prioritySkills[0].topic}: missed questions ${prioritySkills[0].questions.join(", ")}.`);
  }
  const lowTopics = topicBreakdown.filter((topic) => topic.percentage < 60).map((topic) => topic.topic);
  if (lowTopics.length) {
    notes.push(`Low-scoring topics: ${lowTopics.join(", ")}.`);
  }
  if (!notes.length) {
    notes.push("Student is performing consistently; consider enrichment or mixed review.");
  }
  return notes;
}

function buildStudentPlan(prioritySkills, needsReview) {
  if (!prioritySkills.length) {
    return [
      "Review your correct strategies and complete one enrichment set.",
      "Explain your solution steps for two problems to confirm mastery."
    ];
  }

  return prioritySkills.slice(0, 3).map((skill, index) =>
    `${index + 1}. ${skill.recommendation}`
  ).concat(needsReview.length ? [`Complete a short mixed practice set for: ${needsReview.join(", ")}.`] : []);
}

function buildTopicBreakdown(responses) {
  const byTopic = new Map();
  for (const response of responses) {
    const topic = response.topic || "General";
    if (!byTopic.has(topic)) {
      byTopic.set(topic, { topic, correct: 0, total: 0, unanswered: 0 });
    }

    const current = byTopic.get(topic);
    current.total += 1;
    if (response.isCorrect) current.correct += 1;
    if (!response.selected) current.unanswered += 1;
  }

  return Array.from(byTopic.values()).map((topic) => ({
    ...topic,
    percentage: Math.round((topic.correct / topic.total) * 100)
  }));
}

function saveAttempt(evaluation) {
  return getDataAdapter().saveAttempt(evaluation).catch(() => {
    saveAttemptLocally(evaluation);
    return evaluation;
  });
}

function getDataAdapter() {
  if (DATA_PROVIDER === "local") return localDataAdapter;
  if (DATA_PROVIDER === "api" && API_BASE_URL) return apiDataAdapter;
  return localDataAdapter;
}

function saveAttemptLocally(evaluation) {
  if (!("indexedDB" in window)) {
    const key = "assessment-engine-results-fallback";
    const previous = JSON.parse(localStorage.getItem(key) || "[]");
    previous.push(evaluation);
    localStorage.setItem(key, JSON.stringify(previous.slice(-10000)));
    return;
  }

  const request = indexedDB.open(RESULTS_DB_NAME, 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    const store = db.createObjectStore(RESULTS_STORE, { keyPath: "id" });
    store.createIndex("studentId", "student.id", { unique: false });
    store.createIndex("assessmentTitle", "assessment.title", { unique: false });
    store.createIndex("submittedAt", "submittedAt", { unique: false });
  };
  request.onsuccess = () => {
    const db = request.result;
    const transaction = db.transaction(RESULTS_STORE, "readwrite");
    transaction.objectStore(RESULTS_STORE).put(evaluation);
  };
}

const localDataAdapter = {
  async listAssessments() {
    try {
      const response = await fetch(ASSESSMENT_CATALOG_SOURCE);
      if (!response.ok) throw new Error("Assessment catalog was not found");
      const payload = await response.json();
      const statusOverrides = getAssessmentStatusOverrides();
      return (payload.assessments || []).map((item) => ({
        ...item,
        status: statusOverrides[item.key] || item.status || "published"
      }));
    } catch (error) {
      return [getCurrentAssessmentPayload()];
    }
  },

  async updateAssessmentStatus(key, status) {
    const overrides = getAssessmentStatusOverrides();
    overrides[key] = status;
    localStorage.setItem(ASSESSMENT_STATUS_STORAGE_KEY, JSON.stringify(overrides));
    return { ok: true, key, status };
  },

  async saveAttempt(evaluation) {
    saveAttemptLocally(evaluation);
    const assignments = await this.listAssignments();
    const assignmentId = evaluation.assignmentKey || evaluation.assessment?.assignmentKey;
    if (assignmentId) {
      const next = assignments.map((assignment) => {
        if (String(assignment.id) !== String(assignmentId)) return assignment;
        const attemptCount = Number(assignment.attemptCount || 0) + 1;
        return {
          ...assignment,
          attemptCount,
          status: attemptCount >= Number(assignment.attemptLimit || 1) ? "completed" : "assigned"
        };
      });
      localStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(next));
    }
    return evaluation;
  },

  async listAttempts() {
    if (!("indexedDB" in window)) {
      return JSON.parse(localStorage.getItem("assessment-engine-results-fallback") || "[]");
    }

    return new Promise((resolve) => {
      const request = indexedDB.open(RESULTS_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(RESULTS_STORE)) {
          const store = db.createObjectStore(RESULTS_STORE, { keyPath: "id" });
          store.createIndex("studentId", "studentId", { unique: false });
          store.createIndex("assessmentTitle", "assessmentTitle", { unique: false });
          store.createIndex("submittedAt", "submittedAt", { unique: false });
        }
      };
      request.onerror = () => resolve([]);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(RESULTS_STORE)) {
          resolve([]);
          return;
        }
        const transaction = db.transaction(RESULTS_STORE, "readonly");
        const getAll = transaction.objectStore(RESULTS_STORE).getAll();
        getAll.onsuccess = () => resolve(getAll.result || []);
        getAll.onerror = () => resolve([]);
      };
    });
  },

  async listStudents(search = "") {
    const savedStudents = JSON.parse(localStorage.getItem(STUDENTS_STORAGE_KEY) || "[]");
    const students = savedStudents.length ? savedStudents : DEMO_STUDENTS;
    if (!search) return students;
    const normalized = search.toLowerCase();
    return students.filter((student) => {
      return [student.username, student.email, student.id, student.name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized));
    });
  },

  async listStudentFilters() {
    const students = await this.listStudents();
    return {
      schools: uniqueValues(students.map((student) => student.schoolName)),
      grades: uniqueValues(students.map((student) => student.gradeLevel)),
      totalStudents: students.length
    };
  },

  async searchStudents(params = {}) {
    const students = await this.listStudents(params.search || "");
    const filtered = students.filter((student) => {
      return (!params.school || student.schoolName === params.school)
        && (!params.grade || student.gradeLevel === params.grade);
    });
    const limit = Number(params.limit || 25);
    const offset = Number(params.offset || 0);
    return {
      items: filtered.slice(offset, offset + limit),
      total: filtered.length,
      limit,
      offset
    };
  },

  async saveStudent(student) {
    const students = await this.listStudents();
    const next = [
      student,
      ...students.filter((existing) => existing.id !== student.id)
    ];
    localStorage.setItem(STUDENTS_STORAGE_KEY, JSON.stringify(next));
    return student;
  },

  async listAssignments() {
    return JSON.parse(localStorage.getItem(ASSIGNMENTS_STORAGE_KEY) || "[]");
  },

  async saveAssignments(payload) {
    const previous = await this.listAssignments();
    const assessmentKey = payload.assessment?.key || getCurrentAssessmentKey();
    const now = new Date().toISOString();
    const incoming = (payload.studentIds || []).map((studentId) => ({
      id: `${assessmentKey}-${studentId}`,
      studentId,
      assessmentKey,
      assessmentTitle: payload.assessment?.title || assessment.title,
      assignedAt: now,
      dueAt: payload.dueAt || null,
      attemptLimit: Number(payload.attemptLimit || 1),
      status: "assigned",
      metadata: {
        ...(payload.metadata || {}),
        ...(payload.perStudentSettings?.[studentId] || {}),
        assessment: payload.assessment || {}
      }
    }));
    const previousById = new Map(previous.map((item) => [String(item.id), item]));
    const mergedIncoming = incoming.map((item) => {
      const existing = previousById.get(String(item.id));
      if (!existing) return item;
      const attemptCount = Number(existing.totalAssessmentAttemptCount ?? existing.attemptCount ?? 0);
      const previousBaseline = getAssignmentAttemptBaseline(existing);
      const previousWindowAttempts = Math.max(0, attemptCount - previousBaseline);
      const previousHistory = Array.isArray(existing.metadata?.assignmentHistory)
        ? existing.metadata.assignmentHistory
        : [];
      return {
        ...existing,
        ...item,
        assignedAt: now,
        attemptLimit: Number(payload.attemptLimit || 1),
        attemptCount: 0,
        totalAssessmentAttemptCount: attemptCount,
        status: "assigned",
        metadata: {
          ...(existing.metadata || {}),
          ...(item.metadata || {}),
          attemptBaseline: attemptCount,
          assignmentHistory: [
            ...previousHistory,
            {
              assignedAt: existing.assignedAt,
              attemptLimit: existing.attemptLimit,
              status: existing.status,
              attemptBaseline: previousBaseline,
              attemptCount: previousWindowAttempts,
              totalAttemptCount: attemptCount,
              replacedAt: now
            }
          ]
        }
      };
    });
    const incomingKeys = new Set(mergedIncoming.map((item) => item.id));
    const next = [
      ...mergedIncoming,
      ...previous.filter((item) => !incomingKeys.has(item.id))
    ];
    localStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(next));
    return { ok: true, assigned: incoming.length };
  },

  async cancelAssignments(payload) {
    const assignmentIds = new Set((payload.assignmentIds || []).map(String));
    const previous = await this.listAssignments();
    const next = previous.map((assignment) => (
      assignmentIds.has(String(assignment.id))
        ? { ...assignment, status: "cancelled" }
        : assignment
    ));
    localStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(next));
    return { ok: true, cancelled: assignmentIds.size };
  }
};

const apiDataAdapter = {
  async listAssessments() {
    const response = await fetch(`${API_BASE_URL}/api/assessments`);
    if (!response.ok) throw new Error("Could not load assessments");
    return response.json();
  },

  async updateAssessmentStatus(key, status) {
    const response = await fetch(`${API_BASE_URL}/api/assessments/${encodeURIComponent(key)}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    if (!response.ok) throw new Error("Could not update assessment status");
    return response.json();
  },

  async saveAttempt(evaluation) {
    const response = await fetch(`${API_BASE_URL}/api/attempts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(evaluation)
    });
    if (!response.ok) throw new Error("Could not save attempt");
    return response.json();
  },

  async listAttempts() {
    const response = await fetch(`${API_BASE_URL}/api/attempts`);
    if (!response.ok) throw new Error("Could not load attempts");
    return response.json();
  },

  async listStudents(search = "") {
    const url = new URL(`${API_BASE_URL}/api/students`);
    if (search) url.searchParams.set("search", search);
    const response = await fetch(url);
    if (!response.ok) throw new Error("Could not load students");
    return response.json();
  },

  async listStudentFilters() {
    const response = await fetch(`${API_BASE_URL}/api/student-filters`);
    if (!response.ok) throw new Error("Could not load student filters");
    return response.json();
  },

  async searchStudents(params = {}) {
    const url = new URL(`${API_BASE_URL}/api/students`);
    url.searchParams.set("paged", "1");
    url.searchParams.set("limit", String(params.limit || 25));
    url.searchParams.set("offset", String(params.offset || 0));
    if (params.search) url.searchParams.set("search", params.search);
    if (params.school) url.searchParams.set("school", params.school);
    if (params.grade) url.searchParams.set("grade", params.grade);
    const response = await fetch(url);
    if (!response.ok) throw new Error("Could not search students");
    return response.json();
  },

  async saveStudent(student) {
    const response = await fetch(`${API_BASE_URL}/api/students`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(student)
    });
    if (!response.ok) throw new Error("Could not save student");
    return response.json();
  },

  async listAssignments() {
    const response = await fetch(`${API_BASE_URL}/api/assignments`);
    if (!response.ok) throw new Error("Could not load assignments");
    return response.json();
  },

  async saveAssignments(payload) {
    const response = await fetch(`${API_BASE_URL}/api/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error("Could not save assignments");
    return response.json();
  },

  async cancelAssignments(payload) {
    const response = await fetch(`${API_BASE_URL}/api/assignments/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error("Could not unassign assessment");
    return response.json();
  }
};

function aggregateAttemptTopics(attempts) {
  const byTopic = new Map();
  for (const attempt of attempts) {
    for (const topic of attempt.summary?.topicBreakdown || buildTopicBreakdown(attempt.responses || [])) {
      if (!byTopic.has(topic.topic)) {
        byTopic.set(topic.topic, { topic: topic.topic, correct: 0, total: 0 });
      }
      const current = byTopic.get(topic.topic);
      current.correct += topic.correct;
      current.total += topic.total;
    }
  }

  return Array.from(byTopic.values()).map((topic) => ({
    ...topic,
    percentage: topic.total ? Math.round((topic.correct / topic.total) * 100) : 0
  }));
}

function pressCalculator(key) {
  if (key === "clear") {
    calculatorValue = "";
  } else if (key === "=") {
    try {
      if (/^[0-9+\-*/. ()]+$/.test(calculatorValue)) {
        calculatorValue = String(Function(`"use strict"; return (${calculatorValue})`)());
      }
    } catch {
      calculatorValue = "Error";
    }
  } else {
    calculatorValue = calculatorValue === "Error" ? key : calculatorValue + key;
  }

  const display = document.querySelector(".calculator-display");
  if (display) display.value = calculatorValue;
}

function initScratchPad() {
  const canvas = document.querySelector(".scratch-canvas");
  if (!canvas) return;

  const context = canvas.getContext("2d");
  context.lineCap = "round";
  context.lineJoin = "round";

  const question = questions[state.currentIndex];
  const saved = state.scratchWork?.[question.id];
  if (saved) {
    const image = new Image();
    image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.src = saved;
  }

  const point = (event) => {
    const rect = canvas.getBoundingClientRect();
    const source = event.touches?.[0] || event;
    return {
      x: ((source.clientX - rect.left) / rect.width) * canvas.width,
      y: ((source.clientY - rect.top) / rect.height) * canvas.height
    };
  };

  const start = (event) => {
    event.preventDefault();
    drawing = true;
    const p = point(event);
    context.beginPath();
    context.moveTo(p.x, p.y);
  };

  const draw = (event) => {
    if (!drawing) return;
    event.preventDefault();
    const p = point(event);
    context.globalCompositeOperation = scratchTool === "eraser" ? "destination-out" : "source-over";
    context.strokeStyle = scratchColor;
    context.lineWidth = scratchTool === "eraser" ? 22 : 3;
    context.lineTo(p.x, p.y);
    context.stroke();
  };

  const stop = () => {
    if (!drawing) return;
    drawing = false;
    captureScratch();
    saveState();
  };

  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", draw);
  window.addEventListener("mouseup", stop);
  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove", draw, { passive: false });
  window.addEventListener("touchend", stop);
}

function captureScratch() {
  const canvas = document.querySelector(".scratch-canvas");
  if (!canvas || !questions[state.currentIndex]) return;
  const question = questions[state.currentIndex];
  state.scratchWork = {
    ...state.scratchWork,
    [question.id]: canvas.toDataURL("image/png")
  };
}

function openImageZoom(src) {
  zoomImageSrc = src;
  zoomScale = 1;
  const overlay = document.createElement("div");
  overlay.className = "zoom-overlay";
  overlay.innerHTML = `
    <div class="zoom-toolbar" aria-label="Image zoom controls">
      <button data-zoom-control="out" title="Zoom out">-</button>
      <span data-zoom-label>100%</span>
      <button data-zoom-control="in" title="Zoom in">+</button>
      <button data-zoom-control="reset" title="Reset zoom">Reset</button>
      <button class="zoom-close" data-zoom-control="close" title="Close">Close</button>
    </div>
    <div class="zoom-stage">
      <img src="${escapeAttribute(zoomImageSrc)}" alt="" draggable="false" />
    </div>
  `;

  const image = overlay.querySelector("img");
  const label = overlay.querySelector("[data-zoom-label]");
  const applyZoom = () => {
    image.style.transform = `scale(${zoomScale})`;
    label.textContent = `${Math.round(zoomScale * 100)}%`;
  };
  const changeZoom = (amount) => {
    zoomScale = Math.min(3, Math.max(0.5, Number((zoomScale + amount).toFixed(2))));
    applyZoom();
  };

  overlay.addEventListener("click", (event) => {
    const control = event.target.closest("[data-zoom-control]");
    if (!control) {
      if (!event.target.closest("img") && !event.target.closest(".zoom-toolbar")) overlay.remove();
      return;
    }

    if (control.dataset.zoomControl === "in") changeZoom(0.2);
    if (control.dataset.zoomControl === "out") changeZoom(-0.2);
    if (control.dataset.zoomControl === "reset") {
      zoomScale = 1;
      applyZoom();
    }
    if (control.dataset.zoomControl === "close") overlay.remove();
  });
  overlay.addEventListener("wheel", (event) => {
    event.preventDefault();
    changeZoom(event.deltaY < 0 ? 0.12 : -0.12);
  }, { passive: false });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") overlay.remove();
  });
  overlay.tabIndex = -1;
  document.body.appendChild(overlay);
  overlay.focus();
}

function renderSubmitted() {
  const evaluation = state.evaluation || buildEvaluation();
  const missed = evaluation.responses.filter((response) => !response.isCorrect);
  const score = normalizeScore(evaluation);
  const student = normalizeStudent(evaluation);
  const timing = normalizeTiming(evaluation);
  const summary = evaluation.summary || {
    strengths: [],
    needsReview: [],
    topicBreakdown: buildTopicBreakdown(evaluation.responses || [])
  };
  const ilp = evaluation.ilp || generateILP(evaluation.responses || [], summary.topicBreakdown, summary.strengths, summary.needsReview);
  const resultOptions = assessment.resultOptions || state.assignmentSettings?.resultOptions || { showResults: true, showAnswers: true };

  if (resultOptions.showResults === false) {
    root.innerHTML = `
      <main class="shell locked-shell submitted-shell">
        <div class="submitted-actionbar">
          <button class="primary-action" data-action="go-dashboard">Go to Dashboard</button>
        </div>
        <section class="result-panel">
          <div class="result-icon">${icons.shield}</div>
          <p class="eyebrow">Assessment submitted</p>
          <h1>${escapeHtml(assessment.title)}</h1>
          <p>Your assessment has been submitted successfully.</p>
          <p>Results will be reviewed by your teacher.</p>
        </section>
      </main>
    `;
    bindSubmittedDashboardAction();
    return;
  }

  root.innerHTML = `
    <main class="shell locked-shell submitted-shell">
      <div class="submitted-actionbar">
        <button class="primary-action" data-action="go-dashboard">Go to Dashboard</button>
      </div>
      <section class="result-panel result-panel-wide">
        <div class="result-icon">${icons.shield}</div>
        <p class="eyebrow">Assessment submitted</p>
        <h1>${escapeHtml(assessment.title)}</h1>
        <div class="score-ring">
          <strong>${score.percentage}%</strong>
          <span>${score.correct}/${score.total} correct</span>
        </div>
        <div class="result-stats">
          <span>${score.answered} answered</span>
          <span>${score.unanswered} unanswered</span>
          <span>${formatDuration(timing.timeUsedSeconds)} used</span>
          <span>Stored for ${escapeHtml(student.name)}</span>
        </div>

        <div class="student-ilp-panel">
          <h2>Practice Plan</h2>
          <strong>${escapeHtml(ilp.readinessLevel)}</strong>
          <div class="student-plan-list">
            ${(ilp.studentPlan || []).map((item) => `<p>${escapeHtml(item)}</p>`).join("")}
          </div>
        </div>

        <div class="result-review">
          <h2>Question Review</h2>
          ${
            resultOptions.showAnswers === false
              ? `<p class="empty-review">Question answers are hidden for this assessment.</p>`
              : missed.length
              ? missed.map((response) => `
                <article class="review-item">
                  <strong>Question ${response.number}</strong>
                  <span>Your answer: ${escapeHtml(response.selected ? response.selected.toUpperCase() : "Not answered")}</span>
                  <span>Expected answer: ${escapeHtml(response.correctAnswer.toUpperCase())}</span>
                  ${response.distractorFeedback?.feedback ? `<span>Feedback: ${escapeHtml(response.distractorFeedback.feedback)}</span>` : ""}
                  <p>${escapeHtml(response.explanation)}</p>
                </article>
              `).join("")
              : `<p class="perfect-score">All questions were answered correctly.</p>`
          }
        </div>
      </section>
    </main>
  `;

  bindSubmittedDashboardAction();
}

function bindSubmittedDashboardAction() {
  document.querySelector("[data-action='go-dashboard']")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Opening dashboard...";
    try {
      await pendingAttemptSave;
      const student = state.student || {};
      const dashboardData = await getStudentDashboardData(student.id);
      localStorage.removeItem(STORAGE_KEY);
      state = getInitialState(questions.length);
      renderStudentDashboard(student, dashboardData);
    } catch (error) {
      button.disabled = false;
      button.textContent = "Go to Dashboard";
      renderStudentDashboardError(error.message || "Could not refresh your dashboard.");
    }
  });
}

function normalizeScore(evaluation) {
  return evaluation.score && typeof evaluation.score === "object"
    ? evaluation.score
    : {
      correct: evaluation.score || 0,
      total: evaluation.total || questions.length,
      percentage: evaluation.percentage || 0,
      answered: evaluation.answered || 0,
      unanswered: evaluation.unanswered || 0
    };
}

function normalizeStudent(evaluation) {
  return evaluation.student || {
    id: evaluation.studentId || "demo-student",
    name: evaluation.studentName || "Demo Candidate",
    accessCode: evaluation.accessCode || ""
  };
}

function normalizeTiming(evaluation) {
  return evaluation.timing || {
    durationSeconds: assessment.durationMinutes * 60,
    timeUsedSeconds: Math.max(0, assessment.durationMinutes * 60 - (evaluation.timeRemainingSeconds || 0)),
    timeRemainingSeconds: evaluation.timeRemainingSeconds || 0
  };
}

function renderTagList(items, emptyText) {
  if (!items.length) return `<p class="empty-review">${emptyText}</p>`;
  return `<div class="tag-list">${items.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`;
}

function buildResponseCsv(evaluation) {
  const rows = [
    ["student_id", "student_name", "assessment", "question", "topic", "selected", "correct_answer", "is_correct"]
  ];
  const student = normalizeStudent(evaluation);
  const title = evaluation.assessment?.title || evaluation.assessmentTitle || assessment.title;

  for (const response of evaluation.responses || []) {
    rows.push([
      student.id,
      student.name,
      title,
      response.number,
      response.topic,
      response.selected || "",
      response.correctAnswer,
      response.isCorrect ? "true" : "false"
    ]);
  }

  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

function buildAttemptsCsv(attempts) {
  const rows = [
    ["attempt_id", "student_id", "student_name", "assessment", "score", "total", "percentage", "answered", "unanswered", "time_used_seconds", "submitted_at"]
  ];

  for (const attempt of attempts) {
    const student = normalizeStudent(attempt);
    const score = normalizeScore(attempt);
    const timing = normalizeTiming(attempt);
    rows.push([
      attempt.attemptId || attempt.id || "",
      student.id,
      student.name,
      attempt.assessment?.title || attempt.assessmentTitle || assessment.title,
      score.correct,
      score.total,
      score.percentage,
      score.answered,
      score.unanswered,
      timing.timeUsedSeconds,
      attempt.submittedAt || ""
    ]);
  }

  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadText(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function fileSafe(value) {
  return String(value || "result").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function formatDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
