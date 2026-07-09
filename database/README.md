# PostgreSQL Data Plan

The MVP still runs as a static GitHub Pages app with local browser storage by default. Production should use:

```text
Student UI / Admin UI
        ->
Node API
        ->
PostgreSQL
```

Do not connect the browser directly to PostgreSQL. The API protects database credentials, validates writes, and lets the test engine connect to the existing student registration database.

## Files

- `database/postgres-schema.sql`: tables for assessments, questions, assignments, attempts, responses, ILPs, and assets.
- `database/student-registration-view.sql`: maps the existing `public."Student"` table into the API's expected student lookup shape.
- `api/postgres-api.js`: small Node API scaffold using `pg`.
- `src/app.js`: still defaults to `DATA_PROVIDER = "local"`, but includes an `apiDataAdapter` for later.

## Student Registration Integration

The test engine should not become the primary student registration system. Keep your existing student table as the source of truth.

Create a database view that maps your registration fields into the shape the API expects. For the exported schema you shared, use:

```sql
\i database/student-registration-view.sql
```

Then run the API with:

```powershell
$env:DATABASE_URL="postgres://user:password@host:5432/database"
$env:STUDENT_VIEW="test_engine_registered_students"
npm run api
```

## One-Way Student Sync To Neon

For free live testing, keep the local PostgreSQL student system as the source of truth and sync only the fields needed by the test engine into Neon:

```text
Local public."Student"
        ->
npm run sync:students
        ->
Neon test_engine_student_seed
```

Run:

```powershell
cd "E:\Python\Test Engine"

$env:LOCAL_DATABASE_URL="postgres://postgres:LOCAL_PASSWORD@localhost:5432/postgres"
$env:NEON_DATABASE_URL="postgresql://USER:PASSWORD@HOST.neon.tech/DBNAME?sslmode=require"

npm run sync:students
```

The script creates/updates:

- `test_engine_school_seed`
- `test_engine_grade_seed`
- `test_engine_student_seed`
- `test_engine_registered_students`

It upserts schools by `school_external_id`, grades by `grade_external_id`, and students by `student_external_id`. The API reads the `test_engine_registered_students` view, so assignment filters come from the linked school and grade records. It does not delete Neon rows when local rows disappear.

## Pre-Test Import

The pre-test table is `test_engine_assessments`. Questions are stored in `test_engine_questions`, and the order of questions inside each pre-test is stored in `test_engine_assessment_questions`.

Converted Word pretests live in:

```text
input/assessments/
input/assessment-catalog.json
input/assets/<assessment-key>/
```

Seed the converted pretests into PostgreSQL/Neon with:

```powershell
cd "E:\Python\Test Engine"
$env:DATABASE_URL="postgresql://USER:PASSWORD@HOST.neon.tech/DBNAME?sslmode=require"
npm run seed:pretests
```

The admin assignment page reads the catalog in local mode and `/api/assessments` in API mode.

## Assignment Model Migration

Create the assignment type and assignment event tables with:

```powershell
cd "E:\Python\Test Engine"

$env:DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DBNAME"
npm run migrate:assignment-model
```

To run the same migration against local PostgreSQL and Neon in one command:

```powershell
cd "E:\Python\Test Engine"

$env:LOCAL_DATABASE_URL="postgresql://postgres:LOCAL_PASSWORD@localhost:5432/postgres"
$env:NEON_DATABASE_URL="postgresql://USER:PASSWORD@HOST.neon.tech/DBNAME?sslmode=require"

npm run migrate:assignment-model
```

This creates or updates:

- `test_engine_assignment_types`
- `test_engine_assignment_events`
- `test_engine_assessments.assignment_type_code`

The migration is idempotent, so it is safe to run again after local or Neon refreshes.

## Migration Path

1. Run `database/postgres-schema.sql` in the existing PostgreSQL database or a separate schema in the same database.
2. Create the student mapping view for the existing registration table.
3. Host `api/postgres-api.js` on a backend host.
4. Set `window.ASSESSMENT_API_BASE_URL` in the frontend hosting environment.
5. Change `DATA_PROVIDER` in `src/app.js` from `local` to `api`.
6. Move assessment/question JSON into PostgreSQL after the results pipeline is stable.

## Production Notes

- Keep answer keys out of frontend JSON before real student use.
- Add authentication before exposing admin routes.
- Add role checks for admin/teacher/student access.
- Store uploaded images in object storage or a controlled asset service, with URLs saved in PostgreSQL.
- Keep IndexedDB only as an offline fallback or emergency retry queue.
