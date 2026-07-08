let adminIlpFilterState = {};

function renderAdminIlpPage(context) {
  const rows = filterIlpRows(buildIlpRows(context));
  const selectedId = adminIlpFilterState.selectedAttemptId || rows[0]?.id || "";
  const selected = rows.find((row) => row.id === selectedId) || rows[0] || null;
  const reviewedCount = rows.filter((row) => isIlpReviewed(row.id)).length;

  return `
    <section class="admin-page-shell ilp-dashboard">
      <article class="admin-card ilp-filter-card">
        <div class="admin-card-head">
          <div>
            <p class="eyebrow">ILP & Worksheets</p>
            <h2>Learning plans from assessment results</h2>
          </div>
        </div>
        ${renderIlpFilters(buildIlpRows(context))}
      </article>

      <div class="results-summary-grid">
        <article><span>Plans</span><strong>${rows.length}</strong></article>
        <article><span>Reviewed</span><strong>${reviewedCount}</strong></article>
        <article><span>Needs Review</span><strong>${Math.max(0, rows.length - reviewedCount)}</strong></article>
        <article><span>Worksheet Packs</span><strong>${rows.length}</strong></article>
      </div>

      <div class="admin-split ilp-workspace">
        <article class="admin-card">
          <div class="admin-card-head">
            <div>
              <p class="eyebrow">Students</p>
              <h2>${rows.length} learning plans</h2>
            </div>
          </div>
          ${renderIlpStudentList(rows, selected?.id || "")}
        </article>

        <article class="admin-card ilp-detail-card">
          ${selected ? renderIlpDetail(selected) : `<p class="empty-review">No learning plans match the selected filters.</p>`}
        </article>
      </div>
    </section>
  `;
}

function bindIlpDashboardControls() {
  document.querySelectorAll("[data-ilp-filter]").forEach((field) => {
    field.addEventListener("input", () => {
      adminIlpFilterState[field.dataset.ilpFilter] = field.value;
      adminIlpFilterState.selectedAttemptId = "";
      renderAdminDashboard();
    });
    field.addEventListener("change", () => {
      adminIlpFilterState[field.dataset.ilpFilter] = field.value;
      adminIlpFilterState.selectedAttemptId = "";
      renderAdminDashboard();
    });
  });

  document.querySelectorAll("[data-action='view-ilp-detail']").forEach((button) => {
    button.addEventListener("click", () => {
      adminIlpFilterState.selectedAttemptId = button.dataset.attemptId || "";
      renderAdminDashboard();
    });
  });

  document.querySelector("[data-action='mark-ilp-reviewed']")?.addEventListener("click", (event) => {
    const attemptId = event.currentTarget.dataset.attemptId;
    if (!attemptId) return;
    const reviewed = getReviewedIlpMap();
    reviewed[attemptId] = new Date().toISOString();
    localStorage.setItem("assessment-engine-reviewed-ilps", JSON.stringify(reviewed));
    renderAdminDashboard();
  });

  document.querySelector("[data-action='print-ilp']")?.addEventListener("click", () => {
    window.print();
  });
}

