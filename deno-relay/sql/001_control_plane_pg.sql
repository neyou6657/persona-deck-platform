create extension if not exists vector;

create table if not exists personas (
  persona_id text primary key,
  display_name text not null,
  description text not null default '',
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists conversations (
  conversation_id uuid primary key,
  user_id text not null,
  persona_id text not null references personas(persona_id) on delete cascade,
  title text not null,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_preview text
);

create index if not exists conversations_user_persona_updated_idx
  on conversations (user_id, persona_id, updated_at desc);

create table if not exists conversation_states (
  conversation_id uuid primary key references conversations(conversation_id) on delete cascade,
  persona_id text not null references personas(persona_id) on delete cascade,
  previous_response_id text,
  last_run_id uuid,
  updated_at timestamptz not null default now()
);

create table if not exists messages (
  message_id uuid primary key,
  conversation_id uuid not null references conversations(conversation_id) on delete cascade,
  persona_id text not null references personas(persona_id) on delete cascade,
  role text not null,
  content text not null,
  client_message_id text,
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_created_idx
  on messages (conversation_id, created_at asc);

create table if not exists runs (
  run_id uuid primary key,
  conversation_id uuid not null references conversations(conversation_id) on delete cascade,
  persona_id text not null references personas(persona_id) on delete cascade,
  agent_instance_id text,
  status text not null,
  prompt text not null,
  reply text,
  error text,
  usage jsonb,
  raw jsonb,
  model text,
  response_id text,
  assistant_message_id uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists runs_conversation_created_idx
  on runs (conversation_id, created_at asc);

create table if not exists conversation_active_runs (
  conversation_id uuid primary key references conversations(conversation_id) on delete cascade,
  run_id uuid not null references runs(run_id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists message_dedupes (
  user_id text not null,
  conversation_id uuid not null references conversations(conversation_id) on delete cascade,
  client_message_id text not null,
  run_id uuid not null references runs(run_id) on delete cascade,
  message_id uuid not null references messages(message_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, conversation_id, client_message_id)
);

create table if not exists agent_instances (
  instance_id text primary key,
  agent_id text not null,
  persona_ids jsonb not null default '[]'::jsonb,
  capabilities jsonb not null default '{}'::jsonb,
  version text,
  status text not null,
  connected_at timestamptz not null,
  last_heartbeat_at timestamptz not null,
  disconnected_at timestamptz,
  disconnect_reason text
);

create index if not exists agent_instances_status_idx
  on agent_instances (status, last_heartbeat_at desc);

create table if not exists agent_configs (
  agent_id text primary key,
  runtime text not null default 'codex_cli',
  api_kind text not null default 'responses',
  worker_secret text not null default '',
  space_repo_id text not null default '',
  model text not null default 'gpt-5.3-codex',
  api_base_url text not null default '',
  api_key text not null default '',
  system_prompt text not null default '',
  temperature double precision not null default 0.2,
  store boolean not null default true,
  enabled_skills jsonb not null default '[]'::jsonb,
  restart_generation integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table if exists agent_configs
  add column if not exists api_kind text not null default 'responses';
alter table if exists agent_configs
  add column if not exists worker_secret text not null default '';
alter table if exists agent_configs
  add column if not exists space_repo_id text not null default '';

create table if not exists admin_sessions (
  session_id_hash text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now()
);

create table if not exists persona_knowledge_docs (
  doc_id uuid primary key,
  persona_id text not null references personas(persona_id) on delete cascade,
  title text not null,
  body text not null,
  source text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536),
  updated_at timestamptz not null default now()
);

create index if not exists persona_knowledge_docs_persona_updated_idx
  on persona_knowledge_docs (persona_id, updated_at desc);

create table if not exists persona_memories (
  memory_id uuid primary key,
  persona_id text not null references personas(persona_id) on delete cascade,
  conversation_id uuid references conversations(conversation_id) on delete set null,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

create index if not exists persona_memories_persona_created_idx
  on persona_memories (persona_id, created_at desc);
