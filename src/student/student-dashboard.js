function renderStudentDashboard(student, dashboardData) {
  const availableAssignments = dashboardData.availableAssignments || [];
  const completedAssignments = dashboardData.completedAssignments || [];
  const attempts = dashboardData.attempts || [];
  root.innerHTML = `
    <main class="student-dashboard-shell">
      <section class="student-dashboard">
        <header class="student-dashboard-head">
          <div>
            <p class="eyebrow">Student dashboard</p>
            <h1>${escapeHtml(student.name || "Student")}</h1>
            <p>${escapeHtml(student.email || student.username || student.id || "")}</p>
          </div>
          <button class="secondary-action" data-action="student-sign-out">Sign out</button>
        </header>

        <div class="student-dashboard-summary">
          <span><strong>${availableAssignments.length}</strong> available</span>
          <span><strong>${completedAssignments.length}</strong> completed</span>
          <span><strong>${attempts.length}</strong> submitted</span>
          <span><strong>${escapeHtml(student.gradeLevel || "-")}</strong> grade</span>
        </div>

        <section class="student-dashboard-section">
          <div class="student-section-head">
            <p class="eyebrow">Available</p>
            <h2>Assigned assessments</h2>
          </div>
          <div class="student-assessment-list" aria-label="Assigned assessments">
            ${availableAssignments.length
              ? availableAssignments.map((assignment) => renderStudentAssignmentCard(student, assignment, attempts)).join("")
              : `<p class="empty-review">No available assessments right now.</p>`}
          </div>
        </section>

        <section class="student-dashboard-section">
          <div class="student-section-head">
            <p class="eyebrow">History</p>
            <h2>Completed assessments</h2>
          </div>
          <div class="student-history-list" aria-label="Completed assessments">
            ${renderCompletedAssessmentHistory(completedAssignments, attempts)}
          </div>
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
  const historyCount = assignment.metadata?.assignmentHistory?.length || 0;
  return `
    <article class="student-assessment-card">
      <div>
        <p class="eyebrow">Assigned assessment</p>
        <h2>${escapeHtml(assignment.assessmentTitle || assignment.assessmentKey || "Assessment")}</h2>
        <div class="student-assessment-meta">
          <span>${duration} minutes</span>
          <span>${attemptsLeft}/${attemptLimit} attempts left</span>
          ${historyCount ? `<span>${historyCount} prior assignment${historyCount === 1 ? "" : "s"}</span>` : ""}
          ${assignment.dueAt ? `<span>Due ${escapeHtml(formatDateTime(assignment.dueAt))}</span>` : ""}
        </div>
      </div>
      <button class="primary-action" data-action="start-assigned-assessment" data-assignment-id="${escapeAttribute(assignment.id)}">Start</button>
    </article>
  `;
}

function renderCompletedAssessmentHistory(completedAssignments, attempts) {
  const historyRows = [
    ...completedAssignments.map((assignment) => ({
      title: assignment.assessmentTitle || assignment.assessmentKey || "Assessment",
      status: "Completed",
      submittedAt: getLatestAttemptDateForAssignment(assignment, attempts),
      score: getLatestAttemptScoreForAssignment(assignment, attempts),
      attempts: `${getAssignmentAttemptUsage(assignment, attempts)}/${Number(assignment.attemptLimit || 1)}`
    })),
    ...attempts
      .filter((attempt) => !completedAssignments.some((assignment) => String(assignment.id) === String(attempt.assignmentKey)))
      .map((attempt) => {
        const score = normalizeScore(attempt);
        return {
          title: attempt.assessment?.title || attempt.assessmentTitle || "Assessment",
          status: "Submitted",
          submittedAt: attempt.submittedAt || "",
          score: `${score.percentage}%`,
          attempts: "-"
        };
      })
  ];

  if (!historyRows.length) return `<p class="empty-review">No completed assessments yet.</p>`;

  return `
    <div class="student-history-table-wrap">
      <table class="student-history-table">
        <thead><tr><th>Assessment</th><th>Status</th><th>Score</th><th>Attempts</th><th>Submitted</th></tr></thead>
        <tbody>
          ${historyRows.map((row) => `
            <tr>
              <td>${escapeHtml(row.title)}</td>
              <td>${escapeHtml(row.status)}</td>
              <td>${escapeHtml(row.score || "-")}</td>
              <td>${escapeHtml(row.attempts || "-")}</td>
              <td>${escapeHtml(row.submittedAt ? formatDateTime(row.submittedAt) : "-")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function getLatestAttemptForAssignment(assignment, attempts) {
  return attempts
    .filter((attempt) => {
      const sameAssignment = attempt.assignmentKey && String(attempt.assignmentKey) === String(assignment.id);
      const sameAssessment = (attempt.assessment?.key || attempt.assessmentKey) === assignment.assessmentKey;
      const sameTitle = (attempt.assessment?.title || attempt.assessmentTitle) === assignment.assessmentTitle;
      return sameAssignment || sameAssessment || sameTitle;
    })
    .sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")))[0] || null;
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