function renderIlpFilters(rows) {
  const assessments = uniqueValues(rows.map((row) => row.assessmentTitle));
  const readinessLevels = uniqueValues(rows.map((row) => row.ilp.readinessLevel));
  return `
    <div class="results-filter-grid ilp-filter-grid">
      <label>
        Assessment
        <select data-ilp-filter="assessment">
          <option value="">All assessments</option>
          ${assessments.map((item) => `<option value="${escapeAttribute(item)}" ${adminIlpFilterState.assessment === item ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}
        </select>
      </label>
      <label>
        Readiness
        <select data-ilp-filter="readiness">
          <option value="">All levels</option>
          ${readinessLevels.map((item) => `<option value="${escapeAttribute(item)}" ${adminIlpFilterState.readiness === item ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}
        </select>
      </label>
      <label>
        Student
        <input data-ilp-filter="search" type="search" value="${escapeAttribute(adminIlpFilterState.search || "")}" placeholder="Name or ID" />
      </label>
    </div>
  `;
}

function renderIlpStudentList(rows, selectedId) {
  return `
    <div class="admin-table-wrap ilp-table-wrap">
      <table class="admin-table ilp-table">
        <thead>
          <tr><th>Student</th><th>Assessment</th><th>Score</th><th>Readiness</th><th>Review</th><th></th></tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map((row) => `
            <tr class="${row.id === selectedId ? "selected-row" : ""}">
              <td><strong>${escapeHtml(row.student.name)}</strong><small>${escapeHtml(row.student.id)}</small></td>
              <td>${escapeHtml(row.assessmentTitle)}</td>
              <td>${row.score.percentage}%</td>
              <td>${escapeHtml(row.ilp.readinessLevel)}</td>
              <td>${isIlpReviewed(row.id) ? "Reviewed" : "Needs review"}</td>
              <td><button class="table-action" data-action="view-ilp-detail" data-attempt-id="${escapeAttribute(row.id)}">View</button></td>
            </tr>
          `).join("") : `<tr><td colspan="6">No ILPs match the selected filters.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderIlpDetail(row) {
  const worksheets = buildWorksheetRecommendations(row);
  return `
    <div class="result-detail-head">
      <div>
        <p class="eyebrow">Student Plan</p>
        <h2>${escapeHtml(row.student.name)}</h2>
        <span>${escapeHtml(row.assessmentTitle)} / ${row.score.percentage}%</span>
      </div>
      <strong>${escapeHtml(row.ilp.readinessLevel)}</strong>
    </div>

    <div class="result-detail-stats">
      <span>${row.score.correct}/${row.score.total} correct</span>
      <span>${row.score.unanswered} unanswered</span>
      <span>${isIlpReviewed(row.id) ? "Reviewed" : "Needs review"}</span>
      <span>${worksheets.length} worksheets</span>
    </div>

    <section>
      <h3>Strengths</h3>
      ${renderTagList(row.strengths, "No strengths detected yet.")}
    </section>

    <section>
      <h3>Needs Review</h3>
      ${renderTagList(row.needsReview, "No review areas detected.")}
    </section>

    <section>
      <h3>Priority Skills</h3>
      <div class="worksheet-list">
        ${(row.ilp.prioritySkills || []).map((skill) => `
          <article>
            <strong>${escapeHtml(skill.topic)}</strong>
            <span>${escapeHtml(skill.lesson || "")}</span>
            <p>${escapeHtml(skill.recommendation || "")}</p>
          </article>
        `).join("") || `<p class="empty-review">No priority skills generated.</p>`}
      </div>
    </section>

    <section>
      <h3>Worksheet Recommendations</h3>
      <div class="worksheet-list">
        ${worksheets.map((worksheet) => `
          <article>
            <strong>${escapeHtml(worksheet.title)}</strong>
            <span>${escapeHtml(worksheet.level)}</span>
            <p>${escapeHtml(worksheet.description)}</p>
          </article>
        `).join("")}
      </div>
    </section>

    <section>
      <h3>Student-Friendly Plan</h3>
      <div class="student-plan-list">
        ${(row.ilp.studentPlan || []).map((item) => `<p>${escapeHtml(item)}</p>`).join("") || `<p>No student plan generated.</p>`}
      </div>
    </section>

    <div class="assignment-actions">
      <button class="primary-action" data-action="mark-ilp-reviewed" data-attempt-id="${escapeAttribute(row.id)}">Mark Reviewed</button>
      <button class="secondary-action" data-action="export-ilp" data-attempt-id="${escapeAttribute(row.id)}">Export ILP</button>
      <button class="secondary-action" data-action="print-ilp">Print</button>
    </div>
  `;
}

function buildIlpRows(context) {
  return (context.latestAttempts || []).map((attempt) => {
    const student = normalizeStudent(attempt);
    const score = normalizeScore(attempt);
    const strengths = attempt.summary?.strengths || [];
    const needsReview = attempt.summary?.needsReview || [];
    const topicBreakdown = attempt.summary?.topicBreakdown || buildTopicBreakdown(attempt.responses || []);
    const ilp = attempt.ilp || generateILP(attempt.responses || [], topicBreakdown, strengths, needsReview);
    return {
      id: attempt.attemptId || attempt.id || `${student.id}-${attempt.submittedAt}`,
      attempt,
      student,
      score,
      strengths,
      needsReview,
      topicBreakdown,
      ilp,
      assessmentTitle: attempt.assessment?.title || attempt.assessmentTitle || "Assessment"
    };
  });
}

function filterIlpRows(rows) {
  const search = String(adminIlpFilterState.search || "").trim().toLowerCase();
  return rows.filter((row) => {
    const matchesSearch = !search || [row.student.name, row.student.id]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search));
    return (!adminIlpFilterState.assessment || row.assessmentTitle === adminIlpFilterState.assessment)
      && (!adminIlpFilterState.readiness || row.ilp.readinessLevel === adminIlpFilterState.readiness)
      && matchesSearch;
  });
}

function buildWorksheetRecommendations(row) {
  const skills = row.ilp.prioritySkills?.length
    ? row.ilp.prioritySkills
    : row.topicBreakdown.filter((topic) => topic.percentage < 70).map((topic) => ({ topic: topic.topic }));
  const source = skills.length ? skills : [{ topic: "Mixed Review" }];
  return source.slice(0, 5).map((skill, index) => ({
    title: `${skill.topic} Practice Set ${index + 1}`,
    level: row.score.percentage < 50 ? "Foundational" : row.score.percentage < 75 ? "Targeted" : "Reinforcement",
    description: `Assign focused worksheet practice for ${skill.topic} based on missed assessment evidence.`
  }));
}

function getReviewedIlpMap() {
  return JSON.parse(localStorage.getItem("assessment-engine-reviewed-ilps") || "{}");
}

function isIlpReviewed(attemptId) {
  return Boolean(getReviewedIlpMap()[attemptId]);
}
