-- Pin the trigger function's search_path.
--
-- Supabase's security linter flags any function without one. Unqualified names
-- otherwise resolve against whatever search_path the calling role happens to
-- have, which is how an object shadowing a built-in in another schema gets to
-- run instead of the real thing. tasks_touch only calls now(), which lives in
-- pg_catalog and is always searched, so an empty search_path costs it nothing.

alter function public.tasks_touch() set search_path = '';
