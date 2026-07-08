let adminResultsFilterState = {};

function renderAdminResultsPage(context) {
  const rows = buildResultRows(context);
  const filteredRows = filterResultRows(rows);
  const summary = summarizeResultRows(filteredRows);
  const selectedAttemptId = adminResultsFilterState.selectedAttemptId || filteredRows[0]?.id || "";
  const selectedAttempt = filteredRows.find((row) => row.id === selectedAttemptId)?.attempt || null;

  return `
    <section class="admin-page-shell results-dashboard">
      <article class="admin-card results-filter-card">
        <div class="admin-card-head">
          <div>
            <p class="eyebrow">Result Filters</p>
            <h2>Find attempts</h2>
          </div>
        </div>
        ${renderResultsFilters(rows, context)}
      </article>

      <div class="results-summary-grid">
        <article><span>Submissions</span><strong>${summary.count}</strong></article>
        <article><span>Average</span><strong>${summary.average}%</strong></article>
        <article><span>Highest</span><strong>${summary.highest}%</strong></article>
        <article><span>Lowest</span><strong>${summary.lowest}%</strong></article>
        <article><span>Unanswered Avg</span><strong>${summary.unansweredAverage}</strong></article>
      </div>

      <div class="admin-split results-workspace">
        <article class="admin-card">
          <div class="admin-card-head">
            <div>
              <p class="eyebrow">Filtered Results</p>
              <h2>${filteredRows.length} attempts</h2>
            </div>
          </div>
          ${renderResultsTable(filteredRows, selectedAttemptId)}
        </article>

        <article class="admin-card result-detail-card">
          ${selectedAttempt ? renderAttemptDetail(selectedAttempt) : `<p class="empty-review">Select an attempt to review details.</p>`}
        </article>
      </div>
    </section>
  `;
}

function bindResultsDashboardControls() {
  document.querySelectorAll("[data-results-filter]").forEach((field) => {
    field.addEventListener("input", () => {
      adminResultsFilterState[field.dataset.resultsFilter] = field.value;
      adminResultsFilterState.selectedAttemptId = "";
      renderAdminDashboard();
    });
    field.addEventListener("change", () => {
      adminResultsFilterState[field.dataset.resultsFilter] = field.value;
      adminResultsFilterState.selectedAttemptId = "";
      renderAdminDashboard();
    });
  });

  document.querySelectorAll("[data-action='view-attempt-detail']").forEach((button) => {
    button.addEventListener("click", () => {
      adminResultsFilterState.selectedAttemptId = button.dataset.attemptId || "";
      renderAdminDashboard();
    });
  });
}

