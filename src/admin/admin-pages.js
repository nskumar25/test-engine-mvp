function renderAdminOverviewPage(context) {
  return `
    <section class="admin-page-shell">
      <div class="admin-kpis">
        <article><span>Questions</span><strong>${questions.length}</strong></article>
        <article><span>Submitted</span><strong>${context.attempts.length}</strong></article>
        <article><span>Students Tested</span><strong>${context.completedStudents}</strong></article>
        <article><span>Average Score</span><strong>${context.scoreAverage}%</strong></article>
      </div>
      <div class="admin-split">
        <article class="admin-card">
          <div class="admin-card-head">
            <div>
              <p class="eyebrow">Current Assessment</p>
              <h2>${escapeHtml(assessment.title)}</h2>
            </div>
          </div>
          <div class="assessment-config">
            <span>${questions.length} questions</span>
            <span>${assessment.durationMinutes} minutes</span>
            <span>Provider: ${escapeHtml(DATA_PROVIDER)}</span>
          </div>
          <div class="settings-grid">
            ${renderSetting("Calculator", assessment.tools?.calculator)}
            ${renderSetting("Scratch pad", assessment.tools?.scratchpad !== false)}
            ${renderSetting("Image zoom", assessment.tools?.imageZoom !== false)}
            ${renderSetting("Answer eliminator", assessment.tools?.eliminator)}
          </div>
        </article>
        <article class="admin-card">
          <div class="admin-card-head">
            <div>
              <p class="eyebrow">Recent Activity</p>
              <h2>Latest Submissions</h2>
            </div>
          </div>
          ${renderRecentAttempts(context.latestAttempts)}
        </article>
      </div>
    </section>
  `;
}

function renderAdminAssessmentPage(validation) {
  return `
    <section class="admin-page-shell">
      <div class="admin-split">
        <article class="admin-card">
          <div class="admin-card-head">
            <div>
              <p class="eyebrow">Assessment Settings</p>
              <h2>${escapeHtml(assessment.title)}</h2>
            </div>
          </div>
          <div class="assessment-config">
            <span>${questions.length} questions</span>
            <span>${assessment.durationMinutes} minutes</span>
            <span>Input: ${escapeHtml(assessment.inputFormatVersion || "mvp-1")}</span>
            <span>Source: ${escapeHtml(assessment.sourceDocument || "JSON")}</span>
          </div>
          <div class="settings-grid">
            ${renderSetting("Calculator", assessment.tools?.calculator)}
            ${renderSetting("Scratch pad", assessment.tools?.scratchpad !== false)}
            ${renderSetting("Image zoom", assessment.tools?.imageZoom !== false)}
            ${renderSetting("Answer eliminator", assessment.tools?.eliminator)}
          </div>
          <div class="admin-note">Student identity is now read from your PostgreSQL registration data by username/email.</div>
        </article>
        <article class="admin-card">
          <div class="admin-card-head">
            <div>
              <p class="eyebrow">Quality Gate</p>
              <h2>Validation</h2>
            </div>
          </div>
          <div class="validation-score ${validation.errors.length ? "has-errors" : "clean"}">
            <strong>${validation.errors.length ? "Needs Review" : "Ready"}</strong>
            <span>${validation.errors.length} errors / ${validation.warnings.length} warnings</span>
          </div>
          ${renderValidationList("Errors", validation.errors, "No blocking errors.")}
          ${renderValidationList("Warnings", validation.warnings, "No warnings.")}
        </article>
      </div>
    </section>
  `;
}

function renderAdminImportPage() {
  return `
    <section class="admin-page-shell">
      <article class="admin-card">
        <div class="admin-card-head">
          <div>
            <p class="eyebrow">Import Pipeline</p>
            <h2>Word / JSON Intake</h2>
          </div>
        </div>
        <div class="pipeline-list">
          <div><strong>1</strong><span>Place DOCX or converted source in the input folder.</span></div>
          <div><strong>2</strong><span>Convert to assessment JSON with image assets.</span></div>
          <div><strong>3</strong><span>Validate questions, options, answer keys, and image paths.</span></div>
          <div><strong>4</strong><span>Preview the student experience before publishing.</span></div>
        </div>
        <div class="admin-note">Current MVP source: <strong>input/pre-test-for-demo.json</strong>.</div>
      </article>
    </section>
  `;
}

function renderAdminDatabasePage() {
  return `
    <section class="admin-page-shell">
      <div class="database-plan">
        <article>
          <h3>Connected Now</h3>
          <p>Active provider: ${escapeHtml(DATA_PROVIDER)}. Students are looked up from PostgreSQL by username/email.</p>
        </article>
        <article>
          <h3>Needed For MVP</h3>
          <p>Student lookup, assessment assignments, submitted attempts, responses, and ILPs. Questions can stay in JSON for now.</p>
        </article>
        <article>
          <h3>Later</h3>
          <p>Move assessments, reusable questions, assignments, and assets into PostgreSQL when the library is ready.</p>
        </article>
      </div>
      <article class="admin-card">
        <div class="admin-card-head">
          <div>
            <p class="eyebrow">Current Data Contract</p>
            <h2>Tables In Use</h2>
          </div>
        </div>
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead><tr><th>Table/View</th><th>Purpose</th></tr></thead>
            <tbody>
              <tr><td>public."Student"</td><td>Existing registration source. Students enter username/email.</td></tr>
              <tr><td>test_engine_registered_students</td><td>Read-only mapping view used by the API.</td></tr>
              <tr><td>test_engine_assignments</td><td>Which students are allowed to take the current assessment.</td></tr>
              <tr><td>test_engine_attempts</td><td>Attempt summary, timing, score, and raw JSON payload.</td></tr>
              <tr><td>test_engine_responses</td><td>Each selected answer and correctness result.</td></tr>
              <tr><td>test_engine_ilp_plans</td><td>Generated individualized learning plans.</td></tr>
            </tbody>
          </table>
        </div>
      </article>
    </section>
  `;
}

function renderRecentAttempts(attempts) {
  if (!attempts.length) return `<p class="empty-review">No submissions yet.</p>`;
  return `
    <div class="recent-attempts">
      ${attempts.slice(0, 6).map((attempt) => {
        const student = normalizeStudent(attempt);
        const score = normalizeScore(attempt);
        return `<div><strong>${escapeHtml(student.name)}</strong><span>${score.percentage}% / ${formatDateTime(attempt.submittedAt)}</span></div>`;
      }).join("")}
    </div>
  `;
}

function renderAttemptsTable(attempts) {
  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>Student</th><th>ID</th><th>Score</th><th>Answered</th><th>Time Used</th><th>Submitted</th></tr></thead>
        <tbody>
          ${attempts.length ? attempts.map((attempt) => {
            const student = normalizeStudent(attempt);
            const score = normalizeScore(attempt);
            const timing = normalizeTiming(attempt);
            return `<tr>
              <td>${escapeHtml(student.name)}</td>
              <td>${escapeHtml(student.id)}</td>
              <td>${score.correct}/${score.total} (${score.percentage}%)</td>
              <td>${score.answered}</td>
              <td>${formatDuration(timing.timeUsedSeconds)}</td>
              <td>${formatDateTime(attempt.submittedAt)}</td>
            </tr>`;
          }).join("") : `<tr><td colspan="6">No submissions yet.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}
