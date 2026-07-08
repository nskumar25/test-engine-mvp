function renderStartScreen() {
  root.innerHTML = `
    <main class="start-shell">
      <section class="start-panel">
        <div class="start-copy">
          <p class="eyebrow">Assessment portal</p>
          <h1>Sign in to begin</h1>
          <div class="instruction-list">
            <p>Use the username from your student registration.</p>
            <p>Your assigned assessment will open after your account is confirmed.</p>
          </div>
        </div>

        <form class="student-form">
          <div>
            <p class="eyebrow">Student sign in</p>
            <h2>Enter your username</h2>
          </div>
          <label>
            Student username
            <input name="studentUsername" value="${escapeAttribute(state.student?.username || state.student?.email || "")}" autocomplete="username" placeholder="Student email or ID" required />
          </label>
          <p class="lookup-message" data-lookup-message>${state.studentLookupError ? escapeHtml(state.studentLookupError) : "Use the username from your student registration."}</p>
          <button class="primary-action" type="submit">Begin Assessment ${icons.next}</button>
        </form>
      </section>
    </main>
  `;

  document.querySelector(".student-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const username = String(form.get("studentUsername") || "").trim();
    const submitButton = event.currentTarget.querySelector("button[type='submit']");
    const message = event.currentTarget.querySelector("[data-lookup-message]");
    submitButton.disabled = true;
    message.textContent = "Checking student registration...";

    try {
      const student = await findRegisteredStudent(username);
      if (!student) {
        submitButton.disabled = false;
        message.textContent = "Student username was not found. Please check the username and try again.";
        return;
      }

      const dashboardData = await getStudentDashboardData(student.id);
      if (!dashboardData.availableAssignments.length && !dashboardData.completedAssignments.length && !dashboardData.attempts.length) {
        submitButton.disabled = false;
        message.textContent = "No active assessment is available for this student. The assignment may be completed or not assigned yet.";
        return;
      }

      renderStudentDashboard({
        name: student.name,
        id: student.id,
        username: student.username || username,
        email: student.email || "",
        gradeLevel: student.gradeLevel || "",
        section: student.section || ""
      }, dashboardData);
    } catch (error) {
      submitButton.disabled = false;
      message.textContent = error.message || "Could not begin the assessment. Please contact the administrator.";
    }
  });
}
