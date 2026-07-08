function renderAdminAssignmentsPage(context) {
  const gradeOptions = context.studentFilters?.grades || [];
  const schoolOptions = context.studentFilters?.schools || [];
  const availableTests = (context.assessments?.length ? context.assessments : [getCurrentAssessmentPayload()])
    .filter((test) => test.status !== "archived");
  const totalStudents = context.studentFilters?.totalStudents || 0;
  const selectedPretest = sessionStorage.getItem("assessment-engine-selected-pretest") || "";
  const selectedTest = availableTests.find((test) => test.key === selectedPretest) || availableTests[0] || {};
  const selectedAssignmentType = getAssignmentType(selectedTest);
  const activeTab = sessionStorage.getItem("assessment-engine-assignment-tab") || "assign";

  return `
    <section class="admin-page-shell">
      <nav class="admin-page-tabs" aria-label="Assessment access sections">
        <button class="${activeTab === "assign" ? "active" : ""}" type="button" data-assignment-admin-tab="assign">Assign</button>
        <button class="${activeTab === "history" ? "active" : ""}" type="button" data-assignment-admin-tab="history">History</button>
      </nav>
      <article class="admin-card assignment-card">
        <div data-assignment-admin-panel="assign" ${activeTab === "assign" ? "" : "hidden"}>
        <div class="admin-card-head">
          <div>
            <p class="eyebrow">Assignment Builder</p>
            <h2>Select students and assignment</h2>
          </div>
          <span class="assignment-count">${totalStudents} registered students</span>
        </div>

        ${context.dataErrors?.students ? `<div class="admin-error">Student lookup failed: ${escapeHtml(context.dataErrors.students)}. Check that the API server has the correct DATABASE_URL and STUDENT_VIEW.</div>` : ""}
        ${context.dataErrors?.assignments ? `<div class="admin-error">Assignment lookup failed: ${escapeHtml(context.dataErrors.assignments)}.</div>` : ""}
        ${context.dataErrors?.assessments ? `<div class="admin-error">Assessment lookup failed: ${escapeHtml(context.dataErrors.assessments)}.</div>` : ""}

        <div class="assignment-toolbar">
          <label>
            School
            <select data-assignment-filter="school">
              <option value="">All schools</option>
              ${schoolOptions.map((school) => `<option value="${escapeAttribute(school)}">${escapeHtml(school)}</option>`).join("")}
            </select>
          </label>
          <label>
            Grade
            <select data-assignment-filter="grade">
              <option value="">All grades</option>
              ${gradeOptions.map((grade) => `<option value="${escapeAttribute(grade)}">${escapeHtml(grade)}</option>`).join("")}
            </select>
          </label>
          <label>
            Student
            <input data-assignment-filter="search" type="search" placeholder="Name, email, or ID" />
          </label>
          <label>
            Type
            <select data-assignment-type>
              ${["pretest", "worksheet", "practice", "diagnostic"].map((type) => `
                <option value="${escapeAttribute(type)}" ${selectedAssignmentType === type ? "selected" : ""}>${escapeHtml(formatAssignmentType(type))}</option>
              `).join("")}
            </select>
          </label>
          <label>
            Assignment
            <select data-assignment-test>
              ${availableTests.map((test) => `
                <option
                  value="${escapeAttribute(test.key)}"
                  data-title="${escapeAttribute(test.title)}"
                  data-assignment-type="${escapeAttribute(getAssignmentType(test))}"
                  data-source-document="${escapeAttribute(test.sourceDocument || test.path || "")}"
                  data-path="${escapeAttribute(test.path || getAssessmentPathFromKey(test.key))}"
                  data-duration-minutes="${escapeAttribute(test.durationMinutes || 30)}"
                  data-input-format-version="${escapeAttribute(test.inputFormatVersion || "mvp-1")}"
                  ${selectedPretest === test.key ? "selected" : ""}
                >${escapeHtml(test.title)}</option>
              `).join("")}
            </select>
          </label>
        </div>

        <div class="assignment-actions">
          <button class="primary-action" data-action="view-filtered-students">View Students</button>
          <button class="primary-action" data-action="prepare-assignment">Assign Selected</button>
          <span data-assignment-status>Choose filters, then view students.</span>
        </div>

        <div class="student-assignment-results" data-assignment-results>
          <p class="empty-review">Choose filters and click View Students. Results are loaded in pages, not all at once.</p>
        </div>
        </div>

        <div data-assignment-admin-panel="history" ${activeTab === "history" ? "" : "hidden"}>
          ${renderAssignmentHistoryTab(context)}
        </div>
      </article>
    </section>
  `;
}

