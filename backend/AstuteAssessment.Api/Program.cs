using System.Data;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Npgsql;
using NpgsqlTypes;

var builder = WebApplication.CreateBuilder(args);

var allowedOrigin = Environment.GetEnvironmentVariable("CORS_ORIGIN") ?? "*";
var studentView = Environment.GetEnvironmentVariable("STUDENT_VIEW") ?? "test_engine_registered_students";
var safeStudentView = Regex.IsMatch(studentView, @"^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$")
  ? studentView
  : "";
var databaseUrl = Environment.GetEnvironmentVariable("DATABASE_URL")
  ?? builder.Configuration.GetConnectionString("Postgres")
  ?? "";

builder.Services.AddCors(options =>
{
  options.AddDefaultPolicy(policy =>
  {
    if (allowedOrigin == "*")
    {
      policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
    }
    else
    {
      policy.WithOrigins(allowedOrigin).AllowAnyHeader().AllowAnyMethod();
    }
  });
});

builder.Services.AddSingleton(_ =>
{
  var connectionString = BuildNpgsqlConnectionString(databaseUrl);
  return NpgsqlDataSource.Create(connectionString);
});

var app = builder.Build();
app.UseCors();

app.MapGet("/", () => Results.Json(new
{
  ok = true,
  service = "Assessment Test Engine C# API",
  routes = new[]
  {
    "/health",
    "/api/student-filters",
    "/api/students",
    "/api/assessments",
    "/api/assignments",
    "/api/assignment-events",
    "/api/attempts"
  }
}));

app.MapGet("/health", async (NpgsqlDataSource db) =>
{
  await using var command = db.CreateCommand("select 1");
  await command.ExecuteScalarAsync();
  return Results.Json(new { ok = true, studentView = string.IsNullOrWhiteSpace(safeStudentView) ? null : safeStudentView });
});

app.MapGet("/api/debug", async (NpgsqlDataSource db) => Results.Json(await GetDebugSummary(db, safeStudentView)));
app.MapGet("/api/attempts", async (NpgsqlDataSource db) => Results.Json(await ListAttempts(db)));
app.MapGet("/api/assessments", async (NpgsqlDataSource db) => Results.Json(await ListAssessments(db)));
app.MapGet("/api/assignments", async (NpgsqlDataSource db) => Results.Json(await ListAssignments(db)));
app.MapGet("/api/assignment-events", async (NpgsqlDataSource db) => Results.Json(await ListAssignmentEvents(db)));
app.MapGet("/api/student-filters", async (NpgsqlDataSource db) => Results.Json(await ListStudentFilters(db, safeStudentView)));

app.MapGet("/api/students", async (
  HttpRequest request,
  NpgsqlDataSource db,
  string? search,
  string? school,
  string? grade,
  int? limit,
  int? offset,
  string? paged) =>
{
  var result = await ListStudents(db, safeStudentView, new StudentQuery(
    search ?? "",
    school ?? "",
    grade ?? "",
    limit ?? 1000,
    offset ?? 0,
    paged == "1"));
  return Results.Json(result);
});

app.MapPost("/api/students", async (JsonObject payload) =>
{
  return Results.Json(new
  {
    id = GetString(payload, "id"),
    name = GetString(payload, "name"),
    message = "Student registration is owned by the existing PostgreSQL student system."
  });
});

app.MapPost("/api/assessments/{key}/status", async (string key, JsonObject payload, NpgsqlDataSource db) =>
{
  var status = GetString(payload, "status").ToLowerInvariant();
  if (!new[] { "draft", "published", "archived" }.Contains(status))
  {
    return Results.BadRequest(new { error = "Invalid assessment status" });
  }

  await using var command = db.CreateCommand("""
    update test_engine_assessments
    set status = $2,
        updated_at = now()
    where external_assessment_key = $1
    returning external_assessment_key, title, status
  """);
  command.Parameters.AddWithValue(key);
  command.Parameters.AddWithValue(status);
  await using var reader = await command.ExecuteReaderAsync();
  if (!await reader.ReadAsync()) return Results.NotFound(new { error = "Assessment was not found" });

  return Results.Json(new
  {
    ok = true,
    key = reader.GetString(0),
    title = reader.GetString(1),
    status = reader.GetString(2)
  });
});

app.MapPost("/api/assignments", async (JsonObject payload, NpgsqlDataSource db) =>
{
  var saved = await SaveAssignments(db, payload);
  return Results.Json(saved, statusCode: 201);
});

app.MapPost("/api/assignments/cancel", async (JsonObject payload, NpgsqlDataSource db) =>
{
  var saved = await CancelAssignments(db, payload);
  return Results.Json(saved);
});

app.MapPost("/api/assignments/activity", async (JsonObject payload, NpgsqlDataSource db) =>
{
  var saved = await MarkAssignmentActivity(db, payload);
  return Results.Json(saved);
});

app.MapPost("/api/attempts", async (JsonObject payload, NpgsqlDataSource db) =>
{
  var saved = await SaveAttempt(db, payload);
  return Results.Json(saved, statusCode: 201);
});

app.Run();

static async Task<List<JsonObject>> ListAttempts(NpgsqlDataSource db)
{
  await using var command = db.CreateCommand("""
    select
      t.raw_attempt,
      t.student_external_id,
      t.student_name,
      t.assessment_title,
      s.email,
      s.school_name,
      s.grade_level
    from test_engine_attempts t
    left join test_engine_registered_students s
      on s.student_external_id = t.student_external_id
    order by t.submitted_at desc
    limit 10000
  """);

  var attempts = new List<JsonObject>();
  await using var reader = await command.ExecuteReaderAsync();
  while (await reader.ReadAsync())
  {
    var attempt = ParseJsonObject(reader.GetString(0));
    var student = GetObject(attempt, "student");
    SetIfMissing(attempt, "studentId", ReadString(reader, 1));
    SetIfMissing(attempt, "studentName", ReadString(reader, 2));
    SetIfMissing(attempt, "assessmentTitle", ReadString(reader, 3));
    SetIfMissing(student, "id", GetString(attempt, "studentId"));
    SetIfMissing(student, "name", GetString(attempt, "studentName"));
    SetIfMissing(student, "email", ReadString(reader, 4));
    SetIfMissing(student, "schoolName", ReadString(reader, 5));
    SetIfMissing(student, "gradeLevel", ReadString(reader, 6));
    attempt["student"] = student;
    attempts.Add(attempt);
  }
  return attempts;
}

