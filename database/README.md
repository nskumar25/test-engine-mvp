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