function bindAssignmentControls() {
  bindAssignmentAdminTabs();
  bindAssignmentTypeFilter();
  const results = document.querySelector("[data-assignment-results]");
  if (!results) return;

  let offset = 0;
  let limit = Number(document.querySelector("[data-assignment-page-size]")?.value || 10);
  let lastTotal = 0;
  let visibleStudents = [];

  const getFilters = () => {
    const search = document.querySelector("[data-assignment-filter='search']")?.value.trim().toLowerCase() || "";
    const grade = document.querySelector("[data-assignment-filter='grade']")?.value || "";
    const school = document.querySelector("[data-assignment-filter='school']")?.value || "";
    return { search, grade, school };
  };

  const loadStudents = async (nextOffset = 0, nextLimit = limit) => {
    offset = nextOffset;
    limit = nextLimit;
    const status = document.querySelector("[data-assignment-status]");
    status.textContent = "Loading matching students...";
    results.innerHTML = `<p class="empty-review">Loading students...</p>`;

    try {
      const [payload, assignments, attempts] = await Promise.all([
        getDataAdapter().searchStudents({
          ...getFilters(),
          limit,
          offset
        }),
        getDataAdapter().listAssignments(),
        getDataAdapter().listAttempts()
      ]);
      const assessmentKey = getAssignmentAssessmentPayload().key;
      const assignmentsByStudent = new Map();
      assignments
        .filter((item) => item.status !== "cancelled")
        .forEach((item) => {
          const key = String(item.studentId);
          assignmentsByStudent.set(key, [...(assignmentsByStudent.get(key) || []), item]);
        });
      const assignmentByStudent = new Map(
        assignments
          .filter((item) => item.assessmentKey === assessmentKey && item.status !== "cancelled")
          .map((item) => [String(item.studentId), item])
      );
      const completedCounts = getCompletedAttemptCounts(attempts, assessmentKey);
      const students = (payload.items || []).map((student) => ({
        ...student,
        assignment: assignmentByStudent.get(String(student.id)) || null,
        assignments: assignmentsByStudent.get(String(student.id)) || [],
        completedAttempts: completedCounts.get(String(student.id)) || 0
      }));
      visibleStudents = students;
      assignmentSelectionMode = "visible";
      assignmentSelectionFilters = getFilters();
      lastTotal = payload.total || 0;
      results.innerHTML = renderAssignmentResults(students, payload);
      status.textContent = lastTotal
        ? `Showing ${offset + 1}-${Math.min(offset + limit, lastTotal)} of ${lastTotal} matching student(s).`
        : "No students match the selected filters.";
      bindAssignmentPaging(loadStudents);
      bindAssignmentSelectionMenu(loadStudents);
      makeAssignmentTablesResizable();
      bindUnassignControls(loadStudents);
      bindQuickReassignControls(visibleStudents, () => {
        results.innerHTML = renderAssignmentConfirmation(getSelectedVisibleStudentsForReassign(visibleStudents));
        bindAssignmentConfirmation(() => loadStudents(offset));
      });
    } catch (error) {
      status.textContent = "Could not load students. Check the API connection.";
      results.innerHTML = `<div class="admin-error">${escapeHtml(error.message || "Student search failed.")}</div>`;
    }
  };

  document.querySelector("[data-action='view-filtered-students']")?.addEventListener("click", () => {
    loadStudents(0);
  });

  document.querySelector("[data-action='prepare-assignment']")?.addEventListener("click", async () => {
    const status = document.querySelector("[data-assignment-status]");
    const selectedStudents = await getSelectedAssignmentStudents(visibleStudents, limit);
    if (!selectedStudents.length) {
      status.textContent = "Select at least one student.";
      return;
    }

    status.textContent = `Reviewing ${selectedStudents.length} student assignment(s).`;
    results.innerHTML = renderAssignmentConfirmation(selectedStudents);
    makeAssignmentTablesResizable();
    bindAssignmentConfirmation(() => loadStudents(offset));
  });
}

