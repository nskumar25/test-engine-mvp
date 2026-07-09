import json
import re
import shutil
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph


SOURCE_FILES = [
    Path(r"C:\Users\srava\Downloads\Pre-test\Grade 6 Pretest.docx"),
    Path(r"C:\Users\srava\Downloads\Pre-test\Grade 7 Pretest.docx"),
    Path(r"C:\Users\srava\Downloads\Pre-test\Grade 8 Pretest.docx"),
]

OUTPUT_DIR = Path("input/assessments")
ASSET_ROOT = Path("input/assets")
CATALOG_PATH = Path("input/assessment-catalog.json")

SUPERSCRIPT_MAP = str.maketrans({
    "0": "⁰",
    "1": "¹",
    "2": "²",
    "3": "³",
    "4": "⁴",
    "5": "⁵",
    "6": "⁶",
    "7": "⁷",
    "8": "⁸",
    "9": "⁹",
    "+": "⁺",
    "-": "⁻",
    "=": "⁼",
    "(": "⁽",
    ")": "⁾",
    "n": "ⁿ",
    "i": "ⁱ",
})

SUBSCRIPT_MAP = str.maketrans({
    "0": "₀",
    "1": "₁",
    "2": "₂",
    "3": "₃",
    "4": "₄",
    "5": "₅",
    "6": "₆",
    "7": "₇",
    "8": "₈",
    "9": "₉",
    "+": "₊",
    "-": "₋",
    "=": "₌",
    "(": "₍",
    ")": "₎",
})


def slugify(value):
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", value.lower())).strip("-")


def iter_blocks(document):
    body = document.element.body
    for child in body.iterchildren():
        if child.tag == qn("w:p"):
            yield Paragraph(child, document)
        elif child.tag == qn("w:tbl"):
            yield Table(child, document)


def paragraph_images(paragraph, document, asset_dir, slug, image_counter):
    images = []
    for blip in paragraph._p.xpath(".//a:blip"):
        embed = blip.get(qn("r:embed"))
        if not embed or embed not in document.part.related_parts:
            continue
        part = document.part.related_parts[embed]
        ext = Path(part.partname).suffix or ".png"
        image_counter[0] += 1
        filename = f"image{image_counter[0]}{ext}"
        output_path = asset_dir / filename
        output_path.write_bytes(part.blob)
        images.append(f"/input/assets/{slug}/{filename}")
    return images


def table_to_text(table):
    rows = []
    for row in table.rows:
        cells = [clean_inline_text(cell.text) for cell in row.cells]
        if any(cells):
            rows.append(" | ".join(cells))
    return " ".join(rows)


def table_images(table, document, asset_dir, slug, image_counter):
    images = []
    for blip in table._tbl.xpath(".//a:blip"):
        embed = blip.get(qn("r:embed"))
        if not embed or embed not in document.part.related_parts:
            continue
        part = document.part.related_parts[embed]
        ext = Path(part.partname).suffix or ".png"
        image_counter[0] += 1
        filename = f"image{image_counter[0]}{ext}"
        output_path = asset_dir / filename
        output_path.write_bytes(part.blob)
        images.append(f"/input/assets/{slug}/{filename}")
    return images


def normalize_option_text(value):
    return re.sub(r"^[A-Da-d]\)\s*", "", value.strip())


def parse_distractor(line):
    match = re.match(r"^([A-Da-d])\)\s*(.*?)(?:\s*\(Lesson:\s*(.*?)\))?$", line.strip())
    if not match:
        return None
    return {
        "id": match.group(1).lower(),
        "feedback": match.group(2).strip(),
        "lesson": (match.group(3) or "").strip() or None,
    }


def split_option_lines(text):
    text = text.strip()
    matches = list(re.finditer(r"(?m)([A-Da-d])\)\s*", text))
    if len(matches) <= 1:
        return [text] if text else []
    lines = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        lines.append(text[match.start():end].strip())
    return lines


def clean_inline_text(value):
    value = str(value or "").replace("\u00a0", " ")
    value = value.replace("\r", " ").replace("\n", " ").replace("\t", " ")
    return re.sub(r"\s+", " ", value).strip()


def format_run_text(run):
    text = run.text or ""
    if run.font.superscript:
        return text.translate(SUPERSCRIPT_MAP)
    if run.font.subscript:
        return text.translate(SUBSCRIPT_MAP)
    return text


def paragraph_text(paragraph):
    return clean_inline_text("".join(format_run_text(run) for run in paragraph.runs))


def append_text(existing, addition):
    existing = clean_inline_text(existing)
    addition = clean_inline_text(addition)
    return clean_inline_text(f"{existing} {addition}" if existing else addition)


def new_question(number, assessment_key):
    return {
        "id": f"{assessment_key}-q{number:02d}",
        "type": "mcq",
        "number": number,
        "level": "",
        "topic": "",
        "standard": "",
        "question": "",
        "image": None,
        "images": [],
        "imageDescription": None,
        "options": [],
        "answer": "",
        "explanation": "",
        "distractors": {},
        "correctAnswerText": "",
    }


def add_images(question, images):
    if not question or not images:
        return
    question["images"].extend(images)
    if not question["image"]:
        question["image"] = images[0]