static async Task<List<object>> ListAssessments(NpgsqlDataSource db)
{
  await using var command = db.CreateCommand("""
    select
      a.external_assessment_key,
      a.title,
      a.source_document,
      a.duration_minutes,
      a.status,
      a.input_format_version,
      coalesce(a.assignment_type_code, 'assessment') as assignment_type_code,
      at.display_name as assignment_type_label,
      at.supports_attempts,
      at.supports_due_date,
      at.supports_reassignment,
      at.supports_result,
      at.completion_rule,
      a.tools,
      a.instructions,
      count(aq.question_id)::int as question_count
    from test_engine_assessments a
    left join test_engine_assignment_types at
      on at.code = a.assignment_type_code
    left join test_engine_assessment_questions aq
      on aq.assessment_id = a.id
    where a.status <> 'archived'
    group by
      a.id,
      at.display_name,
      at.supports_attempts,
      at.supports_due_date,
      at.supports_reassignment,
      at.supports_result,
      at.completion_rule
    order by a.title
  """);

  var rows = new List<object>();
  await using var reader = await command.ExecuteReaderAsync();
  while (await reader.ReadAsync())
  {
    var type = ReadString(reader, 6);
    rows.Add(new
    {
      key = ReadString(reader, 0),
      title = ReadString(reader, 1),
      sourceDocument = ReadString(reader, 2),
      durationMinutes = ReadInt(reader, 3, 30),
      status = ReadString(reader, 4),
      inputFormatVersion = ReadString(reader, 5),
      assignmentType = type,
      assignmentTypeLabel = ReadString(reader, 7, FormatAssignmentTypeLabel(type)),
      assignmentTypeConfig = new
      {
        code = type,
        displayName = ReadString(reader, 7, FormatAssignmentTypeLabel(type)),
        supportsAttempts = ReadBool(reader, 8, true),
        supportsDueDate = ReadBool(reader, 9, true),
        supportsReassignment = ReadBool(reader, 10, true),
        supportsResult = ReadBool(reader, 11, true),
        completionRule = ReadString(reader, 12, "submission")
      },
      tools = ParseNode(ReadString(reader, 13, "{}")),
      instructions = ParseNode(ReadString(reader, 14, "[]")),
      questionCount = ReadInt(reader, 15)
    });
  }
  return rows;
}

static async Task<List<object>> ListAssignments(NpgsqlDataSource db)
{
  await using var command = db.CreateCommand("""
    select
      a.id,
      a.student_external_id,
      a.assigned_at,
      a.due_at,
      a.attempt_limit,
      a.status,
      a.metadata,
      s.display_name as student_name,
      s.email as student_email,
      ass.external_assessment_key,
      ass.title as assessment_title,
      count(distinct t.id)::int as assessment_attempt_count,
      count(distinct current_t.id)::int as current_assignment_attempt_count
    from test_engine_assignments a
    join test_engine_assessments ass
      on ass.id = a.assessment_id
    left join test_engine_registered_students s
      on s.student_external_id = a.student_external_id
    left join test_engine_attempts t
      on (t.assessment_id = a.assessment_id or (t.assessment_id is null and t.assessment_title = ass.title))
      and t.student_external_id = a.student_external_id
      and t.status in ('submitted', 'scored')
    left join test_engine_attempts current_t
      on current_t.assessment_id = a.assessment_id
      and current_t.student_external_id = a.student_external_id
      and current_t.raw_attempt->>'assignmentKey' = a.id::text
      and current_t.status in ('submitted', 'scored')
    group by
      a.id,
      a.student_external_id,
      a.assigned_at,
      a.due_at,
      a.attempt_limit,
      a.status,
      a.metadata,
      s.display_name,
      s.email,
      ass.external_assessment_key,
      ass.title
    order by a.assigned_at desc
    limit 2000
  """);

  var assignments = new List<object>();
  await using var reader = await command.ExecuteReaderAsync();
  while (await reader.ReadAsync())
  {
    var metadata = ParseJsonObject(ReadString(reader, 6, "{}"));
    var totalAssessmentAttemptCount = ReadInt(reader, 11);
    var attemptBaseline = GetAssignmentAttemptBaseline(metadata);
    var attemptCount = Math.Max(0, totalAssessmentAttemptCount - attemptBaseline);
    var attemptLimit = ReadInt(reader, 4, 1);
    var status = ReadString(reader, 5);
    if (status != "cancelled" && attemptCount >= attemptLimit) status = "completed";
    metadata["attemptBaseline"] = attemptBaseline;

    assignments.Add(new
    {
      id = reader.GetGuid(0),
      studentId = ReadString(reader, 1),
      studentName = ReadString(reader, 7, ReadString(reader, 1)),
      studentEmail = ReadString(reader, 8),
      assignedAt = ReadNullableDateTime(reader, 2),
      dueAt = ReadNullableDateTime(reader, 3),
      attemptLimit,
      status,
      assessmentKey = ReadString(reader, 9),
      assessmentTitle = ReadString(reader, 10),
      attemptCount,
      totalAssessmentAttemptCount,
      metadata
    });
  }
  return assignments;
}

