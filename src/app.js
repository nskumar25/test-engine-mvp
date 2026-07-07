const STORAGE_KEY = "assessment-engine-mvp";
const STUDENTS_STORAGE_KEY = "assessment-engine-students";
const RESULTS_DB_NAME = "assessment-engine-results";
const RESULTS_STORE = "attempts";
const ATTEMPT_SCHEMA_VERSION = "attempt-v1";
const DATA_PROVIDER = "local";
const QUESTION_SOURCE = "input/pre-test-for-demo.json";

const icons = {
  book: "&#9670;",
  grid: "&#9638;",
  clock: "&#128337;",
  flag: "&#9873;",
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
        return {
          ...parsed,
          started: Boolean(parsed.started),
          student: parsed.student || {
            id: assessment.studentId || "",
            name: assessment.candidate || "",
            accessCode: ""
          },
          scratchWork: parsed.scratchWork || {},
          eliminated: parsed.eliminated || {},
          flagged: parsed.flagged || {},
          answers: parsed.answers || {},
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
    flagged: {},
    eliminated: {},
    scratchWork: {},
    calculatorOpen: Boolean(assessment.tools?.calculator),
    started: false,
    startedAt: null,
    student: {
      id: assessment.studentId || "",
      name: assessment.candidate || "",
      accessCode: ""
    },
    reviewing: false,
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

function getFlaggedCount() {
  return Object.values(state.flagged).filter(Boolean).length;
}

function minutesAndSeconds() {
  const minutes = String(Math.floor(state.remainingSeconds / 60)).padStart(2, "0");
  const seconds = String(state.remainingSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function updateTimerOnly() {
  const timer = document.querySelector("[data-timer]");
  if (timer) timer.innerHTML = `${icons.clock} ${minutesAndSeconds()}`;
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

  const question = questions[state.currentIndex];
  const answeredCount = getAnsweredCount();
  const flaggedCount = getFlaggedCount();
  const progress = Math.round((answeredCount / questions.length) * 100);
  root.innerHTML = `
    <main class="shell" aria-label="Assessment workspace">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">${icons.book}</div>
          <div>
            <span>Current Test</span>
            <strong>${escapeHtml(assessment.title)}</strong>
          </div>
        </div>

        <div class="candidate-card">
          <span>Candidate</span>
          <strong>${escapeHtml(state.student?.name || assessment.candidate)}</strong>
        </div>

        <div class="side-section">
          <div class="side-title">${icons.grid} Questions</div>
          <div class="question-grid">
            ${questions.map(renderGridCell).join("")}
          </div>
        </div>

        <div class="legend">
          <span><i class="dot answered-dot"></i> Answered</span>
          <span><i class="dot active-dot"></i> Current</span>
          <span><i class="dot flagged-dot"></i> Flagged</span>
        </div>
      </aside>

      <section class="exam-window">
        <header class="topbar">
          <div>
            <p class="eyebrow">${escapeHtml(question.topic)}</p>
            <h1>${escapeHtml(assessment.title)}</h1>
          </div>

          <div class="top-actions">
            <div class="timer" data-timer aria-label="Time remaining">${icons.clock} ${minutesAndSeconds()}</div>
            <button class="icon-button" data-action="fullscreen" title="Enter fullscreen">${icons.fullscreen}</button>
          </div>
        </header>

        <div class="status-row">
          <div class="progress-track"><span style="width:${progress}%"></span></div>
          <strong>${answeredCount} of ${questions.length} answered</strong>
        </div>

        <section class="content-area">
          <article class="question-pane">
            <div class="question-head">
              <span>Question ${state.currentIndex + 1} of ${questions.length}</span>
              <button class="ghost-button" data-action="flag">${icons.flag} ${state.flagged[question.id] ? "Unflag" : "Flag"}</button>
            </div>

            <h2>${escapeHtml(question.question)}</h2>

            ${renderQuestionMedia(question)}

            <div class="options">
              ${question.options.map((option) => renderOption(question, option)).join("")}
            </div>
          </article>

          <aside class="worksheet">
            ${assessment.tools?.calculator ? renderCalculator() : ""}
            ${assessment.tools?.scratchpad !== false ? `
            <div class="worksheet-head">
              <div>
                <p class="eyebrow">Workspace</p>
                <h3>Scratch Pad</h3>
              </div>
              <button class="icon-button" data-action="clear-scratch" title="Clear scratch pad">${icons.clear}</button>
            </div>

            <div class="scratch-tools" role="toolbar" aria-label="Scratch pad tools">
              <button class="tool-button ${scratchTool === "pencil" ? "active" : ""}" data-tool="pencil" title="Pencil">${icons.pencil}</button>
              <button class="tool-button ${scratchTool === "eraser" ? "active" : ""}" data-tool="eraser" title="Eraser">${icons.eraser}</button>
              <button class="swatch active" data-color="#18212b" style="--swatch:#18212b" title="Black"></button>
              <button class="swatch" data-color="#365f9f" style="--swatch:#365f9f" title="Blue"></button>
              <button class="swatch" data-color="#9b4d32" style="--swatch:#9b4d32" title="Brown"></button>
            </div>
            <canvas class="scratch-canvas" width="560" height="500" aria-label="Scratch pad"></canvas>
            ` : ""}
          </aside>
        </section>

        <footer class="bottombar">
          <button class="secondary-action" data-action="previous" ${state.currentIndex === 0 ? "disabled" : ""}>${icons.previous} Previous</button>
          <div class="footer-center">
            <span>${answeredCount}/${questions.length} answered</span>
            <span>${flaggedCount} flagged</span>
          </div>
          ${
            state.currentIndex === questions.length - 1
              ? `<button class="primary-action" data-action="submit">${icons.submit} Submit</button>`
              : `<button class="primary-action" data-action="next">Next ${icons.next}</button>`
          }
        </footer>
      </section>
    </main>
  `;

  bindActions();
  initScratchPad();
}

function isAdminMode() {
  return new URLSearchParams(window.location.search).get("admin") === "1";
}

function renderAdminDashboard() {
  window.onhashchange = () => {
    if (isAdminMode()) renderAdminDashboard();
  };

  root.innerHTML = `
    <main class="admin-shell">
      <aside class="admin-sidebar">
        <div class="brand">
          <div class="brand-mark">${icons.book}</div>
          <div>
            <span>Admin</span>
            <strong>Assessment Console</strong>
          </div>
        </div>
        <nav class="admin-nav">
          <a href="#overview">Overview</a>
          <a href="#assessments">Settings</a>
          <a href="#questions">Questions</a>
          <a href="#import">Import</a>
          <a href="#results">Results</a>
          <a href="#ilp">ILP</a>
          <a href="#database">Database</a>
        </nav>
        <a class="admin-student-link" href="./">Open student test</a>
      </aside>
      <section class="admin-main">
        <header class="admin-header">
          <div>
            <p class="eyebrow">Local MVP Dashboard</p>
            <h1>Pre-Test Management</h1>
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

  loadAdminData().then(({ attempts, students }) => {
    paintAdminDashboard(attempts, students);
  });
}

async function loadAdminData() {
  const [attempts, students] = await Promise.all([
    localDataAdapter.listAttempts(),
    localDataAdapter.listStudents()
  ]);
  return { attempts, students };
}

function paintAdminDashboard(attempts, students) {
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
        <h1>Pre-Test Management</h1>
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
          <h3>Current MVP</h3>
          <p>Active provider: ${escapeHtml(DATA_PROVIDER)}. Student attempts are stored locally in IndexedDB and admin helper data is stored in localStorage through a data adapter.</p>
        </article>
        <article>
          <h3>Recommended Production Database</h3>
          <p>Supabase Postgres for assessments, questions, attempts, responses, ILPs, and external student mapping.</p>
        </article>
        <article>
          <h3>Migration Strategy</h3>
          <p>Replace adapter functions with Supabase calls. Keep the dashboard UI and attempt schema mostly unchanged.</p>
        </article>
      </div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>Table</th><th>Purpose</th></tr></thead>
          <tbody>
            <tr><td>external_students</td><td>Maps this engine to your existing registered student system.</td></tr>
            <tr><td>assessments</td><td>Stores test metadata, duration, status, and tool settings.</td></tr>
            <tr><td>questions</td><td>Stores reusable question content and answer keys.</td></tr>
            <tr><td>assessment_questions</td><td>Controls question order and assessment membership.</td></tr>
            <tr><td>attempts</td><td>Stores student attempt summary, score, timing, and status.</td></tr>
            <tr><td>responses</td><td>Stores every student answer choice and correctness result.</td></tr>
            <tr><td>ilp_plans</td><td>Stores generated individualized learning plans.</td></tr>
            <tr><td>question_assets</td><td>Stores image/file metadata for question assets.</td></tr>
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

function getAdminPage() {
  const allowed = ["overview", "assessments", "questions", "import", "results", "ilp", "database"];
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

function renderStartScreen() {
  const enabledTools = [
    assessment.tools?.calculator ? "Calculator" : null,
    assessment.tools?.scratchpad !== false ? "Scratch pad" : null,
    assessment.tools?.imageZoom !== false ? "Image zoom" : null,
    assessment.tools?.eliminator ? "Answer eliminator" : null
  ].filter(Boolean);

  root.innerHTML = `
    <main class="start-shell">
      <section class="start-panel">
        <div class="start-copy">
          <p class="eyebrow">Ready to begin</p>
          <h1>${escapeHtml(assessment.title)}</h1>
          <div class="start-facts">
            <span>${questions.length} questions</span>
            <span>${assessment.durationMinutes} minutes</span>
            <span>MCQ assessment</span>
          </div>
          <div class="instruction-list">
            ${(assessment.instructions || []).map((instruction) => `<p>${escapeHtml(instruction)}</p>`).join("")}
          </div>
          <div class="tool-list">
            ${enabledTools.map((tool) => `<span>${escapeHtml(tool)}</span>`).join("")}
          </div>
        </div>

        <form class="student-form">
          <div>
            <p class="eyebrow">Student details</p>
            <h2>Confirm your information</h2>
          </div>
          <label>
            Student name
            <input name="studentName" value="${escapeAttribute(state.student?.name || "")}" autocomplete="name" required />
          </label>
          <label>
            Student ID
            <input name="studentId" value="${escapeAttribute(state.student?.id || "")}" autocomplete="off" required />
          </label>
          <label>
            Access code
            <input name="accessCode" value="${escapeAttribute(state.student?.accessCode || "")}" autocomplete="off" placeholder="For demo, any code works" />
          </label>
          <button class="primary-action" type="submit">Begin Assessment ${icons.next}</button>
        </form>
      </section>
    </main>
  `;

  document.querySelector(".student-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setState({
      started: true,
      startedAt: new Date().toISOString(),
      student: {
        name: String(form.get("studentName") || "").trim(),
        id: String(form.get("studentId") || "").trim(),
        accessCode: String(form.get("accessCode") || "").trim()
      }
    });
  });
}

function renderSubmitReview() {
  const answeredCount = getAnsweredCount();
  const unanswered = questions.filter((question) => !state.answers[question.id]);
  const flagged = questions.filter((question) => state.flagged[question.id]);

  root.innerHTML = `
    <main class="review-shell">
      <section class="submit-review-panel">
        <header class="review-header">
          <div>
            <p class="eyebrow">Before you submit</p>
            <h1>Review your assessment</h1>
          </div>
          <div class="timer" data-timer aria-label="Time remaining">${icons.clock} ${minutesAndSeconds()}</div>
        </header>

        <div class="review-summary">
          <span><strong>${answeredCount}</strong> answered</span>
          <span><strong>${unanswered.length}</strong> unanswered</span>
          <span><strong>${flagged.length}</strong> flagged</span>
        </div>

        <div class="review-grid-panel">
          ${questions.map((question, index) => renderReviewCell(question, index)).join("")}
        </div>

        <div class="review-sections">
          <section>
            <h2>Unanswered</h2>
            ${renderReviewList(unanswered, "No unanswered questions.")}
          </section>
          <section>
            <h2>Flagged</h2>
            ${renderReviewList(flagged, "No flagged questions.")}
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
  const flagged = Boolean(state.flagged[question.id]);
  const classes = [
    "review-cell",
    answered ? "answered" : "unanswered",
    flagged ? "flagged" : ""
  ].join(" ");

  return `
    <button class="${classes}" data-review-index="${index}">
      <strong>${index + 1}</strong>
      <span>${answered ? "Answered" : "Unanswered"}${flagged ? " / Flagged" : ""}</span>
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
  const classes = [
    "grid-cell",
    index === state.currentIndex ? "active" : "",
    state.answers[question.id] ? "answered" : "",
    state.flagged[question.id] ? "flagged" : ""
  ].join(" ");

  return `<button class="${classes}" data-question-index="${index}" aria-label="Question ${index + 1}">${index + 1}</button>`;
}

function renderOption(question, option) {
  const selected = state.answers[question.id] === option.id;
  const isEliminated = Boolean(state.eliminated?.[question.id]?.[option.id]);

  return `
    <button class="option ${selected ? "selected" : ""} ${isEliminated ? "eliminated" : ""}" data-option-id="${escapeAttribute(option.id)}">
      <span class="option-letter">${escapeHtml(option.id.toUpperCase())}</span>
      <span class="option-body">
        <span>${escapeHtml(option.label)}</span>
        ${option.image ? `<img src="${escapeAttribute(assetUrl(option.image))}" alt="" draggable="false" />` : ""}
      </span>
      ${assessment.tools?.eliminator ? `<span class="eliminate" data-eliminate-id="${escapeAttribute(option.id)}" title="Eliminate option">-</span>` : ""}
    </button>
  `;
}

function renderQuestionMedia(question) {
  if (question.image) {
    return `
      <figure class="question-image">
        <img src="${escapeAttribute(assetUrl(question.image))}" alt="${escapeAttribute(question.imageDescription || "")}" draggable="false" />
        ${assessment.tools?.imageZoom !== false ? `<button class="image-zoom" data-zoom-image="${escapeAttribute(assetUrl(question.image))}" title="Zoom image">${icons.zoom}</button>` : ""}
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
      setState({ currentIndex: Number(button.dataset.questionIndex) });
    });
  });

  document.querySelectorAll("[data-option-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const question = questions[state.currentIndex];
      setState({
        answers: { ...state.answers, [question.id]: button.dataset.optionId }
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
      setState({
        eliminated: {
          ...allEliminated,
          [question.id]: {
            ...questionEliminated,
            [optionId]: !questionEliminated[optionId]
          }
        }
      }, { preserveQuestionScroll: true });
    });
  });

  document.querySelector("[data-action='fullscreen']")?.addEventListener("click", () => {
    document.documentElement.requestFullscreen?.();
  });

  document.querySelector("[data-action='flag']")?.addEventListener("click", () => {
    const question = questions[state.currentIndex];
    setState({
      flagged: { ...state.flagged, [question.id]: !state.flagged[question.id] }
    });
  });

  document.querySelector("[data-action='toggle-calculator']")?.addEventListener("click", () => {
    setState({ calculatorOpen: !state.calculatorOpen });
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
    setState({ currentIndex: Math.max(0, state.currentIndex - 1) });
  });

  document.querySelector("[data-action='next']")?.addEventListener("click", () => {
    setState({ currentIndex: Math.min(questions.length - 1, state.currentIndex + 1) });
  });

  document.querySelector("[data-action='submit']")?.addEventListener("click", () => {
    setState({ reviewing: true });
  });
}

