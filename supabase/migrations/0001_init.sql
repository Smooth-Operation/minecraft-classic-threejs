create extension if not exists "pgcrypto";

create type world_session_status as enum ('online', 'draining', 'offline');
create type world_member_role as enum ('owner', 'member', 'builder');

create table if not exists worlds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  is_public boolean not null default true,
  max_players smallint not null default 8 check (max_players between 1 and 8),
  generator_version smallint not null,
  registry_version smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists world_members (
  world_id uuid not null references worlds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role world_member_role not null,
  invited_at timestamptz not null default now(),
  primary key (world_id, user_id)
);

create table if not exists world_bans (
  world_id uuid not null references worlds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  banned_by uuid null references auth.users(id) on delete set null,
  reason text null,
  banned_at timestamptz not null default now(),
  expires_at timestamptz null,
  primary key (world_id, user_id),
  check (expires_at is null or expires_at > banned_at)
);

create table if not exists world_sessions (
  world_id uuid primary key references worlds(id) on delete cascade,
  server_instance_id uuid not null,
  ws_url text not null,
  status world_session_status not null default 'online',
  player_count smallint not null default 0 check (player_count between 0 and 8),
  last_heartbeat timestamptz not null default now(),
  started_at timestamptz not null default now()
);

create table if not exists world_sections (
  world_id uuid not null references worlds(id) on delete cascade,
  section_id text not null,
  version bigint not null check (version > 0),
  blocks bytea not null check (octet_length(blocks) = 8192),
  updated_at timestamptz not null default now(),
  primary key (world_id, section_id)
);

create table if not exists world_players (
  world_id uuid not null references worlds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (world_id, user_id),
  check (last_seen >= joined_at)
);

create index if not exists worlds_owner_id_idx on worlds(owner_id);
create index if not exists worlds_is_public_idx on worlds(is_public);
create index if not exists world_members_user_id_idx on world_members(user_id);
create index if not exists world_bans_user_id_idx on world_bans(user_id);
create index if not exists world_sessions_status_heartbeat_idx
  on world_sessions(status, last_heartbeat);
create index if not exists world_players_world_id_idx on world_players(world_id);
create index if not exists world_players_last_seen_idx on world_players(last_seen);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists worlds_set_updated_at on worlds;
create trigger worlds_set_updated_at
before update on worlds
for each row
execute function set_updated_at();

alter table worlds enable row level security;
alter table world_members enable row level security;
alter table world_bans enable row level security;
alter table world_sessions enable row level security;
alter table world_sections enable row level security;
alter table world_players enable row level security;

create policy worlds_select_public_or_member on worlds
  for select
  using (
    is_public = true
    or owner_id = auth.uid()
    or exists (
      select 1 from world_members
      where world_members.world_id = worlds.id
        and world_members.user_id = auth.uid()
    )
  );

create policy worlds_insert_owner on worlds
  for insert
  with check (owner_id = auth.uid());

create policy worlds_update_owner on worlds
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy worlds_delete_owner on worlds
  for delete
  using (owner_id = auth.uid());

create policy world_members_select_own on world_members
  for select
  using (user_id = auth.uid());

create policy world_sessions_select_visible on world_sessions
  for select
  using (
    status = 'online'
    and last_heartbeat > now() - interval '60 seconds'
    and (
      exists (select 1 from worlds where id = world_sessions.world_id and is_public = true)
      or exists (select 1 from worlds where id = world_sessions.world_id and owner_id = auth.uid())
      or exists (
        select 1 from world_members
        where world_members.world_id = world_sessions.world_id
          and world_members.user_id = auth.uid()
      )
    )
  );

create policy world_players_select_visible on world_players
  for select
  using (
    exists (select 1 from worlds where id = world_players.world_id and is_public = true)
    or exists (select 1 from worlds where id = world_players.world_id and owner_id = auth.uid())
    or exists (
      select 1 from world_members
      where world_members.world_id = world_players.world_id
        and world_members.user_id = auth.uid()
    )
  );

create or replace function list_worlds(
  include_private boolean default false,
  limit_count integer default 50,
  offset_count integer default 0
)
returns table (
  id uuid,
  name text,
  owner_id uuid,
  is_public boolean,
  max_players smallint,
  player_count integer,
  status text,
  generator_version smallint,
  registry_version smallint,
  created_at timestamptz
)
language plpgsql
as $$
begin
  if limit_count < 1 or limit_count > 100 then
    raise exception 'INVALID_PARAMS';
  end if;

  if offset_count < 0 then
    raise exception 'INVALID_PARAMS';
  end if;

  if include_private and auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  return query
  select
    w.id,
    w.name,
    w.owner_id,
    w.is_public,
    w.max_players,
    coalesce(p.player_count, 0) as player_count,
    case when s.world_id is not null then 'online' else 'offline' end as status,
    w.generator_version,
    w.registry_version,
    w.created_at
  from worlds w
  left join world_sessions s
    on s.world_id = w.id
   and s.status = 'online'
   and s.last_heartbeat > now() - interval '60 seconds'
  left join lateral (
    select count(*)::integer as player_count
    from world_players wp
    where wp.world_id = w.id
  ) p on true
  where (
    (include_private = false and w.is_public = true)
    or (
      include_private = true
      and (
        w.is_public = true
        or w.owner_id = auth.uid()
        or exists (
          select 1 from world_members
          where world_members.world_id = w.id
            and world_members.user_id = auth.uid()
        )
      )
    )
  )
  order by w.created_at desc
  limit limit_count
  offset offset_count;
end;
$$;