static async Task<List<object>> ListAssignmentEvents(NpgsqlDataSource db)
{
  await using var command = db.CreateCommand("""
    select
      e.id,
      e.assignment_id,
      e.student_external_id,
      e.event_type,
      e.event_note,
      e.event_by,
      e.event_at,
      e.metadata,
      ass.external_assessment_key,
      ass.title as assessment_title,
      ass.assignment_type_code
    from test_engine_assignment_events e
    left join test_engine_assignments a
      on a.id = e.assignment_id
    left join test_engine_assessments ass
      on ass.id = a.assessment_id
    order by e.event_at desc
    limit 3000
  """);

  var events = new List<object>();
  await using var reader = await command.ExecuteReaderAsync();
  while (await reader.ReadAsync())
  {
    var metadata = ParseJsonObject(ReadString(reader, 7, "{}"));
    events.Add(new
    {
      id = reader.GetGuid(0),
      assignmentId = reader.IsDBNull(1) ? null : reader.GetGuid(1).ToString(),
      studentId = ReadString(reader, 2),
      eventType = ReadString(reader, 3),
      eventNote = ReadString(reader, 4),
      eventBy = ReadString(reader, 5),
      eventAt = ReadNullableDateTime(reader, 6),
      assessmentKey = ReadString(reader, 8, GetString(metadata, "assessmentKey")),
      assessmentTitle = ReadString(reader, 9, GetString(metadata, "assessmentTitle")),
      assignmentType = ReadString(reader, 10, GetString(metadata, "assignmentType", "assessment")),
      metadata
    });
  }
  return events;
}

static async Task<object> SaveAssignments(NpgsqlDataSource db, JsonObject payload)
{
  var studentIds = GetArray(payload, "studentIds").Select(node => node?.ToString()).Where(value => !string.IsNullOrWhiteSpace(value)).ToList();
  if (!studentIds.Any()) return new { ok = true, assigned = 0 };

  var assessment = GetObject(payload, "assessment");
  var metadataPayload = GetObject(payload, "metadata");
  var perStudentSettings = GetObject(payload, "perStudentSettings");
  await using var connection = await db.OpenConnectionAsync();
  await using var tx = await connection.BeginTransactionAsync();

  try
  {
    var assessmentId = await UpsertAssessment(connection, tx, assessment, metadataPayload);
    var dueAt = GetString(payload, "dueAt");
    var attemptLimit = GetInt(payload, "attemptLimit", 1);
    var assignedBy = GetString(payload, "assignedBy", "admin");
    var assigned = 0;

    foreach (var studentId in studentIds)
    {
      var studentSettings = perStudentSettings[studentId!] as JsonObject ?? new JsonObject();
      var studentDueAt = GetString(studentSettings, "dueAt", dueAt);
      var metadata = MergeObjects(metadataPayload, studentSettings);
      metadata["assignmentType"] = GetString(metadataPayload, "assignmentType", GetString(assessment, "assignmentType", "assessment"));
      metadata["assessment"] = assessment.DeepClone();

      await using var existingCommand = new NpgsqlCommand("""
        select
          a.id,
          a.assigned_at,
          a.attempt_limit,
          a.status,
          a.metadata,
          count(t.id)::int as total_attempt_count
        from test_engine_assignments a
        left join test_engine_attempts t
          on t.assessment_id = a.assessment_id
          and t.student_external_id = a.student_external_id
          and t.status in ('submitted', 'scored')
        where a.assessment_id = $1
          and a.student_external_id = $2
        group by
          a.id,
          a.assigned_at,
          a.attempt_limit,
          a.status,
          a.metadata
      """, connection, tx);
      existingCommand.Parameters.AddWithValue(assessmentId);
      existingCommand.Parameters.AddWithValue(studentId!);
      await using var existingReader = await existingCommand.ExecuteReaderAsync();
      if (await existingReader.ReadAsync())
      {
        var assignmentId = existingReader.GetGuid(0);
        var previousMetadata = ParseJsonObject(ReadString(existingReader, 4, "{}"));
        var totalAttemptCount = ReadInt(existingReader, 5);
        var previousBaseline = GetAssignmentAttemptBaseline(previousMetadata);
        var previousWindowAttempts = Math.Max(0, totalAttemptCount - previousBaseline);
        var history = GetArray(previousMetadata, "assignmentHistory");
        history.Add(new JsonObject
        {
          ["assignedAt"] = ReadNullableDateTime(existingReader, 1)?.ToString("O"),
          ["attemptLimit"] = ReadInt(existingReader, 2),
          ["status"] = ReadString(existingReader, 3),
          ["attemptBaseline"] = previousBaseline,
          ["attemptCount"] = previousWindowAttempts,
          ["totalAttemptCount"] = totalAttemptCount,
          ["replacedAt"] = DateTimeOffset.UtcNow.ToString("O")
        });
        await existingReader.CloseAsync();

        var nextMetadata = MergeObjects(previousMetadata, metadata);
        nextMetadata["attemptBaseline"] = totalAttemptCount;
        nextMetadata["assignmentHistory"] = history.DeepClone();

        await using var updateCommand = new NpgsqlCommand("""
          update test_engine_assignments
          set assigned_by = $1,
              assigned_at = now(),
              due_at = $2,
              attempt_limit = $3,
              status = 'assigned',
              metadata = $4
          where id = $5
        """, connection, tx);
        updateCommand.Parameters.AddWithValue(assignedBy);
        updateCommand.Parameters.AddWithValue(ParseNullableDateTime(studentDueAt) ?? (object)DBNull.Value);
        updateCommand.Parameters.AddWithValue(attemptLimit);
        AddJsonb(updateCommand, nextMetadata);
        updateCommand.Parameters.AddWithValue(assignmentId);
        await updateCommand.ExecuteNonQueryAsync();

        await InsertAssignmentEvent(connection, tx, assignmentId, studentId!, "reassigned", "Assignment access window was reassigned.", assignedBy, new JsonObject
        {
          ["assessmentKey"] = GetString(assessment, "key", "pre-test-for-demo"),
          ["assessmentTitle"] = GetString(assessment, "title", "Assessment"),
          ["attemptLimit"] = attemptLimit,
          ["previousWindowAttempts"] = previousWindowAttempts,
          ["totalAttemptCount"] = totalAttemptCount
        });
        assigned += 1;
        continue;
      }
      await existingReader.CloseAsync();

      await using var insertCommand = new NpgsqlCommand("""
        insert into test_engine_assignments (
          assessment_id,
          student_external_id,
          assigned_by,
          due_at,
          attempt_limit,
          status,
          metadata
        )
        values ($1,$2,$3,$4,$5,'assigned',$6)
        on conflict (assessment_id, student_external_id) do update set
          assigned_by = excluded.assigned_by,
          due_at = excluded.due_at,
          attempt_limit = excluded.attempt_limit,
          status = 'assigned',
          metadata = excluded.metadata
        returning id
      """, connection, tx);
      insertCommand.Parameters.AddWithValue(assessmentId);
      insertCommand.Parameters.AddWithValue(studentId!);
      insertCommand.Parameters.AddWithValue(assignedBy);
      insertCommand.Parameters.AddWithValue(ParseNullableDateTime(studentDueAt) ?? (object)DBNull.Value);
      insertCommand.Parameters.AddWithValue(attemptLimit);
      AddJsonb(insertCommand, metadata);
      var insertedId = (Guid)(await insertCommand.ExecuteScalarAsync() ?? Guid.Empty);
      await InsertAssignmentEvent(connection, tx, insertedId, studentId!, "assigned", "Assignment was assigned.", assignedBy, new JsonObject
      {
        ["assessmentKey"] = GetString(assessment, "key", "pre-test-for-demo"),
        ["assessmentTitle"] = GetString(assessment, "title", "Assessment"),
        ["attemptLimit"] = attemptLimit
      });
      assigned += 1;
    }

    await tx.CommitAsync();
    return new { ok = true, assigned };
  }
  catch
  {
    await tx.RollbackAsync();
    throw;
  }
}

