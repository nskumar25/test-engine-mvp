# Assessment Test Engine Project Reference

This document is the working map for the assessment engine. Use it when you want to find where a feature lives, what file controls a page, how the frontend connects to the API, where data is stored, and which functions are responsible for each behavior.

## Quick Orientation

```text
index.html
  loads config, app shell, admin modules, and student modules

src/app.js
  main browser app state, adapters, shared helpers, exam logic, scoring, ILP, local/API data access

src/student/*
  student login, dashboard, and exam screen rendering

src/admin/*
  admin pages: overview, assignments, catalog, questions, results, ILP, database notes

backend/AstuteAssessment.Api
  C# ASP.NET Core API that connects to PostgreSQL

database/*
  PostgreSQL schema, assignment model migration, student registration mapping view

input/*
  assessment JSON files and image assets

scripts/*
  utility scripts for DOCX conversion, seeding assessments, and database migration
```

## Live And Local URLs

### Student Frontend

```text
Live:  https://nskumar25.github.io/test-engine-mvp/
Local: http://127.0.0.1:5173/
```

### Admin Frontend

```text
Live:  https://nskumar25.github.io/test-engine-mvp/?admin=1
Local: http://127.0.0.1:5173/?admin=1
```

### Local C# API

```text
http://127.0.0.1:9001/health
```

## Run Commands

### Run Frontend Locally

```powershell
cd "E:\Python\Test Engine"
npm run dev
```

### Run C# API Locally

```powershell
cd "E:\Python\Test Engine"

$env:DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE"
$env:DATABASE_SSL="false"
$env:STUDENT_VIEW="test_engine_registered_students"
$env:CORS_ORIGIN="http://127.0.0.1:5173"

npm run api:csharp
```

### Build C# API

```powershell
dotnet restore backend\AstuteAssessment.Api\AstuteAssessment.Api.csproj --configfile NuGet.config
dotnet build backend\AstuteAssessment.Api\AstuteAssessment.Api.csproj
```

### Convert DOCX Pretests To JSON

```powershell
npm run convert:pretests
```

### Seed Assessments To PostgreSQL

```powershell
$env:DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE"
npm run seed:pretests
```

### Run Assignment Model Migration

```powershell
$env:DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE"
npm run migrate:assignment-model
```

## Deployment

### GitHub Pages Frontend

File:

```text
.github/workflows/pages.yml
```

Purpose:

- Publishes only the static frontend files to GitHub Pages.
- Runs on every push to `main`.
- GitHub Pages source should be set to `GitHub Actions`.

Published files:

```text
index.html
.nojekyll
src/
input/
data/ if present
```

### API Hosting

Current C# API project:

```text
backend/AstuteAssessment.Api
```

Render deployment file:

```text
render.yaml
```

The Render file is now Docker-based and points to:

```text
backend/AstuteAssessment.Api/Dockerfile
```

If moving to Azure App Service, deploy the `backend/AstuteAssessment.Api` project and set the same environment variables:

```text
DATABASE_URL
DATABASE_SSL
STUDENT_VIEW
CORS_ORIGIN
```

## Configuration

### `src/config.js`

Controls which API the browser calls.

Current shape:

```js
const environments = {
  live: {
    dataProvider: "api",
    apiBaseUrl: "https://assessment-test-engine-api.onrender.com"
  },

  local: {
    dataProvider: "api",
    apiBaseUrl: "http://127.0.0.1:9001"
  }
};
```

Important:

- Local browser uses `http://127.0.0.1:9001`.
- Live browser currently uses `https://assessment-test-engine-api.onrender.com`.
- When Azure App Service is ready, change the live `apiBaseUrl`.

## Frontend Loading Order

File:

```text
index.html
```

Scripts load in this order:

```text
src/config.js
src/admin/admin-pages.js
src/admin/admin-assignments.js
src/admin/admin-pretests.js
src/admin/admin-questions.js
src/admin/admin-results.js
src/admin/admin-ilp.js
src/admin/admin-core.js
src/student/student-start.js
src/student/student-dashboard.js
src/student/student-exam.js
src/app.js
```

This matters because many admin/student files define functions used later by `src/app.js`.

## Main Frontend File

### `src/app.js`

