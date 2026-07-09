let adminQuestionFilterState = {};

function renderAdminQuestionsPage(context = {}) {
  const allRows = buildQuestionRows(context);
  const rows = filterQuestionRows(allRows);
  const selectedId = adminQuestionFilterState.selectedQuestionId || rows[0]?.id || "";
  const selected = rows.find((row) => row.id === selectedId) || rows[0] || null;
  const quality = summarizeQuestionQuality(allRows);
  const activeView = adminQuestionFilterState.view || "normal";

  return `
    <section class="admin-page-shell question-library-dashboard">
      <article class="admin-card question-filter-card">
        <div class="admin-card-head">
          <div>
            <p class="eyebrow">Question Library</p>
            <h2>Review and classify questions</h2>
          </div>
        </div>
        ${renderQuestionFilters()}
        <div class="question-view-tabs" role="tablist" aria-label="Question view">
          ${[
            ["normal", "Normal Questions"],
            ["image", "Image View"]
          ].map(([view, label]) => `
            <button type="button" class="${activeView === view ? "active" : ""}" data-question-view="${view}">${label}</button>
          `).join("")}
        </div>
      </article>

      <div class="results-summary-grid question-summary-grid">
        <article><span>Questions</span><strong>${quality.total}</strong></article>
        <article><span>Topics</span><strong>${quality.topics}</strong></article>
        <article><span>With Images</span><strong>${quality.withImages}</strong></article>
        <article><span>Need Review</span><strong>${quality.needsReview}</strong></article>
        <article><span>Worksheet Ready</span><strong>${quality.worksheetReady}</strong></article>
      </div>

      <div class="admin-split question-library-workspace">
        <article class="admin-card">
          <div class="admin-card-head">
            <div>
              <p class="eyebrow">Filtered Questions</p>
              <h2>${rows.length} questions</h2>
            </div>
          </div>
          ${renderQuestionTable(rows, selected?.id || "")}
        </article>

        <article class="admin-card question-preview-card">
          ${selected ? renderQuestionPreview(selected) : `<p class="empty-review">Select a question to preview details.</p>`}
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
      adminQuestionFilterState[field.dataset.questionFilter] = field.value;
      adminQuestionFilterState.selectedQuestionId = "";
      renderAdminDashboard();
    });
  });

  document.querySelectorAll("[data-question-view]").forEach((button) => {
    button.addEventListener("click", () => {
      adminQuestionFilterState.view = button.dataset.questionView || "normal";
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

  document.querySelectorAll("[data-question-usage]").forEach((field) => {
    field.addEventListener("change", () => {
      const map = getQuestionUsageMap();
      map[field.dataset.questionUsage] = field.value;
      localStorage.setItem("assessment-engine-question-usage", JSON.stringify(map));
      renderAdminDashboard();
    });
  });
}

function renderQuestionFilters() {
  const rows = buildQuestionRows(window.assessmentAdminContext || {});
  const assessments = uniqueValues(rows.flatMap((row) => row.assessments));
  const topics = uniqueValues(rows.map((row) => row.topic));
  const optionCounts = uniqueValues(rows.map((row) => String(row.optionCount)));
  return `
    <div class="results-filter-grid question-filter-grid">
      <label>
        Assignment
        <select data-question-filter="assessment">
          <option value="">All assignments</option>
          ${assessments.map((title) => `<option value="${escapeAttribute(title)}" ${adminQuestionFilterState.assessment === title ? "selected" : ""}>${escapeHtml(title)}</option>`).join("")}
        </select>
      </label>
      <label>
        Topic
        <select data-question-filter="topic">
          <option value="">All topics</option>
          ${topics.map((topic) => `<option value="${escapeAttribute(topic)}" ${adminQuestionFilterState.topic === topic ? "selected" : ""}>${escapeHtml(topic)}</option>`).join("")}
        </select>
      </label>
      <label>
        Media
        <select data-question-filter="media">
          <option value="">All</option>
          <option value="with-image" ${adminQuestionFilterState.media === "with-image" ? "selected" : ""}>Has image</option>
          <option value="without-image" ${adminQuestionFilterState.media === "without-image" ? "selected" : ""}>No image</option>
        </select>
      </label>
      <label>
        Explanation
        <select data-question-filter="explanation">
          <option value="">All</option>
          <option value="complete" ${adminQuestionFilterState.explanation === "complete" ? "selected" : ""}>Complete</option>
          <option value="missing" ${adminQuestionFilterState.explanation === "missing" ? "selected" : ""}>Missing</option>
        </select>
      </label>
      <label>
        Options
        <select data-question-filter="optionCount">
          <option value="">Any</option>
          ${optionCounts.map((count) => `<option value="${escapeAttribute(count)}" ${adminQuestionFilterState.optionCount === count ? "selected" : ""}>${escapeHtml(count)}</option>`).join("")}
        </select>
      </label>
      <label>
        Search
        <input data-question-filter="search" type="search" value="${escapeAttribute(adminQuestionFilterState.search || "")}" placeholder="Prompt or topic" />
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
            <th>Used In</th>
            <th>Topic / Skill</th>
            <th>Prompt</th>
            <th>Answer</th>
            <th>Options</th>
            <th>Quality</th>
            <th>Use</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map((row) => `
            <tr class="${row.id === selectedId ? "selected-row" : ""}">
              <td><code>${escapeHtml(row.questionId)}</code></td>
              <td><strong>Q${row.number}</strong></td>
              <td>${escapeHtml(row.assessments.join(", "))}</td>
              <td>${escapeHtml(row.topic)}</td>
              <td class="question-prompt-cell">${escapeHtml(row.prompt)}</td>
              <td><em class="status-pill completed">${escapeHtml(row.answer)}</em></td>
              <td>${row.optionCount}</td>
              <td>${renderQuestionQualityPills(row)}</td>
              <td>
                <select data-question-usage="${escapeAttribute(row.id)}">
                  ${["Assessment", "Worksheet", "Both"].map((usage) => `<option value="${usage}" ${row.usage === usage ? "selected" : ""}>${usage}</option>`).join("")}
                </select>
              </td>
              <td><button class="table-action" data-action="view-question-detail" data-question-id="${escapeAttribute(row.id)}">Preview</button></td>
            </tr>
          `).join("") : `<tr><td colspan="10">No questions match the selected filters.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderQuestionPreview(row) {
  return `
    <div class="result-detail-head">
      <div>
        <p class="eyebrow">Question Preview</p>
        <h2>Question ${row.number}</h2>
        <span>${escapeHtml(row.assessments.join(", "))}</span>
      </div>
      <strong>${escapeHtml(row.answer)}</strong>
    </div>

    <section>
      <h3>Question ID</h3>
      <p class="empty-review">${escapeHtml(row.questionId)}</p>
    </section>

    <section>
      <h3>Prompt</h3>
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
      <h3>Explanation</h3>
      <p class="empty-review">${escapeHtml(row.question.explanation || "No explanation has been added yet.")}</p>
    </section>

    <section>
      <h3>Quality Checks</h3>
      <div class="quality-check-list">
        ${row.quality.length ? row.quality.map((item) => `<span class="quality-issue">${escapeHtml(item)}</span>`).join("") : `<span class="quality-ok">Ready</span>`}
      </div>
    </section>
  `;
}

function buildQuestionRows(context = {}) {
  const usageMap = getQuestionUsageMap();
  const library = Array.isArray(context.questionLibrary) && context.questionLibrary.length
    ? context.questionLibrary
    : [{ assessment, questions }];

  return library.flatMap((item) => {
    const assessmentMeta = item.assessment || {};
    const assessmentTitle = assessmentMeta.title || "Assessment";
    const assessmentKey = assessmentMeta.key || getAssessmentKeyFromTitle(assessmentTitle);
    return (item.questions || []).map((question, index) => {
      const questionId = String(question.id || `${assessmentKey}-q${question.number || index + 1}`);
      const id = `${assessmentKey}:${questionId}`;
      const row = {
        id,
        questionId,
        assessmentKey,
        assessments: [assessmentTitle],
        question,
        number: question.number || index + 1,
        topic: question.topic || question.standard || "General",
        prompt: question.question || "",
        answer: String(question.answer || "").toUpperCase(),
        optionCount: question.options?.length || 0,
        hasImage: Boolean(question.image || question.images?.length || question.options?.some((option) => option.image)),
        hasExplanation: Boolean(question.explanation),
        usage: usageMap[id] || "Both",
        quality: []
      };
      row.quality = getQuestionQualityIssues(question);
      return row;
    });
  });
}

function filterQuestionRows(rows) {
  const search = String(adminQuestionFilterState.search || "").toLowerCase().trim();
  const view = adminQuestionFilterState.view || "normal";
  return rows.filter((row) => {
    const matchesSearch = !search || [row.prompt, row.topic, row.answer, row.questionId, ...row.assessments]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search));
    return (!adminQuestionFilterState.assessment || row.assessments.includes(adminQuestionFilterState.assessment))
      && (view === "image" ? row.hasImage : true)
      && (!adminQuestionFilterState.topic || row.topic === adminQuestionFilterState.topic)
      && (!adminQuestionFilterState.optionCount || String(row.optionCount) === adminQuestionFilterState.optionCount)
      && (!adminQuestionFilterState.media || (adminQuestionFilterState.media === "with-image" ? row.hasImage : !row.hasImage))
      && (!adminQuestionFilterState.explanation || (adminQuestionFilterState.explanation === "complete" ? row.hasExplanation : !row.hasExplanation))
      && matchesSearch;
  });
}

function getQuestionQualityIssues(question) {
  const issues = [];
  const options = question.options || [];
  if (!question.topic) issues.push("Missing topic");
  if (!question.answer) issues.push("Missing answer");
  if (!question.explanation) issues.push("Missing explanation");
  if (!options.length) issues.push("Missing options");
  if (options.length && !options.some((option) => String(option.id).toLowerCase() === String(question.answer).toLowerCase())) {
    issues.push("Answer not in options");
  }
  const optionTexts = options.map((option) => String(option.text || option.label || "").trim().toLowerCase()).filter(Boolean);
  if (new Set(optionTexts).size !== optionTexts.length) issues.push("Duplicate option text");
  if (question.imageDescription && !question.image) issues.push("Image not extracted");
  return issues;
}

function summarizeQuestionQuality(rows) {
  return {
    total: rows.length,
    topics: uniqueValues(rows.map((row) => row.topic)).length,
    withImages: rows.filter((row) => row.hasImage).length,
    needsReview: rows.filter((row) => row.quality.length).length,
    worksheetReady: rows.filter((row) => row.usage === "Worksheet" || row.usage === "Both").length
  };
}

function renderQuestionQualityPills(row) {
  if (!row.quality.length) return `<span class="quality-ok">Ready</span>`;
  return `<div class="quality-check-list">${row.quality.slice(0, 2).map((item) => `<span class="quality-issue">${escapeHtml(item)}</span>`).join("")}</div>`;
}

function renderAdminQuestionImage(src, label) {
  return `<img class="admin-question-image" src="${escapeAttribute(src)}" alt="${escapeAttribute(label)}" />`;
}

function getQuestionUsageMap() {
  return JSON.parse(localStorage.getItem("assessment-engine-question-usage") || "{}");
}

function getAssessmentKeyFromTitle(title) {
  return String(title || "assessment")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "assessment";
}