static async Task<Guid> UpsertAssessment(NpgsqlConnection connection, NpgsqlTransaction tx, JsonObject assessment, JsonObject metadata)
{
  await using var command = new NpgsqlCommand("""
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
      input_format_version = excluded.input_format_version,
      assignment_type_code = excluded.assignment_type_code,
      tools = excluded.tools,
      instructions = excluded.instructions,
      updated_at = now()
    returning id
  """, connection, tx);
  command.Parameters.AddWithValue(GetString(assessment, "key", "pre-test-for-demo"));
  command.Parameters.AddWithValue(GetString(assessment, "title", "Assessment"));
  var sourceDocument = GetString(assessment, "sourceDocument");
  command.Parameters.AddWithValue(string.IsNullOrWhiteSpace(sourceDocument) ? DBNull.Value : sourceDocument);
  command.Parameters.AddWithValue(GetInt(assessment, "durationMinutes", 30));
  command.Parameters.AddWithValue(GetString(assessment, "inputFormatVersion", "mvp-1"));
  command.Parameters.AddWithValue(GetString(assessment, "assignmentType", GetString(metadata, "assignmentType", "assessment")));
  AddJsonb(command, GetObject(assessment, "tools"));
  AddJsonb(command, assessment["instructions"] ?? new JsonArray());
  return (Guid)(await command.ExecuteScalarAsync() ?? Guid.Empty);
}

static async Task<object> CancelAssignments(NpgsqlDataSource db, JsonObject payload)
{
  var ids = GetArray(payload, "assignmentIds").Select(item => Guid.TryParse(item?.ToString(), out var id) ? id : Guid.Empty).Where(id => id != Guid.Empty).ToArray();
  if (ids.Length == 0) return new { ok = true, cancelled = 0 };

  await using var connection = await db.OpenConnectionAsync();
  await using var tx = await connection.BeginTransactionAsync();
  try
  {
    await using var command = new NpgsqlCommand("""
      update test_engine_assignments
      set status = 'cancelled'
      where id = any($1::uuid[])
      returning id, student_external_id
    """, connection, tx);
    command.Parameters.AddWithValue(ids);
    var rows = new List<(Guid Id, string StudentId)>();
    await using var reader = await command.ExecuteReaderAsync();
    while (await reader.ReadAsync()) rows.Add((reader.GetGuid(0), ReadString(reader, 1)));
    await reader.CloseAsync();

    foreach (var row in rows)
    {
      await InsertAssignmentEvent(connection, tx, row.Id, row.StudentId, "unassigned", "Assignment access was removed.", "admin", new JsonObject());
    }

    await tx.CommitAsync();
    return new { ok = true, cancelled = rows.Count };
  }
  catch
  {
    await tx.RollbackAsync();
    throw;
  }
}

static async Task<object> MarkAssignmentActivity(NpgsqlDataSource db, JsonObject payload)
{
  var assignmentId = GetString(payload, "assignmentId", GetString(payload, "assignmentKey"));
  if (!Guid.TryParse(assignmentId, out var id)) return new { ok = false, updated = 0 };
  var activityAt = GetString(payload, "activityAt", DateTimeOffset.UtcNow.ToString("O"));
  var metadata = new JsonObject
  {
    ["lastActivityAt"] = activityAt,
    ["lastActivityEvent"] = GetString(payload, "activityType", "active")
  };

  await using var command = db.CreateCommand("""
    update test_engine_assignments
    set status = case
          when status = 'assigned' then 'started'
          else status
        end,
        metadata = metadata || $2::jsonb
    where id = $1
      and status <> 'cancelled'
    returning id
  """);
  command.Parameters.AddWithValue(id);
  AddJsonb(command, metadata);
  var updated = 0;
  await using var reader = await command.ExecuteReaderAsync();
  while (await reader.ReadAsync()) updated += 1;
  return new { ok = true, updated, activityAt };
}