function submitAssessment() {
  const evaluation = buildEvaluation();
  saveAttempt(evaluation);
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
      isFlagged: Boolean(state.flagged[question.id]),
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
      inputFormatVersion: assessment.inputFormatVersion || "mvp-1"
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
      unanswered: total - answered,
      flagged: getFlaggedCount()
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
  getDataAdapter().saveAttempt(evaluation);
}

function getDataAdapter() {
  if (DATA_PROVIDER === "local") return localDataAdapter;
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
  async saveAttempt(evaluation) {
    saveAttemptLocally(evaluation);
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

  async listStudents() {
    return JSON.parse(localStorage.getItem(STUDENTS_STORAGE_KEY) || "[]");
  },

  async saveStudent(student) {
    const students = await this.listStudents();
    const next = [
      student,
      ...students.filter((existing) => existing.id !== student.id)
    ];
    localStorage.setItem(STUDENTS_STORAGE_KEY, JSON.stringify(next));
    return student;
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
  const overlay = document.createElement("div");
  overlay.className = "zoom-overlay";
  overlay.innerHTML = `
    <button class="zoom-close" title="Close">Close</button>
    <img src="${escapeAttribute(src)}" alt="" draggable="false" />
  `;
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay || event.target.className === "zoom-close") overlay.remove();
  });
  document.body.appendChild(overlay);
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

  root.innerHTML = `
    <main class="shell locked-shell">
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
          <span>${score.flagged} flagged</span>
          <span>${formatDuration(timing.timeUsedSeconds)} used</span>
          <span>Stored for ${escapeHtml(student.name)}</span>
        </div>

        <div class="performance-panels">
          <section>
            <h2>Strengths</h2>
            ${renderTagList(summary.strengths, "No strong topic yet.")}
          </section>
          <section>
            <h2>Review Next</h2>
            ${renderTagList(summary.needsReview, "No review areas flagged.")}
          </section>
        </div>

        <div class="topic-report">
          <h2>Topic Breakdown</h2>
          ${summary.topicBreakdown.map((topic) => `
            <div class="topic-row">
              <span>${escapeHtml(topic.topic)}</span>
              <strong>${topic.correct}/${topic.total}</strong>
              <div class="topic-bar"><i style="width:${topic.percentage}%"></i></div>
              <em>${topic.percentage}%</em>
            </div>
          `).join("")}
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
            missed.length
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
        <button class="primary-action" data-action="restart">Restart demo</button>
      </section>
    </main>
  `;

  document.querySelector("[data-action='restart']").addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    state = getInitialState(questions.length);
    render();
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
      unanswered: evaluation.unanswered || 0,
      flagged: evaluation.flagged || 0
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
    ["attempt_id", "student_id", "student_name", "assessment", "score", "total", "percentage", "answered", "unanswered", "flagged", "time_used_seconds", "submitted_at"]
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
      score.flagged,
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
