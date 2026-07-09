function renderStudentDashboard(student, dashboardData) {
  document.body.classList.add("page-scroll");
  const availableAssignments = dashboardData.availableAssignments || [];
  const completedAssignments = dashboardData.completedAssignments || [];
  const attempts = [...(dashboardData.attempts || [])]
    .sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")));
  const performance = buildStudentPerformance(attempts, availableAssignments);
  const studentInitial = String(student.name || student.email || "S").trim().charAt(0).toUpperCase();

  root.innerHTML = `
    <main class="student-dashboard-shell">
      <section class="student-dashboard clean">
        <header class="student-dashboard-hero">
          <div class="student-profile-lockup">
            <div class="student-avatar">${escapeHtml(studentInitial)}</div>
            <div>
              <p class="eyebrow">Student dashboard</p>
              <h1>${escapeHtml(student.name || "Student")}</h1>
              <p>${escapeHtml(student.email || student.username || student.id || "")}</p>
            </div>
          </div>
          <button class="secondary-action" data-action="student-sign-out">Sign out</button>
        </header>

        <section class="student-focus-panel">
          <div>
            <p class="eyebrow">Ready</p>
            <h2>${availableAssignments.length ? "Assigned work is ready" : "No assignments available"}</h2>
            <p>${availableAssignments.length
              ? "Start the assignment when you are ready. Your submitted work will appear in performance."
              : "Your dashboard will update when a new assessment or worksheet is assigned."}</p>
          </div>
          <div class="student-dashboard-summary">
            <span><strong>${availableAssignments.length}</strong> assigned</span>
            <span><strong>${attempts.length}</strong> submitted</span>
            <span><strong>${performance.averageScore}%</strong> average</span>
            <span><strong>${escapeHtml(student.gradeLevel || "-")}</strong> grade</span>
          </div>
        </section>

        <section class="student-dashboard-section primary">
          <div class="student-section-head">
            <div>
              <p class="eyebrow">Assigned</p>
              <h2>Start an assignment</h2>
            </div>
            <span>${availableAssignments.length} available</span>
          </div>
          <div class="student-assessment-list" aria-label="Assigned work">
            ${availableAssignments.length
              ? availableAssignments.map((assignment) => renderStudentAssignmentCard(student, assignment, attempts)).join("")
              : `<p class="empty-review">No available assignments right now.</p>`}
          </div>
        </section>

        <section class="student-dashboard-grid">
          <article class="student-performance-card">
            <div class="student-section-head">
              <div>
                <p class="eyebrow">Performance</p>
                <h2>Your progress</h2>
              </div>
              <strong>${performance.averageScore}%</strong>
            </div>
            ${renderStudentPerformance(performance)}
          </article>

          <article class="student-performance-card">
            <div class="student-section-head">
              <div>
                <p class="eyebrow">History</p>
                <h2>Recent submissions</h2>
              </div>
              <span>${attempts.length} total</span>
            </div>
            ${renderCompletedAssessmentHistory(completedAssignments, attempts)}
          </article>
        </section>
      </section>
    </main>
  `;

  document.querySelector("[data-action='student-sign-out']")?.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    state = getInitialState(questions.length);
    renderStartScreen();
  });

  document.querySelectorAll("[data-action='start-assigned-assessment']").forEach((button) => {
    button.addEventListener("click", async () => {
      const assignment = availableAssignments.find((item) => String(item.id) === String(button.dataset.assignmentId));
      if (!assignment) return;
      button.disabled = true;
      button.textContent = "Opening...";
      try {
        await startStudentAssignment(student, assignment);
      } catch (error) {
        button.disabled = false;
        button.textContent = "Start";
        renderStudentDashboardError(error.message || "Could not open this assessment.");
      }
    });
  });
}

