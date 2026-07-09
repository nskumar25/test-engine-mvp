const fs = require("fs/promises");
const path = require("path");
const { Pool } = require("pg");

const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;

if (!databaseUrl) {
  console.error("Missing DATABASE_URL or NEON_DATABASE_URL.");
  console.error("Set one of them before running npm run seed:pretests.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined
});

const assessmentsDir = path.join(process.cwd(), "input", "assessments");
const catalogPath = path.join(process.cwd(), "input", "assessment-catalog.json");

async function main() {
  await pool.query("select 1");

  const files = await getAssessmentFiles();

  let assessmentCount = 0;
  let questionCount = 0;
  const activeAssessmentKeys = [];

  for (const file of files) {
    const payload = JSON.parse(await fs.readFile(file, "utf8"));
    const result = await seedAssessment(payload);
    activeAssessmentKeys.push(payload.assessment?.key || slugify(payload.assessment?.sourceDocument || payload.assessment?.title || "assessment"));
    assessmentCount += 1;
    questionCount += result.questions;
    console.log(`Seeded ${payload.assessment.title}: ${result.questions} question(s).`);
  }

  await archiveInactivePretests(activeAssessmentKeys);
  console.log(`Seeded ${assessmentCount} assessment(s) and ${questionCount} question(s).`);
}

async function getAssessmentFiles() {
  try {
    const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
    const items = Array.isArray(catalog.assessments) ? catalog.assessments : [];
    if (items.length) {
      return items
        .map((item) => path.resolve(process.cwd(), item.path || path.join("input", "assessments", `${item.key}.json`)))
        .sort();
    }
  } catch {
    // Fall back to the folder scan for older local setups.
  }

  return (await fs.readdir(assessmentsDir))
    .filter((file) => file.endsWith(".json"))
    .map((file) => path.join(assessmentsDir, file))
    .sort();
}

async function seedAssessment(payload) {
  const client = await pool.connect();
  const assessment = payload.assessment || {};
  const questions = Array.isArray(payload.questions) ? payload.questions : [];
  const assessmentKey = assessment.key || slugify(assessment.sourceDocument || assessment.title || "assessment");
  const assignmentType = getAssignmentType(assessment);

  try {
    await client.query("begin");

    const assessmentResult = await client.query(`
      insert into test_engine_assessments (
        external_assessment_key,
        title,
        source_document,
        duration_minutes,
        status,
        input_format_version,
        assignment_type_code,
        tools,
        instructions
      )
      values ($1,$2,$3,$4,'published',$5,$6,$7,$8)
      on conflict (external_assessment_key) do update set
        title = excluded.title,
        source_document = excluded.source_document,
        duration_minutes = excluded.duration_minutes,
        status = 'published',
        input_format_version = excluded.input_format_version,
        assignment_type_code = excluded.assignment_type_code,
        tools = excluded.tools,
        instructions = excluded.instructions,
        updated_at = now()
      returning id
    `, [
      assessmentKey,
      assessment.title || assessmentKey,
      assessment.sourceDocument || null,
      Number(assessment.durationMinutes || 30),
      assessment.inputFormatVersion || "mvp-1",
      assignmentType,
      JSON.stringify(assessment.tools || {}),
      JSON.stringify(assessment.instructions || [])
    ]);

    const assessmentId = assessmentResult.rows[0].id;
    await client.query("delete from test_engine_assessment_questions where assessment_id = $1", [assessmentId]);
    const currentQuestionKeys = [];

    for (const question of questions) {
      const questionKey = `${assessmentKey}:${question.id || `q${question.number}`}`;
      currentQuestionKeys.push(questionKey);
      const questionResult = await client.query(`
        insert into test_engine_questions (
          external_question_key,
          type,
          topic,
          level,
          question_text,
          image_url,
          image_description,
          options,
          answer_key,
          explanation,
          distractors,
          metadata
        )
        values ($1,'mcq',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        on conflict (external_question_key) do update set
          topic = excluded.topic,
          level = excluded.level,
          question_text = excluded.question_text,
          image_url = excluded.image_url,
          image_description = excluded.image_description,
          options = excluded.options,
          answer_key = excluded.answer_key,
          explanation = excluded.explanation,
          distractors = excluded.distractors,
          metadata = excluded.metadata,
          updated_at = now()
        returning id
      `, [
        questionKey,
        question.topic || question.standard || "General",
        question.level || null,
        question.question || "",
        question.image || null,
        question.imageDescription || null,
        JSON.stringify(question.options || []),
        question.answer || "",
        question.explanation || null,
        JSON.stringify(question.distractors || {}),
        JSON.stringify({
          assessmentKey,
          questionNumber: question.number,
          standard: question.standard || null,
          images: question.images || [],
          correctAnswerText: question.correctAnswerText || null
        })
      ]);

      await client.query(`
        insert into test_engine_assessment_questions (
          assessment_id,
          question_id,
          position,
          points
        )
        values ($1,$2,$3,1)
        on conflict (assessment_id, question_id) do update set
          position = excluded.position,
          points = excluded.points
      `, [
        assessmentId,
        questionResult.rows[0].id,
        Number(question.number || 0)
      ]);
    }

    if (currentQuestionKeys.length) {
      await client.query(`
        delete from test_engine_questions
        where metadata->>'assessmentKey' = $1
          and external_question_key <> all($2::text[])
      `, [assessmentKey, currentQuestionKeys]);
    }

    await client.query("commit");
    return { questions: questions.length };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function archiveInactivePretests(activeAssessmentKeys) {
  if (!activeAssessmentKeys.length) return;
  const result = await pool.query(`
    update test_engine_assessments
    set status = 'archived',
        updated_at = now()
    where coalesce(assignment_type_code, 'assessment') = 'pretest'
      and external_assessment_key <> all($1::text[])
      and status <> 'archived'
  `, [activeAssessmentKeys]);
  if (result.rowCount) {
    console.log(`Archived ${result.rowCount} inactive pretest assessment(s).`);
  }
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "assessment";
}

function getAssignmentType(assessment) {
  if (assessment.assignmentType) return String(assessment.assignmentType).toLowerCase();
  const title = String(assessment.title || assessment.sourceDocument || "").toLowerCase();
  if (title.includes("worksheet")) return "worksheet";
  if (title.includes("practice")) return "practice";
  if (title.includes("diagnostic")) return "diagnostic";
  if (title.includes("benchmark")) return "benchmark";
  if (title.includes("quiz")) return "quiz";
  if (title.includes("pretest") || title.includes("pre-test")) return "pretest";
  return "assessment";
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
