const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const SOURCE_FILES = [
  "C:\\Users\\srava\\Downloads\\Pre-test\\Grade 6 Pretest.docx",
  "C:\\Users\\srava\\Downloads\\Pre-test\\Grade 7 Pretest.docx",
  "C:\\Users\\srava\\Downloads\\Pre-test\\Grade 8 Pretest.docx"
];

const OUTPUT_DIR = path.join("input", "assessments");
const ASSET_ROOT = path.join("input", "assets");
const CATALOG_PATH = path.join("input", "assessment-catalog.json");

const SUPERSCRIPT_MAP = {
  "0": "\u2070",
  "1": "\u00b9",
  "2": "\u00b2",
  "3": "\u00b3",
  "4": "\u2074",
  "5": "\u2075",
  "6": "\u2076",
  "7": "\u2077",
  "8": "\u2078",
  "9": "\u2079",
  "+": "\u207a",
  "-": "\u207b",
  "=": "\u207c",
  "(": "\u207d",
  ")": "\u207e",
  n: "\u207f",
  i: "\u2071"
};

const SUBSCRIPT_MAP = {
  "0": "\u2080",
  "1": "\u2081",
  "2": "\u2082",
  "3": "\u2083",
  "4": "\u2084",
  "5": "\u2085",
  "6": "\u2086",
  "7": "\u2087",
  "8": "\u2088",
  "9": "\u2089",
  "+": "\u208a",
  "-": "\u208b",
  "=": "\u208c",
  "(": "\u208d",
  ")": "\u208e"
};

function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const catalog = [];

  for (const source of SOURCE_FILES) {
    const payload = parseDocx(source);
    const slug = payload.assessment.key;
    const outputPath = path.join(OUTPUT_DIR, `${slug}.json`);
    fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    catalog.push({
      key: slug,
      title: payload.assessment.title,
      sourceDocument: payload.assessment.sourceDocument,
      questionCount: payload.questions.length,
      durationMinutes: payload.assessment.durationMinutes,
      path: `input/assessments/${slug}.json`
    });
    console.log(`Wrote ${outputPath} with ${payload.questions.length} question(s).`);
  }

  fs.writeFileSync(CATALOG_PATH, `${JSON.stringify({ assessments: catalog }, null, 2)}\n`, "utf8");
  console.log(`Wrote ${CATALOG_PATH} with ${catalog.length} assessment(s).`);
}

