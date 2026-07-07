create schema if not exists public;
set search_path to public;

create extension if not exists pgcrypto with schema public;

create table if not exists test_engine_assessments (
  id uuid primary key default gen_random_uuid(),
  external_assessment_key text unique,
  title text not null,
  source_document text,
  duration_minutes integer not null default 30,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  input_format_version text not null default 'mvp-1',
  tools jsonb not null default '{}'::jsonb,
  instructions jsonb not null default '[]'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists test_engine_questions (
  id uuid primary key default gen_random_uuid(),
  external_question_key text unique,
  type text not null default 'mcq' check (type = 'mcq'),
  topic text,
  level text,
  question_text text not null,
  image_url text,
  image_description text,
  options jsonb not null default '[]'::jsonb,
  answer_key text not null,
  explanation text,
  distractors jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists test_engine_assessment_questions (
  assessment_id uuid not null references test_engine_assessments(id) on delete cascade,
  question_id uuid not null references test_engine_questions(id) on delete cascade,
  position integer not null,
  points numeric(8, 2) not null default 1,
  primary key (assessment_id, question_id),
  unique (assessment_id, position)
);

create table if not exists test_engine_assignments (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references test_engine_assessments(id) on delete cascade,
  student_external_id text not null,
  assigned_by text,
  assigned_at timestamptz not null default now(),
  due_at timestamptz,
  attempt_limit integer not null default 1,
  status text not null default 'assigned' check (status in ('assigned', 'started', 'completed', 'cancelled')),
  metadata jsonb not null default '{}'::jsonb,
  unique (assessment_id, student_external_id)
);

create table if not exists test_engine_attempts (
  id uuid primary key default gen_random_uuid(),
  attempt_key text not null unique,
  assessment_id uuid references test_engine_assessments(id) on delete set null,
  assessment_title text not null,
  student_external_id text not null,
  student_name text not null,
  started_at timestamptz,
  submitted_at timestamptz not null default now(),
  status text not null default 'submitted' check (status in ('started', 'submitted', 'scored', 'void')),
  score_correct integer not null default 0,
  score_total integer not null default 0,
  percentage integer not null default 0,
  answered integer not null default 0,
  unanswered integer not null default 0,
  time_used_seconds integer not null default 0,
  time_remaining_seconds integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  raw_attempt jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists test_engine_responses (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references test_engine_attempts(id) on delete cascade,
  question_external_id text,
  question_number integer,
  topic text,
  selected_answer text,
  selected_label text,
  correct_answer text,
  correct_label text,
  is_correct boolean not null default false,
  explanation text,
  distractor_feedback jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists test_engine_ilp_plans (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references test_engine_attempts(id) on delete cascade,
  student_external_id text not null,
  readiness_level text,
  strengths jsonb not null default '[]'::jsonb,
  needs_review jsonb not null default '[]'::jsonb,
  priority_skills jsonb not null default '[]'::jsonb,
  teacher_notes jsonb not null default '[]'::jsonb,
  student_plan jsonb not null default '[]'::jsonb,
  raw_ilp jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists test_engine_question_assets (
  id uuid primary key default gen_random_uuid(),
  question_id uuid references test_engine_questions(id) on delete cascade,
  asset_type text not null default 'image',
  storage_path text not null,
  public_url text,
  alt_text text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists test_engine_assignments_student_idx on test_engine_assignments(student_external_id);
create index if not exists test_engine_attempts_student_idx on test_engine_attempts(student_external_id);
create index if not exists test_engine_attempts_assessment_idx on test_engine_attempts(assessment_id);
create index if not exists test_engine_attempts_submitted_idx on test_engine_attempts(submitted_at desc);
create index if not exists test_engine_responses_attempt_idx on test_engine_responses(attempt_id);
create index if not exists test_engine_responses_topic_idx on test_engine_responses(topic);
create index if not exists test_engine_ilp_student_idx on test_engine_ilp_plans(student_external_id);

-- Optional integration view:
-- Replace registered_students with the real table/view from the existing registration database.
-- create or replace view test_engine_registered_students as
-- select student_id::text as student_external_id, full_name as display_name, grade_level, section
-- from registered_students;
