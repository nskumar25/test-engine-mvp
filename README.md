# Assessment Test Engine MVP

Student and admin assessment MVP with:

- JavaScript frontend
- MCQ assessments and worksheets
- Image support in questions and answer choices
- Student dashboard with assigned work
- Admin assignment, question, result, and ILP views
- C# / ASP.NET Core API for PostgreSQL

## Architecture

```text
GitHub Pages frontend
  -> C# ASP.NET Core API
  -> PostgreSQL
```

The browser does not connect directly to PostgreSQL. It calls the API, and the API connects to PostgreSQL using `DATABASE_URL`.

## Frontend

Run locally:

```powershell
npm run dev
```

Open:

```text
http://127.0.0.1:5173/
```

Admin console:

```text
http://127.0.0.1:5173/?admin=1
```

Frontend API settings are in:

```text
src/config.js
```

## C# API

Project:

```text
backend/AstuteAssessment.Api
```

Run locally on the same port the frontend already expects:

```powershell
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

Main endpoints:

```text
GET  /api/students
GET  /api/student-filters
GET  /api/assessments
GET  /api/assignments
GET  /api/assignment-events
GET  /api/attempts
POST /api/assignments
POST /api/assignments/cancel
POST /api/assignments/activity
POST /api/attempts
```

## PostgreSQL

Schema:

```text
database/postgres-schema.sql
```

The API reads registered students through:

```text
test_engine_registered_students
```

For production, point that view at the real student registration tables.

## Deployment

The included `render.yaml` deploys the C# API as a Docker web service.

Set these environment variables in the API host:

```text
DATABASE_URL=<your PostgreSQL connection string>
DATABASE_SSL=true
STUDENT_VIEW=test_engine_registered_students
CORS_ORIGIN=https://nskumar25.github.io
```

If your PostgreSQL server does not use SSL, set:

```text
DATABASE_SSL=false
```

The public student/admin links can stay the same as long as `src/config.js` points to the deployed C# API URL.

## DOCX Conversion

Convert Word pretests into JSON:

```powershell
npm run convert:pretests
```

Converted assessments are written to:

```text
input/assessments
input/assessment-catalog.json
```
