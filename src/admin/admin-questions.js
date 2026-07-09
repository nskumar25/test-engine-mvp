let adminQuestionFilterState = {};

function renderAdminQuestionsPage(context = {}) {
  const allRows = buildQuestionRows(context);
  const rows = filterQuestionRows(allRows);
  const selectedId = adminQuestionFilterState.selectedQuestionId || rows[0]?.id || "";
  const selected = rows.find((row) => row.id === selectedId) || rows[0] || null;
  const selectedIndex = selected ? rows.findIndex((row) => row.id === selected.id) : -1;

  return `
    <section class="admin-page-shell question-library-dashboard">
      <article class="admin-card question-filter-card">
        <div class="admin-card-head compact-head">
          <div>
            <p class="eyebrow">Question Library</p>
            <h2>Review questions</h2>
          </div>
          <span class="assignment-count">${rows.length} of ${allRows.length} question(s)</span>
        </div>
        ${renderQuestionFilters()}
      </article>

      <div class="admin-split question-library-workspace">
        <article class="admin-card">
          <div class="admin-card-head compact-head">
            <div>
              <p class="eyebrow">Question List</p>
              <h2>${selectedIndex >= 0 ? `Viewing ${selectedIndex + 1} of ${rows.length}` : `${rows.length} questions`}</h2>
            </div>
          </div>
          ${renderQuestionTable(rows, selected?.id || "")}
        </article>

        <article class="admin-card question-preview-card">
          ${selected ? renderQuestionPreview(selected, selectedIndex, rows.length) : `<p class="empty-review">Select a question to preview details.</p>`}
        </article>
      </div>
    </section>
  `;
}

function bindQuestionLibraryControls() {
  document.querySelectorAll("[data-question-filter]").forEach((field) => {
    field.addEventListener("input", () => {
      adminQuestionFilterState[field.dataset.questionFilter] = field.value;
      adminQuestionFilterState.selectedQuestionId = "";
      renderAdminDashboard();
    });
    field.addEventListener("change", () => {
      if (field.dataset.questionFilter === "assignmentType") {
        adminQuestionFilterState.assessment = "";
        adminQuestionFilterState.topic = "";
      }
      if (field.dataset.questionFilter === "assessment") {
        adminQuestionFilterState.topic = "";
      }
      adminQuestionFilterState[field.dataset.questionFilter] = field.value;
      adminQuestionFilterState.selectedQuestionId = "";
      renderAdminDashboard();
    });
  });

  document.querySelectorAll("[data-action='view-question-detail']").forEach((button) => {
    button.addEventListener("click", () => {
      adminQuestionFilterState.selectedQuestionId = button.dataset.questionId || "";
      renderAdminDashboard();
    });
  });

  document.querySelectorAll("[data-action='move-question-detail']").forEach((button) => {
    button.addEventListener("click", () => {
      const rows = filterQuestionRows(buildQuestionRows(window.assessmentAdminContext || {}));
      const currentIndex = rows.findIndex((row) => row.id === adminQuestionFilterState.selectedQuestionId);
      const fallbackIndex = currentIndex >= 0 ? currentIndex : 0;
      const direction = button.dataset.direction === "previous" ? -1 : 1;
      const next = rows[Math.max(0, Math.min(rows.length - 1, fallbackIndex + direction))];
      adminQuestionFilterState.selectedQuestionId = next?.id || "";
      renderAdminDashboard();
    });
  });
}