This is the central browser app file. It owns:

- global app state
- initial assessment JSON loading
- student/admin routing
- local storage state
- timer
- question navigation
- answer selection
- eliminator logic
- calculator
- scratch pad
- image zoom
- submit confirmation
- scoring/evaluation
- ILP generation
- local data adapter
- API data adapter
- shared formatting/helpers

Key constants:

```text
STORAGE_KEY
STUDENTS_STORAGE_KEY
ASSIGNMENTS_STORAGE_KEY
ASSESSMENT_STATUS_STORAGE_KEY
RESULTS_DB_NAME
RESULTS_STORE
ATTEMPT_SCHEMA_VERSION
QUESTION_SOURCE
ASSESSMENT_CATALOG_SOURCE
```

Important state variables:

```text
questions
assessment
state
scratchTool
scratchColor
calculatorValue
zoomScale
zoomImageSrc
assignmentSelectionMode
assignmentSelectionFilters
lastAssignmentActivityPing
```

Core state functions:

| Function | Purpose |
|---|---|
| `getInitialState(total)` | Builds initial student/exam state or restores saved state. |
| `saveState()` | Saves current browser state to localStorage. |
| `setState(patch, options)` | Updates state, saves it, and re-renders. |
| `render()` | Decides whether to show admin, submitted result, exam, or start screen. |
| `isAdminMode()` | Returns true when URL has `?admin=1`. |

Timer and activity:

| Function | Purpose |
|---|---|
| `installTimer()` | Runs countdown timer and auto-submit. |
| `sendAssignmentActivityHeartbeat(force)` | Sends active/student-taking-test signal to API. |
| `minutesAndSeconds()` | Formats timer display. |
| `updateTimerOnly()` | Updates timer DOM without full render. |

Student/account data:

| Function | Purpose |
|---|---|
| `findRegisteredStudent(username)` | Looks up student by username/email. |
| `findActiveAssignmentForStudent(studentId)` | Finds one active assignment. |
| `listAvailableAssignmentsForStudent(studentId)` | Lists startable student assignments. |
| `getStudentDashboardData(studentId)` | Loads assignments and attempts for student dashboard. |
| `isAssignmentAttemptLimitReached(assignment, attempts)` | Checks if student has used all attempts. |
| `getAssignmentAttemptUsage(assignment, attempts)` | Counts attempts used within current assignment window. |
| `getAssignmentAttemptBaseline(assignment)` | Handles reassignment baseline logic. |
| `getAssignmentType(assignment)` | Determines assessment/worksheet/practice/diagnostic type. |
| `formatAssignmentType(type)` | Display label for assignment type. |
| `applyAssignedAssessment(assignment)` | Loads assigned assessment JSON before starting. |
| `fetchAssessmentPayload(path)` | Fetches assessment JSON by path. |

Question/exam rendering:

| Function | Purpose |
|---|---|
| `renderGridCell(question, index)` | Left-side question number grid cell. |
| `renderOption(question, option)` | MCQ option button. |
| `renderQuestionMedia(question)` | Question image/diagram display. |
| `assetUrl(src)` | Normalizes asset URL. |
| `bindActions()` | Wires all exam click/keyboard/canvas actions. |
| `markVisited(patch)` | Marks a question as visited. |

Submit and result:

| Function | Purpose |
|---|---|
| `renderSubmitReview()` | Pre-submit review screen. |
| `renderSubmitDialog()` | Confirmation popup before submit. |
| `submitAssessment()` | Builds evaluation, saves attempt, marks submitted. |
| `buildEvaluation()` | Creates full attempt JSON with score, responses, timing, ILP. |
| `renderSubmitted()` | Result page after submit. |
| `bindSubmittedDashboardAction()` | Handles Go to Dashboard after result. |

Scoring and ILP:

| Function | Purpose |
|---|---|
| `generateILP(...)` | Builds individualized learning plan. |
| `buildRecommendation(topic, lesson)` | Recommendation row for weak skills. |
| `getReadinessLevel(percentage)` | Converts score into readiness level. |
| `buildTeacherNotes(...)` | Teacher-facing ILP notes. |
| `buildStudentPlan(...)` | Student-facing plan text. |
| `buildTopicBreakdown(responses)` | Topic-level score summary. |