function bindAssignmentAdminTabs() {
  document.querySelectorAll("[data-assignment-admin-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const selected = button.dataset.assignmentAdminTab;
      sessionStorage.setItem("assessment-engine-assignment-tab", selected);
      document.querySelectorAll("[data-assignment-admin-tab]").forEach((tab) => {
        tab.classList.toggle("active", tab.dataset.assignmentAdminTab === selected);
      });
      document.querySelectorAll("[data-assignment-admin-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.assignmentAdminPanel !== selected;
      });
    });
  });
}

function bindAssignmentTypeFilter() {
  const typeSelect = document.querySelector("[data-assignment-type]");
  const assignmentSelect = document.querySelector("[data-assignment-test]");
  if (!typeSelect || !assignmentSelect) return;

  const syncOptions = () => {
    const selectedType = typeSelect.value;
    const options = Array.from(assignmentSelect.options);
    const matching = options.filter((option) => option.dataset.assignmentType === selectedType);
    const optionsToShow = matching.length ? matching : options;
    const shownValues = new Set(optionsToShow.map((option) => option.value));

    options.forEach((option) => {
      const visible = shownValues.has(option.value);
      option.hidden = !visible;
      option.disabled = !visible;
    });

    if (!shownValues.has(assignmentSelect.value) && optionsToShow[0]) {
      assignmentSelect.value = optionsToShow[0].value;
    }
  };

  typeSelect.addEventListener("change", syncOptions);
  syncOptions();
}

function bindUnassignControls(loadStudents) {
  document.querySelectorAll("[data-action='unassign-pretest']").forEach((button) => {
    button.addEventListener("click", async () => {
      const status = document.querySelector("[data-assignment-status]");
      const assignmentId = button.dataset.assignmentId;
      if (!assignmentId) return;
      button.disabled = true;
      if (status) status.textContent = "Unassigning assessment...";
      try {
        await getDataAdapter().cancelAssignments({ assignmentIds: [assignmentId] });
        if (status) status.textContent = "Assessment unassigned.";
        loadStudents();
      } catch (error) {
        button.disabled = false;
        if (status) status.textContent = error.message || "Could not unassign assessment.";
      }
    });
  });
}

function bindQuickReassignControls(visibleStudents, openReview) {
  document.querySelectorAll("[data-action='quick-reassign']").forEach((button) => {
    button.addEventListener("click", () => {
      const studentId = String(button.dataset.studentId || "");
      document.querySelectorAll("[data-student-assignment-id]").forEach((input) => {
        input.checked = String(input.dataset.studentAssignmentId) === studentId;
      });
      assignmentSelectionMode = "visible";
      const status = document.querySelector("[data-assignment-status]");
      if (status) status.textContent = "Review reassignment settings before saving.";
      openReview();
    });
  });
}

function getSelectedVisibleStudentsForReassign(visibleStudents) {
  const selectedIds = new Set(
    Array.from(document.querySelectorAll("[data-student-assignment-id]:checked"))
      .map((input) => String(input.dataset.studentAssignmentId))
  );
  return visibleStudents.filter((student) => selectedIds.has(String(student.id)));
}

