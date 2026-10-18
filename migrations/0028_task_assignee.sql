alter table tasks add column if not exists assignee_user_id text;
create index if not exists tasks_assignee_idx on tasks (chapter_id, assignee_user_id, status);
