create table if not exists block_events_audit (
  id bigserial primary key,
  world_id uuid not null references worlds(id) on delete cascade,
  section_id text not null,
  x smallint not null,
  y smallint not null,
  z smallint not null,
  previous_block_id smallint not null,
  new_block_id smallint not null,
  player_id uuid not null references auth.users(id) on delete set null,
  section_version bigint not null,
  created_at timestamptz not null default now()
);

create table if not exists moderation_logs (
  id bigserial primary key,
  world_id uuid null references worlds(id) on delete set null,
  actor_id uuid not null references auth.users(id) on delete set null,
  target_id uuid null references auth.users(id) on delete set null,
  action text not null,
  details jsonb null,
  created_at timestamptz not null default now()
);

create table if not exists world_thumbnails (
  world_id uuid primary key references worlds(id) on delete cascade,
  storage_path text not null,
  captured_at timestamptz not null default now(),
  captured_by uuid null references auth.users(id) on delete set null
);

create index if not exists block_events_audit_world_id_idx on block_events_audit(world_id);
create index if not exists block_events_audit_created_at_idx on block_events_audit(created_at);
create index if not exists moderation_logs_world_id_idx on moderation_logs(world_id);
create index if not exists moderation_logs_created_at_idx on moderation_logs(created_at);

alter table block_events_audit enable row level security;
alter table moderation_logs enable row level security;
alter table world_thumbnails enable row level security;
