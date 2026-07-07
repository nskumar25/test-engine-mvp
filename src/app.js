const STORAGE_KEY = "assessment-engine-mvp";
const STUDENTS_STORAGE_KEY = "assessment-engine-students-v2";
const ASSIGNMENTS_STORAGE_KEY = "assessment-engine-assignments";
const RESULTS_DB_NAME = "assessment-engine-results";
const RESULTS_STORE = "attempts";
const ATTEMPT_SCHEMA_VERSION = "attempt-v1";

const IS_GITHUB_PAGES =
  window.location.hostname.endsWith("github.io");

const CONFIGURED_DATA_PROVIDER =
  window.ASSESSMENT_DATA_PROVIDER || "api";

const CONFIGURED_API_BASE_URL =
  String(
    window.ASSESSMENT_API_BASE_URL || ""
  )
    .trim()
    .replace(/\/+$/, "");

const DATA_PROVIDER =
  CONFIGURED_DATA_PROVIDER;

const API_BASE_URL =
  DATA_PROVIDER === "api"
    ? CONFIGURED_API_BASE_URL
    : "";

const QUESTION_SOURCE =
  "input/pre-test-for-demo.json";

const ASSESSMENT_CATALOG_SOURCE =
  "input/assessment-catalog.json";

const DEMO_STUDENTS = [];

if (
  DATA_PROVIDER === "api" &&
  !API_BASE_URL
) {
  console.error(
    "ASSESSMENT_API_BASE_URL is missing. " +
    "Configure the backend API URL before loading app.js."
  );
}

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

const root =
  document.getElementById("root");


/* =========================================================
   API HELPERS
========================================================= */

async function apiRequest(
  path,
  options = {}
) {
  if (!API_BASE_URL) {
    throw new Error(
      "API URL is not configured. " +
      "Set window.ASSESSMENT_API_BASE_URL before loading the application."
    );
  }

  const url =
    `${API_BASE_URL}${path}`;

  let response;

  try {
    response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
  } catch (error) {
    console.error(
      "Network request failed:",
      url,
      error
    );

    throw new Error(
      "Could not connect to the assessment server."
    );
  }

  let payload = null;

  try {
    payload =
      await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    console.error(
      "API request failed:",
      {
        url,
        status: response.status,
        payload
      }
    );

    throw new Error(
      payload?.message ||
      payload?.error ||
      `API request failed with status ${response.status}`
    );
  }

  return payload;
}


function normalizeArrayResponse(
  payload
) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (
    payload &&
    Array.isArray(payload.items)
  ) {
    return payload.items;
  }

  if (
    payload &&
    Array.isArray(payload.data)
  ) {
    return payload.data;
  }

  if (
    payload &&
    Array.isArray(payload.students)
  ) {
    return payload.students;
  }

  if (
    payload &&
    Array.isArray(payload.assignments)
  ) {
    return payload.assignments;
  }

  if (
    payload &&
    Array.isArray(payload.attempts)
  ) {
    return payload.attempts;
  }

  return [];
}


/* =========================================================
   INITIAL ASSESSMENT LOAD
========================================================= */

fetch(QUESTION_SOURCE)
  .then((response) => {
    if (!response.ok) {
      throw new Error(
        `Question JSON request failed: ${response.status}`
      );
    }

    return response.json();
  })
  .then((payload) => {
    assessment =
      payload.assessment;

    questions =
      payload.questions;

    state =
      getInitialState(
        questions.length
      );

    installSecurityGuards();
    installTimer();
    render();
  })
  .catch((error) => {
    console.error(
      "Initial assessment load failed:",
      error
    );

    root.innerHTML = `
      <main class="shell locked-shell">
        <section class="result-panel">
          <div class="result-icon">
            ${icons.warn}
          </div>

          <p class="eyebrow">
            Could not load
          </p>

          <h1>
            Question JSON was not found
          </h1>

          <p>
            Start the local web server
            and open the application from
            the local address.
          </p>
        </section>
      </main>
    `;
  });


/* =========================================================
   STATE
========================================================= */

function getInitialState(total) {
  const saved =
    localStorage.getItem(
      STORAGE_KEY
    );

  if (saved) {
    try {
      const parsed =
        JSON.parse(saved);

      if (
        parsed.total === total
      ) {
        return {
          ...parsed,

          started:
            Boolean(
              parsed.started
            ),

          student:
            parsed.student || {
              id:
                assessment.studentId || "",

              name:
                assessment.candidate || "",

              accessCode: ""
            },

          scratchWork:
            parsed.scratchWork || {},

          eliminated:
            parsed.eliminated || {},

          visited:
            parsed.visited || {},

          answers:
            parsed.answers || {},

          toolsOpen:
            Boolean(
              parsed.toolsOpen
            ),

          calculatorOpen:
            Boolean(
              parsed.calculatorOpen
            ),

          scratchOpen:
            parsed.scratchOpen !== false,

          timerMode:
            parsed.timerMode ||
            "remaining",

          studentLookupError:
            parsed.studentLookupError ||
            "",

          reviewing:
            Boolean(
              parsed.reviewing
            )
        };
      }
    } catch {
      localStorage.removeItem(
        STORAGE_KEY
      );
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
      id:
        assessment.studentId || "",

      name:
        assessment.candidate || "",

      accessCode: ""
    },

    reviewing: false,

    studentLookupError: "",

    submitted: false,

    evaluation: null,

    remainingSeconds:
      Number(
        assessment.durationMinutes || 30
      ) * 60,

    total
  };
}


function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(state)
  );
}


function setState(
  patch,
  options = {}
) {
  if (
    options.preserveQuestionScroll
  ) {
    pendingQuestionScroll =
      document.querySelector(
        ".question-pane"
      )?.scrollTop ?? null;
  }

  captureScratch();

  state = {
    ...state,
    ...patch
  };

  saveState();
  render();

  if (
    pendingQuestionScroll !== null
  ) {
    const pane =
      document.querySelector(
        ".question-pane"
      );

    if (pane) {
      pane.scrollTop =
        pendingQuestionScroll;
    }

    pendingQuestionScroll = null;
  }
}


/* =========================================================
   SECURITY
========================================================= */

function installSecurityGuards() {
  const guard = (event) => {
    if (isAdminMode()) {
      return;
    }

    event.preventDefault();
  };

  document.addEventListener(
    "copy",
    guard
  );

  document.addEventListener(
    "cut",
    guard
  );

  document.addEventListener(
    "paste",
    guard
  );

  document.addEventListener(
    "contextmenu",
    guard
  );

  document.addEventListener(
    "selectstart",
    guard
  );

  document.addEventListener(
    "dragstart",
    guard
  );

  document.addEventListener(
    "keydown",
    (event) => {
      const key =
        event.key.toLowerCase();

      const blocked =
        (
          event.ctrlKey ||
          event.metaKey
        ) &&
        [
          "a",
          "c",
          "p",
          "s",
          "u",
          "x"
        ].includes(key);

      if (
        blocked ||
        key === "printscreen"
      ) {
        guard(event);
      }
    }
  );

  document.addEventListener(
    "fullscreenchange",
    render
  );
}


/* =========================================================
   TIMER
========================================================= */

function installTimer() {
  window.setInterval(() => {
    if (
      !state.started ||
      state.submitted
    ) {
      return;
    }

    if (
      state.remainingSeconds <= 1
    ) {
      submitAssessment();
      return;
    }

    state.remainingSeconds -= 1;

    saveState();

    updateTimerOnly();
  }, 1000);
}


function getAnsweredCount() {
  return Object.keys(
    state.answers || {}
  ).length;
}


function minutesAndSeconds() {
  const secondsValue =
    state.timerMode === "elapsed"
      ? Math.max(
          0,
          Number(
            assessment.durationMinutes || 30
          ) *
            60 -
            state.remainingSeconds
        )
      : state.remainingSeconds;

  const minutes =
    String(
      Math.floor(
        secondsValue / 60
      )
    ).padStart(2, "0");

  const seconds =
    String(
      secondsValue % 60
    ).padStart(2, "0");

  return `${minutes}:${seconds}`;
}


function updateTimerOnly() {
  const timer =
    document.querySelector(
      "[data-timer]"
    );

  if (timer) {
    timer.innerHTML =
      renderTimerContent();
  }
}


function renderTimerContent() {
  return `
    ${icons.clock}
    <span>
      ${
        state.timerMode === "elapsed"
          ? "Elapsed"
          : "Time Remaining"
      }:
    </span>
    ${minutesAndSeconds()}
  `;
}


function getSkippedCount() {
  return questions.filter(
    (question) =>
      state.visited?.[question.id] &&
      !state.answers?.[question.id]
  ).length;
}


/* =========================================================
   MAIN RENDER
========================================================= */

function render() {
  if (!questions.length) {
    return;
  }

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

  const question =
    questions[state.currentIndex];

  const answeredCount =
    getAnsweredCount();

  const skippedCount =
    getSkippedCount();

  const progress =
    Math.round(
      (
        answeredCount /
        questions.length
      ) *
        100
    );

  const toolsBody = `
    <div class="tool-panel-head">
      <div>
        <p class="eyebrow">
          Tools
        </p>

        <h3>
          Calculator & Scratch Pad
        </h3>
      </div>

      <button
        class="icon-button"
        data-action="close-tools"
        title="Close tools"
      >
        ${icons.clear}
      </button>
    </div>

    ${
      assessment.tools?.calculator
        ? renderCalculator()
        : ""
    }

    ${
      assessment.tools?.scratchpad !== false
        ? `
          <div class="worksheet-head">
            <div>
              <p class="eyebrow">
                Workspace
              </p>

              <h3>
                Scratch Pad
              </h3>
            </div>

            <div class="tool-head-actions">
              <button
                class="icon-button"
                data-action="toggle-scratch"
                title="Toggle scratch pad"
              >
                ${
                  state.scratchOpen
                    ? "-"
                    : "+"
                }
              </button>

              <button
                class="icon-button"
                data-action="clear-scratch"
                title="Clear scratch pad"
              >
                ${icons.clear}
              </button>
            </div>
          </div>

          <div
            class="scratch-body ${
              state.scratchOpen
                ? "open"
                : ""
            }"
          >
            <div
              class="scratch-tools"
              role="toolbar"
              aria-label="Scratch pad tools"
            >
              <button
                class="tool-button ${
                  scratchTool === "pencil"
                    ? "active"
                    : ""
                }"
                data-tool="pencil"
                title="Pencil"
              >
                ${icons.pencil}
              </button>

              <button
                class="tool-button ${
                  scratchTool === "eraser"
                    ? "active"
                    : ""
                }"
                data-tool="eraser"
                title="Eraser"
              >
                ${icons.eraser}
              </button>

              <button
                class="swatch active"
                data-color="#18212b"
                style="--swatch:#18212b"
                title="Black"
              ></button>

              <button
                class="swatch"
                data-color="#365f9f"
                style="--swatch:#365f9f"
                title="Blue"
              ></button>

              <button
                class="swatch"
                data-color="#c43d32"
                style="--swatch:#c43d32"
                title="Red"
              ></button>

              <button
                class="swatch"
                data-color="#9b4d32"
                style="--swatch:#9b4d32"
                title="Brown"
              ></button>
            </div>

            <canvas
              class="scratch-canvas"
              width="560"
              height="500"
              aria-label="Scratch pad"
            ></canvas>
          </div>
        `
        : ""
    }
  `;

  root.innerHTML = `
    <main
      class="shell"
      aria-label="Assessment workspace"
    >
      <aside class="sidebar">
        <div class="student-meta">
          <section>
            <span>
              Name:
            </span>

            <strong>
              ${escapeHtml(
                state.student?.name ||
                assessment.candidate ||
                ""
              )}
            </strong>
          </section>

          <section>
            <span>
              Test:
            </span>

            <strong>
              ${escapeHtml(
                assessment.title || ""
              )}
            </strong>
          </section>
        </div>

        <div class="brand question-brand">
          <div class="brand-mark">
            ${icons.grid}
          </div>

          <div>
            <span>
              Questions
            </span>

            <strong>
              ${answeredCount}/${questions.length}
              answered
            </strong>

            <small>
              ${skippedCount}
              skipped
            </small>
          </div>
        </div>

        <div class="side-section">
          <div class="question-grid">
            ${
              questions
                .map(renderGridCell)
                .join("")
            }
          </div>
        </div>

        <div class="legend">
          <span>
            <i class="dot answered-dot"></i>
            Answered
          </span>

          <span>
            <i class="dot active-dot"></i>
            Current
          </span>

          <span>
            <i class="dot skipped-dot"></i>
            Skipped
          </span>
        </div>
      </aside>

      <section
        class="exam-window ${
          state.toolsOpen
            ? ""
            : "tools-closed"
        }"
      >
        <header class="topbar">
          <div class="assessment-title">
            <p class="eyebrow">
              Pre-Test
            </p>

            <h1>
              ${escapeHtml(
                assessment.title || ""
              )}
            </h1>
          </div>

          <div class="top-actions">
            <button
              class="timer"
              data-action="toggle-timer"
              data-timer
              aria-label="Toggle timer"
            >
              ${renderTimerContent()}
            </button>

            <button
              class="icon-button"
              data-action="fullscreen"
              title="Enter fullscreen"
            >
              ${icons.fullscreen}
            </button>
          </div>
        </header>

        <div class="status-row">
          <div class="progress-track">
            <span
              style="width:${progress}%"
            ></span>
          </div>
        </div>

        <section class="content-area">
          <article class="question-pane">
            <div class="question-head">
              <span>
                Question
                ${state.currentIndex + 1}
                of
                ${questions.length}
              </span>
            </div>

            <h2>
              ${escapeHtml(
                question.question || ""
              )}
            </h2>

            ${renderQuestionMedia(question)}

            <div class="options">
              ${
                question.options
                  .map(
                    (option) =>
                      renderOption(
                        question,
                        option
                      )
                  )
                  .join("")
              }
            </div>
          </article>

          <aside
            class="tool-dock ${
              state.toolsOpen
                ? "expanded"
                : "collapsed"
            }"
            aria-label="Assessment tools"
          >
            <div class="tools-rail">
              ${
                assessment.tools
                  ?.calculator
                  ? `
                    <button
                      type="button"
                      class="${
                        state.toolsOpen &&
                        state.calculatorOpen
                          ? "active"
                          : ""
                      }"
                      data-action="open-tool"
                      data-tool-panel="calculator"
                      title="Calculator"
                      aria-label="Open calculator"
                    >
                      ${icons.calc}
                    </button>
                  `
                  : ""
              }

              ${
                assessment.tools
                  ?.scratchpad !== false
                  ? `
                    <button
                      type="button"
                      class="${
                        state.toolsOpen &&
                        state.scratchOpen
                          ? "active"
                          : ""
                      }"
                      data-action="open-tool"
                      data-tool-panel="scratch"
                      title="Scratch pad"
                      aria-label="Open scratch pad"
                    >
                      ${icons.pencil}
                    </button>
                  `
                  : ""
              }
            </div>

            ${
              state.toolsOpen
                ? `
                  <div class="tool-panel">
                    ${toolsBody}
                  </div>
                `
                : ""
            }
          </aside>
        </section>

        <footer class="bottombar">
          <div></div>

          <div class="nav-actions">
            <button
              class="primary-action"
              data-action="previous"
              ${
                state.currentIndex === 0
                  ? "disabled"
                  : ""
              }
            >
              ${icons.previous}
              Previous
            </button>

            ${
              state.currentIndex ===
              questions.length - 1
                ? `
                  <button
                    class="primary-action"
                    data-action="submit"
                  >
                    ${icons.submit}
                    Submit
                  </button>
                `
                : `
                  <button
                    class="primary-action"
                    data-action="next"
                  >
                    Next
                    ${icons.next}
                  </button>
                `
            }
          </div>
        </footer>
      </section>
    </main>
  `;

  bindActions();
  initScratchPad();
}


