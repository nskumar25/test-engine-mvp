# Results Architecture

The MVP currently supports two data modes:

- `local`: browser IndexedDB/localStorage for demo use.
- `api`: browser calls to a backend API, which writes to PostgreSQL.

The app still defaults to `local` so GitHub Pages remains usable without backend hosting.

## Production Shape

```text
GitHub Pages student/admin frontend
        ->
Hosted C# ASP.NET Core API
        ->
PostgreSQL
        ->
Existing student registration table/view
```

The browser must never connect directly to PostgreSQL. The C# API stores attempts and reads student registration data through a safe mapped view.

## PostgreSQL Tables

- `test_engine_assessments`
- `test_engine_questions`
- `test_engine_assessment_questions`
- `test_engine_assignments`
- `test_engine_attempts`
- `test_engine_responses`
- `test_engine_ilp_plans`
- `test_engine_question_assets`

Student registration stays outside these tables. The API reads a view such as `test_engine_registered_students` that maps your existing student table into:

- `student_external_id`
- `display_name`
- `grade_level`
- `section`

## Attempt Storage

Each submitted attempt is stored in:

- `test_engine_attempts`: summary, score, timing, student id/name, raw JSON payload.
- `test_engine_responses`: one row per question response.
- `test_engine_ilp_plans`: generated ILP/practice plan.

The raw JSON is intentionally also stored so the UI can evolve without losing historical detail.

## Migration Order

1. Keep questions in `input/pre-test-for-demo.json`.
2. Save submitted attempts to PostgreSQL through `backend/AstuteAssessment.Api`.
3. Connect student lookup to your existing registration table/view.
4. Add assessment assignment rules.
5. Move questions and assets into PostgreSQL/object storage.
6. Remove answer keys from frontend-delivered JSON before real testing.

## Scale Notes

This design is comfortable for 1,000 to 10,000 students if the API is hosted properly and indexes are present. IndexedDB should become only an offline retry cache, not the system of record.