Tools:

| Function | Purpose |
|---|---|
| `renderCalculator()` | Calculator UI. |
| `pressCalculator(key)` | Calculator button logic. |
| `initScratchPad()` | Whiteboard/scratch pad setup. |
| `captureScratch()` | Saves scratch canvas image in state. |
| `openImageZoom(src)` | Image zoom overlay with controls. |
| `readCurrentQuestionAloud()` | Reads current question/options aloud. |
| `speakText(text)` | Speech synthesis helper. |
| `showSelectionReadTool()` | Shows read-aloud tool for selected text. |

Data adapters:

| Adapter | Purpose |
|---|---|
| `localDataAdapter` | Local/demo storage through localStorage and IndexedDB. |
| `apiDataAdapter` | Calls C# API endpoints from browser. |
| `getDataAdapter()` | Chooses local or API based on `src/config.js`. |

Shared helpers:

| Function | Purpose |
|---|---|
| `normalizeScore(evaluation)` | Safe score object for old/new attempts. |
| `normalizeStudent(evaluation)` | Safe student object. |
| `normalizeTiming(evaluation)` | Safe timing object. |
| `formatDuration(totalSeconds)` | Formats seconds as minutes/seconds. |
| `formatDateTime(value)` | Displays dates. |
| `escapeHtml(value)` | Prevents HTML injection in UI strings. |
| `escapeAttribute(value)` | Safe HTML attribute output. |
| `downloadText(filename, content, type)` | Browser text/file download helper. |
| `buildAttemptsCsv(attempts)` | CSV export helper. |
| `buildResponseCsv(evaluation)` | Response-level CSV export. |

## Student Files

### `src/student/student-start.js`

Student login screen.

Main functions:

| Function | Purpose |
|---|---|
| `renderStartScreen()` | Shows student sign-in form and handles username/email lookup. |

Flow:

```text
Student enters username/email
  -> findRegisteredStudent()
  -> getStudentDashboardData()
  -> renderStudentDashboard()
```

### `src/student/student-dashboard.js`

Student dashboard after login.

Current purpose:

- clean dashboard after email login
- shows assigned work
- shows performance summary
- shows recent submissions
- starts assigned assessment

Main functions:

| Function | Purpose |
|---|---|
| `renderStudentDashboard(student, dashboardData)` | Full student dashboard page. |
| `renderStudentAssignmentCard(student, assignment, attempts)` | Assigned assessment card. |
| `renderCompletedAssessmentHistory(completedAssignments, attempts)` | Recent submission history. |
| `buildStudentPerformance(attempts, availableAssignments)` | Average/best/latest/focus/strength summary. |
| `renderStudentPerformance(performance)` | Performance UI. |
| `renderStudentTopicList(topics, emptyText)` | Focus/strength topic pills. |
| `getLatestAttemptForAssignment(assignment, attempts)` | Finds latest attempt for one assignment. |
| `getAttemptAssignmentKey(attempt)` | Reads assignment key from attempt. |
| `getLatestAttemptDateForAssignment(...)` | Latest submit date. |
| `getLatestAttemptScoreForAssignment(...)` | Latest score display. |
| `startStudentAssignment(student, assignment)` | Loads assignment and enters exam. |
| `renderStudentDashboardError(message)` | Shows dashboard error message. |

### `src/student/student-exam.js`

Student exam workspace.

Main functions:

| Function | Purpose |
|---|---|
| `renderAssessmentWorkspace()` | Renders actual question-taking screen. |

Exam screen includes:

- left sidebar with name/test/question grid
- question pane
- question toolbar
- answer options
- previous/next/submit bar
- right collapsible tools
- calculator and scratch pad

## Admin Files

### `src/admin/admin-core.js`

Admin shell and page routing.

Main functions:

| Function | Purpose |
|---|---|
| `paintAdminDashboard(...)` | Builds admin context and renders active page. |
| `getAdminPageMeta(page)` | Header title/eyebrow by admin page. |
| `renderAdminHeaderActions(page)` | Header buttons for page. |
| `renderAdminPage(page, context)` | Routes to correct admin page renderer. |

Admin pages use URL hash:

```text
?admin=1#overview
?admin=1#assessments
?admin=1#assignments
?admin=1#questions
?admin=1#import
?admin=1#results
?admin=1#ilp
?admin=1#database
```

### `src/admin/admin-pages.js`

General admin pages.

Main functions:

| Function | Purpose |
|---|---|
| `renderAdminOverviewPage(context)` | Overview KPIs, live activity, recent attempts. |
| `getActiveAssignmentRows(assignments)` | Determines who is taking a test now. |
| `renderActiveAssignments(assignments)` | Live activity card. |
| `renderAdminAssessmentPage(validation)` | Assessment settings/validation. |
| `renderAdminImportPage()` | Import pipeline notes. |
| `renderAdminDatabasePage()` | Database/data contract notes. |
| `renderRecentAttempts(attempts)` | Recent submissions list. |
| `renderAttemptsTable(attempts)` | Attempt table. |

### `src/admin/admin-assignments.js`

Assignment Access page. This is one of the largest admin files.

Purpose:

- search/filter students
- view assignment status
- assign/reassign/unassign
- configure duration, due date, attempts, tools, results visibility
- review assignment history
- resizable assignment tables

Key functions:

| Function | Purpose |
|---|---|
| `renderAdminAssignmentsPage(context)` | Main page renderer. |
| `bindAssignmentControls()` | Wires Assignment page controls. |
| `bindAssignmentAdminTabs()` | Manage/history tab behavior. |
| `bindAssignmentTypeFilter()` | Type dropdown behavior. |
| `getAssignmentTypeOptions(assessments)` | Assignment type dropdown values. |
| `bindUnassignControls(loadStudents)` | Unassign buttons. |
| `bindQuickReassignControls(...)` | Reassign action handling. |
| `bindAssignmentTableActions(...)` | Row-level actions. |
| `getSelectedVisibleStudentsForReassign(...)` | Selected rows for reassignment. |
| `renderAssignmentResults(students, payload)` | Main student table. |
| `renderAssignmentHistoryTab(context, studentId)` | Assignment history tab. |
| `renderAssignmentEventHistory(events, normalizedStudentId)` | Event history table. |
| `bindAssignmentHistoryControls()` | History filters. |
| `formatAssignmentStatusText(status)` | Status labels. |
| `renderAssignmentsCount(student)` | Total assignment progress display. |
| `getSelectedAssignmentState(student)` | Current selected assignment state per student. |
| `getCurrentAssignmentUsedAttempts(...)` | Used attempts for selected assignment. |
| `getAssignmentProgressLabel(...)` | Progress text. |
| `renderSelectedAssignmentAction(...)` | Actions per row. |
| `bindAssignmentSelectionMenu()` | Select visible/all menu. |
| `getSelectedAssignmentStudents(...)` | Builds selected students list. |
| `renderAssignmentConfirmation(students)` | Confirmation page before assignment. |
| `bindAssignmentConfirmation(onBack)` | Confirmation actions and save. |
| `makeAssignmentTablesResizable()` | Drag column widths. |
| `formatDueDateForApi(value)` | Due date format for API payload. |

### `src/admin/admin-pretests.js`

Assignment/assessment catalog page.

Main functions:

| Function | Purpose |
|---|---|
| `renderAdminPretestCatalogPage(context)` | Catalog table. |
| `bindPretestCatalogControls()` | Publish/archive/status controls. |
| `normalizePretestCatalog(assessments)` | Normalizes assessment catalog. |
| `getPretestAssignedCounts(assignments)` | Assignment counts per assessment. |
| `getPretestSubmittedCounts(attempts)` | Submission counts per assessment. |
| `getPretestGrade(item)` | Grade display. |
| `renderPretestTools(item)` | Tools badges. |
| `formatPretestStatus(status)` | Status label. |

### `src/admin/admin-questions.js`

Question Library page.

Main functions:

| Function | Purpose |
|---|---|
| `renderAdminQuestionsPage(context)` | Main question library layout. |
| `bindQuestionLibraryControls()` | Filter/selection/pagination controls. |
| `renderQuestionFilters()` | Assignment/Test/Standard filters. |
| `renderQuestionTable(rows, selectedId)` | Question list. |
| `renderQuestionPreview(row, selectedIndex, rowCount)` | Preview selected question. |
| `buildQuestionRows(context)` | Builds question rows from assessment JSON/catalog. |
| `filterQuestionRows(rows)` | Filters by assignment/test/standard. |
| `renderAdminQuestionImage(src, label)` | Question image display. |
| `getAssessmentKeyFromTitle(title)` | Infers key from assessment title. |
| `inferQuestionAssignmentType(assessmentMeta)` | Assignment type inference. |
| `getQuestionAssignmentTypeLabel(code)` | Type label. |
| `uniqueQuestionAssignmentTypes(rows)` | Filter values. |

### `src/admin/admin-results.js`

Results dashboard page.

Purpose:

- review results by student, assignment, or school
- filter results
- show grouped performance
- show printable PDF report through browser print

Main functions:

| Function | Purpose |
|---|---|
| `renderAdminResultsPage(context)` | Full Results dashboard. |
| `bindResultsDashboardControls()` | Filter/view/report event handlers. |
| `renderResultsFilters(rows, context)` | Search/assignment/school/grade/score filters. |
| `renderResultViewTab(view, label)` | Student/Assignment/School tabs. |
| `renderResultGroupTable(groups, selectedKey)` | Group summary table. |
| `renderResultGroupDetail(group, view)` | Detail panel for selected group. |
| `renderAttemptDetail(attempt)` | Question review for single attempt. |
| `renderGroupTopicSummary(rows)` | Topic summary across grouped attempts. |
| `renderTopicBreakdown(topics)` | Topic progress bars. |
| `buildResultRows(context)` | Normalizes attempts into result rows. |
| `filterResultRows(rows)` | Applies filters. |
| `buildResultGroups(rows, view)` | Groups by student/assignment/school. |
| `summarizeResultRows(rows)` | Count/average/highest/lowest. |
| `printResultReport(groupKey)` | Opens browser print/PDF report. |
| `buildPrintableResultReport(group, view)` | HTML for printable report. |
| `getFilteredResultAttempts(context)` | Export helper for current filters. |

### `src/admin/admin-ilp.js`

ILP page.

Main functions:

| Function | Purpose |
|---|---|
| `renderAdminIlpPage(context)` | ILP dashboard layout. |
| `bindIlpDashboardControls()` | Filters and selection controls. |
| `renderIlpFilters(rows)` | Assessment/readiness/search filters. |
| `renderIlpStudentList(rows, selectedId)` | ILP student/attempt list. |
| `renderIlpDetail(row)` | Selected ILP details. |
| `buildIlpRows(context)` | Creates ILP rows from attempts. |
| `filterIlpRows(rows)` | Applies ILP filters. |
| `buildWorksheetRecommendations(row)` | Worksheet suggestions from ILP. |
| `getReviewedIlpMap()` | Local reviewed state. |
| `isIlpReviewed(attemptId)` | Review status. |

## Styling

### `src/styles.css`

All app styling is in this file.

Major areas:

```text
start/login page
student dashboard
student exam workspace
question/options/images
calculator
scratch pad
image zoom
submit dialog
results page
admin shell/sidebar
admin assignment page
admin catalog/question/results/ILP pages
responsive rules
```

When changing UI:

- Student dashboard styles begin around `.student-dashboard-shell`.
- Admin shell styles begin around `.admin-shell`.
- Results page styles begin around `.results-dashboard`.
- Exam styles include `.exam-window`, `.content-area`, `.question-pane`, `.option`, `.tools-rail`.

## Backend C# API

### Project

```text
backend/AstuteAssessment.Api
```

Important files:

| File | Purpose |
|---|---|
| `Program.cs` | All C# API routes and PostgreSQL queries. |
| `AstuteAssessment.Api.csproj` | .NET project and Npgsql dependency. |
| `Dockerfile` | Docker deployment for Render or other container hosts. |
| `Properties/launchSettings.json` | Local launch settings. |
| `appsettings.json` | Standard ASP.NET config file. |

### `backend/AstuteAssessment.Api/Program.cs`

Environment variables:

```text
DATABASE_URL
DATABASE_SSL
STUDENT_VIEW
CORS_ORIGIN
```

Routes:

| Route | Purpose |
|---|---|
| `GET /` | Service metadata. |
| `GET /health` | Database connectivity check. |
| `GET /api/debug` | Debug summary. |
| `GET /api/attempts` | Submitted attempts/results. |
| `POST /api/attempts` | Save submitted attempt, responses, ILP. |
| `GET /api/assessments` | Assessment catalog from PostgreSQL. |
| `POST /api/assessments/{key}/status` | Publish/archive/draft status update. |
| `GET /api/assignments` | Assignment rows and attempt counts. |
| `POST /api/assignments` | Assign/reassign students. |
| `POST /api/assignments/cancel` | Unassign/cancel assignments. |
| `POST /api/assignments/activity` | Student live activity heartbeat. |
| `GET /api/assignment-events` | Assignment history/events. |
| `GET /api/students` | Student lookup/search/paging. |
| `POST /api/students` | Placeholder; registration remains external. |
| `GET /api/student-filters` | School/grade/student count filters. |

Main backend functions:

| Function | Purpose |
|---|---|
| `ListAttempts(db)` | Reads attempts and enriches student info. |
| `ListAssessments(db)` | Reads assessment catalog with type/tool config. |
| `ListAssignments(db)` | Reads assignment rows, counts attempts, derives status. |
| `ListAssignmentEvents(db)` | Reads assignment event history. |
| `SaveAssignments(db, payload)` | Assign/reassign students, writes history events. |
| `UpsertAssessment(...)` | Creates/updates assessment record. |
| `CancelAssignments(db, payload)` | Cancels assignments and writes event. |
| `MarkAssignmentActivity(db, payload)` | Marks assignment started/active. |
| `SaveAttempt(db, attempt)` | Saves attempt summary, responses, ILP. |
| `UpdateAssignmentAfterAttempt(...)` | Updates assignment status after submit. |
| `ListStudents(db, safeStudentView, options)` | Student search/paging from mapped view. |
| `ListStudentFilters(db, safeStudentView)` | School/grade filter values. |
| `GetDebugSummary(...)` | Debug information. |
| `InsertAssignmentEvent(...)` | Writes audit/history event. |
| `BuildNpgsqlConnectionString(value)` | Converts URL/connection string into Npgsql string. |
| `AddJsonb(command, node)` | Adds JSONB parameter. |
| `ParseJsonObject(value)` | Safe JSON object parse. |
| `GetObject/GetArray/GetString/GetInt/GetBool` | JSON helpers. |
| `ReadString/ReadColumnString/ReadInt/ReadBool` | Database reader helpers. |
| `FormatAssignmentTypeLabel(code)` | Backend assignment type label. |

## Database

### `database/postgres-schema.sql`

Creates core test engine tables:

| Table/View | Purpose |
|---|---|
| `test_engine_school_seed` | Optional school seed table. |
| `test_engine_grade_seed` | Optional grade seed table. |
| `test_engine_student_seed` | Optional student seed table. |
| `test_engine_registered_students` | View used by API for student lookup. |
| `test_engine_assessments` | Assessment metadata. |
| `test_engine_questions` | Question bank. |
| `test_engine_assessment_questions` | Assessment-question order. |
| `test_engine_assignments` | Student assignment access. |
| `test_engine_attempts` | Attempt summary and raw attempt JSON. |
| `test_engine_responses` | Per-question responses. |
| `test_engine_ilp_plans` | Generated ILP/practice plans. |
| `test_engine_question_assets` | Asset metadata for future upload/object storage. |

### `database/assignment-model.sql`

Adds/enhances:

```text
test_engine_assignment_types
test_engine_assignment_events
test_engine_assessments.assignment_type_code
```

This supports:

- assessment
- pretest
- worksheet
- practice
- diagnostic
- benchmark
- quiz
- assignment history/audit trail

### `database/student-registration-view.sql`

Maps the existing registration schema into the shape expected by the API.

Expected columns:

```text
student_external_id
display_name
email
status
grade_external_id
grade_level
section
school_external_id
school_name
```

## Input Data

### Assessment JSON

Main catalog:

```text
input/assessment-catalog.json
```

Individual assessments:

```text
input/assessments/grade-6-pretest.json
input/assessments/grade-7-pretest.json
input/assessments/grade-8-pretest.json
input/assessments/pre-test-for-demo.json
```