function renderStudentAssignmentCard(student, assignment, attempts = []) {
  const settings = assignment.metadata || {};
  const duration = Number(settings.durationMinutes || assignment.durationMinutes || assignment.metadata?.assessment?.durationMinutes || 30);
  const attemptLimit = Number(assignment.attemptLimit || 1);
  const attemptCount = getAssignmentAttemptUsage(assignment, attempts);
  const attemptsLeft = Math.max(0, attemptLimit - attemptCount);
  const assignmentType = formatAssignmentType(getAssignmentType(assignment));
  const latestScore = getLatestAttemptScoreForAssignment(assignment, attempts);
  return `
    <article class="student-assessment-card clean">
      <div>
        <p class="eyebrow">${escapeHtml(assignmentType)}</p>
        <h2>${escapeHtml(assignment.assessmentTitle || assignment.assessmentKey || "Assessment")}</h2>
        <div class="student-assessment-meta">
          <span>${duration} minutes</span>
          <span class="student-status-chip">${attemptsLeft}/${attemptLimit} attempts left</span>
          ${latestScore !== "-" ? `<span>Last score ${escapeHtml(latestScore)}</span>` : ""}
          ${assignment.dueAt ? `<span>Due ${escapeHtml(formatDateTime(assignment.dueAt))}</span>` : ""}
        </div>
      </div>
      <button class="primary-action" data-action="start-assigned-assessment" data-assignment-id="${escapeAttribute(assignment.id)}">Start</button>
    </article>
  `;
}

