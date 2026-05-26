create extension if not exists "pgcrypto";

create table if not exists authorized_employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cpf_digits text unique not null,
  store_sector text not null,
  active boolean default true,
  created_at timestamp default now()
);

create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references authorized_employees(id),
  name text not null,
  store_sector text not null,
  phone text,
  created_at timestamp default now()
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  home_team text not null,
  away_team text not null,
  match_date timestamp not null,
  phase text,
  status text default 'aberto' check (status in ('aberto', 'ao vivo', 'encerrado')),
  home_score integer,
  away_score integer,
  created_at timestamp default now()
);

create unique index if not exists matches_unique_game
  on matches (home_team, away_team, match_date);

create table if not exists guesses (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid references participants(id) on delete cascade,
  match_id uuid references matches(id) on delete cascade,
  home_score_guess integer not null,
  away_score_guess integer not null,
  points integer default 0,
  created_at timestamp default now(),
  updated_at timestamp with time zone default now(),
  unique(participant_id, match_id)
);

alter table guesses
  add column if not exists updated_at timestamp with time zone default now();

create table if not exists participant_predictions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid references participants(id) on delete cascade unique not null,
  champion_team_id uuid references world_cup_teams(id),
  top_scorer_player_id uuid references brazil_squad_players(id),
  selected_at timestamp with time zone default now()
);

alter table brazil_squad_players
  add column if not exists photo_url text;

alter table participants enable row level security;
alter table matches enable row level security;
alter table guesses enable row level security;
alter table authorized_employees enable row level security;
alter table participant_predictions enable row level security;

drop policy if exists "Public read participants" on participants;
drop policy if exists "Public insert participants" on participants;
drop policy if exists "Public read matches" on matches;
drop policy if exists "Public read guesses" on guesses;
drop policy if exists "Public insert guesses" on guesses;
drop policy if exists "Public update guesses" on guesses;
drop policy if exists "Public read predictions" on participant_predictions;
drop policy if exists "Public insert predictions" on participant_predictions;

create policy "Public read participants"
  on participants for select
  using (true);

create policy "Public insert participants"
  on participants for insert
  with check (true);

create policy "Public read matches"
  on matches for select
  using (true);

create policy "Public read guesses"
  on guesses for select
  using (true);

create policy "Public insert guesses"
  on guesses for insert
  with check (true);

create policy "Public update guesses"
  on guesses for update
  using (true)
  with check (true);

create policy "Public read predictions"
  on participant_predictions for select
  using (true);

create policy "Public insert predictions"
  on participant_predictions for insert
  with check (true);

-- Função RPC para validar CPF de funcionário
drop function if exists check_employee_cpf(text);
create or replace function check_employee_cpf(cpf_input text)
returns table(id uuid, name text, store_sector text)
language sql
security invoker
as $$
  select id, name, store_sector
  from authorized_employees
  where cpf_digits = cpf_input
    and active = true
  limit 1;
$$;
