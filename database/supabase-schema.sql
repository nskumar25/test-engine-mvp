create table if not exists external_students (
  id uuid primary key default gen_random_uuid(),
  external_student_id text not null unique,
  display_name text not null,
  section text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists assessments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_document text,
  duration_minutes integer not null default 30,
  status text not null default 'draft',
  input_format_version text not null default 'mvp-1',
  tools jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  external_question_id text,
  type text not null default 'mcq',
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

create table if not exists assessment_questions (
  assessment_id uuid not null references assessments(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  position integer not null,
  points numeric not null default 1,
  primary key (assessment_id, question_id)
);

create table if not exists attempts (
  id uuid primary key default gen_random_uuid(),
  attempt_key text unique,
  assessment_id uuid references assessments(id) on delete set null,
  external_student_id text not null,
  student_name text not null,
  started_at timestamptz,
  submitted_at timestamptz,
  status text not null default 'submitted',
  score_correct integer not null default 0,
  score_total integer not null default 0,
  percentage integer not null default 0,
  answered integer not null default 0,
  unanswered integer not null default 0,
  flagged integer not null default 0,
  time_used_seconds integer not null default 0,
  time_remaining_seconds integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  raw_attempt jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists responses (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references attempts(id) on delete cascade,
  question_external_id text,
  question_number integer,
  topic text,
  selected_answer text,
  selected_label text,
  correct_answer text,
  correct_label text,
  is_correct boolean not null default false,
  is_flagged boolean not null default false,
  explanation text,
  distractor_feedback jsonb,
  created_at timestamptz not null default now()
);

create table if not exists ilp_plans (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references attempts(id) on delete cascade,
  readiness_level text,
  strengths jsonb not null default '[]'::jsonb,
  needs_review jsonb not null default '[]'::jsonb,
  priority_skills jsonb not null default '[]'::jsonb,
  teacher_notes jsonb not null default '[]'::jsonb,
  student_plan jsonb not null default '[]'::jsonb,
  raw_ilp jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists question_assets (
  id uuid primary key default gen_random_uuid(),
  question_id uuid references questions(id) on delete cascade,
  asset_type text not null default 'image',
  storage_path text not null,
  alt_text text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists attempts_external_student_id_idx on attempts(external_student_id);
create index if not exists attempts_assessment_id_idx on attempts(assessment_id);
create index if not exists attempts_submitted_at_idx on attempts(submitted_at);
create index if not exists responses_attempt_id_idx on responses(attempt_id);
create index if not exists responses_topic_idx on responses(topic);

