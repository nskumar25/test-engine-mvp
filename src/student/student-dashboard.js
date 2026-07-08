function renderStudentDashboard(student, assignments) {
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
          <span><strong>${assignments.length}</strong> available</span>
          <span><strong>${escapeHtml(student.gradeLevel || "-")}</strong> grade</span>
          <span><strong>${escapeHtml(student.section || "-")}</strong> section</span>
        </div>

        <section class="student-assessment-list" aria-label="Assigned assessments">
          ${assignments.map((assignment) => renderStudentAssignmentCard(student, assignment)).join("")}
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
      const assignment = assignments.find((item) => String(item.id) === String(button.dataset.assignmentId));
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

function renderStudentAssignmentCard(student, assignment) {
  const settings = assignment.metadata || {};
  const duration = Number(settings.durationMinutes || assignment.durationMinutes || assignment.metadata?.assessment?.durationMinutes || 30);
  const attemptLimit = Number(assignment.attemptLimit || 1);
  const attemptCount = Number(assignment.attemptCount || 0);
  const attemptsLeft = Math.max(0, attemptLimit - attemptCount);
  return `
    <article class="student-assessment-card">
      <div>
        <p class="eyebrow">Assigned assessment</p>
        <h2>${escapeHtml(assignment.assessmentTitle || assignment.assessmentKey || "Assessment")}</h2>
        <div class="student-assessment-meta">
          <span>${duration} minutes</span>
          <span>${attemptsLeft}/${attemptLimit} attempts left</span>
          ${assignment.dueAt ? `<span>Due ${escapeHtml(formatDateTime(assignment.dueAt))}</span>` : ""}
        </div>
      </div>
      <button class="primary-action" data-action="start-assigned-assessment" data-assignment-id="${escapeAttribute(assignment.id)}">Start</button>
    </article>
  `;
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
