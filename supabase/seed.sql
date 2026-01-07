-- Seed user with a fixed ID for reference
do $$
declare
  seed_user_id uuid := extensions.gen_random_uuid();
begin
  -- Insert user
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmation_sent_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    is_super_admin,
    is_sso_user
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    seed_user_id,
    'authenticated',
    'authenticated',
    'seed@example.com',
    extensions.crypt('password', extensions.gen_salt('bf')),
    now(),
    now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    '{"display_name": "Seed User"}'::jsonb,
    now(),
    now(),
    false,
    false
  );

  -- Insert identity for email provider
  insert into auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  values (
    extensions.gen_random_uuid(),
    seed_user_id,
    'seed@example.com',
    jsonb_build_object('sub', seed_user_id::text, 'email', 'seed@example.com'),
    'email',
    now(),
    now(),
    now()
  );

  -- Create seed world
  insert into worlds (
    name,
    owner_id,
    is_public,
    max_players,
    generator_version,
    registry_version
  )
  values (
    'Seed World',
    seed_user_id,
    true,
    8,
    1,
    1
  );
end $$;