function renderQuestionFilters() {
  const rows = buildQuestionRows(window.assessmentAdminContext || {});
  const assignmentTypes = uniqueQuestionAssignmentTypes(rows);
  const tests = uniqueValues(rows
    .filter((row) => !adminQuestionFilterState.assignmentType || row.assignmentType === adminQuestionFilterState.assignmentType)
    .map((row) => row.assessmentTitle));
  const standards = uniqueValues(rows
    .filter((row) => (!adminQuestionFilterState.assignmentType || row.assignmentType === adminQuestionFilterState.assignmentType)
      && (!adminQuestionFilterState.assessment || row.assessmentTitle === adminQuestionFilterState.assessment))
    .map((row) => row.standard));

  return `
    <div class="results-filter-grid question-filter-grid">
      <label>
        Assignment
        <select data-question-filter="assignmentType">
          <option value="">All types</option>
          ${assignmentTypes.map((item) => `<option value="${escapeAttribute(item.value)}" ${adminQuestionFilterState.assignmentType === item.value ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}
        </select>
      </label>
      <label>
        Test
        <select data-question-filter="assessment">
          <option value="">All tests</option>
          ${tests.map((title) => `<option value="${escapeAttribute(title)}" ${adminQuestionFilterState.assessment === title ? "selected" : ""}>${escapeHtml(title)}</option>`).join("")}
        </select>
      </label>
      <label>
        Standard
        <select data-question-filter="topic">
          <option value="">All standards</option>
          ${standards.map((standard) => `<option value="${escapeAttribute(standard)}" ${adminQuestionFilterState.topic === standard ? "selected" : ""}>${escapeHtml(standard)}</option>`).join("")}
        </select>
      </label>
    </div>
  `;
}

function renderQuestionTable(rows, selectedId) {
  return `
    <div class="admin-table-wrap question-library-wrap">
      <table class="admin-table question-library-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Question</th>
            <th>Standard</th>
            <th>Answer</th>
            <th>Assigned To</th>
            <th>Prompt</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map((row) => `
            <tr class="${row.id === selectedId ? "selected-row" : ""}">
              <td><code>${escapeHtml(row.questionId)}</code></td>
              <td><strong>Q${row.number}</strong></td>
              <td>${escapeHtml(row.standard)}</td>
              <td><em class="status-pill completed">${escapeHtml(row.answer)}</em></td>
              <td>${escapeHtml(row.assessmentTitle)}</td>
              <td class="question-prompt-cell">${escapeHtml(row.prompt)}</td>
              <td><button class="table-action" data-action="view-question-detail" data-question-id="${escapeAttribute(row.id)}">View</button></td>
            </tr>
          `).join("") : `<tr><td colspan="7">No questions match the selected filters.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderQuestionPreview(row, selectedIndex, rowCount) {
  const answerOption = (row.question.options || []).find((option) =>
    String(option.id).toLowerCase() === String(row.question.answer).toLowerCase()
  );
  return `
    <div class="result-detail-head question-detail-head">
      <div>
        <p class="eyebrow">${escapeHtml(row.assignmentTypeLabel)} / ${escapeHtml(row.standard)}</p>
        <h2>Question ${row.number}</h2>
        <span>${escapeHtml(row.assessmentTitle)}</span>
      </div>
      <strong>${escapeHtml(row.answer)}</strong>
    </div>

    <div class="question-detail-meta">
      <span><strong>ID</strong>${escapeHtml(row.questionId)}</span>
      <span><strong>Options</strong>${row.optionCount}</span>
      <span><strong>Media</strong>${row.hasImage ? "Image" : "Text"}</span>
    </div>

    <section>
      <h3>Question</h3>
      <p class="question-preview-prompt">${escapeHtml(row.prompt)}</p>
      ${row.question.image ? renderAdminQuestionImage(row.question.image, "Question image") : ""}
    </section>

    <section>
      <h3>Options</h3>
      <div class="question-preview-options">
        ${row.question.options.map((option) => `
          <article class="${String(option.id).toLowerCase() === String(row.question.answer).toLowerCase() ? "correct" : ""}">
            <strong>${escapeHtml(String(option.id || "").toUpperCase())}</strong>
            <span>${escapeHtml(option.text || option.label || "")}</span>
            ${option.image ? renderAdminQuestionImage(option.image, "Option image") : ""}
          </article>
        `).join("")}
      </div>
    </section>

    <section>
      <h3>Answer</h3>
      <p class="empty-review">${escapeHtml(`${row.answer}${answerOption ? `. ${answerOption.label || answerOption.text || ""}` : ""}`)}</p>
    </section>

    <div class="question-preview-actions">
      <button type="button" class="secondary-action" data-action="move-question-detail" data-direction="previous" ${selectedIndex <= 0 ? "disabled" : ""}>Previous</button>
      <span>${selectedIndex + 1} of ${rowCount}</span>
      <button type="button" class="primary-action" data-action="move-question-detail" data-direction="next" ${selectedIndex >= rowCount - 1 ? "disabled" : ""}>Next</button>
    </div>
  `;
}

function buildQuestionRows(context = {}) {
  const library = Array.isArray(context.questionLibrary) && context.questionLibrary.length
    ? context.questionLibrary
    : [{ assessment, questions }];

  return library.flatMap((item) => {
    const assessmentMeta = item.assessment || {};
    const assessmentTitle = assessmentMeta.title || "Assessment";
    const assessmentKey = assessmentMeta.key || getAssessmentKeyFromTitle(assessmentTitle);
    const assignmentType = String(assessmentMeta.assignmentType || inferQuestionAssignmentType(assessmentMeta)).toLowerCase();
    return (item.questions || []).map((question, index) => {
      const questionId = String(question.id || `${assessmentKey}-q${question.number || index + 1}`);
      const id = `${assessmentKey}:${questionId}`;
      const row = {
        id,
        questionId,
        assessmentKey,
        assessmentTitle,
        assignmentType,
        assignmentTypeLabel: getQuestionAssignmentTypeLabel(assignmentType),
        question,
        number: question.number || index + 1,
        standard: question.standard || question.topic || "General",
        topic: question.standard || question.topic || "General",
        prompt: question.question || "",
        answer: String(question.answer || "").toUpperCase(),
        optionCount: question.options?.length || 0,
        hasImage: Boolean(question.image || question.images?.length || question.options?.some((option) => option.image))
      };
      return row;
    });
  });
}

function filterQuestionRows(rows) {
  return rows.filter((row) => {
    return (!adminQuestionFilterState.assignmentType || row.assignmentType === adminQuestionFilterState.assignmentType)
      && (!adminQuestionFilterState.assessment || row.assessmentTitle === adminQuestionFilterState.assessment)
      && (!adminQuestionFilterState.topic || row.standard === adminQuestionFilterState.topic);
  });
}

function renderAdminQuestionImage(src, label) {
  return `<img class="admin-question-image" src="${escapeAttribute(src)}" alt="${escapeAttribute(label)}" />`;
}

function getAssessmentKeyFromTitle(title) {
  return String(title || "assessment")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "assessment";
}

function inferQuestionAssignmentType(assessmentMeta) {
  const title = String(assessmentMeta.title || assessmentMeta.sourceDocument || "").toLowerCase();
  if (title.includes("worksheet")) return "worksheet";
  if (title.includes("practice")) return "practice";
  if (title.includes("diagnostic")) return "diagnostic";
  if (title.includes("benchmark")) return "benchmark";
  if (title.includes("quiz")) return "quiz";
  if (title.includes("pretest") || title.includes("pre-test")) return "pretest";
  return "assessment";
}

function getQuestionAssignmentTypeLabel(code) {
  const labels = {
    assessment: "Assessment",
    pretest: "Pre-test",
    worksheet: "Worksheet",
    practice: "Practice",
    diagnostic: "Diagnostic",
    benchmark: "Benchmark",
    quiz: "Quiz"
  };
  return labels[String(code || "assessment").toLowerCase()] || "Assessment";
}

function uniqueQuestionAssignmentTypes(rows) {
  const seen = new Map();
  for (const row of rows) {
    if (!seen.has(row.assignmentType)) {
      seen.set(row.assignmentType, {
        value: row.assignmentType,
        label: row.assignmentTypeLabel
      });
    }
  }
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
}
