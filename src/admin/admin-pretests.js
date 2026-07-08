function renderAdminPretestCatalogPage(context) {
  const assessments = normalizePretestCatalog(context.assessments);
  const assignedCounts = getPretestAssignedCounts(context.assignments || []);
  const submittedCounts = getPretestSubmittedCounts(context.attempts || []);

  return `
    <section class="admin-page-shell">
      <article class="admin-card pretest-catalog-card">
        <div class="admin-card-head">
          <div>
            <p class="eyebrow">Assignment Catalog</p>
            <h2>${assessments.length} assessments</h2>
          </div>
          <a class="secondary-action admin-link-button" href="#import">Import Assessment</a>
        </div>

        <div class="pretest-catalog-summary">
          <span><strong>${assessments.filter((item) => item.status === "published").length}</strong> published</span>
          <span><strong>${assessments.filter((item) => item.status === "draft").length}</strong> draft</span>
          <span><strong>${assessments.filter((item) => item.status === "archived").length}</strong> archived</span>
        </div>

        <div class="admin-table-wrap pretest-catalog-wrap">
          <table class="admin-table pretest-catalog-table">
            <thead>
              <tr>
                <th>Assessment</th>
                <th>Grade</th>
                <th>Questions</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Tools</th>
                <th>Assigned</th>
                <th>Submitted</th>
                <th>Source</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${assessments.map((item) => `
                <tr>
                  <td>
                    <strong>${escapeHtml(item.title)}</strong>
                    <small>${escapeHtml(item.key)}</small>
                  </td>
                  <td>${escapeHtml(getPretestGrade(item))}</td>
                  <td>${Number(item.questionCount || 0)}</td>
                  <td>${Number(item.durationMinutes || 30)} min</td>
                  <td><em class="status-pill ${escapeAttribute(item.status)}">${escapeHtml(formatPretestStatus(item.status))}</em></td>
                  <td>${renderPretestTools(item)}</td>
                  <td>${assignedCounts.get(item.key) || 0}</td>
                  <td>${submittedCounts.get(item.key) || 0}</td>
                  <td class="source-cell">${escapeHtml(item.sourceDocument || item.path || "-")}</td>
                  <td>
                    <div class="table-action-row">
                      <a class="table-action" href="./" target="_blank">Preview</a>
                      <a class="table-action" href="#questions">Questions</a>
                      <a class="table-action" href="#assignments" data-action="assign-pretest" data-pretest-key="${escapeAttribute(item.key)}">Assign</a>
                      ${item.status === "archived"
                        ? `<button type="button" class="table-action" data-action="set-pretest-status" data-pretest-key="${escapeAttribute(item.key)}" data-status="published">Publish</button>`
                        : `<button type="button" class="table-action" data-action="set-pretest-status" data-pretest-key="${escapeAttribute(item.key)}" data-status="archived">Archive</button>`}
                    </div>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  `;
}

function bindPretestCatalogControls() {
  document.querySelectorAll("[data-action='set-pretest-status']").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      const key = button.dataset.pretestKey;
      const status = button.dataset.status;
      try {
        await getDataAdapter().updateAssessmentStatus(key, status);
        renderAdminDashboard();
      } catch (error) {
        button.disabled = false;
        alert(error.message || "Could not update assessment status.");
      }
    });
  });

  document.querySelectorAll("[data-action='assign-pretest']").forEach((link) => {
    link.addEventListener("click", () => {
      sessionStorage.setItem("assessment-engine-selected-pretest", link.dataset.pretestKey || "");
    });
  });
}

function normalizePretestCatalog(assessments) {
  const items = assessments?.length ? assessments : [getCurrentAssessmentPayload()];
  const statusOverrides = getAssessmentStatusOverrides();
  return items.map((item) => ({
    ...item,
    status: statusOverrides[item.key] || item.status || "published",
    tools: item.tools || {}
  }));
}

function getPretestAssignedCounts(assignments) {
  const counts = new Map();
  for (const assignment of assignments || []) {
    if (assignment.status === "cancelled") continue;
    counts.set(assignment.assessmentKey, (counts.get(assignment.assessmentKey) || 0) + 1);
  }
  return counts;
}

function getPretestSubmittedCounts(attempts) {
  const counts = new Map();
  for (const attempt of attempts || []) {
    const key = attempt.assessment?.key || attempt.assessmentKey || "";
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function getPretestGrade(item) {
  const title = `${item.title || ""} ${item.key || ""}`;
  const match = title.match(/grade\s*(\d+)/i);
  return match ? `Grade ${match[1]}` : "General";
}

function renderPretestTools(item) {
  const tools = item.tools || {};
  const enabled = [
    tools.calculator ? "Calculator" : "",
    tools.scratchpad !== false ? "Scratch" : "",
    tools.imageZoom !== false ? "Zoom" : "",
    tools.eliminator ? "Eliminator" : ""
  ].filter(Boolean);
  return enabled.length ? enabled.join(", ") : "-";
}

function formatPretestStatus(status) {
  return String(status || "published").replace(/^./, (letter) => letter.toUpperCase());
}