static async Task<object> SaveAttempt(NpgsqlDataSource db, JsonObject attempt)
{
  await using var connection = await db.OpenConnectionAsync();
  await using var tx = await connection.BeginTransactionAsync();
  try
  {
    var score = GetObject(attempt, "score");
    var timing = GetObject(attempt, "timing");
    var student = GetObject(attempt, "student");
    var assessment = GetObject(attempt, "assessment");
    var attemptKey = GetString(attempt, "attemptId", GetString(attempt, "id", Guid.NewGuid().ToString()));
    var submittedAt = GetString(attempt, "submittedAt", DateTimeOffset.UtcNow.ToString("O"));
    var assignmentIdText = GetString(attempt, "assignmentKey", GetString(assessment, "assignmentKey"));
    Guid? assignmentId = Guid.TryParse(assignmentIdText, out var parsedAssignmentId) ? parsedAssignmentId : null;
    Guid? assessmentId = null;

    if (assignmentId.HasValue)
    {
      await using var assignmentCommand = new NpgsqlCommand("select assessment_id from test_engine_assignments where id = $1", connection, tx);
      assignmentCommand.Parameters.AddWithValue(assignmentId.Value);
      var value = await assignmentCommand.ExecuteScalarAsync();
      if (value is Guid id) assessmentId = id;
    }

    var assessmentKey = GetString(assessment, "assessmentKey", GetString(assessment, "key"));
    if (!assessmentId.HasValue && !string.IsNullOrWhiteSpace(assessmentKey))
    {
      await using var assessmentCommand = new NpgsqlCommand("select id from test_engine_assessments where external_assessment_key = $1", connection, tx);
      assessmentCommand.Parameters.AddWithValue(assessmentKey);
      var value = await assessmentCommand.ExecuteScalarAsync();
      if (value is Guid id) assessmentId = id;
    }

    attempt["attemptId"] = attemptKey;
    attempt["id"] = attemptKey;
    attempt["submittedAt"] = submittedAt;

    await using var insertAttempt = new NpgsqlCommand("""
      insert into test_engine_attempts (
        attempt_key,
        assessment_id,
        assessment_title,
        student_external_id,
        student_name,
        started_at,
        submitted_at,
        score_correct,
        score_total,
        percentage,
        answered,
        unanswered,
        time_used_seconds,
        time_remaining_seconds,
        summary,
        raw_attempt
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      on conflict (attempt_key) do update set
        assessment_id = excluded.assessment_id,
        submitted_at = excluded.submitted_at,
        score_correct = excluded.score_correct,
        score_total = excluded.score_total,
        percentage = excluded.percentage,
        answered = excluded.answered,
        unanswered = excluded.unanswered,
        time_used_seconds = excluded.time_used_seconds,
        time_remaining_seconds = excluded.time_remaining_seconds,
        summary = excluded.summary,
        raw_attempt = excluded.raw_attempt
      returning id
    """, connection, tx);
    insertAttempt.Parameters.AddWithValue(attemptKey);
    insertAttempt.Parameters.AddWithValue(assessmentId ?? (object)DBNull.Value);
    insertAttempt.Parameters.AddWithValue(GetString(assessment, "title", GetString(attempt, "assessmentTitle", "Assessment")));
    insertAttempt.Parameters.AddWithValue(GetString(student, "id", GetString(attempt, "studentId", "unknown-student")));
    insertAttempt.Parameters.AddWithValue(GetString(student, "name", GetString(attempt, "studentName", "Student")));
    insertAttempt.Parameters.AddWithValue(ParseNullableDateTime(GetString(attempt, "startedAt")) ?? (object)DBNull.Value);
    insertAttempt.Parameters.AddWithValue(ParseNullableDateTime(submittedAt) ?? DateTimeOffset.UtcNow);
    insertAttempt.Parameters.AddWithValue(GetInt(score, "correct"));
    insertAttempt.Parameters.AddWithValue(GetInt(score, "total"));
    insertAttempt.Parameters.AddWithValue(GetInt(score, "percentage"));
    insertAttempt.Parameters.AddWithValue(GetInt(score, "answered"));
    insertAttempt.Parameters.AddWithValue(GetInt(score, "unanswered"));
    insertAttempt.Parameters.AddWithValue(GetInt(timing, "timeUsedSeconds"));
    insertAttempt.Parameters.AddWithValue(GetInt(timing, "timeRemainingSeconds"));
    AddJsonb(insertAttempt, GetObject(attempt, "summary"));
    AddJsonb(insertAttempt, attempt);
    var attemptId = (Guid)(await insertAttempt.ExecuteScalarAsync() ?? Guid.Empty);

    if (assignmentId.HasValue && assessmentId.HasValue)
    {
      await UpdateAssignmentAfterAttempt(connection, tx, assignmentId.Value, assessmentId.Value, GetString(student, "id", GetString(attempt, "studentId", "unknown-student")), attemptKey, attempt);
    }

    await using (var deleteResponses = new NpgsqlCommand("delete from test_engine_responses where attempt_id = $1", connection, tx))
    {
      deleteResponses.Parameters.AddWithValue(attemptId);
      await deleteResponses.ExecuteNonQueryAsync();
    }

    foreach (var responseNode in GetArray(attempt, "responses"))
    {
      if (responseNode is not JsonObject response) continue;
      await using var responseCommand = new NpgsqlCommand("""
        insert into test_engine_responses (
          attempt_id,
          question_external_id,
          question_number,
          topic,
          selected_answer,
          selected_label,
          correct_answer,
          correct_label,
          is_correct,
          explanation,
          distractor_feedback
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      """, connection, tx);
      responseCommand.Parameters.AddWithValue(attemptId);
      responseCommand.Parameters.AddWithValue(GetDbString(response, "questionId"));
      var questionNumber = GetInt(response, "number");
      responseCommand.Parameters.AddWithValue(questionNumber == 0 ? DBNull.Value : questionNumber);
      responseCommand.Parameters.AddWithValue(GetDbString(response, "topic"));
      responseCommand.Parameters.AddWithValue(GetDbString(response, "selected"));
      responseCommand.Parameters.AddWithValue(GetDbString(response, "selectedLabel"));
      responseCommand.Parameters.AddWithValue(GetDbString(response, "correctAnswer"));
      responseCommand.Parameters.AddWithValue(GetDbString(response, "correctLabel"));
      responseCommand.Parameters.AddWithValue(GetBool(response, "isCorrect"));
      responseCommand.Parameters.AddWithValue(GetDbString(response, "explanation"));
      AddJsonb(responseCommand, response["distractorFeedback"] ?? JsonValue.Create((string?)null)!);
      await responseCommand.ExecuteNonQueryAsync();
    }

    if (attempt["ilp"] is JsonObject ilp)
    {
      await using (var deleteIlp = new NpgsqlCommand("delete from test_engine_ilp_plans where attempt_id = $1", connection, tx))
      {
        deleteIlp.Parameters.AddWithValue(attemptId);
        await deleteIlp.ExecuteNonQueryAsync();
      }
      await using var ilpCommand = new NpgsqlCommand("""
        insert into test_engine_ilp_plans (
          attempt_id,
          student_external_id,
          readiness_level,
          strengths,
          needs_review,
          priority_skills,
          teacher_notes,
          student_plan,
          raw_ilp
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      """, connection, tx);
      var summary = GetObject(attempt, "summary");
      ilpCommand.Parameters.AddWithValue(attemptId);
      ilpCommand.Parameters.AddWithValue(GetString(student, "id", GetString(attempt, "studentId", "unknown-student")));
      ilpCommand.Parameters.AddWithValue(GetDbString(ilp, "readinessLevel"));
      AddJsonb(ilpCommand, summary["strengths"] ?? new JsonArray());
      AddJsonb(ilpCommand, summary["needsReview"] ?? new JsonArray());
      AddJsonb(ilpCommand, ilp["prioritySkills"] ?? new JsonArray());
      AddJsonb(ilpCommand, ilp["teacherNotes"] ?? new JsonArray());
      AddJsonb(ilpCommand, ilp["studentPlan"] ?? new JsonArray());
      AddJsonb(ilpCommand, ilp);
      await ilpCommand.ExecuteNonQueryAsync();
    }

    await tx.CommitAsync();
    return new { ok = true, attemptId = attemptKey };
  }
  catch
  {
    await tx.RollbackAsync();
    throw;
  }
}