/* =========================================================
   ADMIN MODE
========================================================= */

function isAdminMode() {
  return (
    new URLSearchParams(
      window.location.search
    ).get("admin") === "1"
  );
}


/* =========================================================
   FIXED STUDENT LOGIN SCREEN
========================================================= */

function renderStartScreen() {
  const enabledTools = [
    assessment.tools?.calculator
      ? "Calculator"
      : null,

    assessment.tools?.scratchpad !== false
      ? "Scratch pad"
      : null,

    assessment.tools?.imageZoom !== false
      ? "Image zoom"
      : null,

    assessment.tools?.eliminator
      ? "Answer eliminator"
      : null
  ].filter(Boolean);

  root.innerHTML = `
    <main class="start-shell">
      <section class="start-panel">
        <div class="start-copy">
          <p class="eyebrow">
            Ready to begin
          </p>

          <h1>
            ${escapeHtml(
              assessment.title || ""
            )}
          </h1>

          <div class="start-facts">
            <span>
              ${questions.length}
              questions
            </span>

            <span>
              ${
                assessment.durationMinutes ||
                30
              }
              minutes
            </span>

            <span>
              MCQ assessment
            </span>
          </div>

          <div class="instruction-list">
            ${
              (
                assessment.instructions || []
              )
                .map(
                  (instruction) => `
                    <p>
                      ${escapeHtml(
                        instruction
                      )}
                    </p>
                  `
                )
                .join("")
            }
          </div>

          <div class="tool-list">
            ${
              enabledTools
                .map(
                  (tool) => `
                    <span>
                      ${escapeHtml(tool)}
                    </span>
                  `
                )
                .join("")
            }
          </div>
        </div>

        <form class="student-form">
          <div>
            <p class="eyebrow">
              Student sign in
            </p>

            <h2>
              Enter your username
            </h2>
          </div>

          <label>
            Student username

            <input
              name="studentUsername"
              value="${escapeAttribute(
                state.student?.username ||
                state.student?.email ||
                ""
              )}"
              autocomplete="username"
              placeholder="Student email or ID"
              required
            />
          </label>

          <p
            class="lookup-message"
            data-lookup-message
          >
            ${
              state.studentLookupError
                ? escapeHtml(
                    state.studentLookupError
                  )
                : "Use the username from your student registration."
            }
          </p>

          <button
            class="primary-action"
            type="submit"
          >
            Begin Assessment
            ${icons.next}
          </button>
        </form>
      </section>
    </main>
  `;

  document
    .querySelector(".student-form")
    .addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();

        const currentForm =
          event.currentTarget;

        const form =
          new FormData(currentForm);

        const username =
          String(
            form.get(
              "studentUsername"
            ) || ""
          ).trim();

        const submitButton =
          currentForm.querySelector(
            "button[type='submit']"
          );

        const message =
          currentForm.querySelector(
            "[data-lookup-message]"
          );

        if (!username) {
          message.textContent =
            "Enter your username or email.";

          return;
        }

        submitButton.disabled = true;

        message.textContent =
          "Checking student registration...";

        try {
          console.log(
            "Login attempt:",
            username
          );

          const student =
            await findRegisteredStudent(
              username
            );

          console.log(
            "Student found:",
            student
          );

          message.textContent =
            "Checking assessment assignment...";

          const assigned =
            await findActiveAssignmentForStudent(
              student.id
            );

          if (!assigned) {
            throw new Error(
              "No active assessment is assigned to this student."
            );
          }

          console.log(
            "Assignment found:",
            assigned
          );

          message.textContent =
            "Loading assigned assessment...";

          await applyAssignedAssessment(
            assigned
          );

          setState({
            started: true,

            startedAt:
              new Date().toISOString(),

            studentLookupError: "",

            remainingSeconds:
              Number(
                assessment.durationMinutes ||
                30
              ) * 60,

            assignment:
              assigned,

            assignmentSettings:
              assigned.metadata || {},

            student: {
              name:
                student.name ||
                student.fullName ||
                username,

              id:
                String(student.id),

              username:
                student.username ||
                username,

              email:
                student.email || "",

              gradeLevel:
                student.gradeLevel || "",

              section:
                student.section || ""
            }
          });
        } catch (error) {
          console.error(
            "Begin Assessment failed:",
            error
          );

          submitButton.disabled = false;

          message.textContent =
            error.message ||
            "Could not begin the assessment.";
        }
      }
    );
}


/* =========================================================
   FIXED STUDENT LOOKUP
========================================================= */

async function findRegisteredStudent(
  username
) {
  const normalizedUsername =
    normalizeIdentity(username);

  if (!normalizedUsername) {
    throw new Error(
      "Enter your student username or email."
    );
  }

  const students =
    await getDataAdapter()
      .listStudents(
        normalizedUsername
      );

  if (
    !Array.isArray(students) ||
    students.length === 0
  ) {
    throw new Error(
      `No registered student matched "${username}".`
    );
  }

  const student =
    students.find((item) => {
      const identities = [
        item.username,
        item.email,
        item.id
      ];

      return identities
        .filter(Boolean)
        .some(
          (value) =>
            normalizeIdentity(value) ===
            normalizedUsername
        );
    });

  if (!student) {
    console.error(
      "Student search returned records, but none exactly matched:",
      students
    );

    throw new Error(
      `Student "${username}" was not found. Check the username or email.`
    );
  }

  return student;
}


function normalizeIdentity(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}


/* =========================================================
   FIXED ASSIGNMENT LOOKUP
========================================================= */

async function findActiveAssignmentForStudent(
  studentId
) {
  const assignments =
    await getDataAdapter()
      .listAssignments();

  const normalizedStudentId =
    normalizeIdentity(studentId);

  console.log(
    "Assignments returned:",
    assignments
  );

  return assignments.find(
    (assignment) => {
      const sameStudent =
        normalizeIdentity(
          assignment.studentId
        ) ===
        normalizedStudentId;

      const active =
        normalizeIdentity(
          assignment.status
        ) !== "cancelled";

      return (
        sameStudent &&
        active
      );
    }
  ) || null;
}


/* =========================================================
   FIXED ASSIGNED ASSESSMENT LOAD
========================================================= */

async function applyAssignedAssessment(
  assignment
) {
  const settings =
    assignment.metadata || {};

  const assessmentPath =
    settings.assessmentPath ||
    settings.assessment?.path ||
    assignment.assessmentPath ||
    getAssessmentPathFromKey(
      assignment.assessmentKey
    );

  console.log(
    "Loading assigned assessment:",
    assessmentPath
  );

  let payload;

  try {
    payload =
      await fetchAssessmentPayload(
        assessmentPath
      );
  } catch (error) {
    console.error(
      "Assessment loading failed:",
      error
    );

    throw new Error(
      `The assigned assessment could not be loaded from "${assessmentPath}".`
    );
  }

  if (
    !payload ||
    !payload.assessment ||
    !Array.isArray(
      payload.questions
    ) ||
    payload.questions.length === 0
  ) {
    throw new Error(
      "The assigned assessment JSON is invalid or contains no questions."
    );
  }

  assessment = {
    ...payload.assessment,

    key:
      assignment.assessmentKey ||
      payload.assessment.key,

    title:
      assignment.assessmentTitle ||
      payload.assessment.title ||
      assessment.title,

    durationMinutes:
      Number(
        settings.durationMinutes ||
        payload.assessment
          .durationMinutes ||
        assessment.durationMinutes ||
        30
      ),

    tools: {
      ...(
        payload.assessment.tools ||
        {}
      ),

      ...(
        settings.tools ||
        {}
      )
    },

    resultOptions: {
      showResults: true,
      showAnswers: true,

      ...(
        settings.resultOptions ||
        {}
      )
    }
  };

  questions =
    payload.questions;

  localStorage.removeItem(
    STORAGE_KEY
  );

  state =
    getInitialState(
      questions.length
    );
}


async function fetchAssessmentPayload(
  path
) {
  if (!path) {
    throw new Error(
      "Assessment path is missing."
    );
  }

  const response =
    await fetch(path, {
      cache: "no-store"
    });

  if (!response.ok) {
    throw new Error(
      `Assessment JSON request failed: ${response.status} ${response.statusText}`
    );
  }

  const payload =
    await response.json();

  if (
    !payload.assessment ||
    !Array.isArray(
      payload.questions
    )
  ) {
    throw new Error(
      "Invalid assessment JSON structure."
    );
  }

  return payload;
}


/* =========================================================
   DATA ADAPTER
========================================================= */

function getDataAdapter() {
  if (
    DATA_PROVIDER === "api"
  ) {
    return apiDataAdapter;
  }

  return localDataAdapter;
}


/* =========================================================
   API DATA ADAPTER
========================================================= */

const apiDataAdapter = {
  async listStudents(
    search = ""
  ) {
    const query =
      encodeURIComponent(search);

    const payload =
      await apiRequest(
        `/api/students?search=${query}`
      );

    return normalizeArrayResponse(
      payload
    );
  },


  async searchStudents(
    filters = {}
  ) {
    const params =
      new URLSearchParams();

    if (filters.search) {
      params.set(
        "search",
        filters.search
      );
    }

    if (filters.grade) {
      params.set(
        "grade",
        filters.grade
      );
    }

    if (filters.school) {
      params.set(
        "school",
        filters.school
      );
    }

    params.set(
      "limit",
      String(
        filters.limit || 10
      )
    );

    params.set(
      "offset",
      String(
        filters.offset || 0
      )
    );

    const payload =
      await apiRequest(
        `/api/students?${params.toString()}`
      );

    if (
      payload &&
      Array.isArray(payload.items)
    ) {
      return {
        items:
          payload.items,

        total:
          Number(
            payload.total ||
            payload.items.length
          ),

        limit:
          Number(
            payload.limit ||
            filters.limit ||
            10
          ),

        offset:
          Number(
            payload.offset ||
            filters.offset ||
            0
          )
      };
    }

    const items =
      normalizeArrayResponse(
        payload
      );

    return {
      items,

      total:
        items.length,

      limit:
        Number(
          filters.limit || 10
        ),

      offset:
        Number(
          filters.offset || 0
        )
    };
  },


  async listStudentFilters() {
    try {
      const payload =
        await apiRequest(
          "/api/students/filters"
        );

      return payload || {
        grades: [],
        schools: [],
        totalStudents: 0
      };
    } catch (error) {
      console.warn(
        "Student filter endpoint failed:",
        error
      );

      return {
        grades: [],
        schools: [],
        totalStudents: 0
      };
    }
  },


  async listAssignments() {
    const payload =
      await apiRequest(
        "/api/assignments"
      );

    return normalizeArrayResponse(
      payload
    );
  },


  async saveAssignments(
    payload
  ) {
    return apiRequest(
      "/api/assignments",
      {
        method: "POST",
        body:
          JSON.stringify(payload)
      }
    );
  },


  async listAttempts() {
    const payload =
      await apiRequest(
        "/api/attempts"
      );

    return normalizeArrayResponse(
      payload
    );
  },


  async saveAttempt(
    attempt
  ) {
    return apiRequest(
      "/api/attempts",
      {
        method: "POST",
        body:
          JSON.stringify(attempt)
      }
    );
  },


  async listAssessments() {
    try {
      const payload =
        await apiRequest(
          "/api/assessments"
        );

      return normalizeArrayResponse(
        payload
      );
    } catch (error) {
      console.warn(
        "Assessment endpoint failed:",
        error
      );

      return [];
    }
  }
};


/* =========================================================
   LOCAL DATA ADAPTER
========================================================= */

