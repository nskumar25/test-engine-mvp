create extension if not exists pgcrypto with schema public;

create table if not exists test_engine_assignment_types (
  code text primary key,
  display_name text not null,
  is_active boolean not null default true,
  supports_attempts boolean not null default true,
  supports_due_date boolean not null default true,
  supports_reassignment boolean not null default true,
  supports_result boolean not null default true,
  completion_rule text not null default 'submission',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into test_engine_assignment_types (
  code,
  display_name,
  supports_attempts,
  supports_due_date,
  supports_reassignment,
  supports_result,
  completion_rule
)
values
  ('assessment', 'Assessment', true, true, true, true, 'attempt_limit_or_submission'),
  ('pretest', 'Pre-test', true, true, true, true, 'final_submission'),
  ('worksheet', 'Worksheet', false, true, true, true, 'submission'),
  ('practice', 'Practice', true, false, true, true, 'activity_completion'),
  ('diagnostic', 'Diagnostic Test', true, true, true, true, 'final_submission'),
  ('benchmark', 'Benchmark', true, true, true, true, 'final_submission'),
  ('quiz', 'Quiz', true, true, true, true, 'final_submission')
on conflict (code) do update set
  display_name = excluded.display_name,
  supports_attempts = excluded.supports_attempts,
  supports_due_date = excluded.supports_due_date,
  supports_reassignment = excluded.supports_reassignment,
  supports_result = excluded.supports_result,
  completion_rule = excluded.completion_rule,
  updated_at = now();

alter table test_engine_assessments
  add column if not exists assignment_type_code text;

update test_engine_assessments
set assignment_type_code = case
  when lower(title) like '%worksheet%' then 'worksheet'
  when lower(title) like '%practice%' then 'practice'
  when lower(title) like '%diagnostic%' then 'diagnostic'
  when lower(title) like '%benchmark%' then 'benchmark'
  when lower(title) like '%quiz%' then 'quiz'
  when lower(title) like '%pretest%' or lower(title) like '%pre-test%' then 'pretest'
  else 'assessment'
end
where assignment_type_code is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'test_engine_assessments_assignment_type_fk'
  ) then
    alter table test_engine_assessments
      add constraint test_engine_assessments_assignment_type_fk
      foreign key (assignment_type_code)
      references test_engine_assignment_types(code)
      on update cascade
      on delete set null;
  end if;
end $$;

create table if not exists test_engine_assignment_events (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references test_engine_assignments(id) on delete cascade,
  student_external_id text not null,
  event_type text not null,
  event_note text,
  event_by text,
  event_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists test_engine_assignment_events_assignment_idx
  on test_engine_assignment_events(assignment_id, event_at desc);

create index if not exists test_engine_assignment_events_student_idx
  on test_engine_assignment_events(student_external_id, event_at desc);

create index if not exists test_engine_assignment_events_type_idx
  on test_engine_assignment_events(event_type);

create index if not exists test_engine_assessments_assignment_type_idx
  on test_engine_assessments(assignment_type_code);
