# Database Migration Plan

The MVP currently uses local browser storage through `localDataAdapter` in `src/app.js`.

When moving to production, replace that adapter with a hosted adapter such as Supabase while keeping the dashboard UI and attempt schema mostly unchanged.

Recommended path:

1. Create a Supabase project.
2. Run `database/supabase-schema.sql`.
3. Store public Supabase URL and anon key in frontend config.
4. Replace `localDataAdapter` calls with the functions in `database/supabase-adapter.js`.
5. Add Row Level Security policies for teachers/admins before real student data is used.

The test engine should not become the main student registration system. It should store only the student fields needed for assessment attempts or map to an external student ID.

