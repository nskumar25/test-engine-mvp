# Result Storage Notes

For this MVP, submitted attempts are stored in browser IndexedDB under:

- Database: `assessment-engine-results`
- Store: `attempts`
- Student key: `studentId`

This is suitable for demo-scale local testing because it avoids localStorage limits and can hold many more attempt records in a browser profile.

For a production system, replace this with an API-backed model:

- `students`
- `assessments`
- `assessment_attempts`
- `assessment_responses`
- `question_bank`
- `question_assets`

The current attempt shape already maps cleanly to that backend:

- Student identity
- Assessment title/source
- Submitted timestamp
- Score and percentage
- Answered/unanswered counts
- Per-question response, correct answer, and explanation

For 1,000 to 10,000 students, use a hosted database such as PostgreSQL or managed serverless storage. Keep browser IndexedDB only as an offline cache or emergency sync queue.

