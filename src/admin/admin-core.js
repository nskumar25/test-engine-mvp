function paintAdminDashboard(attempts, students, assignments = [], dataErrors = {}, studentFilters = {}, assessments = []) {
  const activePage = getAdminPage();
  const latestAttempts = [...attempts].sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
  const context = {
    attempts,
    students,
    studentFilters,
    assignments,
    assessments,
    dataErrors,
    latestAttempts,
    scoreAverage: attempts.length
      ? Math.round(attempts.reduce((sum, attempt) => sum + normalizeScore(attempt).percentage, 0) / attempts.length)
      : 0,
    completedStudents: new Set(attempts.map((attempt) => normalizeStudent(attempt).id)).size,
    topicRows: aggregateAttemptTopics(attempts),
    validation: validateAssessment(),
    ilpAttempts: latestAttempts.filter((attempt) => attempt.ilp)
  };
  window.assessmentAdminContext = context;
  const meta = getAdminPageMeta(activePage);

  document.querySelector(".admin-main").innerHTML = `
    <header class="admin-header">
      <div>
        <p class="eyebrow">${escapeHtml(meta.eyebrow)}</p>
        <h1>${escapeHtml(meta.title)}</h1>
      </div>
      <div class="admin-actions">
        ${renderAdminHeaderActions(activePage)}
      </div>
    </header>
    ${renderAdminPage(activePage, context)}
  `;

  setAdminActiveNav(activePage);

  document.querySelector("[data-action='export-attempts-json']")?.addEventListener("click", () => {
    const exportAttempts = activePage === "results" && typeof getFilteredResultAttempts === "function"
      ? getFilteredResultAttempts(context)
      : attempts;
    downloadText("assessment-attempts.json", JSON.stringify(exportAttempts, null, 2), "application/json");
  });

  document.querySelector("[data-action='export-attempts-csv']")?.addEventListener("click", () => {
    const exportAttempts = activePage === "results" && typeof getFilteredResultAttempts === "function"
      ? getFilteredResultAttempts(context)
      : attempts;
    downloadText("assessment-attempts.csv", buildAttemptsCsv(exportAttempts), "text/csv");
  });

  document.querySelectorAll("[data-action='export-ilp']").forEach((button) => {
    button.addEventListener("click", () => {
      const attempt = attempts.find((item) => (item.attemptId || item.id) === button.dataset.attemptId);
      if (!attempt) return;
      const student = normalizeStudent(attempt);
      downloadText(`${fileSafe(student.id)}-ilp.json`, JSON.stringify(attempt.ilp || {}, null, 2), "application/json");
    });
  });

  bindAssignmentControls();
  bindPretestCatalogControls();
  bindResultsDashboardControls();
  bindIlpDashboardControls();
  bindQuestionLibraryControls();
}

function getAdminPageMeta(page) {
  const pages = {
    overview: { eyebrow: "Admin Overview", title: "Dashboard" },
    assessments: { eyebrow: "Assessment Setup", title: "Assessment Catalog" },
    assignments: { eyebrow: "Assessment Access", title: "Assessment Access" },
    questions: { eyebrow: "Question Review", title: "Question Library" },
    import: { eyebrow: "Import Workflow", title: "JSON Intake" },
    results: { eyebrow: "Performance", title: "Results" },
    ilp: { eyebrow: "Personalized Learning", title: "ILP & Worksheets" },
    database: { eyebrow: "Data Layer", title: "PostgreSQL Connection" }
  };
  return pages[page] || pages.overview;
}

function renderAdminHeaderActions(page) {
  if (page === "results") {
    return `
      <button class="secondary-action" data-action="export-attempts-json">Export Attempts JSON</button>
      <button class="secondary-action" data-action="export-attempts-csv">Export Attempts CSV</button>
    `;
  }
  if (page === "questions") {
    return `<a class="secondary-action admin-link-button" href="./" target="_blank">Preview Student View</a>`;
  }
  return `<a class="secondary-action admin-link-button" href="./">Open Student Test</a>`;
}

function renderAdminPage(page, context) {
  if (page === "assessments") return renderAdminPretestCatalogPage(context);
  if (page === "assignments") return renderAdminAssignmentsPage(context);
  if (page === "questions") return renderAdminQuestionsPage();
  if (page === "import") return renderAdminImportPage();
  if (page === "results") return renderAdminResultsPage(context);
  if (page === "ilp") return renderAdminIlpPage(context);
  if (page === "database") return renderAdminDatabasePage();
  return renderAdminOverviewPage(context);
}