function renderResultsFilters(rows, context) {
  const assessments = uniqueValues(rows.map((row) => row.assessmentTitle));
  const schools = uniqueValues(rows.map((row) => row.schoolName).concat(context.studentFilters?.schools || []));
  const grades = uniqueValues(rows.map((row) => row.gradeLevel).concat(context.studentFilters?.grades || []));
  return `
    <div class="results-filter-grid">
      <label>
        Assessment
        <select data-results-filter="pretest">
          <option value="">All assessments</option>
          ${assessments.map((item) => `<option value="${escapeAttribute(item)}" ${adminResultsFilterState.pretest === item ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}
        </select>
      </label>
      <label>
        School
        <select data-results-filter="school">
          <option value="">All schools</option>
          ${schools.map((item) => `<option value="${escapeAttribute(item)}" ${adminResultsFilterState.school === item ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}
        </select>
      </label>
      <label>
        Grade
        <select data-results-filter="grade">
          <option value="">All grades</option>
          ${grades.map((item) => `<option value="${escapeAttribute(item)}" ${adminResultsFilterState.grade === item ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}
        </select>
      </label>
      <label>
        Student
        <input data-results-filter="search" type="search" value="${escapeAttribute(adminResultsFilterState.search || "")}" placeholder="Name, email, or ID" />
      </label>
      <label>
        Min score
        <input data-results-filter="minScore" type="number" min="0" max="100" value="${escapeAttribute(adminResultsFilterState.minScore || "")}" />
      </label>
      <label>
        Max score
        <input data-results-filter="maxScore" type="number" min="0" max="100" value="${escapeAttribute(adminResultsFilterState.maxScore || "")}" />
      </label>
    </div>
  `;
}

function renderResultsTable(rows, selectedAttemptId) {
  return `
    <div class="admin-table-wrap results-table-wrap">
      <table class="admin-table results-table">
        <thead>
          <tr>
            <th>Student</th>
            <th>Email / ID</th>
            <th>School</th>
            <th>Grade</th>
            <th>Assessment</th>
            <th>Score</th>
            <th>Time</th>
            <th>Submitted</th>
            <th>ILP</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map((row) => `
            <tr class="${row.id === selectedAttemptId ? "selected-row" : ""}">
              <td><strong>${escapeHtml(row.studentName)}</strong></td>
              <td>${escapeHtml(row.email || row.studentId)}</td>
              <td>${escapeHtml(row.schoolName || "-")}</td>
              <td>${escapeHtml(row.gradeLevel || "-")}</td>
              <td>${escapeHtml(row.assessmentTitle)}</td>
              <td>${row.score.percentage}%</td>
              <td>${formatDuration(row.timing.timeUsedSeconds)}</td>
              <td>${formatDateTime(row.submittedAt)}</td>
              <td>${row.attempt.ilp ? "Ready" : "Pending"}</td>
              <td><button class="table-action" data-action="view-attempt-detail" data-attempt-id="${escapeAttribute(row.id)}">View</button></td>
            </tr>
          `).join("") : `<tr><td colspan="10">No results match the selected filters.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderAttemptDetail(attempt) {
  const student = normalizeStudent(attempt);
  const score = normalizeScore(attempt);
  const timing = normalizeTiming(attempt);
  const topics = attempt.summary?.topicBreakdown || buildTopicBreakdown(attempt.responses || []);
  return `
    <div class="result-detail-head">
      <div>
        <p class="eyebrow">Attempt Detail</p>
        <h2>${escapeHtml(student.name)}</h2>
        <span>${escapeHtml(attempt.assessment?.title || attempt.assessmentTitle || "Assessment")}</span>
      </div>
      <strong>${score.percentage}%</strong>
    </div>

    <div class="result-detail-stats">
      <span>${score.correct}/${score.total} correct</span>
      <span>${score.answered} answered</span>
      <span>${score.unanswered} unanswered</span>
      <span>${formatDuration(timing.timeUsedSeconds)} used</span>
    </div>

    <section>
      <h3>Topic Breakdown</h3>
      <div class="topic-report admin-topic-report">
        ${topics.length ? topics.map((topic) => `
          <div class="topic-row">
            <span>${escapeHtml(topic.topic)}</span>
            <strong>${topic.correct}/${topic.total}</strong>
            <div class="topic-bar"><i style="width:${topic.percentage}%"></i></div>
            <em>${topic.percentage}%</em>
          </div>
        `).join("") : `<p class="empty-review">No topic data available.</p>`}
      </div>
    </section>

    <section>
      <h3>Question Review</h3>
      <div class="attempt-response-list">
        ${(attempt.responses || []).map((response) => `
          <article class="${response.isCorrect ? "correct" : "incorrect"}">
            <strong>Q${response.number}</strong>
            <span>${escapeHtml(response.topic || "General")}</span>
            <span>Selected: ${escapeHtml(response.selected ? String(response.selected).toUpperCase() : "Not answered")}</span>
            <span>Correct: ${escapeHtml(String(response.correctAnswer || "").toUpperCase())}</span>
          </article>
        `).join("") || `<p class="empty-review">No response details available.</p>`}
      </div>
    </section>
  `;
}

function buildResultRows(context) {
  const studentsById = new Map((context.students || []).map((student) => [String(student.id), student]));
  return (context.latestAttempts || []).map((attempt) => {
    const student = normalizeStudent(attempt);
    const registered = studentsById.get(String(student.id)) || {};
    return {
      id: attempt.attemptId || attempt.id || `${student.id}-${attempt.submittedAt}`,
      attempt,
      studentId: student.id,
      studentName: student.name,
      email: registered.email || student.email || "",
      schoolName: registered.schoolName || attempt.student?.schoolName || "",
      gradeLevel: registered.gradeLevel || attempt.student?.gradeLevel || "",
      assessmentTitle: attempt.assessment?.title || attempt.assessmentTitle || "Assessment",
      score: normalizeScore(attempt),
      timing: normalizeTiming(attempt),
      submittedAt: attempt.submittedAt || ""
    };
  });
}

function filterResultRows(rows) {
  const search = String(adminResultsFilterState.search || "").toLowerCase().trim();
  const minScore = adminResultsFilterState.minScore === "" || adminResultsFilterState.minScore == null ? null : Number(adminResultsFilterState.minScore);
  const maxScore = adminResultsFilterState.maxScore === "" || adminResultsFilterState.maxScore == null ? null : Number(adminResultsFilterState.maxScore);
  return rows.filter((row) => {
    const matchesSearch = !search || [row.studentName, row.studentId, row.email]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search));
    return (!adminResultsFilterState.pretest || row.assessmentTitle === adminResultsFilterState.pretest)
      && (!adminResultsFilterState.school || row.schoolName === adminResultsFilterState.school)
      && (!adminResultsFilterState.grade || row.gradeLevel === adminResultsFilterState.grade)
      && matchesSearch
      && (minScore == null || row.score.percentage >= minScore)
      && (maxScore == null || row.score.percentage <= maxScore);
  });
}

function summarizeResultRows(rows) {
  if (!rows.length) return { count: 0, average: 0, highest: 0, lowest: 0, unansweredAverage: 0 };
  const percentages = rows.map((row) => row.score.percentage);
  const unanswered = rows.map((row) => row.score.unanswered || 0);
  return {
    count: rows.length,
    average: Math.round(percentages.reduce((sum, value) => sum + value, 0) / rows.length),
    highest: Math.max(...percentages),
    lowest: Math.min(...percentages),
    unansweredAverage: Math.round((unanswered.reduce((sum, value) => sum + value, 0) / rows.length) * 10) / 10
  };
}

function getFilteredResultAttempts(context) {
  return filterResultRows(buildResultRows(context)).map((row) => row.attempt);
}