function parseDocx(sourcePath) {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`DOCX file was not found: ${sourcePath}`);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "assessment-docx-"));
  try {
    expandDocx(sourcePath, tempDir);
    const documentXml = readXml(path.join(tempDir, "word", "document.xml"));
    const relationships = readRelationships(path.join(tempDir, "word", "_rels", "document.xml.rels"));
    const title = getTitle(documentXml, path.parse(sourcePath).name);
    const slug = slugify(title);
    const assetDir = path.join(ASSET_ROOT, slug);

    fs.rmSync(assetDir, { recursive: true, force: true });
    fs.mkdirSync(assetDir, { recursive: true });

    const blocks = extractBodyBlocks(documentXml);
    const questions = [];
    let current = null;
    let mode = null;
    let pendingStandard = "";
    let pendingLevel = "";
    let imageCounter = 0;

    for (const block of blocks) {
      const text = block.type === "table" ? tableToText(block.xml) : paragraphText(block.xml);
      const images = extractImages(block.xml, relationships, tempDir, assetDir, slug, () => {
        imageCounter += 1;
        return imageCounter;
      });

      if (!text && images.length) {
        addImages(current, images);
        continue;
      }
      if (!text) continue;
      if (text.replace(/\u2014/g, "-").split("").every((char) => char === "-")) continue;
      if (text === title) continue;

      const questionMatch = text.match(/^Question\s+(\d+)(?:\s*\((.*?)\))?:\s*(.*)$/i);
      if (questionMatch) {
        if (current) questions.push(current);
        current = newQuestion(Number(questionMatch[1]), slug);
        current.level = cleanInlineText(questionMatch[2] || "");
        current.topic = current.level || "General";
        current.question = cleanInlineText(questionMatch[3] || "");
        addImages(current, images);
        mode = "question";
        continue;
      }

      if (text.startsWith("Standard Code:")) {
        if (current?.question) {
          questions.push(current);
          current = null;
        }
        pendingStandard = cleanInlineText(text.split(":").slice(1).join(":"));
        mode = "standard";
        continue;
      }

      if (text.startsWith("Bloom")) {
        pendingLevel = text.includes(":") ? cleanInlineText(text.split(":").slice(1).join(":")) : "";
        continue;
      }

      if (text.startsWith("Question Number:")) {
        if (current?.question) questions.push(current);
        const numberMatch = text.match(/\d+/);
        current = newQuestion(Number(numberMatch?.[0] || questions.length + 1), slug);
        current.standard = pendingStandard;
        current.level = pendingLevel;
        current.topic = current.standard || current.level || "General";
        mode = null;
        continue;
      }

      if (text === "Question:") {
        mode = "question";
        continue;
      }

      if (text === "Distractor:") {
        mode = "distractor";
        continue;
      }

      if (!current) continue;

      if (text.startsWith("Correct Answer:")) {
        const answerText = cleanInlineText(text.split(":").slice(1).join(":"));
        const answerMatch = answerText.match(/^([A-Da-d])\)\s*(.*)$/);
        if (answerMatch) {
          current.answer = answerMatch[1].toLowerCase();
          current.correctAnswerText = cleanInlineText(answerMatch[2]);
        } else {
          current.correctAnswerText = answerText;
        }
        mode = null;
        continue;
      }

      if (text.startsWith("Explanation:")) {
        current.explanation = cleanInlineText(text.split(":").slice(1).join(":"));
        mode = null;
        continue;
      }

      if (mode === "distractor") {
        const parsed = parseDistractor(text);
        if (parsed) {
          current.distractors[parsed.id] = {
            feedback: parsed.feedback,
            lesson: parsed.lesson || current.topic || "Review"
          };
        }
        continue;
      }

      const optionLines = splitOptionLines(text);
      if (optionLines.length && optionLines.every((line) => /^[A-Da-d]\)/.test(line))) {
        for (const line of optionLines) {
          const optionId = line[0].toLowerCase();
          current.options.push({
            id: optionId,
            label: normalizeOptionText(line),
            image: optionLines.length === 1 && images.length ? images[0] : null
          });
        }
        if (!(optionLines.length === 1 && images.length)) addImages(current, images);
        mode = "options";
        continue;
      }

      addImages(current, images);
      if (mode === "question") current.question = appendText(current.question, text);
    }

    if (current) questions.push(current);

    for (const question of questions) {
      question.topic = question.topic || question.standard || question.level || "General";
      if (!question.correctAnswerText && question.answer) {
        const option = question.options.find((item) => item.id === question.answer);
        question.correctAnswerText = option?.label || "";
      }
    }

    return {
      assessment: {
        key: slug,
        title,
        sourceDocument: path.basename(sourcePath),
        durationMinutes: 30,
        tools: {
          calculator: true,
          scratchpad: true,
          imageZoom: true,
          eliminator: true
        },
        inputFormatVersion: "mvp-1",
        questionSource: "Converted from Word document for MVP input folder",
        instructions: [
          "Choose one answer for every question.",
          "Use the question grid to move between questions.",
          "Submit when you have answered all questions."
        ]
      },
      questions
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function expandDocx(sourcePath, destination) {
  const zipPath = path.join(path.dirname(destination), `${path.basename(destination)}.zip`);
  fs.copyFileSync(sourcePath, zipPath);
  execFileSync("powershell", [
    "-NoProfile",
    "-Command",
    "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force",
    zipPath,
    destination
  ], { stdio: "pipe" });
  fs.rmSync(zipPath, { force: true });
}

function extractBodyBlocks(xml) {
  const bodyMatch = xml.match(/<w:body[\s\S]*?>([\s\S]*?)<\/w:body>/);
  const body = bodyMatch?.[1] || "";
  const blocks = [];
  const blockPattern = /<w:(p|tbl)\b[\s\S]*?<\/w:\1>/g;
  let match;
  while ((match = blockPattern.exec(body))) {
    blocks.push({ type: match[1] === "tbl" ? "table" : "paragraph", xml: match[0] });
  }
  return blocks;
}

function paragraphText(xml) {
  const runs = xml.match(/<w:r\b[\s\S]*?<\/w:r>/g) || [];
  return cleanInlineText(runs.map(formatRunText).join(""));
}

function formatRunText(runXml) {
  let text = "";
  const textPattern = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\b[^>]*\/>/g;
  let match;
  while ((match = textPattern.exec(runXml))) {
    if (match[1] != null) text += decodeXml(match[1]);
    else text += " ";
  }
  if (/<w:vertAlign\b[^>]*w:val="superscript"/.test(runXml)) return translateChars(text, SUPERSCRIPT_MAP);
  if (/<w:vertAlign\b[^>]*w:val="subscript"/.test(runXml)) return translateChars(text, SUBSCRIPT_MAP);
  return text;
}

function tableToText(xml) {
  const rows = xml.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
  return cleanInlineText(rows.map((row) => {
    const cells = row.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || [];
    return cells.map(paragraphText).filter(Boolean).join(" | ");
  }).filter(Boolean).join(" "));
}

function extractImages(xml, relationships, tempDir, assetDir, slug, nextCounter) {
  const images = [];
  const ids = Array.from(xml.matchAll(/r:embed="([^"]+)"/g)).map((match) => match[1]);
  for (const id of ids) {
    const target = relationships[id];
    if (!target || !target.startsWith("media/")) continue;
    const source = path.join(tempDir, "word", target.replace(/\//g, path.sep));
    if (!fs.existsSync(source)) continue;
    const ext = path.extname(source) || ".png";
    const filename = `image${nextCounter()}${ext}`;
    fs.copyFileSync(source, path.join(assetDir, filename));
    images.push(`/input/assets/${slug}/${filename}`);
  }
  return images;
}

function readRelationships(relsPath) {
  const xml = readXml(relsPath);
  const relationships = {};
  const pattern = /<Relationship\b([^>]*)\/>/g;
  let match;
  while ((match = pattern.exec(xml))) {
    const attrs = parseAttributes(match[1]);
    if (attrs.Id && attrs.Target) relationships[attrs.Id] = attrs.Target;
  }
  return relationships;
}

function parseAttributes(value) {
  const attrs = {};
  const pattern = /([\w:.-]+)="([^"]*)"/g;
  let match;
  while ((match = pattern.exec(value))) attrs[match[1]] = decodeXml(match[2]);
  return attrs;
}

function readXml(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function getTitle(documentXml, fallback) {
  const firstText = extractBodyBlocks(documentXml)
    .filter((block) => block.type === "paragraph")
    .map((block) => paragraphText(block.xml))
    .find(Boolean);
  return firstText || fallback;
}

function newQuestion(number, assessmentKey) {
  return {
    id: `${assessmentKey}-q${String(number).padStart(2, "0")}`,
    type: "mcq",
    number,
    level: "",
    topic: "",
    standard: "",
    question: "",
    image: null,
    images: [],
    imageDescription: null,
    options: [],
    answer: "",
    explanation: "",
    distractors: {},
    correctAnswerText: ""
  };
}

function addImages(question, images) {
  if (!question || !images.length) return;
  question.images.push(...images);
  if (!question.image) question.image = images[0];
}

function parseDistractor(line) {
  const match = line.trim().match(/^([A-Da-d])\)\s*(.*?)(?:\s*\(Lesson:\s*(.*?)\))?$/);
  if (!match) return null;
  return {
    id: match[1].toLowerCase(),
    feedback: match[2].trim(),
    lesson: (match[3] || "").trim() || null
  };
}

function splitOptionLines(text) {
  const trimmed = text.trim();
  const matches = Array.from(trimmed.matchAll(/([A-Da-d])\)\s*/g));
  if (matches.length <= 1) return trimmed ? [trimmed] : [];
  return matches.map((match, index) => {
    const end = matches[index + 1]?.index ?? trimmed.length;
    return trimmed.slice(match.index, end).trim();
  });
}

function normalizeOptionText(value) {
  return value.trim().replace(/^[A-Da-d]\)\s*/, "");
}

function appendText(existing, addition) {
  const left = cleanInlineText(existing);
  const right = cleanInlineText(addition);
  return cleanInlineText(left ? `${left} ${right}` : right);
}

function cleanInlineText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function translateChars(value, map) {
  return String(value || "").split("").map((char) => map[char] || char).join("");
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

main();
