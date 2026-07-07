# Question Source Notes

For this MVP, assessments are loaded from the input folder:

`input/pre-test-for-demo.json`

That is the right approach for the first version because it is simple, reviewable, and easy to replace later. The student app fetches one JSON file and renders MCQ questions from it. Extracted document images are stored beside the JSON under `input/assets/`.

Recommended next step for a production library:

1. Store questions in a database through an admin/library module.
2. Keep images in controlled asset storage, such as a private uploads folder or cloud object storage.
3. Generate the same JSON shape from an API endpoint when a student starts an assessment.
4. Do not expose answer keys to the student browser in production. The current JSON includes `answer` only for MVP/demo convenience.

The current JSON structure already supports:

- Assessment metadata: title, duration, candidate, instructions
- MCQ questions only
- Question images
- Option images
- Topics and question IDs