static async Task UpdateAssignmentAfterAttempt(NpgsqlConnection connection, NpgsqlTransaction tx, Guid assignmentId, Guid assessmentId, string studentId, string attemptKey, JsonObject attempt)
{
  var assessment = GetObject(attempt, "assessment");
  var score = GetObject(attempt, "score");
  await using var statusCommand = new NpgsqlCommand("""
    update test_engine_assignments a
    set status = case
      when greatest(0, completed.count - coalesce(nullif(a.metadata->>'attemptBaseline', '')::int, 0)) >= a.attempt_limit then 'completed'
      else 'assigned'
    end,
        metadata = (a.metadata - 'lastActivityAt' - 'lastActivityEvent') || jsonb_build_object('lastSubmittedAt', now())
    from (
      select count(*)::int as count
      from test_engine_attempts
      where assessment_id = $1
        and student_external_id = $2
        and status in ('submitted', 'scored')
    ) completed
    where a.id = $3
    returning a.status
  """, connection, tx);
  statusCommand.Parameters.AddWithValue(assessmentId);
  statusCommand.Parameters.AddWithValue(studentId);
  statusCommand.Parameters.AddWithValue(assignmentId);
  var nextStatus = (string?)await statusCommand.ExecuteScalarAsync() ?? "assigned";

  if (!string.IsNullOrWhiteSpace(GetString(attempt, "startedAt")))
  {
    await InsertAssignmentEvent(connection, tx, assignmentId, studentId, "started", "Student started assignment attempt.", "student", new JsonObject
    {
      ["attemptKey"] = attemptKey,
      ["startedAt"] = GetString(attempt, "startedAt"),
      ["assessmentTitle"] = GetString(assessment, "title", GetString(attempt, "assessmentTitle", "Assessment"))
    });
  }

  await InsertAssignmentEvent(connection, tx, assignmentId, studentId, "submitted", "Student submitted assignment attempt.", "student", new JsonObject
  {
    ["attemptKey"] = attemptKey,
    ["assessmentTitle"] = GetString(assessment, "title", GetString(attempt, "assessmentTitle", "Assessment")),
    ["scorePercentage"] = GetInt(score, "percentage")
  });

  if (nextStatus == "completed")
  {
    await InsertAssignmentEvent(connection, tx, assignmentId, studentId, "completed", "Assignment was marked completed.", "system", new JsonObject
    {
      ["attemptKey"] = attemptKey,
      ["assessmentTitle"] = GetString(assessment, "title", GetString(attempt, "assessmentTitle", "Assessment")),
      ["scorePercentage"] = GetInt(score, "percentage")
    });
  }
}