function renderAssignmentResults(students, payload) {
  if (!students.length) return `<p class="empty-review">No students match the selected filters.</p>`;
  return `
    <div class="admin-table-wrap assignment-table-wrap">
      <table class="admin-table assignment-table resizable-table">
        <thead>
          <tr>
            <th class="select-col">
              <span class="select-menu">
                <input type="checkbox" data-action="toggle-visible-students" aria-label="Visible" />
                <button type="button" class="tiny-menu-button" data-action="toggle-selection-menu" aria-label="Selection options">More</button>
                <span class="selection-menu" data-selection-menu hidden>
                  <button type="button" data-action="select-visible-students">Visible</button>
                  <button type="button" data-action="select-all-matching-students">All matches</button>
                  <button type="button" data-action="clear-student-selection">Clear</button>
                </span>
              </span>
            </th>
            <th>Name</th>
            <th>Email</th>
            <th>Student ID</th>
            <th>School</th>
            <th>Grade</th>
            <th>Assessment Assigned</th>
            <th>Attempts</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${students.map((student) => {
      const status = getAssignmentDisplayStatus(student);
      const assignment = student.assignment || null;
      const assignedPreTests = getAssignedPreTestText(student);
      const usedAttempts = getCurrentAssignmentUsedAttempts(assignment, student.completedAttempts);
      const isCompleted = status.className === "completed";
      return `
          <tr>
            <td><input type="checkbox" data-student-assignment-id="${escapeAttribute(student.id)}" data-student-payload="${escapeAttribute(JSON.stringify(student))}" /></td>
            <td>
              <strong>${escapeHtml(student.name || "Unnamed Student")}</strong>
            </td>
            <td>${escapeHtml(student.email || student.username || "")}</td>
            <td>${escapeHtml(student.id || "")}</td>
            <td>${escapeHtml(student.schoolName || "")}</td>
            <td>${escapeHtml(student.gradeLevel || "")}</td>
            <td>${escapeHtml(assignedPreTests)}</td>
            <td>${assignment ? `${usedAttempts}/${Number(assignment.attemptLimit || 1)}` : "-"}</td>
            <td><em class="status-pill ${escapeAttribute(status.className)}">${escapeHtml(status.label)}</em></td>
            <td>
              ${assignment && isCompleted
                ? `<span class="table-action-group"><button type="button" class="table-action" data-action="quick-reassign" data-student-id="${escapeAttribute(student.id)}">Reassign</button><button type="button" class="table-action" data-action="unassign-pretest" data-assignment-id="${escapeAttribute(assignment.id)}">Unassign</button></span>`
                : assignment
                ? `<button type="button" class="table-action" data-action="unassign-pretest" data-assignment-id="${escapeAttribute(assignment.id)}">Unassign</button>`
                : `<span class="muted-cell">-</span>`}
            </td>
          </tr>
        `;
      }).join("")}
        </tbody>
      </table>
    </div>
    <div class="assignment-pager">
      <label class="pager-size">Rows
        <select data-assignment-page-size>
          <option value="10" ${payload.limit === 10 ? "selected" : ""}>10</option>
          <option value="25" ${payload.limit === 25 ? "selected" : ""}>25</option>
          <option value="50" ${payload.limit === 50 ? "selected" : ""}>50</option>
          <option value="100" ${payload.limit === 100 ? "selected" : ""}>100</option>
        </select>
      </label>
      <button class="secondary-action" data-action="assignment-page" data-offset="${Math.max(0, payload.offset - payload.limit)}" ${payload.offset <= 0 ? "disabled" : ""}>Previous</button>
      <span>${payload.offset + 1}-${Math.min(payload.offset + payload.limit, payload.total)} of ${payload.total}</span>
      <button class="secondary-action" data-action="assignment-page" data-offset="${payload.offset + payload.limit}" ${payload.offset + payload.limit >= payload.total ? "disabled" : ""}>Next</button>
    </div>
  `;
}

