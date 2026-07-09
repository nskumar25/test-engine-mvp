# PostgreSQL Data Plan

Production architecture:

```text
Student UI / Admin UI
        ->
C# ASP.NET Core API
        ->
PostgreSQL
```

The browser must not connect directly to PostgreSQL. The C# API keeps database credentials private and controls all reads/writes.

## Files

- `database/postgres-schema.sql`: tables for assessments, questions, assignments, attempts, responses, ILPs, and assets.
- `database/student-registration-view.sql`: maps the existing `public."Student"` table into the API's expected student lookup shape.
- `backend/AstuteAssessment.Api`: C# API used by the frontend.
- `src/config.js`: frontend API URL configuration.

## Student Registration Integration

The test engine should not become the primary student registration system. Keep your existing student table as the source of truth.

Create a database view that maps your registration fields into the shape the API expects:

```sql
\i database/student-registration-view.sql
```

The API reads:

```text
test_engine_registered_students
```

## Run C# API Locally

```powershell
cd "E:\Python\Test Engine"

$env:DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE"
$env:DATABASE_SSL="false"
$env:STUDENT_VIEW="test_engine_registered_students"
$env:CORS_ORIGIN="http://127.0.0.1:5173"

npm run api:csharp
```

Health check:

```text
http://127.0.0.1:9001/health
```

## Pre-Test Import

The assessment table is `test_engine_assessments`. Questions are stored in `test_engine_questions`, and the order of questions inside each assessment is stored in `test_engine_assessment_questions`.

Converted Word assessments live in:

```text
input/assessments/
input/assessment-catalog.json
input/assets/<assessment-key>/
```

Seed converted assessments into PostgreSQL with:

```powershell
cd "E:\Python\Test Engine"
$env:DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE"
npm run seed:pretests
```

## Assignment Model Migration

Create the assignment type and assignment event tables with:

```powershell
cd "E:\Python\Test Engine"

$env:DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE"
npm run migrate:assignment-model
```

This creates or updates:

- `test_engine_assignment_types`
- `test_engine_assignment_events`
- `test_engine_assessments.assignment_type_code`

The migration is idempotent, so it is safe to run again.

## Production Notes

- Keep answer keys out of frontend JSON before real student use.
- Add authentication before exposing admin routes.
- Add role checks for admin/teacher/student access.
- Store uploaded images in object storage or a controlled asset service, with URLs saved in PostgreSQL.
- Keep IndexedDB only as an offline fallback or emergency retry queue.