static async Task<object> ListStudents(NpgsqlDataSource db, string safeStudentView, StudentQuery options)
{
  if (string.IsNullOrWhiteSpace(safeStudentView))
  {
    return options.Paged ? new { items = Array.Empty<object>(), total = 0, limit = options.Limit, offset = options.Offset } : Array.Empty<object>();
  }

  var conditions = new List<string>();
  var parameters = new List<object>();
  if (!string.IsNullOrWhiteSpace(options.Search))
  {
    parameters.Add($"%{options.Search.Trim().ToLowerInvariant()}%");
    conditions.Add($"(lower(trim(display_name)) like ${parameters.Count} or lower(trim(student_external_id)) like ${parameters.Count} or lower(trim(coalesce(email, ''))) like ${parameters.Count})");
  }
  if (!string.IsNullOrWhiteSpace(options.School))
  {
    parameters.Add(options.School);
    conditions.Add($"coalesce(school_name, '') = ${parameters.Count}");
  }
  if (!string.IsNullOrWhiteSpace(options.Grade))
  {
    parameters.Add(options.Grade);
    conditions.Add($"coalesce(grade_level, '') = ${parameters.Count}");
  }

  var where = conditions.Count > 0 ? $"where {string.Join(" and ", conditions)}" : "";
  var total = 0;
  if (options.Paged)
  {
    await using var countCommand = db.CreateCommand($"select count(*)::int as total from {safeStudentView} {where}");
    foreach (var value in parameters) countCommand.Parameters.AddWithValue(value);
    total = Convert.ToInt32(await countCommand.ExecuteScalarAsync() ?? 0);
  }

  var limit = Math.Min(Math.Max(options.Limit, 1), 100);
  var offset = Math.Max(options.Offset, 0);
  var queryParameters = parameters.Concat(new object[] { limit, offset }).ToList();
  await using var command = db.CreateCommand($"""
    select *
    from {safeStudentView}
    {where}
    order by display_name
    limit ${queryParameters.Count - 1}
    offset ${queryParameters.Count}
  """);
  foreach (var value in queryParameters) command.Parameters.AddWithValue(value);

  var items = new List<object>();
  await using var reader = await command.ExecuteReaderAsync();
  while (await reader.ReadAsync())
  {
    items.Add(new
    {
      id = ReadColumnString(reader, "student_external_id"),
      name = ReadColumnString(reader, "display_name"),
      username = ReadColumnString(reader, "email", ReadColumnString(reader, "student_external_id")),
      email = ReadColumnString(reader, "email"),
      status = ReadColumnString(reader, "status"),
      gradeId = ReadColumnString(reader, "grade_external_id"),
      gradeLevel = ReadColumnString(reader, "grade_level"),
      section = ReadColumnString(reader, "section"),
      schoolId = ReadColumnString(reader, "school_external_id"),
      schoolName = ReadColumnString(reader, "school_name")
    });
  }

  if (!options.Paged) return items;
  return new { items, total, limit, offset };
}

static async Task<object> ListStudentFilters(NpgsqlDataSource db, string safeStudentView)
{
  if (string.IsNullOrWhiteSpace(safeStudentView)) return new { schools = Array.Empty<string>(), grades = Array.Empty<string>(), totalStudents = 0 };

  var schools = await ReadStringList(db, $"select distinct school_name from {safeStudentView} where school_name is not null and school_name <> '' order by school_name");
  var grades = await ReadStringList(db, $"select distinct grade_level from {safeStudentView} where grade_level is not null and grade_level <> '' order by grade_level");
  await using var totalCommand = db.CreateCommand($"select count(*)::int as total from {safeStudentView}");
  var totalStudents = Convert.ToInt32(await totalCommand.ExecuteScalarAsync() ?? 0);
  return new { schools, grades, totalStudents };
}

static async Task<List<string>> ReadStringList(NpgsqlDataSource db, string sql)
{
  await using var command = db.CreateCommand(sql);
  var rows = new List<string>();
  await using var reader = await command.ExecuteReaderAsync();
  while (await reader.ReadAsync()) rows.Add(ReadString(reader, 0));
  return rows;
}

static async Task<object> GetDebugSummary(NpgsqlDataSource db, string safeStudentView)
{
  var result = new Dictionary<string, object?>
  {
    ["ok"] = true,
    ["studentView"] = safeStudentView
  };
  if (!string.IsNullOrWhiteSpace(safeStudentView))
  {
    var filters = await ListStudentFilters(db, safeStudentView);
    result["studentFilters"] = filters;
  }
  await using var command = db.CreateCommand("select to_regclass('public.test_engine_assessments') as table_name");
  result["assessmentTable"] = await command.ExecuteScalarAsync();
  return result;
}

static async Task InsertAssignmentEvent(NpgsqlConnection connection, NpgsqlTransaction tx, Guid? assignmentId, string studentId, string eventType, string eventNote, string eventBy, JsonObject metadata)
{
  await using var command = new NpgsqlCommand("""
    insert into test_engine_assignment_events (
      assignment_id,
      student_external_id,
      event_type,
      event_note,
      event_by,
      metadata
    )
    values ($1,$2,$3,$4,$5,$6)
  """, connection, tx);
  command.Parameters.AddWithValue(assignmentId ?? (object)DBNull.Value);
  command.Parameters.AddWithValue(studentId);
  command.Parameters.AddWithValue(eventType);
  command.Parameters.AddWithValue(eventNote);
  command.Parameters.AddWithValue(eventBy);
  AddJsonb(command, metadata);
  await command.ExecuteNonQueryAsync();
}

