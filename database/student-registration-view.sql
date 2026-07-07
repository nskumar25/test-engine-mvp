set search_path to public;

create or replace view public.test_engine_registered_students as
select
  s."StudentId"::text as student_external_id,
  s."StudentFullName" as display_name,
  s."Email" as email,
  s."Phone" as phone,
  s."Status" as status,
  s."GradeId" as grade_id,
  g."GradeName" as grade_level,
  null::text as section,
  s."SchoolId" as school_id,
  sc."SchoolName" as school_name,
  s."ClientId" as client_id,
  s."ClassLinkSourcedId" as classlink_sourced_id,
  s."ClassLinkTenantId" as classlink_tenant_id,
  s."ClassLinkUserId" as classlink_user_id
from public."Student" s
left join public."Grade" g
  on g."GradeId" = s."GradeId"
left join public."School" sc
  on sc."SchoolId" = s."SchoolId";

-- The API expects at minimum:
-- student_external_id, display_name, grade_level, section
-- This database does not expose a section column in the exported schema,
-- so the API should treat section as optional unless a class/section table is added.