Legacy/current default source:

```text
input/pre-test-for-demo.json
```

### Images

Question images are stored under:

```text
input/assets/<assessment-key>/
```

Examples:

```text
input/assets/grade-6-pretest/
input/assets/grade-7-pretest/
input/assets/grade-8-pretest/
input/assets/pre-test-for-demo/
```

## Scripts

### `scripts/convert-pretests-from-docx.js`

Converts Word documents into assessment JSON and extracts images.

Important functions:

| Function | Purpose |
|---|---|
| `main()` | Converts all configured source DOCX files. |
| `parseDocx(sourcePath)` | Reads one DOCX and builds assessment payload. |
| `expandDocx(sourcePath, destination)` | Extracts DOCX as ZIP. |
| `extractBodyBlocks(xml)` | Reads document paragraphs/tables. |
| `paragraphText(xml)` | Extracts paragraph text. |
| `formatRunText(runXml)` | Handles superscript/subscript runs. |
| `tableToText(xml)` | Converts Word tables into text. |
| `extractImages(...)` | Copies embedded images to assets folder. |
| `readRelationships(relsPath)` | Maps DOCX relationship IDs to media files. |
| `newQuestion(number, assessmentKey)` | Creates question object. |
| `parseDistractor(line)` | Parses distractor feedback. |
| `splitOptionLines(text)` | Splits A/B/C/D options. |
| `slugify(value)` | File/key-safe slug. |

Source files are hardcoded near the top:

```js
const SOURCE_FILES = [
  "C:\\Users\\srava\\Downloads\\Pre-test\\Grade 6 Pretest.docx",
  "C:\\Users\\srava\\Downloads\\Pre-test\\Grade 7 Pretest.docx",
  "C:\\Users\\srava\\Downloads\\Pre-test\\Grade 8 Pretest.docx"
];
```

### `scripts/seed-pretests-to-postgres.js`

Seeds converted JSON assessments/questions into PostgreSQL.

Important functions:

| Function | Purpose |
|---|---|
| `main()` | Reads assessment files and seeds all active assessments. |
| `getAssessmentFiles()` | Finds assessment JSON files. |
| `seedAssessment(payload)` | Inserts assessment/questions/order. |
| `archiveInactivePretests(activeAssessmentKeys)` | Archives DB assessments no longer in JSON. |
| `slugify(value)` | Safe fallback key. |
| `getAssignmentType(assessment)` | Determines type. |

### `scripts/migrate-assignment-model.js`

Runs `database/assignment-model.sql`.

Important functions:

| Function | Purpose |
|---|---|
| `getTargets()` | Reads `DATABASE_URL` or `LOCAL_DATABASE_URL`. |
| `shouldUseSsl(connectionString)` | Determines SSL for remote DB. |
| `runMigration(target, sql)` | Applies SQL. |
| `main()` | Orchestrates migration. |

## Local Development Server

### `server.js`

This is the local static frontend server used by:

```powershell
npm run dev
```

It serves:

```text
index.html
src/
input/
data/
```

It also contains older Node/PostgreSQL local API helper routes. Current target architecture uses the C# API for database work, so treat `server.js` mainly as the local frontend server.

Important functions:

| Function | Purpose |
|---|---|
| `serveStatic(url, res)` | Serves local frontend files. |
| `handleHealth(res)` | Local health endpoint. |
| `handleStudents(req, url, res)` | Older local student endpoint. |
| `handleAssignments(req, res)` | Older local assignment endpoint. |
| `handleAttempts(req, res)` | Older local attempt endpoint. |
| `handleAssessments(res)` | Older local assessment endpoint. |

## Common Change Guide

### Change Student Login Page

Edit:

```text
src/student/student-start.js
src/styles.css
```

### Change Student Dashboard After Login

Edit:

```text
src/student/student-dashboard.js
src/styles.css
```

### Change Student Exam Screen

Edit:

```text
src/student/student-exam.js
src/app.js
src/styles.css
```

### Change Question/Option Behavior

Edit:

```text
src/app.js
```

Look at:

```text
renderOption()
bindActions()
markVisited()
buildEvaluation()
```

### Change Calculator/Scratch Pad

Edit:

```text
src/app.js
src/styles.css
```

Look at:

```text
renderCalculator()
pressCalculator()
initScratchPad()
captureScratch()
```

### Change Admin Assignment Access

Edit:

```text
src/admin/admin-assignments.js
src/styles.css
```

Backend assignment API:

```text
backend/AstuteAssessment.Api/Program.cs
SaveAssignments()
ListAssignments()
CancelAssignments()
MarkAssignmentActivity()
```

### Change Admin Results

Edit:

```text
src/admin/admin-results.js
src/styles.css
```

Backend results API:

```text
backend/AstuteAssessment.Api/Program.cs
ListAttempts()
SaveAttempt()
```

### Change Question Library

Edit:

```text
src/admin/admin-questions.js
```

Assessment JSON source:

```text
input/assessments/
input/assessment-catalog.json
```

### Change Database Tables

Edit:

```text
database/postgres-schema.sql
database/assignment-model.sql
backend/AstuteAssessment.Api/Program.cs
```

Then run:

```powershell
npm run migrate:assignment-model
```

or run updated SQL manually in PostgreSQL.

### Change Live API URL

Edit:

```text
src/config.js
```

Change:

```js
apiBaseUrl: "https://your-api-url"
```

### Change GitHub Pages Deployment

Edit:

```text
.github/workflows/pages.yml
```

## Data Flow

### Student Login

```text
student-start.js
  renderStartScreen()
    -> findRegisteredStudent()
      -> apiDataAdapter.listStudents()
        -> GET /api/students
          -> C# ListStudents()
            -> test_engine_registered_students
```

### Student Dashboard

```text
renderStartScreen()
  -> getStudentDashboardData(studentId)
    -> apiDataAdapter.listAssignments()
    -> apiDataAdapter.listAttempts()
  -> renderStudentDashboard()
```

### Start Assignment

```text
student-dashboard.js
  startStudentAssignment()
    -> applyAssignedAssessment()
      -> fetchAssessmentPayload()
    -> setState(started: true)
    -> sendAssignmentActivityHeartbeat(true)
```

### Submit Attempt

```text
app.js
  submitAssessment()
    -> buildEvaluation()
    -> saveAttempt()
      -> apiDataAdapter.saveAttempt()
        -> POST /api/attempts
          -> C# SaveAttempt()
            -> test_engine_attempts
            -> test_engine_responses
            -> test_engine_ilp_plans
            -> test_engine_assignments
            -> test_engine_assignment_events
```

### Admin Assignment

```text
admin-assignments.js
  renderAssignmentConfirmation()
  bindAssignmentConfirmation()
    -> apiDataAdapter.saveAssignments()
      -> POST /api/assignments
        -> C# SaveAssignments()
          -> test_engine_assessments
          -> test_engine_assignments
          -> test_engine_assignment_events
```

### Admin Results

```text
admin-results.js
  renderAdminResultsPage()
    -> context.attempts
      -> apiDataAdapter.listAttempts()
        -> GET /api/attempts
          -> C# ListAttempts()
            -> test_engine_attempts
            -> test_engine_registered_students
```

## Important Storage Locations

Browser:

```text
localStorage key: assessment-engine-mvp
IndexedDB: assessment-engine-results
```

PostgreSQL:

```text
test_engine_assignments
test_engine_attempts
test_engine_responses
test_engine_ilp_plans
test_engine_assignment_events
```

Static files:

```text
input/assessments/*.json
input/assets/**/*.png
```

## Known Architecture Notes

- The frontend is static JavaScript and can stay on GitHub Pages.
- The database must be reached through the C# API, not the browser.
- `src/config.js` controls which API the frontend calls.
- The current app still ships assessment JSON to the browser; for high-stakes production, answer keys should move fully behind the API.
- Admin authentication and role checks are not complete yet and should be added before broad real use.
- `server.js` is still useful as a local frontend server, but C# is now the intended database API.

## Recommended Next Documentation Updates

As the app grows, add smaller docs for:

```text
docs/STUDENT_FLOW.md
docs/ADMIN_ASSIGNMENTS.md
docs/API_CONTRACT.md
docs/DATABASE_SCHEMA.md
docs/DEPLOYMENT_AZURE.md
```