static string BuildNpgsqlConnectionString(string value)
{
  if (string.IsNullOrWhiteSpace(value)) throw new InvalidOperationException("DATABASE_URL is required.");
  if (!value.StartsWith("postgres", StringComparison.OrdinalIgnoreCase)) return value;

  var uri = new Uri(value);
  var userInfo = uri.UserInfo.Split(':', 2);
  var builder = new NpgsqlConnectionStringBuilder
  {
    Host = uri.Host,
    Port = uri.Port > 0 ? uri.Port : 5432,
    Database = uri.AbsolutePath.TrimStart('/'),
    Username = Uri.UnescapeDataString(userInfo.ElementAtOrDefault(0) ?? ""),
    Password = Uri.UnescapeDataString(userInfo.ElementAtOrDefault(1) ?? ""),
    Pooling = true
  };

  var sslMode = Environment.GetEnvironmentVariable("DATABASE_SSL") == "false"
    ? SslMode.Disable
    : SslMode.Require;
  var query = ParseQuery(uri.Query);
  if (query.TryGetValue("sslmode", out var mode) && mode.Contains("disable", StringComparison.OrdinalIgnoreCase))
  {
    sslMode = SslMode.Disable;
  }
  builder.SslMode = sslMode;
  return builder.ConnectionString;
}

static void AddJsonb(NpgsqlCommand command, JsonNode node)
{
  command.Parameters.Add(new NpgsqlParameter
  {
    NpgsqlDbType = NpgsqlDbType.Jsonb,
    Value = node.ToJsonString()
  });
}

static Dictionary<string, string> ParseQuery(string query)
{
  return query.TrimStart('?')
    .Split('&', StringSplitOptions.RemoveEmptyEntries)
    .Select(part => part.Split('=', 2))
    .Where(parts => parts.Length == 2)
    .ToDictionary(
      parts => Uri.UnescapeDataString(parts[0]).ToLowerInvariant(),
      parts => Uri.UnescapeDataString(parts[1]));
}

static JsonObject ParseJsonObject(string value)
{
  if (string.IsNullOrWhiteSpace(value)) return new JsonObject();
  return JsonNode.Parse(value) as JsonObject ?? new JsonObject();
}

static JsonNode ParseNode(string value)
{
  if (string.IsNullOrWhiteSpace(value)) return new JsonObject();
  return JsonNode.Parse(value) ?? new JsonObject();
}

static JsonObject GetObject(JsonObject source, string key)
{
  return source[key] as JsonObject ?? new JsonObject();
}

static JsonArray GetArray(JsonObject source, string key)
{
  return source[key] as JsonArray ?? new JsonArray();
}

static JsonObject MergeObjects(params JsonObject[] objects)
{
  var result = new JsonObject();
  foreach (var obj in objects)
  {
    foreach (var item in obj)
    {
      result[item.Key] = item.Value?.DeepClone();
    }
  }
  return result;
}

static void SetIfMissing(JsonObject source, string key, string value)
{
  if (source[key] == null && !string.IsNullOrWhiteSpace(value)) source[key] = value;
}

static int GetAssignmentAttemptBaseline(JsonObject metadata)
{
  var baseline = GetInt(metadata, "attemptBaseline", -1);
  if (baseline >= 0) return baseline;
  var history = GetArray(metadata, "assignmentHistory");
  if (history.LastOrDefault() is JsonObject lastHistory)
  {
    return GetInt(lastHistory, "totalAttemptCount", GetInt(lastHistory, "attemptCount"));
  }
  return 0;
}

static object GetDbString(JsonObject source, string key)
{
  var value = GetString(source, key);
  return string.IsNullOrWhiteSpace(value) ? DBNull.Value : value;
}

static string GetString(JsonObject source, string key, string defaultValue = "")
{
  return source[key]?.GetValue<string>() ?? defaultValue;
}

static int GetInt(JsonObject source, string key, int defaultValue = 0)
{
  var node = source[key];
  if (node == null) return defaultValue;
  if (node is JsonValue value && value.TryGetValue<int>(out var intValue)) return intValue;
  return int.TryParse(node.ToString(), out var parsed) ? parsed : defaultValue;
}

static bool GetBool(JsonObject source, string key, bool defaultValue = false)
{
  var node = source[key];
  if (node == null) return defaultValue;
  if (node is JsonValue value && value.TryGetValue<bool>(out var boolValue)) return boolValue;
  return bool.TryParse(node.ToString(), out var parsed) ? parsed : defaultValue;
}

static DateTimeOffset? ParseNullableDateTime(string value)
{
  return DateTimeOffset.TryParse(value, out var parsed) ? parsed : null;
}

static string ReadString(NpgsqlDataReader reader, int index, string defaultValue = "")
{
  return reader.IsDBNull(index) ? defaultValue : Convert.ToString(reader.GetValue(index)) ?? defaultValue;
}

static string ReadColumnString(NpgsqlDataReader reader, string column, string defaultValue = "")
{
  var index = reader.GetOrdinal(column);
  return ReadString(reader, index, defaultValue);
}

static int ReadInt(NpgsqlDataReader reader, int index, int defaultValue = 0)
{
  return reader.IsDBNull(index) ? defaultValue : Convert.ToInt32(reader.GetValue(index));
}

static bool ReadBool(NpgsqlDataReader reader, int index, bool defaultValue)
{
  return reader.IsDBNull(index) ? defaultValue : Convert.ToBoolean(reader.GetValue(index));
}

static DateTimeOffset? ReadNullableDateTime(NpgsqlDataReader reader, int index)
{
  if (reader.IsDBNull(index)) return null;
  var value = reader.GetValue(index);
  return value switch
  {
    DateTimeOffset dto => dto,
    DateTime dt => new DateTimeOffset(dt),
    _ => null
  };
}

static string FormatAssignmentTypeLabel(string code)
{
  return code.ToLowerInvariant() switch
  {
    "pretest" => "Pre-test",
    "worksheet" => "Worksheet",
    "practice" => "Practice",
    "diagnostic" => "Diagnostic Test",
    "benchmark" => "Benchmark",
    "quiz" => "Quiz",
    _ => "Assessment"
  };
}

record StudentQuery(string Search, string School, string Grade, int Limit, int Offset, bool Paged);