function renderAssignmentHistoryTab(context) {
  const assignments = [...(context.assignments || [])]
    .sort((a, b) => String(b.assignedAt || "").localeCompare(String(a.assignedAt || "")));

  if (!assignments.length) {
    return `
      <div class="admin-card-head compact-head">
        <div>
          <p class="eyebrow">Assignment History</p>
          <h2>No assignment history yet</h2>
        </div>
      </div>
      <p class="empty-review">Assignments will appear here after students are assigned work.</p>
    `;
  }

  return `
    <div class="admin-card-head compact-head">
      <div>
        <p class="eyebrow">Assignment History</p>
        <h2>Assignment timeline</h2>
      </div>
      <span class="assignment-count">${assignments.length} current record(s)</span>
    </div>
    <div class="admin-table-wrap assignment-history-wrap">
      <table class="admin-table assignment-history-table">
        <thead>
          <tr>
            <th>Student ID</th>
            <th>Assignment</th>
            <th>Type</th>
            <th>Status</th>
            <th>Attempts</th>
            <th>Assigned</th>
            <th>History</th>
          </tr>
        </thead>
        <tbody>
          ${assignments.map((assignment) => `
            <tr>
              <td>${escapeHtml(assignment.studentId || "")}</td>
              <td>${escapeHtml(assignment.assessmentTitle || assignment.assessmentKey || "Assessment")}</td>
              <td>${escapeHtml(formatAssignmentType(getAssignmentType(assignment)))}</td>
              <td><em class="status-pill ${escapeAttribute(assignment.status || "assigned")}">${escapeHtml(formatAssignmentStatusText(assignment.status))}</em></td>
              <td>${getCurrentAssignmentUsedAttempts(assignment)}/${Number(assignment.attemptLimit || 1)}</td>
              <td>${assignment.assignedAt ? escapeHtml(formatDateTime(assignment.assignedAt)) : "-"}</td>
              <td>${escapeHtml(getAssignmentHistoryLabel(assignment))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function formatAssignmentStatusText(status) {
  if (!status) return "Assigned";
  return String(status).charAt(0).toUpperCase() + String(status).slice(1);
}

function getAssignmentHistoryLabel(assignment) {
  const history = assignment.metadata?.assignmentHistory || [];
  return history.length ? `${history.length} reassignment${history.length === 1 ? "" : "s"}` : "First assignment";
}

function getAssignedPreTestText(student) {
  const assignments = student.assignments || (student.assignment ? [student.assignment] : []);
  const titles = uniqueValues(
    assignments
      .filter((assignment) => assignment.status !== "cancelled")
      .map((assignment) => assignment.assessmentTitle || assignment.assessmentKey)
  );
  return titles.length ? titles.join(", ") : "-";
}

function getCompletedAttemptCounts(attempts, assessmentKey) {
  const counts = new Map();
  for (const attempt of attempts || []) {
    const student = normalizeStudent(attempt);
    const key = attempt.assessment?.key || attempt.assessmentKey || attempt.assessment?.assessmentKey || "";
    const title = attempt.assessment?.title || attempt.assessmentTitle || "";
    const matchesKey = key && key === assessmentKey;
    const matchesTitle = title && title === getAssignmentAssessmentPayload().title;
    if (!student.id || (!matchesKey && !matchesTitle)) continue;
    counts.set(String(student.id), (counts.get(String(student.id)) || 0) + 1);
  }
  return counts;
}

function getAssignmentDisplayStatus(student) {
  const assignment = student.assignment || null;
  if (!assignment) return { label: "Ready", className: "ready" };
  const completed = getCurrentAssignmentUsedAttempts(assignment, student.completedAttempts);
  const limit = Number(assignment.attemptLimit || 1);
  if (assignment.status === "completed") return { label: "Completed", className: "completed" };
  if (completed >= limit) return { label: "Completed", className: "completed" };
  if (completed > 0) return { label: `${completed}/${limit} used`, className: "started" };
  return { label: "Assigned", className: "assigned" };
}

function getCurrentAssignmentUsedAttempts(assignment, fallbackAttemptCount = 0) {
  if (!assignment) return 0;
  if (assignment.attemptCount !== undefined && assignment.attemptCount !== null) {
    return Number(assignment.attemptCount || 0);
  }
  return Math.max(0, Number(fallbackAttemptCount || 0) - getAssignmentAttemptBaseline(assignment));
}

function bindAssignmentSelectionMenu() {
  document.querySelector("[data-action='toggle-visible-students']")?.addEventListener("change", (event) => {
    assignmentSelectionMode = "visible";
    document.querySelectorAll("[data-student-assignment-id]").forEach((input) => {
      input.checked = event.currentTarget.checked;
    });
  });

  document.querySelector("[data-action='toggle-selection-menu']")?.addEventListener("click", () => {
    const menu = document.querySelector("[data-selection-menu]");
    if (menu) menu.hidden = !menu.hidden;
  });

  document.querySelector("[data-action='select-visible-students']")?.addEventListener("click", () => {
    assignmentSelectionMode = "visible";
    document.querySelectorAll("[data-student-assignment-id]").forEach((input) => {
      input.checked = true;
    });
    const menu = document.querySelector("[data-selection-menu]");
    if (menu) menu.hidden = true;
  });

  document.querySelector("[data-action='select-all-matching-students']")?.addEventListener("click", () => {
    assignmentSelectionMode = "allMatching";
    assignmentSelectionFilters = {
      search: document.querySelector("[data-assignment-filter='search']")?.value.trim().toLowerCase() || "",
      grade: document.querySelector("[data-assignment-filter='grade']")?.value || "",
      school: document.querySelector("[data-assignment-filter='school']")?.value || ""
    };
    document.querySelectorAll("[data-student-assignment-id]").forEach((input) => {
      input.checked = true;
    });
    const status = document.querySelector("[data-assignment-status]");
    if (status) status.textContent = "All matching students selected. Review before assigning.";
    const menu = document.querySelector("[data-selection-menu]");
    if (menu) menu.hidden = true;
  });

  document.querySelector("[data-action='clear-student-selection']")?.addEventListener("click", () => {
    assignmentSelectionMode = "visible";
    document.querySelectorAll("[data-student-assignment-id]").forEach((input) => {
      input.checked = false;
    });
    const menu = document.querySelector("[data-selection-menu]");
    if (menu) menu.hidden = true;
  });
}

async function getSelectedAssignmentStudents(visibleStudents, pageLimit) {
  if (assignmentSelectionMode === "allMatching") {
    const payload = await getDataAdapter().searchStudents({
      ...assignmentSelectionFilters,
      limit: 10000,
      offset: 0
    });
    return payload.items || [];
  }

  const selectedIds = new Set(
    Array.from(document.querySelectorAll("[data-student-assignment-id]:checked"))
      .map((input) => input.dataset.studentAssignmentId)
  );
  return visibleStudents.filter((student) => selectedIds.has(String(student.id))).slice(0, pageLimit);
}

function renderAssignmentConfirmation(students) {
  const selectedTest = getAssignmentAssessmentPayload();
  const defaultDuration = selectedTest.durationMinutes || assessment.durationMinutes || 30;
  const selectedType = getSelectedAssignmentType(selectedTest);
  return `
    <div class="assignment-confirmation">
      <div class="confirm-head">
        <div>
          <p class="eyebrow">Confirm Assignment</p>
          <h2>${escapeHtml(selectedTest.title)}</h2>
        </div>
        <span>${students.length} student(s) / ${escapeHtml(formatAssignmentType(selectedType))}</span>
      </div>
      <div class="bulk-settings">
        <label>Duration <input data-bulk-duration type="number" min="1" max="240" value="${escapeAttribute(defaultDuration)}" /></label>
        <label>Attempts <input data-assignment-attempt-limit type="number" min="1" max="5" value="1" /></label>
        <button class="secondary-action" data-action="apply-duration-all">Apply to all</button>
        <label><input data-bulk-setting="calculator" type="checkbox" checked /> Calculator</label>
        <label><input data-bulk-setting="scratchpad" type="checkbox" checked /> Scratch pad</label>
        <label><input data-bulk-setting="showResults" type="checkbox" checked /> Show results</label>
        <label><input data-bulk-setting="showAnswers" type="checkbox" checked /> Show answers</label>
        <button class="secondary-action" data-action="apply-options-all">Apply options to all</button>
      </div>
      <div class="admin-table-wrap assignment-confirm-wrap">
        <table class="admin-table assignment-confirm-table resizable-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>School</th>
              <th>Grade</th>
              <th>Assignment</th>
              <th>Type</th>
              <th>Duration</th>
              <th>Calculator</th>
              <th>Scratch</th>
              <th>Results</th>
              <th>Answers</th>
            </tr>
          </thead>
          <tbody>
            ${students.map((student) => `
              <tr data-confirm-student="${escapeAttribute(student.id)}">
                <td><strong>${escapeHtml(student.name || "Unnamed Student")}</strong><small>${escapeHtml(student.email || student.username || student.id)}</small></td>
                <td>${escapeHtml(student.schoolName || "")}</td>
                <td>${escapeHtml(student.gradeLevel || "")}</td>
                <td>${escapeHtml(selectedTest.title)}</td>
                <td>${escapeHtml(formatAssignmentType(selectedType))}</td>
                <td><input data-confirm-field="durationMinutes" type="number" min="1" max="240" value="${escapeAttribute(defaultDuration)}" /></td>
                <td><input data-confirm-field="calculator" type="checkbox" checked /></td>
                <td><input data-confirm-field="scratchpad" type="checkbox" checked /></td>
                <td><input data-confirm-field="showResults" type="checkbox" checked /></td>
                <td><input data-confirm-field="showAnswers" type="checkbox" checked /></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      <div class="assignment-actions">
        <button class="secondary-action" data-action="cancel-assignment-review">Back</button>
        <button class="primary-action" data-action="confirm-save-assignments">Confirm Assignment</button>
        <span data-confirm-status>Review settings before assigning.</span>
      </div>
    </div>
  `;
}

function bindAssignmentConfirmation(onBack) {
  makeAssignmentTablesResizable();
  document.querySelector("[data-action='apply-duration-all']")?.addEventListener("click", () => {
    const duration = document.querySelector("[data-bulk-duration]")?.value || "";
    document.querySelectorAll("[data-confirm-field='durationMinutes']").forEach((input) => {
      input.value = duration;
    });
  });

  document.querySelector("[data-action='apply-options-all']")?.addEventListener("click", () => {
    ["calculator", "scratchpad", "showResults", "showAnswers"].forEach((field) => {
      const checked = Boolean(document.querySelector(`[data-bulk-setting='${field}']`)?.checked);
      document.querySelectorAll(`[data-confirm-field='${field}']`).forEach((input) => {
        input.checked = checked;
      });
    });
  });

  document.querySelector("[data-action='cancel-assignment-review']")?.addEventListener("click", () => {
    onBack();
  });

  document.querySelector("[data-action='confirm-save-assignments']")?.addEventListener("click", async () => {
    const status = document.querySelector("[data-confirm-status]");
    const rows = Array.from(document.querySelectorAll("[data-confirm-student]"));
    const assessmentPayload = getAssignmentAssessmentPayload();
    const assignmentType = getSelectedAssignmentType(assessmentPayload);
    const attemptLimit = Number(document.querySelector("[data-assignment-attempt-limit]")?.value || 1);
    const studentIds = rows.map((row) => row.dataset.confirmStudent);
    const perStudentSettings = {};

    rows.forEach((row) => {
      const studentId = row.dataset.confirmStudent;
      perStudentSettings[studentId] = {
        assessmentPath: assessmentPayload.path || getAssessmentPathFromKey(assessmentPayload.key),
        durationMinutes: Number(row.querySelector("[data-confirm-field='durationMinutes']")?.value || assessmentPayload.durationMinutes || 30),
        tools: {
          calculator: Boolean(row.querySelector("[data-confirm-field='calculator']")?.checked),
          scratchpad: Boolean(row.querySelector("[data-confirm-field='scratchpad']")?.checked),
          imageZoom: true,
          eliminator: true
        },
        resultOptions: {
          showResults: Boolean(row.querySelector("[data-confirm-field='showResults']")?.checked),
          showAnswers: Boolean(row.querySelector("[data-confirm-field='showAnswers']")?.checked)
        },
        assignmentType
      };
    });

    status.textContent = "Saving assignments...";
    try {
      const result = await getDataAdapter().saveAssignments({
        assessment: assessmentPayload,
        studentIds,
        attemptLimit,
        assignedBy: "admin",
        metadata: { assignmentType },
        perStudentSettings
      });
      status.textContent = `Assigned ${result.assigned || studentIds.length} student(s).`;
      window.setTimeout(onBack, 700);
    } catch (error) {
      status.textContent = error.message || "Could not save assignments.";
    }
  });
}

function makeAssignmentTablesResizable() {
  document.querySelectorAll(".resizable-table").forEach((table) => {
    if (table.dataset.resizableReady === "true") return;
    const headers = Array.from(table.querySelectorAll("thead th"));
    const colgroup = document.createElement("colgroup");
    headers.forEach((header) => {
      const col = document.createElement("col");
      col.style.width = `${Math.max(90, header.offsetWidth || 120)}px`;
      colgroup.appendChild(col);
    });
    table.prepend(colgroup);
    headers.forEach((header, index) => {
      header.title = "Drag the lower-right edge to resize this column";
      const handle = document.createElement("span");
      handle.className = "column-resize-handle";
      handle.setAttribute("aria-hidden", "true");
      header.appendChild(handle);
      handle.addEventListener("mousedown", (event) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = colgroup.children[index].getBoundingClientRect().width;
        const onMove = (moveEvent) => {
          const nextWidth = Math.max(72, startWidth + moveEvent.clientX - startX);
          colgroup.children[index].style.width = `${nextWidth}px`;
        };
        const onUp = () => {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
    });
    table.dataset.resizableReady = "true";
  });
}

function getSelectedAssignmentType(selectedTest = {}) {
  return document.querySelector("[data-assignment-type]")?.value || getAssignmentType(selectedTest);
}

function bindAssignmentPaging(loadStudents) {
  document.querySelectorAll("[data-action='assignment-page']").forEach((button) => {
    button.addEventListener("click", () => {
      loadStudents(Number(button.dataset.offset || 0));
    });
  });
  document.querySelector("[data-assignment-page-size]")?.addEventListener("change", (event) => {
    loadStudents(0, Number(event.currentTarget.value || 10));
  });
}
