# Question Source Notes

For this MVP, assessments are loaded from:

```text
input/pre-test-for-demo.json
```

That is still the right short-term approach because it is easy to review, edit, and replace. Extracted document images live beside the JSON under `input/assets/`.

## Production Direction

Questions should eventually move into PostgreSQL through the admin dashboard/library module:

1. Store assessment metadata in `test_engine_assessments`.
2. Store reusable questions in `test_engine_questions`.
3. Store ordering in `test_engine_assessment_questions`.
4. Store image metadata in `test_engine_question_assets`.
5. Store actual image files in object storage or a controlled asset folder.
6. Generate a student-safe assessment payload from the API when the student starts a test.

## Important Security Change Before Real Use

The MVP JSON includes answer keys so the browser can evaluate locally. Production should not send answer keys to the browser. The API should:

- send only question text, options, and image URLs to the student UI;
- receive selected answers on submit;
- score the attempt server-side;
- store results in PostgreSQL.

The current JSON structure already supports:

- Assessment metadata
- MCQ questions
- Question images
- Option images
- Topics and question IDs for admin/ILP use