const localDataAdapter = {
  async listStudents(
    search = ""
  ) {
    const normalized =
      normalizeIdentity(search);

    const savedStudents =
      JSON.parse(
        localStorage.getItem(
          STUDENTS_STORAGE_KEY
        ) || "[]"
      );

    const students =
      savedStudents.length
        ? savedStudents
        : DEMO_STUDENTS;

    if (!normalized) {
      return students;
    }

    return students.filter(
      (student) =>
        [
          student.username,
          student.email,
          student.id,
          student.name
        ]
          .filter(Boolean)
          .some((value) =>
            normalizeIdentity(
              value
            ).includes(
              normalized
            )
          )
    );
  },


  async searchStudents(
    filters = {}
  ) {
    const students =
      await this.listStudents(
        filters.search || ""
      );

    const filtered =
      students.filter(
        (student) => {
          const gradeMatch =
            !filters.grade ||
            String(
              student.gradeLevel ||
              ""
            ) ===
              String(
                filters.grade
              );

          const schoolMatch =
            !filters.school ||
            String(
              student.schoolName ||
              ""
            ) ===
              String(
                filters.school
              );

          return (
            gradeMatch &&
            schoolMatch
          );
        }
      );

    const limit =
      Number(
        filters.limit || 10
      );

    const offset =
      Number(
        filters.offset || 0
      );

    return {
      items:
        filtered.slice(
          offset,
          offset + limit
        ),

      total:
        filtered.length,

      limit,

      offset
    };
  },


  async listStudentFilters() {
    const students =
      await this.listStudents("");

    return {
      grades:
        uniqueValues(
          students.map(
            (student) =>
              student.gradeLevel
          )
        ),

      schools:
        uniqueValues(
          students.map(
            (student) =>
              student.schoolName
          )
        ),

      totalStudents:
        students.length
    };
  },


  async listAssignments() {
    return JSON.parse(
      localStorage.getItem(
        ASSIGNMENTS_STORAGE_KEY
      ) || "[]"
    );
  },


  async saveAssignments(
    payload
  ) {
    const assignments =
      await this.listAssignments();

    const now =
      new Date().toISOString();

    const created = [];

    for (
      const studentId
      of payload.studentIds || []
    ) {
      const metadata =
        payload.perStudentSettings?.[
          studentId
        ] || {};

      const assignment = {
        id:
          crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${studentId}`,

        studentId,

        assessmentKey:
          payload.assessment?.key ||
          "",

        assessmentTitle:
          payload.assessment?.title ||
          "",

        status: "assigned",

        attemptLimit:
          payload.attemptLimit || 1,

        assignedBy:
          payload.assignedBy ||
          "admin",

        assignedAt: now,

        metadata
      };

      assignments.push(
        assignment
      );

      created.push(
        assignment
      );
    }

    localStorage.setItem(
      ASSIGNMENTS_STORAGE_KEY,
      JSON.stringify(
        assignments
      )
    );

    return {
      assigned:
        created.length,

      assignments:
        created
    };
  },


  async listAttempts() {
    return loadAttemptsFromIndexedDb();
  },


  async saveAttempt(
    attempt
  ) {
    await saveAttemptToIndexedDb(
      attempt
    );

    return attempt;
  },


  async listAssessments() {
    try {
      const response =
        await fetch(
          ASSESSMENT_CATALOG_SOURCE
        );

      if (!response.ok) {
        return [];
      }

      const payload =
        await response.json();

      return normalizeArrayResponse(
        payload
      );
    } catch {
      return [];
    }
  }
};
/* =========================================================
   ADMIN DASHBOARD
========================================================= */

function renderAdminDashboard() {
  window.onhashchange = () => {
    if (isAdminMode()) {
      renderAdminDashboard();
    }
  };

  root.innerHTML = `
    <main class="admin-shell">
      <aside class="admin-sidebar">

        <div class="brand">
          <div class="brand-mark">
            ${icons.book}
          </div>

          <div>
            <span>Admin</span>
            <strong>Assessment Console</strong>
          </div>
        </div>

        <nav class="admin-nav">
          <a href="#overview">Overview</a>
          <a href="#assessments">Settings</a>
          <a href="#assignments">Assignments</a>
          <a href="#questions">Questions</a>
          <a href="#import">Import</a>
          <a href="#results">Results</a>
          <a href="#ilp">ILP</a>
          <a href="#database">Database</a>
        </nav>

        <a
          class="admin-student-link"
          href="./"
        >
          Open student test
        </a>

      </aside>

      <section class="admin-main">

        <header class="admin-header">

          <div>
            <p class="eyebrow">
              Assessment Dashboard
            </p>

            <h1>
              Pre-Test Management
            </h1>
          </div>

          <div class="admin-actions">
            <button
              class="secondary-action"
              data-action="export-attempts-json"
            >
              Export Attempts JSON
            </button>

            <button
              class="secondary-action"
              data-action="export-attempts-csv"
            >
              Export Attempts CSV
            </button>
          </div>

        </header>

        <div class="admin-loading">
          Loading dashboard...
        </div>

      </section>
    </main>
  `;

  loadAdminData()
    .then(
      ({
        attempts,
        students,
        assignments,
        dataErrors,
        studentFilters,
        assessments
      }) => {
        paintAdminDashboard(
          attempts,
          students,
          assignments,
          dataErrors,
          studentFilters,
          assessments
        );
      }
    )
    .catch((error) => {
      console.error(
        "Admin dashboard load failed:",
        error
      );

      const main =
        document.querySelector(
          ".admin-main"
        );

      if (main) {
        main.innerHTML = `
          <div class="admin-error">
            ${
              escapeHtml(
                error.message ||
                "Could not load the admin dashboard."
              )
            }
          </div>
        `;
      }
    });
}


/* =========================================================
   ADMIN DATA LOAD
========================================================= */

async function loadAdminData() {
  const adapter =
    getDataAdapter();

  const [
    attempts,
    studentFilters,
    assignments,
    assessments
  ] = await Promise.all([
    loadAdminDataset(
      () =>
        adapter.listAttempts()
    ),

    loadAdminDataset(
      () =>
        adapter.listStudentFilters()
    ),

    loadAdminDataset(
      () =>
        adapter.listAssignments()
    ),

    loadAdminDataset(
      () =>
        adapter.listAssessments()
    )
  ]);

  return {
    attempts:
      attempts.data,

    students: [],

    studentFilters:
      studentFilters.data,

    assignments:
      assignments.data,

    assessments:
      assessments.data?.length
        ? assessments.data
        : [
            getCurrentAssessmentPayload()
          ],

    dataErrors: {
      attempts:
        attempts.error,

      students:
        studentFilters.error,

      assignments:
        assignments.error,

      assessments:
        assessments.error
    }
  };
}


async function loadAdminDataset(
  loader
) {
  try {
    return {
      data:
        await loader(),

      error: ""
    };
  } catch (error) {
    console.error(
      "Admin dataset load failed:",
      error
    );

    return {
      data: [],

      error:
        error.message ||
        "Could not load data"
    };
  }
}


/* =========================================================
   PAINT ADMIN DASHBOARD
========================================================= */

function paintAdminDashboard(
  attempts,
  students,
  assignments = [],
  dataErrors = {},
  studentFilters = {},
  assessments = []
) {
  const activePage =
    getAdminPage();

  const latestAttempts =
    [...attempts]
      .sort(
        (a, b) =>
          String(
            b.submittedAt || ""
          ).localeCompare(
            String(
              a.submittedAt || ""
            )
          )
      );

  const context = {
    attempts,

    students,

    studentFilters,

    assignments,

    assessments,

    dataErrors,

    latestAttempts,

    scoreAverage:
      attempts.length
        ? Math.round(
            attempts.reduce(
              (
                sum,
                attempt
              ) =>
                sum +
                normalizeScore(
                  attempt
                ).percentage,
              0
            ) /
              attempts.length
          )
        : 0,

    completedStudents:
      new Set(
        attempts.map(
          (attempt) =>
            normalizeStudent(
              attempt
            ).id
        )
      ).size,

    topicRows:
      aggregateAttemptTopics(
        attempts
      ),

    validation:
      validateAssessment(),

    ilpAttempts:
      latestAttempts.filter(
        (attempt) =>
          attempt.ilp
      )
  };

  const meta =
    getAdminPageMeta(
      activePage
    );

  const adminMain =
    document.querySelector(
      ".admin-main"
    );

  if (!adminMain) {
    return;
  }

  adminMain.innerHTML = `
    <header class="admin-header">

      <div>
        <p class="eyebrow">
          ${escapeHtml(
            meta.eyebrow
          )}
        </p>

        <h1>
          ${escapeHtml(
            meta.title
          )}
        </h1>
      </div>

      <div class="admin-actions">
        ${
          renderAdminHeaderActions(
            activePage
          )
        }
      </div>

    </header>

    ${
      renderAdminPage(
        activePage,
        context
      )
    }
  `;

  setAdminActiveNav(
    activePage
  );

  document
    .querySelector(
      "[data-action='export-attempts-json']"
    )
    ?.addEventListener(
      "click",
      () => {
        downloadText(
          "assessment-attempts.json",

          JSON.stringify(
            attempts,
            null,
            2
          ),

          "application/json"
        );
      }
    );

  document
    .querySelector(
      "[data-action='export-attempts-csv']"
    )
    ?.addEventListener(
      "click",
      () => {
        downloadText(
          "assessment-attempts.csv",

          buildAttemptsCsv(
            attempts
          ),

          "text/csv"
        );
      }
    );

  document
    .querySelectorAll(
      "[data-action='export-ilp']"
    )
    .forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            const attempt =
              attempts.find(
                (item) =>
                  (
                    item.attemptId ||
                    item.id
                  ) ===
                  button.dataset
                    .attemptId
              );

            if (!attempt) {
              return;
            }

            const student =
              normalizeStudent(
                attempt
              );

            downloadText(
              `${
                fileSafe(
                  student.id
                )
              }-ilp.json`,

              JSON.stringify(
                attempt.ilp || {},
                null,
                2
              ),

              "application/json"
            );
          }
        );
      }
    );

  bindAssignmentControls();
}


/* =========================================================
   ADMIN PAGE META
========================================================= */

function getAdminPageMeta(
  page
) {
  const pages = {
    overview: {
      eyebrow:
        "Admin Overview",

      title:
        "Dashboard"
    },

    assessments: {
      eyebrow:
        "Assessment Setup",

      title:
        "Pre-Test Settings"
    },

    assignments: {
      eyebrow:
        "Student Assignments",

      title:
        "Assignments"
    },

    questions: {
      eyebrow:
        "Question Bank",

      title:
        "Questions"
    },

    import: {
      eyebrow:
        "Import Workflow",

      title:
        "JSON Intake"
    },

    results: {
      eyebrow:
        "Performance",

      title:
        "Results"
    },

    ilp: {
      eyebrow:
        "Personalized Learning",

      title:
        "ILP Review"
    },

    database: {
      eyebrow:
        "Data Layer",

      title:
        "PostgreSQL Connection"
    }
  };

  return (
    pages[page] ||
    pages.overview
  );
}


/* =========================================================
   ADMIN HEADER ACTIONS
========================================================= */

function renderAdminHeaderActions(
  page
) {
  if (
    page === "results"
  ) {
    return `
      <button
        class="secondary-action"
        data-action="export-attempts-json"
      >
        Export Attempts JSON
      </button>

      <button
        class="secondary-action"
        data-action="export-attempts-csv"
      >
        Export Attempts CSV
      </button>
    `;
  }

  if (
    page === "questions"
  ) {
    return `
      <a
        class="secondary-action admin-link-button"
        href="./"
        target="_blank"
      >
        Preview Student View
      </a>
    `;
  }

  return `
    <a
      class="secondary-action admin-link-button"
      href="./"
    >
      Open Student Test
    </a>
  `;
}


/* =========================================================
   SELECT ADMIN PAGE
========================================================= */

function renderAdminPage(
  page,
  context
) {
  if (
    page === "assessments"
  ) {
    return renderAdminAssessmentPage(
      context.validation
    );
  }

  if (
    page === "assignments"
  ) {
    return renderAdminAssignmentsPage(
      context
    );
  }

  if (
    page === "questions"
  ) {
    return renderAdminQuestionsPage();
  }

  if (
    page === "import"
  ) {
    return renderAdminImportPage();
  }

  if (
    page === "results"
  ) {
    return renderAdminResultsPage(
      context
    );
  }

  if (
    page === "ilp"
  ) {
    return renderAdminIlpPage(
      context
    );
  }

  if (
    page === "database"
  ) {
    return renderAdminDatabasePage();
  }

  return renderAdminOverviewPage(
    context
  );
}


/* =========================================================
   OVERVIEW PAGE
========================================================= */

function renderAdminOverviewPage(
  context
) {
  return `
    <section class="admin-page-shell">

      <div class="admin-kpis">

        <article>
          <span>
            Questions
          </span>

          <strong>
            ${questions.length}
          </strong>
        </article>

        <article>
          <span>
            Submitted
          </span>

          <strong>
            ${
              context.attempts.length
            }
          </strong>
        </article>

        <article>
          <span>
            Students Tested
          </span>

          <strong>
            ${
              context.completedStudents
            }
          </strong>
        </article>

        <article>
          <span>
            Average Score
          </span>

          <strong>
            ${
              context.scoreAverage
            }%
          </strong>
        </article>

      </div>


      <div class="admin-split">

        <article class="admin-card">

          <div class="admin-card-head">

            <div>
              <p class="eyebrow">
                Current Assessment
              </p>

              <h2>
                ${
                  escapeHtml(
                    assessment.title ||
                    ""
                  )
                }
              </h2>
            </div>

          </div>


          <div class="assessment-config">

            <span>
              ${
                questions.length
              }
              questions
            </span>

            <span>
              ${
                assessment
                  .durationMinutes ||
                30
              }
              minutes
            </span>

            <span>
              Provider:
              ${
                escapeHtml(
                  DATA_PROVIDER
                )
              }
            </span>

          </div>


          <div class="settings-grid">

            ${
              renderSetting(
                "Calculator",
                assessment.tools
                  ?.calculator
              )
            }

            ${
              renderSetting(
                "Scratch pad",
                assessment.tools
                  ?.scratchpad !==
                  false
              )
            }

            ${
              renderSetting(
                "Image zoom",
                assessment.tools
                  ?.imageZoom !==
                  false
              )
            }

            ${
              renderSetting(
                "Answer eliminator",
                assessment.tools
                  ?.eliminator
              )
            }

          </div>

        </article>


        <article class="admin-card">

          <div class="admin-card-head">

            <div>
              <p class="eyebrow">
                Recent Activity
              </p>

              <h2>
                Latest Submissions
              </h2>
            </div>

          </div>

          ${
            renderRecentAttempts(
              context.latestAttempts
            )
          }

        </article>

      </div>
    </section>
  `;
}


/* =========================================================
   ASSESSMENT SETTINGS PAGE
========================================================= */

function renderAdminAssessmentPage(
  validation
) {
  return `
    <section class="admin-page-shell">

      <div class="admin-split">

        <article class="admin-card">

          <div class="admin-card-head">

            <div>
              <p class="eyebrow">
                Assessment Settings
              </p>

              <h2>
                ${
                  escapeHtml(
                    assessment.title ||
                    ""
                  )
                }
              </h2>
            </div>

          </div>


          <div class="assessment-config">

            <span>
              ${questions.length}
              questions
            </span>

            <span>
              ${
                assessment
                  .durationMinutes ||
                30
              }
              minutes
            </span>

            <span>
              Input:
              ${
                escapeHtml(
                  assessment
                    .inputFormatVersion ||
                  "mvp-1"
                )
              }
            </span>

            <span>
              Source:
              ${
                escapeHtml(
                  assessment
                    .sourceDocument ||
                  "JSON"
                )
              }
            </span>

          </div>


          <div class="settings-grid">

            ${
              renderSetting(
                "Calculator",
                assessment.tools
                  ?.calculator
              )
            }

            ${
              renderSetting(
                "Scratch pad",
                assessment.tools
                  ?.scratchpad !==
                  false
              )
            }

            ${
              renderSetting(
                "Image zoom",
                assessment.tools
                  ?.imageZoom !==
                  false
              )
            }

            ${
              renderSetting(
                "Answer eliminator",
                assessment.tools
                  ?.eliminator
              )
            }

          </div>


          <div class="admin-note">
            Student identity is read from
            PostgreSQL registration data
            through the configured API.
          </div>

        </article>


        <article class="admin-card">

          <div class="admin-card-head">

            <div>
              <p class="eyebrow">
                Quality Gate
              </p>

              <h2>
                Validation
              </h2>
            </div>

          </div>


          <div
            class="validation-score ${
              validation.errors.length
                ? "has-errors"
                : "clean"
            }"
          >

            <strong>
              ${
                validation.errors.length
                  ? "Needs Review"
                  : "Ready"
              }
            </strong>

            <span>
              ${
                validation.errors.length
              }
              errors /
              ${
                validation.warnings.length
              }
              warnings
            </span>

          </div>


          ${
            renderValidationList(
              "Errors",
              validation.errors,
              "No blocking errors."
            )
          }


          ${
            renderValidationList(
              "Warnings",
              validation.warnings,
              "No warnings."
            )
          }

        </article>

      </div>

    </section>
  `;
}
/* =========================================================
   ADMIN DASHBOARD
========================================================= */

function renderAdminDashboard() {
  window.onhashchange = () => {
    if (isAdminMode()) {
      renderAdminDashboard();
    }
  };

  root.innerHTML = `
    <main class="admin-shell">
      <aside class="admin-sidebar">

        <div class="brand">
          <div class="brand-mark">
            ${icons.book}
          </div>

          <div>
            <span>Admin</span>
            <strong>Assessment Console</strong>
          </div>
        </div>

        <nav class="admin-nav">
          <a href="#overview">Overview</a>
          <a href="#assessments">Settings</a>
          <a href="#assignments">Assignments</a>
          <a href="#questions">Questions</a>
          <a href="#import">Import</a>
          <a href="#results">Results</a>
          <a href="#ilp">ILP</a>
          <a href="#database">Database</a>
        </nav>

        <a
          class="admin-student-link"
          href="./"
        >
          Open student test
        </a>

      </aside>

      <section class="admin-main">

        <header class="admin-header">

          <div>
            <p class="eyebrow">
              Assessment Dashboard
            </p>

            <h1>
              Pre-Test Management
            </h1>
          </div>

          <div class="admin-actions">
            <button
              class="secondary-action"
              data-action="export-attempts-json"
            >
              Export Attempts JSON
            </button>

            <button
              class="secondary-action"
              data-action="export-attempts-csv"
            >
              Export Attempts CSV
            </button>
          </div>

        </header>

        <div class="admin-loading">
          Loading dashboard...
        </div>

      </section>
    </main>
  `;

  loadAdminData()
    .then(
      ({
        attempts,
        students,
        assignments,
        dataErrors,
        studentFilters,
        assessments
      }) => {
        paintAdminDashboard(
          attempts,
          students,
          assignments,
          dataErrors,
          studentFilters,
          assessments
        );
      }
    )
    .catch((error) => {
      console.error(
        "Admin dashboard load failed:",
        error
      );

      const main =
        document.querySelector(
          ".admin-main"
        );

      if (main) {
        main.innerHTML = `
          <div class="admin-error">
            ${
              escapeHtml(
                error.message ||
                "Could not load the admin dashboard."
              )
            }
          </div>
        `;
      }
    });
}


/* =========================================================
   ADMIN DATA LOAD
========================================================= */

async function loadAdminData() {
  const adapter =
    getDataAdapter();

  const [
    attempts,
    studentFilters,
    assignments,
    assessments
  ] = await Promise.all([
    loadAdminDataset(
      () =>
        adapter.listAttempts()
    ),

    loadAdminDataset(
      () =>
        adapter.listStudentFilters()
    ),

    loadAdminDataset(
      () =>
        adapter.listAssignments()
    ),

    loadAdminDataset(
      () =>
        adapter.listAssessments()
    )
  ]);

  return {
    attempts:
      attempts.data,

    students: [],

    studentFilters:
      studentFilters.data,

    assignments:
      assignments.data,

    assessments:
      assessments.data?.length
        ? assessments.data
        : [
            getCurrentAssessmentPayload()
          ],

    dataErrors: {
      attempts:
        attempts.error,

      students:
        studentFilters.error,

      assignments:
        assignments.error,

      assessments:
        assessments.error
    }
  };
}


async function loadAdminDataset(
  loader
) {
  try {
    return {
      data:
        await loader(),

      error: ""
    };
  } catch (error) {
    console.error(
      "Admin dataset load failed:",
      error
    );

    return {
      data: [],

      error:
        error.message ||
        "Could not load data"
    };
  }
}


/* =========================================================
   PAINT ADMIN DASHBOARD
========================================================= */

function paintAdminDashboard(
  attempts,
  students,
  assignments = [],
  dataErrors = {},
  studentFilters = {},
  assessments = []
) {
  const activePage =
    getAdminPage();

  const latestAttempts =
    [...attempts]
      .sort(
        (a, b) =>
          String(
            b.submittedAt || ""
          ).localeCompare(
            String(
              a.submittedAt || ""
            )
          )
      );

  const context = {
    attempts,

    students,

    studentFilters,

    assignments,

    assessments,

    dataErrors,

    latestAttempts,

    scoreAverage:
      attempts.length
        ? Math.round(
            attempts.reduce(
              (
                sum,
                attempt
              ) =>
                sum +
                normalizeScore(
                  attempt
                ).percentage,
              0
            ) /
              attempts.length
          )
        : 0,

    completedStudents:
      new Set(
        attempts.map(
          (attempt) =>
            normalizeStudent(
              attempt
            ).id
        )
      ).size,

    topicRows:
      aggregateAttemptTopics(
        attempts
      ),

    validation:
      validateAssessment(),

    ilpAttempts:
      latestAttempts.filter(
        (attempt) =>
          attempt.ilp
      )
  };

  const meta =
    getAdminPageMeta(
      activePage
    );

  const adminMain =
    document.querySelector(
      ".admin-main"
    );

  if (!adminMain) {
    return;
  }

  adminMain.innerHTML = `
    <header class="admin-header">

      <div>
        <p class="eyebrow">
          ${escapeHtml(
            meta.eyebrow
          )}
        </p>

        <h1>
          ${escapeHtml(
            meta.title
          )}
        </h1>
      </div>

      <div class="admin-actions">
        ${
          renderAdminHeaderActions(
            activePage
          )
        }
      </div>

    </header>

    ${
      renderAdminPage(
        activePage,
        context
      )
    }
  `;

  setAdminActiveNav(
    activePage
  );

  document
    .querySelector(
      "[data-action='export-attempts-json']"
    )
    ?.addEventListener(
      "click",
      () => {
        downloadText(
          "assessment-attempts.json",

          JSON.stringify(
            attempts,
            null,
            2
          ),

          "application/json"
        );
      }
    );

  document
    .querySelector(
      "[data-action='export-attempts-csv']"
    )
    ?.addEventListener(
      "click",
      () => {
        downloadText(
          "assessment-attempts.csv",

          buildAttemptsCsv(
            attempts
          ),

          "text/csv"
        );
      }
    );

  document
    .querySelectorAll(
      "[data-action='export-ilp']"
    )
    .forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            const attempt =
              attempts.find(
                (item) =>
                  (
                    item.attemptId ||
                    item.id
                  ) ===
                  button.dataset
                    .attemptId
              );

            if (!attempt) {
              return;
            }

            const student =
              normalizeStudent(
                attempt
              );

            downloadText(
              `${
                fileSafe(
                  student.id
                )
              }-ilp.json`,

              JSON.stringify(
                attempt.ilp || {},
                null,
                2
              ),

              "application/json"
            );
          }
        );
      }
    );

  bindAssignmentControls();
}


/* =========================================================
   ADMIN PAGE META
========================================================= */

function getAdminPageMeta(
  page
) {
  const pages = {
    overview: {
      eyebrow:
        "Admin Overview",

      title:
        "Dashboard"
    },

    assessments: {
      eyebrow:
        "Assessment Setup",

      title:
        "Pre-Test Settings"
    },

    assignments: {
      eyebrow:
        "Student Assignments",

      title:
        "Assignments"
    },

    questions: {
      eyebrow:
        "Question Bank",

      title:
        "Questions"
    },

    import: {
      eyebrow:
        "Import Workflow",

      title:
        "JSON Intake"
    },

    results: {
      eyebrow:
        "Performance",

      title:
        "Results"
    },

    ilp: {
      eyebrow:
        "Personalized Learning",

      title:
        "ILP Review"
    },

    database: {
      eyebrow:
        "Data Layer",

      title:
        "PostgreSQL Connection"
    }
  };

  return (
    pages[page] ||
    pages.overview
  );
}


/* =========================================================
   ADMIN HEADER ACTIONS
========================================================= */

function renderAdminHeaderActions(
  page
) {
  if (
    page === "results"
  ) {
    return `
      <button
        class="secondary-action"
        data-action="export-attempts-json"
      >
        Export Attempts JSON
      </button>

      <button
        class="secondary-action"
        data-action="export-attempts-csv"
      >
        Export Attempts CSV
      </button>
    `;
  }

  if (
    page === "questions"
  ) {
    return `
      <a
        class="secondary-action admin-link-button"
        href="./"
        target="_blank"
      >
        Preview Student View
      </a>
    `;
  }

  return `
    <a
      class="secondary-action admin-link-button"
      href="./"
    >
      Open Student Test
    </a>
  `;
}


/* =========================================================
   SELECT ADMIN PAGE
========================================================= */

function renderAdminPage(
  page,
  context
) {
  if (
    page === "assessments"
  ) {
    return renderAdminAssessmentPage(
      context.validation
    );
  }

  if (
    page === "assignments"
  ) {
    return renderAdminAssignmentsPage(
      context
    );
  }

  if (
    page === "questions"
  ) {
    return renderAdminQuestionsPage();
  }

  if (
    page === "import"
  ) {
    return renderAdminImportPage();
  }

  if (
    page === "results"
  ) {
    return renderAdminResultsPage(
      context
    );
  }

  if (
    page === "ilp"
  ) {
    return renderAdminIlpPage(
      context
    );
  }

  if (
    page === "database"
  ) {
    return renderAdminDatabasePage();
  }

  return renderAdminOverviewPage(
    context
  );
}


/* =========================================================
   OVERVIEW PAGE
========================================================= */

function renderAdminOverviewPage(
  context
) {
  return `
    <section class="admin-page-shell">

      <div class="admin-kpis">

        <article>
          <span>
            Questions
          </span>

          <strong>
            ${questions.length}
          </strong>
        </article>

        <article>
          <span>
            Submitted
          </span>

          <strong>
            ${
              context.attempts.length
            }
          </strong>
        </article>

        <article>
          <span>
            Students Tested
          </span>

          <strong>
            ${
              context.completedStudents
            }
          </strong>
        </article>

        <article>
          <span>
            Average Score
          </span>

          <strong>
            ${
              context.scoreAverage
            }%
          </strong>
        </article>

      </div>


      <div class="admin-split">

        <article class="admin-card">

          <div class="admin-card-head">

            <div>
              <p class="eyebrow">
                Current Assessment
              </p>

              <h2>
                ${
                  escapeHtml(
                    assessment.title ||
                    ""
                  )
                }
              </h2>
            </div>

          </div>


          <div class="assessment-config">

            <span>
              ${
                questions.length
              }
              questions
            </span>

            <span>
              ${
                assessment
                  .durationMinutes ||
                30
              }
              minutes
            </span>

            <span>
              Provider:
              ${
                escapeHtml(
                  DATA_PROVIDER
                )
              }
            </span>

          </div>


          <div class="settings-grid">

            ${
              renderSetting(
                "Calculator",
                assessment.tools
                  ?.calculator
              )
            }

            ${
              renderSetting(
                "Scratch pad",
                assessment.tools
                  ?.scratchpad !==
                  false
              )
            }

            ${
              renderSetting(
                "Image zoom",
                assessment.tools
                  ?.imageZoom !==
                  false
              )
            }

            ${
              renderSetting(
                "Answer eliminator",
                assessment.tools
                  ?.eliminator
              )
            }

          </div>

        </article>


        <article class="admin-card">

          <div class="admin-card-head">

            <div>
              <p class="eyebrow">
                Recent Activity
              </p>

              <h2>
                Latest Submissions
              </h2>
            </div>

          </div>

          ${
            renderRecentAttempts(
              context.latestAttempts
            )
          }

        </article>

      </div>
    </section>
  `;
}


/* =========================================================
   ASSESSMENT SETTINGS PAGE
========================================================= */

function renderAdminAssessmentPage(
  validation
) {
  return `
    <section class="admin-page-shell">

      <div class="admin-split">

        <article class="admin-card">

          <div class="admin-card-head">

            <div>
              <p class="eyebrow">
                Assessment Settings
              </p>

              <h2>
                ${
                  escapeHtml(
                    assessment.title ||
                    ""
                  )
                }
              </h2>
            </div>

          </div>


          <div class="assessment-config">

            <span>
              ${questions.length}
              questions
            </span>

            <span>
              ${
                assessment
                  .durationMinutes ||
                30
              }
              minutes
            </span>

            <span>
              Input:
              ${
                escapeHtml(
                  assessment
                    .inputFormatVersion ||
                  "mvp-1"
                )
              }
            </span>

            <span>
              Source:
              ${
                escapeHtml(
                  assessment
                    .sourceDocument ||
                  "JSON"
                )
              }
            </span>

          </div>


          <div class="settings-grid">

            ${
              renderSetting(
                "Calculator",
                assessment.tools
                  ?.calculator
              )
            }

            ${
              renderSetting(
                "Scratch pad",
                assessment.tools
                  ?.scratchpad !==
                  false
              )
            }

            ${
              renderSetting(
                "Image zoom",
                assessment.tools
                  ?.imageZoom !==
                  false
              )
            }

            ${
              renderSetting(
                "Answer eliminator",
                assessment.tools
                  ?.eliminator
              )
            }

          </div>


          <div class="admin-note">
            Student identity is read from
            PostgreSQL registration data
            through the configured API.
          </div>

        </article>


        <article class="admin-card">

          <div class="admin-card-head">

            <div>
              <p class="eyebrow">
                Quality Gate
              </p>

              <h2>
                Validation
              </h2>
            </div>

          </div>


          <div
            class="validation-score ${
              validation.errors.length
                ? "has-errors"
                : "clean"
            }"
          >

            <strong>
              ${
                validation.errors.length
                  ? "Needs Review"
                  : "Ready"
              }
            </strong>

            <span>
              ${
                validation.errors.length
              }
              errors /
              ${
                validation.warnings.length
              }
              warnings
            </span>

          </div>


          ${
            renderValidationList(
              "Errors",
              validation.errors,
              "No blocking errors."
            )
          }


          ${
            renderValidationList(
              "Warnings",
              validation.warnings,
              "No warnings."
            )
          }

        </article>

      </div>

    </section>
  `;
}
/* =========================================================
   ADMIN QUESTIONS PAGE
========================================================= */

function renderAdminQuestionsPage() {
  return `
    <section class="admin-page-shell">

      <article class="admin-card">

        <div class="admin-card-head">

          <div>
            <p class="eyebrow">
              MVP JSON Source
            </p>

            <h2>
              ${questions.length}
              Questions
            </h2>
          </div>

        </div>


        <div class="question-admin-list roomy">

          ${
            questions
              .map(
                (
                  question,
                  index
                ) => `
                  <div>

                    <strong>
                      Q${
                        question.number ||
                        index + 1
                      }
                    </strong>

                    <span>
                      ${
                        escapeHtml(
                          question.topic ||
                          "General"
                        )
                      }
                    </span>

                    <p>
                      ${
                        escapeHtml(
                          question.question ||
                          ""
                        )
                      }
                    </p>

                    <small>
                      ${
                        question.options
                          ?.length || 0
                      }
                      options
                      /
                      Answer
                      ${
                        escapeHtml(
                          String(
                            question.answer ||
                            ""
                          ).toUpperCase()
                        )
                      }
                      /
                      ${
                        question.image
                          ? "Has image"
                          : "No image"
                      }
                    </small>

                  </div>
                `
              )
              .join("")
          }

        </div>

      </article>

    </section>
  `;
}


/* =========================================================
   ADMIN IMPORT PAGE
========================================================= */

function renderAdminImportPage() {
  return `
    <section class="admin-page-shell">

      <article class="admin-card">

        <div class="admin-card-head">

          <div>

            <p class="eyebrow">
              Import Pipeline
            </p>

            <h2>
              Word / JSON Intake
            </h2>

          </div>

        </div>


        <div class="pipeline-list">

          <div>
            <strong>1</strong>

            <span>
              Place DOCX or converted
              source in the input folder.
            </span>
          </div>


          <div>
            <strong>2</strong>

            <span>
              Convert to assessment JSON
              with image assets.
            </span>
          </div>


          <div>
            <strong>3</strong>

            <span>
              Validate questions,
              options, answer keys,
              and image paths.
            </span>
          </div>


          <div>
            <strong>4</strong>

            <span>
              Preview the student
              experience before publishing.
            </span>
          </div>

        </div>


        <div class="admin-note">
          Current MVP source:
          <strong>
            input/pre-test-for-demo.json
          </strong>.
        </div>

      </article>

    </section>
  `;
}


/* =========================================================
   ADMIN RESULTS PAGE
========================================================= */

function renderAdminResultsPage(
  context
) {
  return `
    <section class="admin-page-shell">

      <div
        class="admin-split results-layout"
      >

        <article class="admin-card">

          <div class="admin-card-head">

            <div>

              <p class="eyebrow">
                Topic Analysis
              </p>

              <h2>
                Performance By Skill
              </h2>

            </div>

          </div>


          <div
            class="topic-report admin-topic-report"
          >

            ${
              context.topicRows.length
                ? context.topicRows
                    .map(
                      (topic) => `
                        <div class="topic-row">

                          <span>
                            ${
                              escapeHtml(
                                topic.topic
                              )
                            }
                          </span>

                          <strong>
                            ${
                              topic.correct
                            }/${
                              topic.total
                            }
                          </strong>

                          <div class="topic-bar">
                            <i
                              style="width:${
                                topic.percentage
                              }%"
                            ></i>
                          </div>

                          <em>
                            ${
                              topic.percentage
                            }%
                          </em>

                        </div>
                      `
                    )
                    .join("")
                : `
                    <p class="empty-review">
                      No attempt data yet.
                    </p>
                  `
            }

          </div>

        </article>


        <article class="admin-card">

          <div class="admin-card-head">

            <div>

              <p class="eyebrow">
                Attempts
              </p>

              <h2>
                Submitted Results
              </h2>

            </div>

          </div>


          ${
            renderAttemptsTable(
              context.latestAttempts
            )
          }

        </article>

      </div>

    </section>
  `;
}


/* =========================================================
   ADMIN ILP PAGE
========================================================= */

function renderAdminIlpPage(
  context
) {
  return `
    <section class="admin-page-shell">

      <article class="admin-card">

        <div class="admin-card-head">

          <div>

            <p class="eyebrow">
              Personalized Learning
            </p>

            <h2>
              Automatic ILP Review
            </h2>

          </div>

        </div>


        <div class="ilp-admin-list">

          ${
            context.ilpAttempts.length
              ? context.ilpAttempts
                  .map(
                    (attempt) =>
                      renderAdminILPCard(
                        attempt
                      )
                  )
                  .join("")
              : `
                  <p class="empty-review">
                    No ILPs yet.
                    Submit a student attempt
                    to generate one automatically.
                  </p>
                `
          }

        </div>

      </article>

    </section>
  `;
}


/* =========================================================
   ADMIN DATABASE PAGE
========================================================= */

function renderAdminDatabasePage() {
  return `
    <section class="admin-page-shell">

      <div class="database-plan">

        <article>

          <h3>
            Connected Now
          </h3>

          <p>
            Active provider:
            ${
              escapeHtml(
                DATA_PROVIDER
              )
            }.
            Students are looked up
            from PostgreSQL by
            username/email.
          </p>

        </article>


        <article>

          <h3>
            Needed For MVP
          </h3>

          <p>
            Student lookup,
            pre-test assignments,
            submitted attempts,
            responses, and ILPs.
            Questions can stay in JSON
            for now.
          </p>

        </article>


        <article>

          <h3>
            Later
          </h3>

          <p>
            Move assessments,
            reusable questions,
            assignments, and assets
            into PostgreSQL when the
            library is ready.
          </p>

        </article>

      </div>


      <article class="admin-card">

        <div class="admin-card-head">

          <div>

            <p class="eyebrow">
              Current Data Contract
            </p>

            <h2>
              Tables In Use
            </h2>

          </div>

        </div>


        <div class="admin-table-wrap">

          <table class="admin-table">

            <thead>
              <tr>
                <th>
                  Table/View
                </th>

                <th>
                  Purpose
                </th>
              </tr>
            </thead>


            <tbody>

              <tr>
                <td>
                  public."Student"
                </td>

                <td>
                  Existing registration
                  source. Students enter
                  username/email.
                </td>
              </tr>


              <tr>
                <td>
                  test_engine_registered_students
                </td>

                <td>
                  Read-only mapping view
                  used by the API.
                </td>
              </tr>


              <tr>
                <td>
                  test_engine_assignments
                </td>

                <td>
                  Defines which students
                  are allowed to take
                  an assessment.
                </td>
              </tr>


              <tr>
                <td>
                  test_engine_attempts
                </td>

                <td>
                  Attempt summary,
                  timing, score,
                  and raw JSON payload.
                </td>
              </tr>


              <tr>
                <td>
                  test_engine_responses
                </td>

                <td>
                  Each selected answer
                  and correctness result.
                </td>
              </tr>


              <tr>
                <td>
                  test_engine_ilp_plans
                </td>

                <td>
                  Generated individualized
                  learning plans.
                </td>
              </tr>

            </tbody>

          </table>

        </div>

      </article>

    </section>
  `;
}


/* =========================================================
   RECENT ATTEMPTS
========================================================= */

function renderRecentAttempts(
  attempts
) {
  if (!attempts.length) {
    return `
      <p class="empty-review">
        No submissions yet.
      </p>
    `;
  }


  return `
    <div class="recent-attempts">

      ${
        attempts
          .slice(
            0,
            6
          )
          .map(
            (attempt) => {
              const student =
                normalizeStudent(
                  attempt
                );

              const score =
                normalizeScore(
                  attempt
                );


              return `
                <div>

                  <strong>
                    ${
                      escapeHtml(
                        student.name
                      )
                    }
                  </strong>

                  <span>
                    ${
                      score.percentage
                    }%
                    /
                    ${
                      formatDateTime(
                        attempt.submittedAt
                      )
                    }
                  </span>

                </div>
              `;
            }
          )
          .join("")
      }

    </div>
  `;
}


/* =========================================================
   ATTEMPTS TABLE
========================================================= */

function renderAttemptsTable(
  attempts
) {
  return `
    <div class="admin-table-wrap">

      <table class="admin-table">

        <thead>

          <tr>
            <th>Student</th>
            <th>ID</th>
            <th>Score</th>
            <th>Answered</th>
            <th>Time Used</th>
            <th>Submitted</th>
          </tr>

        </thead>


        <tbody>

          ${
            attempts.length
              ? attempts
                  .map(
                    (attempt) => {
                      const student =
                        normalizeStudent(
                          attempt
                        );

                      const score =
                        normalizeScore(
                          attempt
                        );

                      const timing =
                        normalizeTiming(
                          attempt
                        );


                      return `
                        <tr>

                          <td>
                            ${
                              escapeHtml(
                                student.name
                              )
                            }
                          </td>

                          <td>
                            ${
                              escapeHtml(
                                student.id
                              )
                            }
                          </td>

                          <td>
                            ${
                              score.correct
                            }/${
                              score.total
                            }
                            (${
                              score.percentage
                            }%)
                          </td>

                          <td>
                            ${
                              score.answered
                            }
                          </td>

                          <td>
                            ${
                              formatDuration(
                                timing.timeUsedSeconds
                              )
                            }
                          </td>

                          <td>
                            ${
                              formatDateTime(
                                attempt.submittedAt
                              )
                            }
                          </td>

                        </tr>
                      `;
                    }
                  )
                  .join("")
              : `
                  <tr>
                    <td colspan="6">
                      No submissions yet.
                    </td>
                  </tr>
                `
          }

        </tbody>

      </table>

    </div>
  `;
}


/* =========================================================
   SUBMIT REVIEW SCREEN
========================================================= */

function renderSubmitReview() {
  const answeredCount =
    getAnsweredCount();


  const unanswered =
    questions.filter(
      (question) =>
        !state.answers[
          question.id
        ]
    );


  root.innerHTML = `
    <main class="review-shell">

      <section
        class="submit-review-panel"
      >

        <header class="review-header">

          <div>

            <p class="eyebrow">
              Before you submit
            </p>

            <h1>
              Review your assessment
            </h1>

          </div>


          <div
            class="timer"
            data-timer
            aria-label="Time remaining"
          >
            ${
              renderTimerContent()
            }
          </div>

        </header>


        <div class="review-summary">

          <span>
            <strong>
              ${answeredCount}
            </strong>
            answered
          </span>


          <span>
            <strong>
              ${unanswered.length}
            </strong>
            unanswered
          </span>


          <span>
            <strong>
              ${getSkippedCount()}
            </strong>
            skipped
          </span>

        </div>


        <div
          class="review-grid-panel"
        >

          ${
            questions
              .map(
                (
                  question,
                  index
                ) =>
                  renderReviewCell(
                    question,
                    index
                  )
              )
              .join("")
          }

        </div>


        <div class="review-sections">

          <section>

            <h2>
              Unanswered
            </h2>

            ${
              renderReviewList(
                unanswered,
                "No unanswered questions."
              )
            }

          </section>

        </div>


        <footer class="review-actions">

          <button
            class="secondary-action"
            data-action="return-to-test"
          >
            Return to test
          </button>


          <button
            class="primary-action"
            data-action="confirm-submit"
          >
            ${icons.submit}
            Submit final
          </button>

        </footer>

      </section>

    </main>
  `;


  document
    .querySelectorAll(
      "[data-review-index]"
    )
    .forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            setState({
              reviewing:
                false,

              currentIndex:
                Number(
                  button.dataset
                    .reviewIndex
                )
            });
          }
        );
      }
    );


  document
    .querySelector(
      "[data-action='return-to-test']"
    )
    ?.addEventListener(
      "click",
      () => {
        setState({
          reviewing:
            false
        });
      }
    );


  document
    .querySelector(
      "[data-action='confirm-submit']"
    )
    ?.addEventListener(
      "click",
      () => {
        submitAssessment();
      }
    );
}


/* =========================================================
   REVIEW CELL
========================================================= */

function renderReviewCell(
  question,
  index
) {
  const answered =
    Boolean(
      state.answers[
        question.id
      ]
    );


  const skipped =
    Boolean(
      state.visited?.[
        question.id
      ]
    ) &&
    !answered;


  const classes = [
    "review-cell",

    answered
      ? "answered"
      : "unanswered",

    skipped
      ? "skipped"
      : ""
  ]
    .filter(Boolean)
    .join(" ");


  return `
    <button
      class="${classes}"
      data-review-index="${index}"
    >

      <strong>
        ${index + 1}
      </strong>

      <span>
        ${
          answered
            ? "Answered"
            : skipped
              ? "Skipped"
              : "Unanswered"
        }
      </span>

    </button>
  `;
}


/* =========================================================
   REVIEW LIST
========================================================= */

function renderReviewList(
  questionList,
  emptyMessage
) {
  if (!questionList.length) {
    return `
      <p class="empty-review">
        ${
          escapeHtml(
            emptyMessage
          )
        }
      </p>
    `;
  }


  return `
    <div class="review-list">

      ${
        questionList
          .map(
            (question) => {
              const index =
                questions.findIndex(
                  (item) =>
                    item.id ===
                    question.id
                );


              return `
                <button
                  data-review-index="${
                    index
                  }"
                >

                  <strong>
                    Question
                    ${
                      index + 1
                    }
                  </strong>

                  <span>
                    ${
                      escapeHtml(
                        question.question ||
                        ""
                      )
                    }
                  </span>

                </button>
              `;
            }
          )
          .join("")
      }

    </div>
  `;
}
/* =========================================================
   QUESTION GRID CELL
========================================================= */

function renderGridCell(
  question,
  index
) {
  const isAnswered =
    Boolean(
      state.answers[
        question.id
      ]
    );

  const isSkipped =
    Boolean(
      state.visited?.[
        question.id
      ]
    ) &&
    !isAnswered;


  const classes = [
    "grid-cell",

    index ===
    state.currentIndex
      ? "active"
      : "",

    isAnswered
      ? "answered"
      : "",

    isSkipped
      ? "skipped"
      : ""
  ]
    .filter(Boolean)
    .join(" ");


  return `
    <button
      class="${classes}"
      data-question-index="${index}"
      aria-label="Question ${
        index + 1
      }"
    >
      ${index + 1}
    </button>
  `;
}


/* =========================================================
   QUESTION OPTION
========================================================= */

function renderOption(
  question,
  option
) {
  const selected =
    state.answers[
      question.id
    ] ===
    option.id;


  const isEliminated =
    Boolean(
      state.eliminated
        ?.[question.id]
        ?.[option.id]
    );


  return `
    <button
      class="
        option
        ${
          selected
            ? "selected"
            : ""
        }
        ${
          isEliminated
            ? "eliminated"
            : ""
        }
      "

      data-option-id="${escapeAttribute(
        option.id
      )}"

      ${
        isEliminated
          ? "aria-disabled='true'"
          : ""
      }
    >

      <span
        class="option-letter"
      >
        ${
          escapeHtml(
            String(
              option.id || ""
            ).toUpperCase()
          )
        }
      </span>


      <span
        class="option-label"
      >
        ${
          escapeHtml(
            option.label ||
            option.text ||
            ""
          )
        }
      </span>


      ${
        assessment.tools
          ?.eliminator
          ? `
            <span
              class="eliminate-control"
              data-eliminate-option="${escapeAttribute(
                option.id
              )}"
              title="Eliminate this answer"
              aria-label="Eliminate option ${
                escapeAttribute(
                  option.id
                )
              }"
            >
              ${
                isEliminated
                  ? "Restore"
                  : "Eliminate"
              }
            </span>
          `
          : ""
      }

    </button>
  `;
}


/* =========================================================
   QUESTION MEDIA
========================================================= */

function renderQuestionMedia(
  question
) {
  if (!question.image) {
    return "";
  }


  const alt =
    question.imageAlt ||
    question.imageDescription ||
    "";


  return `
    <figure class="question-media">

      <img
        src="${escapeAttribute(
          question.image
        )}"
        alt="${escapeAttribute(
          alt
        )}"
        loading="eager"
        draggable="false"
      />


      ${
        assessment.tools
          ?.imageZoom !== false
          ? `
            <button
              class="image-zoom-button"
              type="button"
              data-zoom-image="${escapeAttribute(
                question.image
              )}"
            >
              ${icons.zoom}
              Zoom image
            </button>
          `
          : ""
      }

    </figure>
  `;
}


/* =========================================================
   BIND MAIN STUDENT ACTIONS
========================================================= */

function bindActions() {
  document
    .querySelectorAll(
      "[data-question-index]"
    )
    .forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            setState(
              markVisited({
                currentIndex:
                  Number(
                    button.dataset
                      .questionIndex
                  )
              })
            );
          }
        );
      }
    );


  document
    .querySelectorAll(
      "[data-option-id]"
    )
    .forEach(
      (button) => {
        button.addEventListener(
          "click",
          (event) => {
            const eliminateControl =
              event.target.closest(
                "[data-eliminate-option]"
              );


            if (
              eliminateControl
            ) {
              event.stopPropagation();

              toggleEliminatedOption(
                eliminateControl
                  .dataset
                  .eliminateOption
              );

              return;
            }


            const question =
              questions[
                state.currentIndex
              ];


            const optionId =
              button.dataset
                .optionId;


            const eliminated =
              Boolean(
                state.eliminated
                  ?.[question.id]
                  ?.[optionId]
              );


            if (eliminated) {
              return;
            }


            setState(
              {
                answers: {
                  ...(
                    state.answers ||
                    {}
                  ),

                  [question.id]:
                    optionId
                },

                visited: {
                  ...(
                    state.visited ||
                    {}
                  ),

                  [question.id]:
                    true
                }
              },
              {
                preserveQuestionScroll:
                  true
              }
            );
          }
        );
      }
    );


  document
    .querySelectorAll(
      "[data-eliminate-option]"
    )
    .forEach(
      (control) => {
        control.addEventListener(
          "click",
          (event) => {
            event.preventDefault();

            event.stopPropagation();

            toggleEliminatedOption(
              control.dataset
                .eliminateOption
            );
          }
        );
      }
    );


  document
    .querySelector(
      "[data-action='toggle-timer']"
    )
    ?.addEventListener(
      "click",
      () => {
        setState({
          timerMode:
            state.timerMode ===
            "remaining"
              ? "elapsed"
              : "remaining"
        });
      }
    );


  document
    .querySelector(
      "[data-action='fullscreen']"
    )
    ?.addEventListener(
      "click",
      async () => {
        try {
          if (
            !document
              .fullscreenElement
          ) {
            await document
              .documentElement
              .requestFullscreen();
          } else {
            await document
              .exitFullscreen();
          }
        } catch (error) {
          console.warn(
            "Fullscreen failed:",
            error
          );
        }
      }
    );


  document
    .querySelector(
      "[data-action='open-tool'][data-tool-panel='calculator']"
    )
    ?.addEventListener(
      "click",
      () => {
        setState({
          toolsOpen:
            true,

          calculatorOpen:
            true
        });
      }
    );


  document
    .querySelector(
      "[data-action='open-tool'][data-tool-panel='scratch']"
    )
    ?.addEventListener(
      "click",
      () => {
        setState({
          toolsOpen:
            true,

          scratchOpen:
            true,

          calculatorOpen:
            false
        });
      }
    );


  document
    .querySelector(
      "[data-action='close-tools']"
    )
    ?.addEventListener(
      "click",
      () => {
        setState({
          toolsOpen:
            false
        });
      }
    );


  document
    .querySelector(
      "[data-action='toggle-scratch']"
    )
    ?.addEventListener(
      "click",
      () => {
        setState({
          scratchOpen:
            !state.scratchOpen
        });
      }
    );


  document
    .querySelectorAll(
      "[data-calculator-key]"
    )
    .forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            handleCalculatorKey(
              button.dataset
                .calculatorKey
            );
          }
        );
      }
    );


  document
    .querySelectorAll(
      "[data-tool]"
    )
    .forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            scratchTool =
              button.dataset.tool;

            render();
          }
        );
      }
    );


  document
    .querySelectorAll(
      "[data-color]"
    )
    .forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            scratchColor =
              button.dataset.color;

            scratchTool =
              "pencil";

            render();
          }
        );
      }
    );


  document
    .querySelector(
      "[data-action='clear-scratch']"
    )
    ?.addEventListener(
      "click",
      () => {
        const canvas =
          document.querySelector(
            ".scratch-canvas"
          );

        const context =
          canvas?.getContext(
            "2d"
          );


        if (
          !canvas ||
          !context
        ) {
          return;
        }


        context.clearRect(
          0,
          0,
          canvas.width,
          canvas.height
        );


        const question =
          questions[
            state.currentIndex
          ];


        setState({
          scratchWork: {
            ...(
              state.scratchWork ||
              {}
            ),

            [question.id]:
              null
          }
        });
      }
    );


  document
    .querySelectorAll(
      "[data-zoom-image]"
    )
    .forEach(
      (button) => {
        button.addEventListener(
          "click",
          () =>
            openImageZoom(
              button.dataset
                .zoomImage
            )
        );
      }
    );


  document
    .querySelector(
      "[data-action='previous']"
    )
    ?.addEventListener(
      "click",
      () => {
        setState(
          markVisited({
            currentIndex:
              Math.max(
                0,
                state.currentIndex -
                  1
              )
          })
        );
      }
    );


  document
    .querySelector(
      "[data-action='next']"
    )
    ?.addEventListener(
      "click",
      () => {
        setState(
          markVisited({
            currentIndex:
              Math.min(
                questions.length -
                  1,

                state.currentIndex +
                  1
              )
          })
        );
      }
    );


  document
    .querySelector(
      "[data-action='submit']"
    )
    ?.addEventListener(
      "click",
      () => {
        setState({
          reviewing:
            true
        });
      }
    );
}


/* =========================================================
   ELIMINATE / RESTORE OPTION
========================================================= */

function toggleEliminatedOption(
  optionId
) {
  const question =
    questions[
      state.currentIndex
    ];


  if (!question) {
    return;
  }


  const current =
    state.eliminated?.[
      question.id
    ] || {};


  const nextValue =
    !current[
      optionId
    ];


  const nextAnswers = {
    ...(
      state.answers ||
      {}
    )
  };


  if (
    nextValue &&
    nextAnswers[
      question.id
    ] ===
      optionId
  ) {
    delete nextAnswers[
      question.id
    ];
  }


  setState(
    {
      answers:
        nextAnswers,

      eliminated: {
        ...(
          state.eliminated ||
          {}
        ),

        [question.id]: {
          ...current,

          [optionId]:
            nextValue
        }
      }
    },
    {
      preserveQuestionScroll:
        true
    }
  );
}


/* =========================================================
   MARK CURRENT QUESTION VISITED
========================================================= */

function markVisited(
  patch = {}
) {
  const question =
    questions[
      state.currentIndex
    ];


  if (!question) {
    return patch;
  }


  return {
    ...patch,

    visited: {
      ...(
        state.visited ||
        {}
      ),

      [question.id]:
        true
    }
  };
}


/* =========================================================
   SUBMIT ASSESSMENT
========================================================= */

async function submitAssessment() {
  if (
    state.submitted
  ) {
    return;
  }


  const evaluation =
    buildEvaluation();


  try {
    await saveAttempt(
      evaluation
    );
  } catch (error) {
    console.error(
      "Attempt save failed:",
      error
    );

    /*
      Keep the student's result visible even when
      remote persistence fails. The attempt can
      still remain in local storage / IndexedDB
      depending on the adapter configuration.
    */
  }


  setState({
    remainingSeconds:
      Math.max(
        0,
        state.remainingSeconds
      ),

    submitted:
      true,

    reviewing:
      false,

    evaluation
  });
}


/* =========================================================
   BUILD EVALUATION
========================================================= */

function buildEvaluation() {
  const responses =
    questions.map(
      (question) => {
        const selected =
          state.answers[
            question.id
          ] || null;


        const selectedOption =
          question.options.find(
            (option) =>
              option.id ===
              selected
          );


        const correctOption =
          question.options.find(
            (option) =>
              option.id ===
              question.answer
          );


        return {
          questionId:
            question.id,

          number:
            question.number,

          question:
            question.question,

          topic:
            question.topic ||
            "General",

          level:
            question.level ||
            question.topic ||
            "General",

          selected,

          selectedLabel:
            selectedOption
              ?.label ||
            selectedOption
              ?.text ||
            "",

          correctAnswer:
            question.answer,

          correctLabel:
            correctOption
              ?.label ||
            correctOption
              ?.text ||
            "",

          isCorrect:
            selected ===
            question.answer,

          explanation:
            question.explanation ||
            "",

          distractorFeedback:
            selected &&
            question.distractors
              ?.[selected]
              ? question
                  .distractors[
                    selected
                  ]
              : null
        };
      }
    );


  const correct =
    responses.filter(
      (response) =>
        response.isCorrect
    ).length;


  const answered =
    getAnsweredCount();


  const total =
    questions.length;


  const percentage =
    total
      ? Math.round(
          (
            correct /
            total
          ) *
            100
        )
      : 0;


  const submittedAt =
    new Date()
      .toISOString();


  const durationSeconds =
    Number(
      assessment
        .durationMinutes ||
      30
    ) *
    60;


  const timeUsedSeconds =
    Math.max(
      0,

      durationSeconds -
        Number(
          state.remainingSeconds ||
          0
        )
    );


  const topicBreakdown =
    buildTopicBreakdown(
      responses
    );


  const studentId =
    state.student?.id ||
    assessment.studentId ||
    "demo-student";


  const attemptId =
    `${studentId}-${Date.now()}`;


  const strengths =
    topicBreakdown
      .filter(
        (topic) =>
          topic.total > 0 &&
          topic.percentage >=
            75
      )
      .map(
        (topic) =>
          topic.topic
      );


  const needsReview =
    topicBreakdown
      .filter(
        (topic) =>
          topic.total > 0 &&
          topic.percentage <
            75
      )
      .map(
        (topic) =>
          topic.topic
      );


  const ilp =
    generateILP(
      responses,
      topicBreakdown,
      strengths,
      needsReview
    );


  return {
    schemaVersion:
      ATTEMPT_SCHEMA_VERSION,

    id:
      attemptId,

    attemptId,

    studentId,

    studentName:
      state.student?.name ||
      assessment.candidate ||
      "Demo Candidate",

    assessmentTitle:
      assessment.title,

    submittedAt,

    startedAt:
      state.startedAt,


    student: {
      id:
        studentId,

      name:
        state.student?.name ||
        assessment.candidate ||
        "Demo Candidate",

      username:
        state.student?.username ||
        "",

      email:
        state.student?.email ||
        "",

      gradeLevel:
        state.student
          ?.gradeLevel ||
        "",

      section:
        state.student
          ?.section ||
        "",

      accessCode:
        state.student
          ?.accessCode ||
        ""
    },


    assessment: {
      key:
        assessment.key ||
        getCurrentAssessmentKey(),

      title:
        assessment.title,

      sourceDocument:
        assessment
          .sourceDocument ||
        null,

      durationMinutes:
        assessment
          .durationMinutes,

      questionCount:
        total,

      inputFormatVersion:
        assessment
          .inputFormatVersion ||
        "mvp-1",

      assignmentKey:
        state.assignment
          ?.id ||
        null,

      resultOptions:
        assessment
          .resultOptions ||
        state
          .assignmentSettings
          ?.resultOptions ||
        {},

      tools:
        assessment.tools ||
        {}
    },


    timing: {
      durationSeconds,

      timeUsedSeconds,

      timeRemainingSeconds:
        Math.max(
          0,
          state.remainingSeconds
        )
    },


    score: {
      correct,

      total,

      percentage,

      answered,

      unanswered:
        total -
        answered
    },


    correct,

    total,

    percentage,

    answered,

    unanswered:
      total -
      answered,


    responses,


    summary: {
      strengths,

      needsReview,

      topicBreakdown
    },


    ilp
  };
}


/* =========================================================
   TOPIC BREAKDOWN
========================================================= */

function buildTopicBreakdown(
  responses
) {
  const map =
    new Map();


  responses.forEach(
    (response) => {
      const topic =
        response.topic ||
        "General";


      if (
        !map.has(topic)
      ) {
        map.set(
          topic,
          {
            topic,

            correct: 0,

            total: 0,

            percentage: 0
          }
        );
      }


      const row =
        map.get(topic);


      row.total += 1;


      if (
        response.isCorrect
      ) {
        row.correct += 1;
      }
    }
  );


  return Array.from(
    map.values()
  )
    .map(
      (topic) => ({
        ...topic,

        percentage:
          topic.total
            ? Math.round(
                (
                  topic.correct /
                  topic.total
                ) *
                  100
              )
            : 0
      })
    )
    .sort(
      (a, b) =>
        a.topic.localeCompare(
          b.topic
        )
    );
}


/* =========================================================
   AGGREGATE TOPICS ACROSS ATTEMPTS
========================================================= */

function aggregateAttemptTopics(
  attempts
) {
  const allResponses =
    attempts.flatMap(
      (attempt) =>
        attempt.responses ||
        []
    );


  return buildTopicBreakdown(
    allResponses
  );
}


/* =========================================================
   SAVE ATTEMPT
========================================================= */

async function saveAttempt(
  evaluation
) {
  const adapter =
    getDataAdapter();


  try {
    return await adapter
      .saveAttempt(
        evaluation
      );
  } catch (error) {
    console.error(
      "Primary attempt persistence failed:",
      error
    );


    /*
      Try local IndexedDB as fallback.
    */

    try {
      await saveAttemptToIndexedDb(
        evaluation
      );

      return evaluation;
    } catch (
      localError
    ) {
      console.error(
        "IndexedDB fallback also failed:",
        localError
      );

      throw error;
    }
  }
}


/* =========================================================
   SUBMITTED RESULTS SCREEN
========================================================= */

function renderSubmitted() {
  const evaluation =
    state.evaluation ||
    buildEvaluation();


  const missed =
    evaluation.responses
      .filter(
        (response) =>
          !response.isCorrect
      );


  const score =
    normalizeScore(
      evaluation
    );


  const student =
    normalizeStudent(
      evaluation
    );


  const timing =
    normalizeTiming(
      evaluation
    );


  const summary =
    evaluation.summary || {
      strengths: [],

      needsReview: [],

      topicBreakdown:
        buildTopicBreakdown(
          evaluation.responses ||
          []
        )
    };


  const ilp =
    evaluation.ilp ||
    generateILP(
      evaluation.responses ||
      [],

      summary.topicBreakdown,

      summary.strengths,

      summary.needsReview
    );


  const resultOptions =
    assessment.resultOptions ||
    state
      .assignmentSettings
      ?.resultOptions ||
    {
      showResults:
        true,

      showAnswers:
        true
    };


  if (
    resultOptions.showResults ===
    false
  ) {
    root.innerHTML = `
      <main
        class="shell locked-shell"
      >

        <section
          class="result-panel"
        >

          <div
            class="result-icon"
          >
            ${icons.shield}
          </div>


          <p class="eyebrow">
            Assessment submitted
          </p>


          <h1>
            ${
              escapeHtml(
                assessment.title
              )
            }
          </h1>


          <p>
            Your assessment has been
            submitted successfully.
          </p>


          <p>
            Results will be reviewed
            by your teacher.
          </p>

        </section>

      </main>
    `;

    return;
  }


  root.innerHTML = `
    <main
      class="shell locked-shell"
    >

      <section
        class="result-panel result-panel-wide"
      >

        <div
          class="result-icon"
        >
          ${icons.shield}
        </div>


        <p class="eyebrow">
          Assessment submitted
        </p>


        <h1>
          ${
            escapeHtml(
              assessment.title
            )
          }
        </h1>


        <p class="student-result-name">
          ${
            escapeHtml(
              student.name
            )
          }
        </p>


        <div class="score-ring">

          <strong>
            ${
              score.percentage
            }%
          </strong>

          <span>
            ${
              score.correct
            }/${
              score.total
            }
            correct
          </span>

        </div>


        <div class="result-stats">

          <span>
            ${
              score.answered
            }
            answered
          </span>

          <span>
            ${
              score.unanswered
            }
            unanswered
          </span>

          <span>
            ${
              formatDuration(
                timing.timeUsedSeconds
              )
            }
            used
          </span>

        </div>


        <div
          class="performance-panels"
        >

          <section>

            <h2>
              Strengths
            </h2>

            ${
              renderTagList(
                summary.strengths ||
                [],

                "No strength areas were identified yet."
              )
            }

          </section>


          <section>

            <h2>
              Needs Review
            </h2>

            ${
              renderTagList(
                summary.needsReview ||
                [],

                "No priority review areas were identified."
              )
            }

          </section>

        </div>


        <div class="topic-report">

          <h2>
            Topic Performance
          </h2>

          ${
            summary
              .topicBreakdown
              ?.length
              ? summary
                  .topicBreakdown
                  .map(
                    (topic) => `
                      <div
                        class="topic-row"
                      >

                        <span>
                          ${
                            escapeHtml(
                              topic.topic
                            )
                          }
                        </span>

                        <strong>
                          ${
                            topic.correct
                          }/${
                            topic.total
                          }
                        </strong>

                        <div
                          class="topic-bar"
                        >
                          <i
                            style="width:${
                              topic.percentage
                            }%"
                          ></i>
                        </div>

                        <em>
                          ${
                            topic.percentage
                          }%
                        </em>

                      </div>
                    `
                  )
                  .join("")
              : `
                  <p class="empty-review">
                    No topic data available.
                  </p>
                `
          }

        </div>


        <div class="performance-panels">

          <section>

            <h2>
              Learning Priorities
            </h2>

            ${
              ilp.prioritySkills
                ?.length
                ? ilp
                    .prioritySkills
                    .slice(
                      0,
                      5
                    )
                    .map(
                      (skill) => `
                        <div
                          class="skill-gap"
                        >

                          <strong>
                            ${
                              escapeHtml(
                                skill.topic
                              )
                            }
                          </strong>

                          <span>
                            ${
                              escapeHtml(
                                skill.lesson
                              )
                            }
                          </span>

                          <p>
                            ${
                              escapeHtml(
                                skill.recommendation
                              )
                            }
                          </p>

                        </div>
                      `
                    )
                    .join("")
                : `
                    <p class="empty-review">
                      No priority gaps detected.
                    </p>
                  `
            }

          </section>


          <section>

            <h2>
              Teacher Notes
            </h2>

            ${
              renderTagList(
                ilp.teacherNotes ||
                [],

                "No teacher notes generated."
              )
            }

          </section>

        </div>


        ${
          resultOptions
            .showAnswers !== false
            ? `
              <section
                class="missed-review"
              >

                <h2>
                  Review Incorrect Answers
                </h2>

                ${
                  missed.length
                    ? missed
                        .map(
                          (
                            response
                          ) => `
                            <article>

                              <strong>
                                Question ${
                                  response.number ||
                                  response.questionId
                                }
                              </strong>

                              <p>
                                Topic:
                                ${
                                  escapeHtml(
                                    response.topic ||
                                    "General"
                                  )
                                }
                              </p>

                              <p>
                                Your answer:
                                ${
                                  escapeHtml(
                                    response.selectedLabel ||
                                    "No answer"
                                  )
                                }
                              </p>

                              <p>
                                Correct answer:
                                ${
                                  escapeHtml(
                                    response.correctLabel ||
                                    response.correctAnswer ||
                                    ""
                                  )
                                }
                              </p>

                              ${
                                response
                                  .explanation
                                  ? `
                                    <p>
                                      ${
                                        escapeHtml(
                                          response.explanation
                                        )
                                      }
                                    </p>
                                  `
                                  : ""
                              }

                            </article>
                          `
                        )
                        .join("")
                    : `
                        <p class="empty-review">
                          Excellent work.
                          No incorrect answers.
                        </p>
                      `
                }

              </section>
            `
            : ""
        }


        <div class="result-actions">

          <button
            class="secondary-action"
            data-action="download-response-csv"
          >
            Download Response CSV
          </button>

        </div>

      </section>

    </main>
  `;


  document
    .querySelector(
      "[data-action='download-response-csv']"
    )
    ?.addEventListener(
      "click",
      () => {
        downloadText(
          `${
            fileSafe(
              student.id
            )
          }-responses.csv`,

          buildResponseCsv(
            evaluation
          ),

          "text/csv"
        );
      }
    );
}


/* =========================================================
   NORMALIZE SCORE
========================================================= */

function normalizeScore(
  evaluation
) {
  if (
    evaluation.score
  ) {
    return {
      correct:
        Number(
          evaluation.score
            .correct || 0
        ),

      total:
        Number(
          evaluation.score
            .total ||
          questions.length ||
          0
        ),

      percentage:
        Number(
          evaluation.score
            .percentage || 0
        ),

      answered:
        Number(
          evaluation.score
            .answered || 0
        ),

      unanswered:
        Number(
          evaluation.score
            .unanswered || 0
        )
    };
  }


  return {
    correct:
      Number(
        evaluation.correct ||
        0
      ),

    total:
      Number(
        evaluation.total ||
        questions.length ||
        0
      ),

    percentage:
      Number(
        evaluation.percentage ||
        0
      ),

    answered:
      Number(
        evaluation.answered ||
        0
      ),

    unanswered:
      Number(
        evaluation.unanswered ||
        0
      )
  };
}


/* =========================================================
   NORMALIZE STUDENT
========================================================= */

function normalizeStudent(
  evaluation
) {
  return evaluation.student || {
    id:
      evaluation.studentId ||
      "demo-student",

    name:
      evaluation.studentName ||
      "Demo Candidate",

    accessCode:
      evaluation.accessCode ||
      ""
  };
}


/* =========================================================
   NORMALIZE TIMING
========================================================= */

function normalizeTiming(
  evaluation
) {
  return evaluation.timing || {
    durationSeconds:
      Number(
        assessment
          .durationMinutes ||
        30
      ) *
      60,

    timeUsedSeconds:
      Math.max(
        0,

        Number(
          assessment
            .durationMinutes ||
          30
        ) *
          60 -
          Number(
            evaluation
              .timeRemainingSeconds ||
            0
          )
      ),

    timeRemainingSeconds:
      Number(
        evaluation
          .timeRemainingSeconds ||
        0
      )
  };
}


/* =========================================================
   TAG LIST
========================================================= */

function renderTagList(
  items,
  emptyText
) {
  if (
    !items ||
    !items.length
  ) {
    return `
      <p class="empty-review">
        ${
          escapeHtml(
            emptyText
          )
        }
      </p>
    `;
  }


  return `
    <div class="tag-list">

      ${
        items
          .map(
            (item) => `
              <span>
                ${
                  escapeHtml(
                    typeof item ===
                    "string"
                      ? item
                      : item.topic ||
                        item.label ||
                        ""
                  )
                }
              </span>
            `
          )
          .join("")
      }

    </div>
  `;
}
/* =========================================================
   ADMIN SETTING DISPLAY
========================================================= */

function renderSetting(
  label,
  enabled
) {
  return `
    <div
      class="setting-pill ${
        enabled
          ? "enabled"
          : "disabled"
      }"
    >
      <strong>
        ${escapeHtml(label)}
      </strong>

      <span>
        ${
          enabled
            ? "Enabled"
            : "Disabled"
        }
      </span>
    </div>
  `;
}


/* =========================================================
   ASSESSMENT VALIDATION
========================================================= */

function validateAssessment() {
  const errors = [];
  const warnings = [];

  const ids =
    new Set();


  if (!assessment.title) {
    errors.push(
      "Assessment title is missing."
    );
  }


  if (
    !assessment.durationMinutes ||
    Number(
      assessment.durationMinutes
    ) <= 0
  ) {
    errors.push(
      "Duration must be greater than 0."
    );
  }


  if (!questions.length) {
    errors.push(
      "No questions found."
    );
  }


  for (
    const question
    of questions
  ) {
    const label =
      `Question ${
        question.number ||
        question.id ||
        "unknown"
      }`;


    if (!question.id) {
      errors.push(
        `${label}: missing question id.`
      );
    }


    if (
      question.id &&
      ids.has(question.id)
    ) {
      errors.push(
        `${label}: duplicate question id ${question.id}.`
      );
    }


    if (question.id) {
      ids.add(
        question.id
      );
    }


    if (
      question.type &&
      question.type !== "mcq"
    ) {
      errors.push(
        `${label}: only MCQ questions are supported in this version.`
      );
    }


    if (!question.question) {
      errors.push(
        `${label}: missing question text.`
      );
    }


    if (
      !Array.isArray(
        question.options
      ) ||
      question.options.length !== 4
    ) {
      errors.push(
        `${label}: expected exactly 4 options.`
      );
    }


    if (!question.answer) {
      errors.push(
        `${label}: missing answer key.`
      );
    }


    if (
      question.answer &&
      Array.isArray(
        question.options
      ) &&
      !question.options.some(
        (option) =>
          option.id ===
          question.answer
      )
    ) {
      errors.push(
        `${label}: answer key does not match an option id.`
      );
    }


    if (!question.topic) {
      warnings.push(
        `${label}: topic is missing.`
      );
    }


    if (!question.explanation) {
      warnings.push(
        `${label}: explanation is missing.`
      );
    }


    if (
      !question.image &&
      question.imageDescription
    ) {
      warnings.push(
        `${label}: has an image description but no image file.`
      );
    }
  }


  return {
    errors,
    warnings
  };
}


/* =========================================================
   VALIDATION LIST
========================================================= */

function renderValidationList(
  title,
  items,
  emptyText
) {
  return `
    <div class="validation-list">

      <h3>
        ${escapeHtml(title)}
      </h3>

      ${
        items.length
          ? `
            <ul>
              ${
                items
                  .map(
                    (item) => `
                      <li>
                        ${
                          escapeHtml(
                            item
                          )
                        }
                      </li>
                    `
                  )
                  .join("")
              }
            </ul>
          `
          : `
            <p class="empty-review">
              ${
                escapeHtml(
                  emptyText
                )
              }
            </p>
          `
      }

    </div>
  `;
}


/* =========================================================
   ADMIN ILP CARD
========================================================= */

function renderAdminILPCard(
  attempt
) {
  const student =
    normalizeStudent(
      attempt
    );


  const score =
    normalizeScore(
      attempt
    );


  const ilp =
    attempt.ilp ||
    generateILP(
      attempt.responses || [],

      attempt.summary
        ?.topicBreakdown || [],

      attempt.summary
        ?.strengths || [],

      attempt.summary
        ?.needsReview || []
    );


  return `
    <article class="ilp-card">

      <div class="ilp-card-head">

        <div>

          <strong>
            ${
              escapeHtml(
                student.name
              )
            }
          </strong>

          <span>
            ${
              escapeHtml(
                student.id
              )
            }
            /
            ${
              score.percentage
            }%
            /
            ${
              escapeHtml(
                ilp.readinessLevel
              )
            }
          </span>

        </div>


        <button
          class="secondary-action"
          data-action="export-ilp"
          data-attempt-id="${escapeAttribute(
            attempt.attemptId ||
            attempt.id
          )}"
        >
          Export ILP
        </button>

      </div>


      <div class="performance-panels">

        <section>

          <h2>
            Priority Skills
          </h2>

          ${
            ilp.prioritySkills
              ?.length
              ? ilp.prioritySkills
                  .slice(
                    0,
                    4
                  )
                  .map(
                    (skill) => `
                      <div class="skill-gap">

                        <strong>
                          ${
                            escapeHtml(
                              skill.topic
                            )
                          }
                        </strong>

                        <span>
                          ${
                            escapeHtml(
                              skill.lesson
                            )
                          }
                        </span>

                        <p>
                          ${
                            escapeHtml(
                              skill.recommendation
                            )
                          }
                        </p>

                      </div>
                    `
                  )
                  .join("")
              : `
                  <p class="empty-review">
                    No priority gaps detected.
                  </p>
                `
          }

        </section>


        <section>

          <h2>
            Teacher Notes
          </h2>

          ${
            renderTagList(
              ilp.teacherNotes || [],
              "No notes generated."
            )
          }

        </section>

      </div>

    </article>
  `;
}


/* =========================================================
   ILP GENERATION
========================================================= */

function generateILP(
  responses,
  topicBreakdown,
  strengths,
  needsReview
) {
  const missed =
    responses.filter(
      (response) =>
        !response.isCorrect
    );


  const lessonMap =
    new Map();


  for (
    const response
    of missed
  ) {
    const lesson =
      response
        .distractorFeedback
        ?.lesson ||
      response.topic ||
      "General review";


    const feedback =
      response
        .distractorFeedback
        ?.feedback ||
      response.explanation ||
      "Review the underlying skill for this question.";


    if (
      !lessonMap.has(
        lesson
      )
    ) {
      lessonMap.set(
        lesson,
        {
          lesson,

          topic:
            response.topic ||
            "General",

          questions: [],

          reasons:
            new Set(),

          recommendation:
            buildRecommendation(
              response.topic,
              lesson
            )
        }
      );
    }


    const item =
      lessonMap.get(
        lesson
      );


    item.questions.push(
      response.number ||
      response.questionId
    );


    item.reasons.add(
      feedback
    );
  }


  const prioritySkills =
    Array.from(
      lessonMap.values()
    )
      .map(
        (item) => ({
          lesson:
            item.lesson,

          topic:
            item.topic,

          questions:
            item.questions,

          reasons:
            Array.from(
              item.reasons
            ),

          recommendation:
            item.recommendation
        })
      )
      .sort(
        (a, b) =>
          b.questions.length -
          a.questions.length
      );


  const overallPercent =
    responses.length
      ? Math.round(
          (
            responses.filter(
              (response) =>
                response.isCorrect
            ).length /
            responses.length
          ) *
            100
        )
      : 0;


  return {
    readinessLevel:
      getReadinessLevel(
        overallPercent
      ),

    strengths:
      strengths || [],

    needsReview:
      needsReview || [],

    prioritySkills,

    teacherNotes:
      buildTeacherNotes(
        prioritySkills,
        topicBreakdown || []
      ),

    studentPlan:
      buildStudentPlan(
        prioritySkills,
        needsReview || []
      )
  };
}


/* =========================================================
   ILP RECOMMENDATION
========================================================= */

function buildRecommendation(
  topic,
  lesson
) {
  const lower =
    `${
      topic || ""
    } ${
      lesson || ""
    }`
      .toLowerCase();


  if (
    lower.includes(
      "number line"
    )
  ) {
    return (
      "Practice modeling addition and subtraction on horizontal number lines, focusing on the start point and direction."
    );
  }


  if (
    lower.includes(
      "decimal"
    ) ||
    lower.includes(
      "nbt"
    )
  ) {
    return (
      "Practice aligning decimal points, adding placeholder zeroes, and checking place-value columns before calculating."
    );
  }


  if (
    lower.includes(
      "regroup"
    ) ||
    lower.includes(
      "borrow"
    )
  ) {
    return (
      "Practice regrouping with decimals and annotate each borrowing step before subtracting."
    );
  }


  return (
    "Review the related mini-lesson, complete guided examples, and then retry similar independent practice."
  );
}


/* =========================================================
   READINESS LEVEL
========================================================= */

function getReadinessLevel(
  percentage
) {
  if (
    percentage >= 85
  ) {
    return (
      "Ready for enrichment"
    );
  }


  if (
    percentage >= 70
  ) {
    return (
      "Near mastery"
    );
  }


  if (
    percentage >= 50
  ) {
    return (
      "Needs targeted support"
    );
  }


  return (
    "Needs foundational support"
  );
}


/* =========================================================
   TEACHER NOTES
========================================================= */

function buildTeacherNotes(
  prioritySkills,
  topicBreakdown
) {
  const notes = [];


  if (
    prioritySkills.length
  ) {
    notes.push(
      `Prioritize ${
        prioritySkills[0]
          .topic
      }: missed questions ${
        prioritySkills[0]
          .questions
          .join(", ")
      }.`
    );
  }


  const lowTopics =
    topicBreakdown
      .filter(
        (topic) =>
          topic.percentage <
          60
      )
      .map(
        (topic) =>
          topic.topic
      );


  if (
    lowTopics.length
  ) {
    notes.push(
      `Low-scoring topics: ${
        lowTopics.join(", ")
      }.`
    );
  }


  if (!notes.length) {
    notes.push(
      "Student is performing consistently; consider enrichment or mixed review."
    );
  }


  return notes;
}


/* =========================================================
   STUDENT LEARNING PLAN
========================================================= */

function buildStudentPlan(
  prioritySkills,
  needsReview
) {
  if (
    !prioritySkills.length
  ) {
    return [
      "Review your correct strategies and complete one enrichment set.",

      "Explain your solution steps for two problems to confirm mastery."
    ];
  }


  const plan =
    prioritySkills
      .slice(
        0,
        3
      )
      .map(
        (
          skill,
          index
        ) =>
          `${index + 1}. ${
            skill.recommendation
          }`
      );


  if (
    needsReview.length
  ) {
    plan.push(
      `Complete a short mixed practice set for: ${
        needsReview.join(", ")
      }.`
    );
  }


  return plan;
}


/* =========================================================
   CALCULATOR
========================================================= */

function renderCalculator() {
  return `
    <section
      class="calculator ${
        state.calculatorOpen
          ? "open"
          : ""
      }"
    >

      <div class="calculator-head">

        <div>

          <p class="eyebrow">
            Tool
          </p>

          <h3>
            Calculator
          </h3>

        </div>

      </div>


      <div class="calculator-body">

        <input
          class="calculator-display"
          value="${escapeAttribute(
            calculatorValue
          )}"
          readonly
          aria-label="Calculator display"
        />


        <div class="calculator-grid">

          ${
            [
              "7",
              "8",
              "9",
              "/",

              "4",
              "5",
              "6",
              "*",

              "1",
              "2",
              "3",
              "-",

              "0",
              ".",
              "=",
              "+"
            ]
              .map(
                (key) => `
                  <button
                    data-calculator-key="${key}"
                  >
                    ${key}
                  </button>
                `
              )
              .join("")
          }


          <button
            data-calculator-key="clear"
            class="wide"
          >
            Clear
          </button>

        </div>

      </div>

    </section>
  `;
}


function handleCalculatorKey(
  key
) {
  if (
    key === "clear"
  ) {
    calculatorValue = "";
  } else if (
    key === "="
  ) {
    try {
      if (
        /^[0-9+\-*/. ()]+$/.test(
          calculatorValue
        )
      ) {
        calculatorValue =
          String(
            Function(
              `"use strict"; return (${calculatorValue})`
            )()
          );
      }
    } catch {
      calculatorValue =
        "Error";
    }
  } else {
    calculatorValue =
      calculatorValue ===
      "Error"
        ? key
        : calculatorValue +
          key;
  }


  const display =
    document.querySelector(
      ".calculator-display"
    );


  if (display) {
    display.value =
      calculatorValue;
  }
}


/*
  Compatibility alias.
  This prevents errors if any older code still
  calls pressCalculator().
*/

function pressCalculator(
  key
) {
  handleCalculatorKey(
    key
  );
}


/* =========================================================
   SCRATCH PAD
========================================================= */

function initScratchPad() {
  const canvas =
    document.querySelector(
      ".scratch-canvas"
    );


  if (!canvas) {
    return;
  }


  const context =
    canvas.getContext(
      "2d"
    );


  if (!context) {
    return;
  }


  context.lineCap =
    "round";


  context.lineJoin =
    "round";


  const question =
    questions[
      state.currentIndex
    ];


  if (!question) {
    return;
  }


  const saved =
    state.scratchWork?.[
      question.id
    ];


  if (saved) {
    const image =
      new Image();


    image.onload = () => {
      context.drawImage(
        image,
        0,
        0,
        canvas.width,
        canvas.height
      );
    };


    image.src =
      saved;
  }


  const point =
    (event) => {
      const rect =
        canvas.getBoundingClientRect();


      const source =
        event.touches?.[0] ||
        event;


      return {
        x:
          (
            (
              source.clientX -
              rect.left
            ) /
            rect.width
          ) *
          canvas.width,


        y:
          (
            (
              source.clientY -
              rect.top
            ) /
            rect.height
          ) *
          canvas.height
      };
    };


  const start =
    (event) => {
      event.preventDefault();


      drawing =
        true;


      const p =
        point(event);


      context.beginPath();


      context.moveTo(
        p.x,
        p.y
      );
    };


  const draw =
    (event) => {
      if (!drawing) {
        return;
      }


      event.preventDefault();


      const p =
        point(event);


      context.globalCompositeOperation =
        scratchTool ===
        "eraser"
          ? "destination-out"
          : "source-over";


      context.strokeStyle =
        scratchColor;


      context.lineWidth =
        scratchTool ===
        "eraser"
          ? 22
          : 3;


      context.lineTo(
        p.x,
        p.y
      );


      context.stroke();
    };


  const stop =
    () => {
      if (!drawing) {
        return;
      }


      drawing =
        false;


      captureScratch();


      saveState();
    };


  canvas.addEventListener(
    "mousedown",
    start
  );


  canvas.addEventListener(
    "mousemove",
    draw
  );


  window.addEventListener(
    "mouseup",
    stop
  );


  canvas.addEventListener(
    "touchstart",
    start,
    {
      passive:
        false
    }
  );


  canvas.addEventListener(
    "touchmove",
    draw,
    {
      passive:
        false
    }
  );


  window.addEventListener(
    "touchend",
    stop
  );
}


/* =========================================================
   CAPTURE SCRATCH WORK
========================================================= */

function captureScratch() {
  const canvas =
    document.querySelector(
      ".scratch-canvas"
    );


  const question =
    questions[
      state.currentIndex
    ];


  if (
    !canvas ||
    !question
  ) {
    return;
  }


  state.scratchWork = {
    ...(
      state.scratchWork ||
      {}
    ),

    [question.id]:
      canvas.toDataURL(
        "image/png"
      )
  };
}


/* =========================================================
   IMAGE ZOOM
========================================================= */

function openImageZoom(
  src
) {
  zoomImageSrc =
    src;


  zoomScale =
    1;


  const overlay =
    document.createElement(
      "div"
    );


  overlay.className =
    "zoom-overlay";


  overlay.innerHTML = `
    <div
      class="zoom-toolbar"
      aria-label="Image zoom controls"
    >

      <button
        data-zoom-control="out"
        title="Zoom out"
      >
        -
      </button>


      <span data-zoom-label>
        100%
      </span>


      <button
        data-zoom-control="in"
        title="Zoom in"
      >
        +
      </button>


      <button
        data-zoom-control="reset"
        title="Reset zoom"
      >
        Reset
      </button>


      <button
        class="zoom-close"
        data-zoom-control="close"
        title="Close"
      >
        Close
      </button>

    </div>


    <div class="zoom-stage">

      <img
        src="${escapeAttribute(
          zoomImageSrc
        )}"
        alt=""
        draggable="false"
      />

    </div>
  `;


  const image =
    overlay.querySelector(
      "img"
    );


  const label =
    overlay.querySelector(
      "[data-zoom-label]"
    );


  const applyZoom =
    () => {
      image.style.transform =
        `scale(${zoomScale})`;


      label.textContent =
        `${
          Math.round(
            zoomScale *
            100
          )
        }%`;
    };


  const changeZoom =
    (amount) => {
      zoomScale =
        Math.min(
          3,

          Math.max(
            0.5,

            Number(
              (
                zoomScale +
                amount
              ).toFixed(
                2
              )
            )
          )
        );


      applyZoom();
    };


  overlay.addEventListener(
    "click",
    (event) => {
      const control =
        event.target.closest(
          "[data-zoom-control]"
        );


      if (!control) {
        if (
          !event.target.closest(
            "img"
          ) &&
          !event.target.closest(
            ".zoom-toolbar"
          )
        ) {
          overlay.remove();
        }


        return;
      }


      const action =
        control.dataset
          .zoomControl;


      if (
        action === "in"
      ) {
        changeZoom(
          0.2
        );
      }


      if (
        action === "out"
      ) {
        changeZoom(
          -0.2
        );
      }


      if (
        action === "reset"
      ) {
        zoomScale =
          1;


        applyZoom();
      }


      if (
        action === "close"
      ) {
        overlay.remove();
      }
    }
  );


  overlay.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();


      changeZoom(
        event.deltaY <
        0
          ? 0.12
          : -0.12
      );
    },
    {
      passive:
        false
    }
  );


  overlay.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key ===
        "Escape"
      ) {
        overlay.remove();
      }
    }
  );


  overlay.tabIndex =
    -1;


  document.body.appendChild(
    overlay
  );


  overlay.focus();
}


/* =========================================================
   INDEXEDDB OPEN
========================================================= */

function openResultsDatabase() {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      if (
        !(
          "indexedDB"
          in window
        )
      ) {
        reject(
          new Error(
            "IndexedDB is not available."
          )
        );

        return;
      }


      const request =
        indexedDB.open(
          RESULTS_DB_NAME,
          1
        );


      request.onupgradeneeded =
        () => {
          const db =
            request.result;


          let store;


          if (
            !db.objectStoreNames
              .contains(
                RESULTS_STORE
              )
          ) {
            store =
              db.createObjectStore(
                RESULTS_STORE,
                {
                  keyPath:
                    "id"
                }
              );
          } else {
            store =
              request.transaction
                .objectStore(
                  RESULTS_STORE
                );
          }


          if (
            !store.indexNames
              .contains(
                "studentId"
              )
          ) {
            store.createIndex(
              "studentId",
              "student.id",
              {
                unique:
                  false
              }
            );
          }


          if (
            !store.indexNames
              .contains(
                "assessmentTitle"
              )
          ) {
            store.createIndex(
              "assessmentTitle",
              "assessment.title",
              {
                unique:
                  false
              }
            );
          }


          if (
            !store.indexNames
              .contains(
                "submittedAt"
              )
          ) {
            store.createIndex(
              "submittedAt",
              "submittedAt",
              {
                unique:
                  false
              }
            );
          }
        };


      request.onerror =
        () => {
          reject(
            request.error ||
            new Error(
              "Could not open results database."
            )
          );
        };


      request.onsuccess =
        () => {
          resolve(
            request.result
          );
        };
    }
  );
}


/* =========================================================
   SAVE ATTEMPT TO INDEXEDDB
========================================================= */

async function saveAttemptToIndexedDb(
  evaluation
) {
  if (
    !(
      "indexedDB"
      in window
    )
  ) {
    const fallbackKey =
      "assessment-engine-results-fallback";


    const previous =
      JSON.parse(
        localStorage.getItem(
          fallbackKey
        ) ||
        "[]"
      );


    previous.push(
      evaluation
    );


    localStorage.setItem(
      fallbackKey,

      JSON.stringify(
        previous.slice(
          -10000
        )
      )
    );


    return evaluation;
  }


  const db =
    await openResultsDatabase();


  return new Promise(
    (
      resolve,
      reject
    ) => {
      const transaction =
        db.transaction(
          RESULTS_STORE,
          "readwrite"
        );


      const store =
        transaction.objectStore(
          RESULTS_STORE
        );


      store.put(
        evaluation
      );


      transaction.oncomplete =
        () => {
          db.close();


          resolve(
            evaluation
          );
        };


      transaction.onerror =
        () => {
          const error =
            transaction.error ||
            new Error(
              "Could not save assessment attempt."
            );


          db.close();


          reject(
            error
          );
        };
    }
  );
}


/* =========================================================
   LOAD ATTEMPTS FROM INDEXEDDB
========================================================= */

async function loadAttemptsFromIndexedDb() {
  if (
    !(
      "indexedDB"
      in window
    )
  ) {
    return JSON.parse(
      localStorage.getItem(
        "assessment-engine-results-fallback"
      ) ||
      "[]"
    );
  }


  try {
    const db =
      await openResultsDatabase();


    return await new Promise(
      (
        resolve
      ) => {
        const transaction =
          db.transaction(
            RESULTS_STORE,
            "readonly"
          );


        const store =
          transaction.objectStore(
            RESULTS_STORE
          );


        const request =
          store.getAll();


        request.onsuccess =
          () => {
            db.close();


            resolve(
              request.result ||
              []
            );
          };


        request.onerror =
          () => {
            db.close();


            resolve(
              []
            );
          };
      }
    );
  } catch (
    error
  ) {
    console.warn(
      "Could not load IndexedDB attempts:",
      error
    );


    return [];
  }
}


/* =========================================================
   RESPONSE CSV
========================================================= */

function buildResponseCsv(
  evaluation
) {
  const rows = [
    [
      "student_id",
      "student_name",
      "assessment",
      "question",
      "topic",
      "selected",
      "correct_answer",
      "is_correct"
    ]
  ];


  const student =
    normalizeStudent(
      evaluation
    );


  const title =
    evaluation.assessment
      ?.title ||
    evaluation
      .assessmentTitle ||
    assessment.title;


  for (
    const response
    of evaluation.responses ||
    []
  ) {
    rows.push([
      student.id,

      student.name,

      title,

      response.number,

      response.topic,

      response.selected ||
      "",

      response.correctAnswer,

      response.isCorrect
        ? "true"
        : "false"
    ]);
  }


  return rows
    .map(
      (row) =>
        row
          .map(
            csvEscape
          )
          .join(",")
    )
    .join("\n");
}


/* =========================================================
   ATTEMPTS CSV
========================================================= */

function buildAttemptsCsv(
  attempts
) {
  const rows = [
    [
      "attempt_id",
      "student_id",
      "student_name",
      "assessment",
      "score",
      "total",
      "percentage",
      "answered",
      "unanswered",
      "time_used_seconds",
      "submitted_at"
    ]
  ];


  for (
    const attempt
    of attempts
  ) {
    const student =
      normalizeStudent(
        attempt
      );


    const score =
      normalizeScore(
        attempt
      );


    const timing =
      normalizeTiming(
        attempt
      );


    rows.push([
      attempt.attemptId ||
      attempt.id ||
      "",

      student.id,

      student.name,

      attempt.assessment
        ?.title ||
      attempt
        .assessmentTitle ||
      assessment.title,

      score.correct,

      score.total,

      score.percentage,

      score.answered,

      score.unanswered,

      timing.timeUsedSeconds,

      attempt.submittedAt ||
      ""
    ]);
  }


  return rows
    .map(
      (row) =>
        row
          .map(
            csvEscape
          )
          .join(",")
    )
    .join("\n");
}


/* =========================================================
   CSV ESCAPE
========================================================= */

function csvEscape(
  value
) {
  const text =
    String(
      value ?? ""
    );


  return `"${text.replaceAll(
    '"',
    '""'
  )}"`;
}


