let adminResultsFilterState = {
  view: "student"
};

function renderAdminResultsPage(context) {
  const rows = buildResultRows(context);
  const filteredRows = filterResultRows(rows);
  const summary = summarizeResultRows(filteredRows);
  const view = adminResultsFilterState.view || "student";
  const groups = buildResultGroups(filteredRows, view);
  const selectedKey = adminResultsFilterState.selectedGroupKey || groups[0]?.key || "";
  const selectedGroup = groups.find((group) => group.key === selectedKey) || groups[0] || null;

  return `
    <section class="admin-page-shell results-dashboard">
      <article class="admin-card results-filter-card">
        <div class="admin-card-head compact-head">
          <div>
            <p class="eyebrow">Results</p>
            <h2>Review submissions</h2>
          </div>
          <span class="assignment-count">${filteredRows.length} of ${rows.length} attempts</span>
        </div>
        ${renderResultsFilters(rows, context)}
      </article>

      <div class="results-summary-grid">
        <article><span>Submissions</span><strong>${summary.count}</strong></article>
        <article><span>Students</span><strong>${summary.students}</strong></article>
        <article><span>Average</span><strong>${summary.average}%</strong></article>
        <article><span>Highest</span><strong>${summary.highest}%</strong></article>
        <article><span>Lowest</span><strong>${summary.lowest}%</strong></article>
      </div>

      <div class="admin-page-tabs results-view-tabs" aria-label="Result views">
        ${renderResultViewTab("student", "Student")}
        ${renderResultViewTab("assessment", "Assignment")}
        ${renderResultViewTab("school", "School")}
      </div>

      <div class="admin-split results-workspace">
        <article class="admin-card">
          <div class="admin-card-head compact-head">
            <div>
              <p class="eyebrow">${escapeHtml(formatResultView(view))} View</p>
              <h2>${groups.length} ${groups.length === 1 ? "group" : "groups"}</h2>
            </div>
          </div>
          ${renderResultGroupTable(groups, selectedGroup?.key || "")}
        </article>

        <article class="admin-card result-detail-card">
          ${selectedGroup ? renderResultGroupDetail(selectedGroup, view) : `<p class="empty-review">No results match the selected filters.</p>`}
        </article>
      </div>
    </section>
  `;
}

function bindResultsDashboardControls() {
  document.querySelectorAll("[data-results-filter]").forEach((field) => {
    field.addEventListener("input", () => {
      adminResultsFilterState[field.dataset.resultsFilter] = field.value;
      adminResultsFilterState.selectedGroupKey = "";
      renderAdminDashboard();
    });
    field.addEventListener("change", () => {
      adminResultsFilterState[field.dataset.resultsFilter] = field.value;
      adminResultsFilterState.selectedGroupKey = "";
      renderAdminDashboard();
    });
  });

  document.querySelectorAll("[data-results-view]").forEach((button) => {
    button.addEventListener("click", () => {
      adminResultsFilterState.view = button.dataset.resultsView || "student";
      adminResultsFilterState.selectedGroupKey = "";
      renderAdminDashboard();
    });
  });

  document.querySelectorAll("[data-action='view-result-group']").forEach((button) => {
    button.addEventListener("click", () => {
      adminResultsFilterState.selectedGroupKey = button.dataset.groupKey || "";
      renderAdminDashboard();
    });
  });

  document.querySelectorAll("[data-action='print-result-report']").forEach((button) => {
    button.addEventListener("click", () => {
      printResultReport(button.dataset.groupKey || "");
    });
  });
}

