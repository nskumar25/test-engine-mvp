# Assessment Test Engine MVP

Student-facing web assessment MVP with:

- JSON-based assessment input
- MCQ questions
- Embedded question and option images
- Question navigation grid
- Calculator and scratch pad tools
- Silent copy/selection friction
- Submission evaluation
- ILP/practice plan generation
- Local demo storage with a PostgreSQL API path for production

## Run Frontend Locally

```powershell
npm run dev
```

Open:

```text
http://127.0.0.1:5173/
```

Admin dashboard:

```text
http://127.0.0.1:5173/?admin=1
```

## Current Input

The app currently loads:

```text
input/pre-test-for-demo.json
```

Images are stored in:

```text
input/assets/pre-test-for-demo/
```

## PostgreSQL Backend

Production should use a backend API between the browser and PostgreSQL:

```text
Frontend
  -> Node API
  -> PostgreSQL
  -> Existing student registration table/view
```

Run the schema:

```text
database/postgres-schema.sql
```

Run the API locally:

```powershell
$env:DATABASE_URL="postgres://user:password@host:5432/database"
$env:STUDENT_VIEW="test_engine_registered_students"
npm run api
```

The frontend is configured in:

```text
src/config.js
```

For local API testing it currently uses:

```js
window.ASSESSMENT_DATA_PROVIDER = "api";
window.ASSESSMENT_API_BASE_URL = "http://127.0.0.1:9000";
```

When the API is hosted, update only `ASSESSMENT_API_BASE_URL`.

## GitHub Pages

GitHub Pages can host the frontend only. PostgreSQL requires a separate backend host such as Render, Railway, Fly.io, Vercel serverless functions, or your own server.