def parse_docx(path):
    document = Document(path)
    title = next((paragraph_text(p) for p in document.paragraphs if paragraph_text(p)), path.stem)
    slug = slugify(title)
    asset_dir = ASSET_ROOT / slug
    if asset_dir.exists():
        shutil.rmtree(asset_dir)
    asset_dir.mkdir(parents=True, exist_ok=True)

    image_counter = [0]
    questions = []
    current = None
    mode = None

    for block in iter_blocks(document):
        if isinstance(block, Table):
            table_text = table_to_text(block)
            images = table_images(block, document, asset_dir, slug, image_counter)
            if current:
                if table_text:
                    current["question"] = append_text(current["question"], table_text)
                add_images(current, images)
            continue

        text = paragraph_text(block)
        images = paragraph_images(block, document, asset_dir, slug, image_counter)
        if not text and images:
            add_images(current, images)
            continue
        if not text:
            continue
        if set(text.replace("—", "-")) <= {"-"}:
            continue
        if text == title:
            continue

        question_match = re.match(r"^Question\s+(\d+)(?:\s*\((.*?)\))?:\s*(.*)$", text, re.I)
        if question_match:
            if current:
                questions.append(current)
            current = new_question(int(question_match.group(1)), slug)
            current["level"] = (question_match.group(2) or "").strip()
            current["topic"] = current["level"] or "General"
            current["question"] = clean_inline_text(question_match.group(3))
            add_images(current, images)
            mode = "question"
            continue

        if text.startswith("Standard Code:"):
            if current and current.get("question"):
                questions.append(current)
                current = None
            mode = "standard"
            pending_standard = text.split(":", 1)[1].strip()
            continue

        if text.startswith("Bloom"):
            pending_level = text.split(":", 1)[1].strip() if ":" in text else ""
            continue

        if text.startswith("Question Number:"):
            if current and current.get("question"):
                questions.append(current)
            number = int(re.search(r"\d+", text).group(0))
            current = new_question(number, slug)
            current["standard"] = locals().get("pending_standard", "")
            current["level"] = locals().get("pending_level", "")
            current["topic"] = current["standard"] or current["level"] or "General"
            mode = None
            continue

        if text == "Question:":
            mode = "question"
            continue

        if text == "Distractor:":
            mode = "distractor"
            continue

        if not current:
            continue

        if text.startswith("Correct Answer:"):
            answer_text = clean_inline_text(text.split(":", 1)[1])
            answer_match = re.match(r"^([A-Da-d])\)\s*(.*)$", answer_text)
            if answer_match:
                current["answer"] = answer_match.group(1).lower()
                current["correctAnswerText"] = clean_inline_text(answer_match.group(2))
            else:
                current["correctAnswerText"] = answer_text
            mode = None
            continue

        if text.startswith("Explanation:"):
            current["explanation"] = clean_inline_text(text.split(":", 1)[1])
            mode = None
            continue

        if mode == "distractor":
            parsed = parse_distractor(text)
            if parsed:
                current["distractors"][parsed["id"]] = {
                    "feedback": parsed["feedback"],
                    "lesson": parsed["lesson"] or current["topic"] or "Review",
                }
            continue

        option_lines = split_option_lines(text)
        if option_lines and all(re.match(r"^[A-Da-d]\)", line) for line in option_lines):
            for line in option_lines:
                option_id = line[0].lower()
                option_image = images[0] if len(option_lines) == 1 and images else None
                current["options"].append({
                    "id": option_id,
                    "label": normalize_option_text(line),
                    "image": option_image,
                })
            if not (len(option_lines) == 1 and images):
                add_images(current, images)
            mode = "options"
            continue

        add_images(current, images)

        if mode == "question":
            current["question"] = append_text(current["question"], text)

    if current:
        questions.append(current)

    for question in questions:
        question["topic"] = question["topic"] or question["standard"] or question["level"] or "General"
        if not question["correctAnswerText"] and question["answer"]:
            option = next((item for item in question["options"] if item["id"] == question["answer"]), None)
            question["correctAnswerText"] = option["label"] if option else ""

    return {
        "assessment": {
            "key": slug,
            "title": title,
            "sourceDocument": path.name,
            "durationMinutes": 30,
            "tools": {
                "calculator": True,
                "scratchpad": True,
                "imageZoom": True,
                "eliminator": True,
            },
            "inputFormatVersion": "mvp-1",
            "questionSource": "Converted from Word document for MVP input folder",
            "instructions": [
                "Choose one answer for every question.",
                "Use the question grid to move between questions.",
                "Submit when you have answered all questions.",
            ],
        },
        "questions": questions,
    }


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    catalog = []

    for source in SOURCE_FILES:
        payload = parse_docx(source)
        slug = payload["assessment"]["key"]
        output_path = OUTPUT_DIR / f"{slug}.json"
        output_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        catalog.append({
            "key": slug,
            "title": payload["assessment"]["title"],
            "sourceDocument": payload["assessment"]["sourceDocument"],
            "questionCount": len(payload["questions"]),
            "durationMinutes": payload["assessment"]["durationMinutes"],
            "path": f"input/assessments/{slug}.json",
        })
        print(f"Wrote {output_path} with {len(payload['questions'])} question(s).")

    CATALOG_PATH.write_text(json.dumps({"assessments": catalog}, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {CATALOG_PATH} with {len(catalog)} assessment(s).")


if __name__ == "__main__":
    main()