function renderResultsFilters(rows, context) {
  const assessments = uniqueValues(rows.map((row) => row.assessmentTitle));
  const schools = uniqueValues(rows.map((row) => row.schoolName).concat(context.studentFilters?.schools || []));
  const grades = uniqueValues(rows.map((row) => row.gradeLevel).concat(context.studentFilters?.grades || []));
  return `
    <div class="results-filter-grid">
      <label class="wide">
        Student
        <input data-results-filter="search" type="search" value="${escapeAttribute(adminResultsFilterState.search || "")}" placeholder="Name, email, or ID" />
      </label>
      <label>
        Assignment
        <select data-results-filter="assessment">
          <option value="">All assignments</option>
          ${assessments.map((item) => `<option value="${escapeAttribute(item)}" ${adminResultsFilterState.assessment === item ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}
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
      <label class="score-filter">
        Score
        <div class="score-range">
          <input data-results-filter="minScore" type="number" min="0" max="100" value="${escapeAttribute(adminResultsFilterState.minScore || "")}" placeholder="Min" />
          <input data-results-filter="maxScore" type="number" min="0" max="100" value="${escapeAttribute(adminResultsFilterState.maxScore || "")}" placeholder="Max" />
        </div>
      </label>
    </div>
  `;
}

function renderResultViewTab(view, label) {
  const active = (adminResultsFilterState.view || "student") === view;
  return `<button class="${active ? "active" : ""}" data-results-view="${escapeAttribute(view)}" type="button">${escapeHtml(label)}</button>`;
}

function renderResultGroupTable(groups, selectedKey) {
  return `
    <div class="admin-table-wrap results-table-wrap">
      <table class="admin-table results-group-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Attempts</th>
            <th>Students</th>
            <th>Average</th>
            <th>Highest</th>
            <th>Latest</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${groups.length ? groups.map((group) => `
            <tr class="${group.key === selectedKey ? "selected-row" : ""}">
              <td><strong>${escapeHtml(group.label)}</strong><small>${escapeHtml(group.subLabel || "")}</small></td>
              <td>${group.summary.count}</td>
              <td>${group.summary.students}</td>
              <td>${group.summary.average}%</td>
              <td>${group.summary.highest}%</td>
              <td>${formatDateTime(group.latestSubmittedAt)}</td>
              <td><button class="table-action" data-action="view-result-group" data-group-key="${escapeAttribute(group.key)}">View</button></td>
            </tr>
          `).join("") : `<tr><td colspan="7">No results match the selected filters.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderResultGroupDetail(group, view) {
  const recent = [...group.rows].sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
  return `
    <div class="result-detail-head">
      <div>
        <p class="eyebrow">${escapeHtml(formatResultView(view))} Report</p>
        <h2>${escapeHtml(group.label)}</h2>
        <span>${escapeHtml(group.subLabel || "Filtered result group")}</span>
      </div>
      <strong>${group.summary.average}%</strong>
    </div>

    <div class="result-detail-actions">
      <button class="secondary-action" data-action="print-result-report" data-group-key="${escapeAttribute(group.key)}">PDF Report</button>
    </div>

    <div class="result-detail-stats">
      <span>${group.summary.count} submissions</span>
      <span>${group.summary.students} students</span>
      <span>${group.summary.highest}% highest</span>
      <span>${group.summary.lowest}% lowest</span>
    </div>

    <section>
      <h3>Recent Attempts</h3>
      <div class="admin-table-wrap compact-results-wrap">
        <table class="admin-table compact-results-table">
          <thead>
            <tr><th>Student</th><th>Assignment</th><th>Score</th><th>Time</th><th>Submitted</th></tr>
          </thead>
          <tbody>
            ${recent.map((row) => `
              <tr>
                <td><strong>${escapeHtml(row.studentName)}</strong><small>${escapeHtml(row.email || row.studentId)}</small></td>
                <td>${escapeHtml(row.assessmentTitle)}</td>
                <td>${row.score.percentage}%</td>
                <td>${formatDuration(row.timing.timeUsedSeconds)}</td>
                <td>${formatDateTime(row.submittedAt)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>

    ${group.rows.length === 1 ? renderAttemptDetail(group.rows[0].attempt) : renderGroupTopicSummary(group.rows)}
  `;
}

function renderAttemptDetail(attempt) {
  const topics = attempt.summary?.topicBreakdown || buildTopicBreakdown(attempt.responses || []);
  return `
    <section>
      <h3>Question Review</h3>
      ${renderTopicBreakdown(topics)}
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

function renderGroupTopicSummary(rows) {
  const topicMap = new Map();
  rows.forEach((row) => {
    const topics = row.attempt.summary?.topicBreakdown || buildTopicBreakdown(row.attempt.responses || []);
    topics.forEach((topic) => {
      const key = topic.topic || "General";
      if (!topicMap.has(key)) topicMap.set(key, { topic: key, correct: 0, total: 0 });
      const current = topicMap.get(key);
      current.correct += Number(topic.correct || 0);
      current.total += Number(topic.total || 0);
    });
  });
  const topics = Array.from(topicMap.values()).map((topic) => ({
    ...topic,
    percentage: topic.total ? Math.round((topic.correct / topic.total) * 100) : 0
  }));
  return `
    <section>
      <h3>Topic Breakdown</h3>
      ${renderTopicBreakdown(topics)}
    </section>
  `;
}

function renderTopicBreakdown(topics) {
  return `
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
  `;
}

function buildResultRows(context) {
  return (context.attempts || []).map((attempt) => {
    const student = normalizeStudent(attempt);
    const enrichedStudent = attempt.student || {};
    return {
      id: attempt.attemptId || attempt.id || `${student.id}-${attempt.submittedAt}`,
      attempt,
      studentId: student.id,
      studentName: student.name,
      email: enrichedStudent.email || attempt.studentEmail || "",
      schoolName: enrichedStudent.schoolName || attempt.schoolName || "",
      gradeLevel: enrichedStudent.gradeLevel || attempt.gradeLevel || "",
      assessmentTitle: attempt.assessment?.title || attempt.assessmentTitle || "Assessment",
      assignmentType: attempt.assignmentType || attempt.assessment?.assignmentType || "assessment",
      score: normalizeScore(attempt),
      timing: normalizeTiming(attempt),
      submittedAt: attempt.submittedAt || ""
    };
  }).sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
}

function filterResultRows(rows) {
  const search = String(adminResultsFilterState.search || "").toLowerCase().trim();
  const minScore = adminResultsFilterState.minScore === "" || adminResultsFilterState.minScore == null ? null : Number(adminResultsFilterState.minScore);
  const maxScore = adminResultsFilterState.maxScore === "" || adminResultsFilterState.maxScore == null ? null : Number(adminResultsFilterState.maxScore);
  return rows.filter((row) => {
    const matchesSearch = !search || [row.studentName, row.studentId, row.email]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search));
    return (!adminResultsFilterState.assessment || row.assessmentTitle === adminResultsFilterState.assessment)
      && (!adminResultsFilterState.school || row.schoolName === adminResultsFilterState.school)
      && (!adminResultsFilterState.grade || row.gradeLevel === adminResultsFilterState.grade)
      && matchesSearch
      && (minScore == null || row.score.percentage >= minScore)
      && (maxScore == null || row.score.percentage <= maxScore);
  });
}

function buildResultGroups(rows, view) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = getResultGroupKey(row, view);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: getResultGroupLabel(row, view),
        subLabel: getResultGroupSubLabel(row, view),
        rows: []
      });
    }
    groups.get(key).rows.push(row);
  });

  return Array.from(groups.values()).map((group) => {
    const sortedRows = [...group.rows].sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
    return {
      ...group,
      rows: sortedRows,
      latestSubmittedAt: sortedRows[0]?.submittedAt || "",
      summary: summarizeResultRows(sortedRows)
    };
  }).sort((a, b) => String(b.latestSubmittedAt).localeCompare(String(a.latestSubmittedAt)));
}

function getResultGroupKey(row, view) {
  if (view === "assessment") return `assessment:${row.assessmentTitle}`;
  if (view === "school") return `school:${row.schoolName || "Unassigned School"}`;
  return `student:${row.studentId}`;
}

function getResultGroupLabel(row, view) {
  if (view === "assessment") return row.assessmentTitle;
  if (view === "school") return row.schoolName || "Unassigned School";
  return row.studentName || row.studentId;
}

function getResultGroupSubLabel(row, view) {
  if (view === "assessment") return formatAssignmentType(row.assignmentType);
  if (view === "school") return row.gradeLevel ? `Includes ${row.gradeLevel}` : "All grades";
  return [row.email || row.studentId, row.schoolName, row.gradeLevel].filter(Boolean).join(" / ");
}

function summarizeResultRows(rows) {
  if (!rows.length) return { count: 0, students: 0, average: 0, highest: 0, lowest: 0, unansweredAverage: 0 };
  const percentages = rows.map((row) => row.score.percentage);
  const unanswered = rows.map((row) => row.score.unanswered || 0);
  return {
    count: rows.length,
    students: new Set(rows.map((row) => row.studentId)).size,
    average: Math.round(percentages.reduce((sum, value) => sum + value, 0) / rows.length),
    highest: Math.max(...percentages),
    lowest: Math.min(...percentages),
    unansweredAverage: Math.round((unanswered.reduce((sum, value) => sum + value, 0) / rows.length) * 10) / 10
  };
}

function printResultReport(groupKey) {
  const context = window.assessmentAdminContext;
  if (!context) return;
  const rows = filterResultRows(buildResultRows(context));
  const group = buildResultGroups(rows, adminResultsFilterState.view || "student").find((item) => item.key === groupKey);
  if (!group) return;
  const reportWindow = window.open("", "_blank", "width=960,height=720");
  if (!reportWindow) return;
  reportWindow.document.write(buildPrintableResultReport(group, adminResultsFilterState.view || "student"));
  reportWindow.document.close();
  reportWindow.focus();
  reportWindow.print();
}

function buildPrintableResultReport(group, view) {
  const rows = group.rows;
  return `<!doctype html>
    <html>
      <head>
        <title>${escapeHtml(group.label)} Results</title>
        <style>
          body { font-family: Arial, sans-serif; color: #17212b; margin: 28px; }
          h1, h2, p { margin: 0; }
          header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #17212b; padding-bottom: 16px; margin-bottom: 20px; }
          .eyebrow { color: #5d6d73; font-size: 12px; text-transform: uppercase; font-weight: 700; }
          .score { font-size: 42px; font-weight: 800; color: #245d3a; }
          .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0; }
          .stats div { border: 1px solid #dfe6df; padding: 12px; border-radius: 8px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
          th, td { border: 1px solid #dfe6df; padding: 8px; text-align: left; vertical-align: top; }
          th { background: #f3f6f5; }
          small { display: block; color: #5d6d73; }
        </style>
      </head>
      <body>
        <header>
          <div>
            <p class="eyebrow">${escapeHtml(formatResultView(view))} Report</p>
            <h1>${escapeHtml(group.label)}</h1>
            <p>${escapeHtml(group.subLabel || "")}</p>
          </div>
          <div class="score">${group.summary.average}%</div>
        </header>
        <section class="stats">
          <div><strong>${group.summary.count}</strong><small>Submissions</small></div>
          <div><strong>${group.summary.students}</strong><small>Students</small></div>
          <div><strong>${group.summary.highest}%</strong><small>Highest</small></div>
          <div><strong>${group.summary.lowest}%</strong><small>Lowest</small></div>
        </section>
        <table>
          <thead><tr><th>Student</th><th>Assignment</th><th>Score</th><th>Answered</th><th>Time</th><th>Submitted</th></tr></thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td>${escapeHtml(row.studentName)}<small>${escapeHtml(row.email || row.studentId)}</small></td>
                <td>${escapeHtml(row.assessmentTitle)}</td>
                <td>${row.score.correct}/${row.score.total} (${row.score.percentage}%)</td>
                <td>${row.score.answered}</td>
                <td>${formatDuration(row.timing.timeUsedSeconds)}</td>
                <td>${formatDateTime(row.submittedAt)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </body>
    </html>`;
}

function formatResultView(view) {
  if (view === "assessment") return "Assignment";
  if (view === "school") return "School";
  return "Student";
}

function getFilteredResultAttempts(context) {
  return filterResultRows(buildResultRows(context)).map((row) => row.attempt);
}