function renderCompletedAssessmentHistory(completedAssignments, attempts) {
  const assignmentIds = new Set(completedAssignments.map((assignment) => String(assignment.id)));
  const historyRows = [
    ...completedAssignments.map((assignment) => ({
      title: assignment.assessmentTitle || assignment.assessmentKey || "Assessment",
      type: formatAssignmentType(getAssignmentType(assignment)),
      status: "Completed",
      submittedAt: getLatestAttemptDateForAssignment(assignment, attempts),
      score: getLatestAttemptScoreForAssignment(assignment, attempts)
    })),
    ...attempts
      .filter((attempt) => !assignmentIds.has(String(getAttemptAssignmentKey(attempt))))
      .map((attempt) => {
        const score = normalizeScore(attempt);
        return {
          title: attempt.assessment?.title || attempt.assessmentTitle || "Assessment",
          type: formatAssignmentType(attempt.assignmentType || attempt.assessment?.assignmentType || "assessment"),
          status: "Submitted",
          submittedAt: attempt.submittedAt || "",
          score: `${score.percentage}%`
        };
      })
  ].sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")));

  if (!historyRows.length) return `<p class="empty-review">No submitted work yet.</p>`;

  return `
    <div class="student-history-table-wrap compact">
      <table class="student-history-table">
        <thead><tr><th>Assignment</th><th>Score</th><th>Submitted</th></tr></thead>
        <tbody>
          ${historyRows.slice(0, 6).map((row) => `
            <tr>
              <td><strong>${escapeHtml(row.title)}</strong><small>${escapeHtml(row.type)} / ${escapeHtml(row.status)}</small></td>
              <td>${escapeHtml(row.score || "-")}</td>
              <td>${escapeHtml(row.submittedAt ? formatDateTime(row.submittedAt) : "-")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function buildStudentPerformance(attempts = [], availableAssignments = []) {
  const scored = attempts.map((attempt) => ({
    attempt,
    score: normalizeScore(attempt),
    timing: normalizeTiming(attempt)
  }));
  const averageScore = scored.length
    ? Math.round(scored.reduce((sum, row) => sum + row.score.percentage, 0) / scored.length)
    : 0;
  const bestScore = scored.length
    ? Math.max(...scored.map((row) => row.score.percentage))
    : 0;
  const latest = scored[0] || null;
  const topicMap = new Map();
  scored.forEach(({ attempt }) => {
    const topics = attempt.summary?.topicBreakdown || buildTopicBreakdown(attempt.responses || []);
    topics.forEach((topic) => {
      const key = topic.topic || "General";
      if (!topicMap.has(key)) topicMap.set(key, { topic: key, correct: 0, total: 0 });
      const current = topicMap.get(key);
      current.correct += Number(topic.correct || 0);
      current.total += Number(topic.total || 0);
    });
  });
  const topics = Array.from(topicMap.values())
    .map((topic) => ({
      ...topic,
      percentage: topic.total ? Math.round((topic.correct / topic.total) * 100) : 0
    }))
    .sort((a, b) => a.percentage - b.percentage);
  return {
    averageScore,
    bestScore,
    latest,
    submittedCount: attempts.length,
    assignedCount: availableAssignments.length,
    focusTopics: topics.slice(0, 3),
    strongestTopics: [...topics].sort((a, b) => b.percentage - a.percentage).slice(0, 2)
  };
}

function renderStudentPerformance(performance) {
  return `
    <div class="student-performance-stats">
      <span><strong>${performance.averageScore}%</strong> average</span>
      <span><strong>${performance.bestScore}%</strong> best</span>
      <span><strong>${performance.submittedCount}</strong> submitted</span>
      <span><strong>${performance.assignedCount}</strong> assigned</span>
    </div>
    ${performance.latest ? `
      <div class="student-latest-score">
        <span>Latest score</span>
        <strong>${performance.latest.score.percentage}%</strong>
        <small>${escapeHtml(performance.latest.attempt.assessment?.title || performance.latest.attempt.assessmentTitle || "Assessment")}</small>
      </div>
    ` : `<p class="empty-review">Performance will appear after the first submission.</p>`}
    <div class="student-topic-panel">
      <div>
        <h3>Focus</h3>
        ${renderStudentTopicList(performance.focusTopics, "No focus areas yet.")}
      </div>
      <div>
        <h3>Strengths</h3>
        ${renderStudentTopicList(performance.strongestTopics, "No strengths yet.")}
      </div>
    </div>
  `;
}

function renderStudentTopicList(topics, emptyText) {
  if (!topics.length) return `<p class="muted-cell">${escapeHtml(emptyText)}</p>`;
  return `
    <div class="student-topic-list">
      ${topics.map((topic) => `
        <span>
          <b>${escapeHtml(topic.topic)}</b>
          <em>${topic.percentage}%</em>
        </span>
      `).join("")}
    </div>
  `;
}

function getLatestAttemptForAssignment(assignment, attempts) {
  return attempts
    .filter((attempt) => {
      const sameAssignment = getAttemptAssignmentKey(attempt) && String(getAttemptAssignmentKey(attempt)) === String(assignment.id);
      const sameAssessment = (attempt.assessment?.key || attempt.assessmentKey) === assignment.assessmentKey;
      const sameTitle = (attempt.assessment?.title || attempt.assessmentTitle) === assignment.assessmentTitle;
      return sameAssignment || sameAssessment || sameTitle;
    })
    .sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")))[0] || null;
}

function getAttemptAssignmentKey(attempt) {
  return attempt.assignmentKey || attempt.assessment?.assignmentKey || "";
}

function getLatestAttemptDateForAssignment(assignment, attempts) {
  return getLatestAttemptForAssignment(assignment, attempts)?.submittedAt || "";
}

function getLatestAttemptScoreForAssignment(assignment, attempts) {
  const attempt = getLatestAttemptForAssignment(assignment, attempts);
  if (!attempt) return "-";
  return `${normalizeScore(attempt).percentage}%`;
}

async function startStudentAssignment(student, assignment) {
  await applyAssignedAssessment(assignment);
  setState({
    started: true,
    startedAt: new Date().toISOString(),
    studentLookupError: "",
    remainingSeconds: (assessment.durationMinutes || 30) * 60,
    assignment,
    assignmentSettings: assignment.metadata || {},
    student
  });
  sendAssignmentActivityHeartbeat(true);
}

function renderStudentDashboardError(message) {
  const existing = document.querySelector("[data-dashboard-error]");
  if (existing) {
    existing.textContent = message;
    return;
  }
  const panel = document.querySelector(".student-dashboard");
  panel?.insertAdjacentHTML("afterbegin", `<div class="admin-error" data-dashboard-error>${escapeHtml(message)}</div>`);
}