/* =========================================================
   DOWNLOAD TEXT FILE
========================================================= */

function downloadText(
  filename,
  content,
  type
) {
  const blob =
    new Blob(
      [
        content
      ],
      {
        type
      }
    );


  const url =
    URL.createObjectURL(
      blob
    );


  const link =
    document.createElement(
      "a"
    );


  link.href =
    url;


  link.download =
    filename;


  document.body.appendChild(
    link
  );


  link.click();


  link.remove();


  URL.revokeObjectURL(
    url
  );
}


/* =========================================================
   FILE SAFE NAME
========================================================= */

function fileSafe(
  value
) {
  return String(
    value ||
    "result"
  )
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      "-"
    )
    .replace(
      /^-|-$/g,
      ""
    );
}


/* =========================================================
   FORMAT DURATION
========================================================= */

function formatDuration(
  totalSeconds
) {
  const safeSeconds =
    Math.max(
      0,
      Number(
        totalSeconds ||
        0
      )
    );


  const minutes =
    Math.floor(
      safeSeconds /
      60
    );


  const seconds =
    Math.floor(
      safeSeconds %
      60
    );


  return `${minutes}m ${
    String(
      seconds
    ).padStart(
      2,
      "0"
    )
  }s`;
}


/* =========================================================
   FORMAT DATE
========================================================= */

function formatDateTime(
  value
) {
  if (!value) {
    return "";
  }


  const date =
    new Date(
      value
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return String(
      value
    );
  }


  return date
    .toLocaleString();
}


/* =========================================================
   HTML ESCAPING
========================================================= */

function escapeHtml(
  value
) {
  return String(
    value ?? ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}


/* =========================================================
   ATTRIBUTE ESCAPING
========================================================= */

function escapeAttribute(
  value
) {
  return escapeHtml(
    value
  )
    .replaceAll(
      "`",
      "&#096;"
    );
}