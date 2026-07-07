# Result Storage Notes

For this MVP, submitted attempts are stored in browser IndexedDB under:

- Database: `assessment-engine-results`
- Store: `attempts`
- Student key: `studentId`

The admin dashboard reads data through a small local adapter in `src/app.js`:

- `localDataAdapter.listAttempts()`
- `localDataAdapter.listStudents()`
- `localDataAdapter.saveStudent(student)`

When moving to Supabase, Firebase, Neon, or another backend, replace this adapter with API calls while keeping the dashboard UI and attempt shape mostly unchanged.

This is suitable for demo-scale local testing because it avoids localStorage limits and can hold many more attempt records in a browser profile.

For a production system, replace this with an API-backed model:

- `students`
- `assessments`
- `assessment_attempts`
- `assessment_responses`
- `question_bank`
- `question_assets`

The current attempt shape already maps cleanly to that backend:

- `schemaVersion`
- `attemptId`
- Student identity
- Assessment title/source/duration
- Submitted timestamp
- Started timestamp
- Timing summary
- Score, percentage, answered/unanswered counts, flagged count
- Topic breakdown
- Strengths and review areas
- Per-question response, correct answer, explanation, and distractor feedback

The result page can export:

- Full JSON attempt record
- CSV response rows

For 1,000 to 10,000 students, use a hosted database such as PostgreSQL or managed serverless storage. Keep browser IndexedDB only as an offline cache or emergency sync queue.

Suggested backend tables:

- `students(id, name, section, metadata)`
- `assessments(id, title, duration_minutes, version, source_document)`
- `attempts(id, student_id, assessment_id, started_at, submitted_at, score, percentage, time_used_seconds)`
- `responses(id, attempt_id, question_id, selected_answer, correct_answer, is_correct, topic)`
- `question_bank(id, topic, standard, difficulty, body, answer_key, metadata)`
