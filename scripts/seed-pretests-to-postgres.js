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

async function main() {
  await pool.query("select 1");

  const files = (await fs.readdir(assessmentsDir))
    .filter((file) => file.endsWith(".json"))
    .sort();

  let assessmentCount = 0;
  let questionCount = 0;

  for (const file of files) {
    const payload = JSON.parse(await fs.readFile(path.join(assessmentsDir, file), "utf8"));
    const result = await seedAssessment(payload);
    assessmentCount += 1;
    questionCount += result.questions;
    console.log(`Seeded ${payload.assessment.title}: ${result.questions} question(s).`);
  }

  console.log(`Seeded ${assessmentCount} assessment(s) and ${questionCount} question(s).`);
}

async function seedAssessment(payload) {
  const client = await pool.connect();
  const assessment = payload.assessment || {};
  const questions = Array.isArray(payload.questions) ? payload.questions : [];
  const assessmentKey = assessment.key || slugify(assessment.sourceDocument || assessment.title || "assessment");

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
        tools,
        instructions
      )
      values ($1,$2,$3,$4,'published',$5,$6,$7)
      on conflict (external_assessment_key) do update set
        title = excluded.title,
        source_document = excluded.source_document,
        duration_minutes = excluded.duration_minutes,
        status = 'published',
        input_format_version = excluded.input_format_version,
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
      JSON.stringify(assessment.tools || {}),
      JSON.stringify(assessment.instructions || [])
    ]);

    const assessmentId = assessmentResult.rows[0].id;
    await client.query("delete from test_engine_assessment_questions where assessment_id = $1", [assessmentId]);

    for (const question of questions) {
      const questionKey = `${assessmentKey}:${question.id || `q${question.number}`}`;
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

    await client.query("commit");
    return { questions: questions.length };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "assessment";
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
