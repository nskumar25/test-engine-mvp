function renderAssessmentWorkspace() {
  const question = questions[state.currentIndex];
  const answeredCount = getAnsweredCount();
  const skippedCount = getSkippedCount();
  const progress = Math.round((answeredCount / questions.length) * 100);
  const toolsBody = `
    <div class="tool-panel-head">
      <div>
        <p class="eyebrow">Tools</p>
        <h3>Calculator & Scratch Pad</h3>
      </div>
      <button class="icon-button" data-action="close-tools" title="Close tools">${icons.clear}</button>
    </div>
    ${assessment.tools?.calculator ? renderCalculator() : ""}
    ${assessment.tools?.scratchpad !== false ? `
    <div class="worksheet-head">
      <div>
        <p class="eyebrow">Workspace</p>
        <h3>Scratch Pad</h3>
      </div>
      <div class="tool-head-actions">
        <button class="icon-button" data-action="toggle-scratch" title="Toggle scratch pad">${state.scratchOpen ? "-" : "+"}</button>
        <button class="icon-button" data-action="clear-scratch" title="Clear scratch pad">${icons.clear}</button>
      </div>
    </div>

    <div class="scratch-body ${state.scratchOpen ? "open" : ""}">
      <div class="scratch-tools" role="toolbar" aria-label="Scratch pad tools">
        <button class="tool-button ${scratchTool === "pencil" ? "active" : ""}" data-tool="pencil" title="Pencil">${icons.pencil}</button>
        <button class="tool-button ${scratchTool === "eraser" ? "active" : ""}" data-tool="eraser" title="Eraser">${icons.eraser}</button>
        <button class="swatch active" data-color="#18212b" style="--swatch:#18212b" title="Black"></button>
        <button class="swatch" data-color="#365f9f" style="--swatch:#365f9f" title="Blue"></button>
        <button class="swatch" data-color="#c43d32" style="--swatch:#c43d32" title="Red"></button>
        <button class="swatch" data-color="#9b4d32" style="--swatch:#9b4d32" title="Brown"></button>
      </div>
      <canvas class="scratch-canvas" width="560" height="500" aria-label="Scratch pad"></canvas>
    </div>
    ` : ""}
  `;

  root.innerHTML = `
    <main class="shell" aria-label="Assessment workspace">
      <aside class="sidebar">
        <div class="student-meta">
          <section>
            <span>Name:</span>
            <strong>${escapeHtml(state.student?.name || assessment.candidate)}</strong>
          </section>
          <section>
            <span>Test:</span>
            <strong>${escapeHtml(assessment.title)}</strong>
          </section>
        </div>

        <div class="brand question-brand">
          <div class="brand-mark">${icons.grid}</div>
          <div>
            <span>Questions</span>
            <strong>${answeredCount}/${questions.length} answered</strong>
            <small>${skippedCount} skipped</small>
          </div>
        </div>

        <div class="side-section">
          <div class="question-grid">
            ${questions.map(renderGridCell).join("")}
          </div>
        </div>

        <div class="legend">
          <span><i class="dot answered-dot"></i> Answered</span>
          <span><i class="dot active-dot"></i> Current</span>
          <span><i class="dot skipped-dot"></i> Skipped</span>
        </div>
      </aside>

      <section class="exam-window ${state.toolsOpen ? "" : "tools-closed"} layout-${escapeAttribute(state.questionLayout || "stacked")}" style="--text-scale:${Number(state.textScale || 0)}pt">
        <header class="topbar">
          <div class="assessment-title">
            <p class="eyebrow">Assessment</p>
            <h1>${escapeHtml(assessment.title)}</h1>
          </div>

          <div class="top-actions">
            <button class="icon-button" data-action="toggle-question-layout" title="Switch question layout" aria-label="Switch question layout">${icons.layout}</button>
            <button class="icon-button text-tool" data-action="increase-text" title="Increase text size" aria-label="Increase text size">${icons.text}</button>
            <button class="icon-button" data-action="read-aloud" title="Read question aloud" aria-label="Read question aloud">${icons.read}</button>
            <button class="timer" data-action="toggle-timer" data-timer aria-label="Toggle timer">${renderTimerContent()}</button>
            <button class="icon-button" data-action="fullscreen" title="Enter fullscreen">${icons.fullscreen}</button>
          </div>
        </header>

        <div class="status-row">
          <div class="progress-track"><span style="width:${progress}%"></span></div>
        </div>

        <section class="content-area">
          <article class="question-pane">
            <div class="question-head">
              <span>Question ${state.currentIndex + 1} of ${questions.length}</span>
            </div>

            ${state.studentNotice ? `<div class="student-notice">${escapeHtml(state.studentNotice)}</div>` : ""}

            <div class="question-visual-layout">
              <div class="question-text-block">
                <h2>${escapeHtml(question.question)}</h2>
              </div>
              ${renderQuestionMedia(question)}
            </div>

            <div class="options">
              ${question.options.map((option) => renderOption(question, option)).join("")}
            </div>
          </article>

          <aside class="tool-dock ${state.toolsOpen ? "expanded" : "collapsed"}" aria-label="Assessment tools">
            <div class="tools-rail">
              ${assessment.tools?.calculator ? `<button type="button" class="${state.toolsOpen && state.calculatorOpen ? "active" : ""}" data-action="open-tool" data-tool-panel="calculator" title="Calculator" aria-label="Open calculator">${icons.calc}</button>` : ""}
              ${assessment.tools?.scratchpad !== false ? `<button type="button" class="${state.toolsOpen && state.scratchOpen ? "active" : ""}" data-action="open-tool" data-tool-panel="scratch" title="Scratch pad" aria-label="Open scratch pad">${icons.pencil}</button>` : ""}
            </div>
            ${state.toolsOpen ? `<div class="tool-panel">${toolsBody}</div>` : ""}
          </aside>
        </section>

        <footer class="bottombar">
          <div class="nav-actions">
            <button class="secondary-action" data-action="previous" ${state.currentIndex === 0 ? "disabled" : ""}>${icons.previous} Previous</button>
            <button class="primary-action" data-action="next" ${state.currentIndex === questions.length - 1 ? "disabled" : ""}>Next ${icons.next}</button>
          </div>
          <div class="submit-slot">
            <button class="submit-action" data-action="submit">${icons.submit} Submit</button>
          </div>
        </footer>
      </section>
      ${state.reviewing ? renderSubmitDialog() : ""}
    </main>
  `;

  bindActions();
  initScratchPad();
}
