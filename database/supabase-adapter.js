// Skeleton adapter for later production use.
// This file is not loaded by the MVP yet. It documents the target adapter shape
// used by the admin dashboard's current localDataAdapter.

export function createSupabaseDataAdapter(supabase) {
  return {
    async listAttempts() {
      const { data, error } = await supabase
        .from("attempts")
        .select("*, responses(*), ilp_plans(*)")
        .order("submitted_at", { ascending: false });

      if (error) throw error;
      return (data || []).map(mapAttemptFromSupabase);
    },

    async saveAttempt(attempt) {
      const { data, error } = await supabase.rpc("save_assessment_attempt", {
        attempt_payload: attempt
      });

      if (error) throw error;
      return data;
    },

    async listStudents() {
      const { data, error } = await supabase
        .from("external_students")
        .select("*")
        .order("display_name", { ascending: true });

      if (error) throw error;
      return (data || []).map((student) => ({
        id: student.external_student_id,
        name: student.display_name,
        section: student.section,
        metadata: student.metadata
      }));
    },

    async saveStudent(student) {
      const { data, error } = await supabase
        .from("external_students")
        .upsert({
          external_student_id: student.id,
          display_name: student.name,
          section: student.section || null,
          metadata: student.metadata || {}
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  };
}

function mapAttemptFromSupabase(row) {
  return row.raw_attempt && Object.keys(row.raw_attempt).length
    ? row.raw_attempt
    : {
      id: row.attempt_key || row.id,
      attemptId: row.attempt_key || row.id,
      submittedAt: row.submitted_at,
      startedAt: row.started_at,
      student: {
        id: row.external_student_id,
        name: row.student_name
      },
      score: {
        correct: row.score_correct,
        total: row.score_total,
        percentage: row.percentage,
        answered: row.answered,
        unanswered: row.unanswered,
        flagged: row.flagged
      },
      timing: {
        timeUsedSeconds: row.time_used_seconds,
        timeRemainingSeconds: row.time_remaining_seconds
      },
      summary: row.summary || {},
      responses: row.responses || [],
      ilp: row.ilp_plans?.[0]?.raw_ilp || null
    };
}
