const STORAGE_KEY = "assessment-engine-mvp";
const RESULTS_DB_NAME = "assessment-engine-results";
const RESULTS_STORE = "attempts";
const ATTEMPT_SCHEMA_VERSION = "attempt-v1";
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
    responses
  };
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

        <div class="result-actions">
          <button class="secondary-action" data-action="download-json">Download JSON</button>
          <button class="secondary-action" data-action="download-csv">Download CSV</button>
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

  document.querySelector("[data-action='download-json']").addEventListener("click", () => {
    downloadText(
      `${fileSafe(student.id)}-${fileSafe(assessment.title)}-result.json`,
      JSON.stringify(evaluation, null, 2),
      "application/json"
    );
  });

  document.querySelector("[data-action='download-csv']").addEventListener("click", () => {
    downloadText(
      `${fileSafe(student.id)}-${fileSafe(assessment.title)}-responses.csv`,
      buildResponseCsv(evaluation),
      "text/csv"
    );
  });

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
