-- DRAFT LOCAL - nao executar ainda.
-- Objetivo: fechamento do bolao com campeao (+10) e artilheiro (+7)
-- sem alterar guesses.points, participants, prorrogacao/penaltis ou a regra 5/3/0.

begin;

alter table public.participant_predictions
  add column if not exists champion_team_id uuid null references public.world_cup_teams(id),
  add column if not exists top_scorer_player_id uuid null references public.brazil_squad_players(id),
  add column if not exists champion_name text,
  add column if not exists champion_code text,
  add column if not exists champion_flag_emoji text,
  add column if not exists champion_flag_url text,
  add column if not exists top_scorer_name text,
  add column if not exists top_scorer_position text;

create table if not exists public.bolao_special_results (
  id boolean primary key default true,
  updated_at timestamp with time zone not null default now(),
  constraint bolao_special_results_single_row check (id = true)
);

alter table public.bolao_special_results
  add column if not exists champion_team_id uuid null references public.world_cup_teams(id),
  add column if not exists champion_name text,
  add column if not exists champion_defined boolean not null default false,
  add column if not exists top_scorer_player_id uuid null references public.brazil_squad_players(id),
  add column if not exists top_scorer_name text,
  add column if not exists top_scorer_defined boolean not null default false,
  add column if not exists updated_at timestamp with time zone not null default now();

insert into public.bolao_special_results (id)
values (true)
on conflict (id) do nothing;

alter table public.bolao_special_results enable row level security;

drop policy if exists "Public read bolao special results" on public.bolao_special_results;
drop policy if exists "Public write bolao special results" on public.bolao_special_results;

create policy "Public read bolao special results"
  on public.bolao_special_results for select
  using (true);

create policy "Public write bolao special results"
  on public.bolao_special_results for all
  using (true)
  with check (true);

drop function if exists public.get_rezende_leaderboard();
drop function if exists public.recalculate_bolao_points();

create or replace function public.recalculate_bolao_points()
returns table (
  participant_id uuid,
  participant_name text,
  store_sector text,
  match_points integer,
  champion_points integer,
  top_scorer_points integer,
  total_points integer,
  total_guesses integer,
  exact_scores integer,
  result_hits integer
)
language sql
security definer
set search_path = public
as $$
  with special as (
    select *
    from public.bolao_special_results
    where id = true
  ),
  scored as (
    select
      p.id as participant_id,
      p.name as participant_name,
      p.store_sector,
      coalesce(sum(
        case
          when m.status = 'encerrado'
            and m.home_score is not null
            and m.away_score is not null
            and g.home_score_guess = m.home_score
            and g.away_score_guess = m.away_score
            then 5
          when m.status = 'encerrado'
            and m.home_score is not null
            and m.away_score is not null
            and sign(g.home_score_guess - g.away_score_guess) = sign(m.home_score - m.away_score)
            then 3
          else 0
        end
      ), 0)::integer as match_points,
      count(g.id)::integer as total_guesses,
      coalesce(sum(case when m.status = 'encerrado'
        and m.home_score is not null
        and m.away_score is not null
        and g.home_score_guess = m.home_score
        and g.away_score_guess = m.away_score
        then 1 else 0 end), 0)::integer as exact_scores,
      coalesce(sum(case when m.status = 'encerrado'
        and m.home_score is not null
        and m.away_score is not null
        and not (g.home_score_guess = m.home_score and g.away_score_guess = m.away_score)
        and sign(g.home_score_guess - g.away_score_guess) = sign(m.home_score - m.away_score)
        then 1 else 0 end), 0)::integer as result_hits
    from public.participants p
    left join public.guesses g on g.participant_id = p.id
    left join public.matches m on m.id = g.match_id
    group by p.id, p.name, p.store_sector
  ),
  bonuses as (
    select
      p.id as participant_id,
      case
        when coalesce(s.champion_defined, false)
          and (
            (s.champion_team_id is not null and pp.champion_team_id = s.champion_team_id)
            or (
              s.champion_team_id is null
              and nullif(trim(coalesce(s.champion_name, '')), '') is not null
              and lower(trim(coalesce(pp.champion_name, ''))) = lower(trim(s.champion_name))
            )
          )
          then 10
        else 0
      end::integer as champion_points,
      case
        when coalesce(s.top_scorer_defined, false)
          and (
            (s.top_scorer_player_id is not null and pp.top_scorer_player_id = s.top_scorer_player_id)
            or (
              s.top_scorer_player_id is null
              and nullif(trim(coalesce(s.top_scorer_name, '')), '') is not null
              and lower(trim(coalesce(pp.top_scorer_name, ''))) = lower(trim(s.top_scorer_name))
            )
          )
          then 7
        else 0
      end::integer as top_scorer_points
    from public.participants p
    left join public.participant_predictions pp on pp.participant_id = p.id
    left join special s on true
  )
  select
    scored.participant_id,
    scored.participant_name,
    scored.store_sector,
    scored.match_points,
    coalesce(bonuses.champion_points, 0)::integer as champion_points,
    coalesce(bonuses.top_scorer_points, 0)::integer as top_scorer_points,
    (
      scored.match_points
      + coalesce(bonuses.champion_points, 0)
      + coalesce(bonuses.top_scorer_points, 0)
    )::integer as total_points,
    scored.total_guesses,
    scored.exact_scores,
    scored.result_hits
  from scored
  left join bonuses on bonuses.participant_id = scored.participant_id;
$$;

create or replace function public.get_rezende_leaderboard()
returns table (
  "position" bigint,
  participant_id uuid,
  name text,
  store_sector text,
  points integer,
  guesses integer
)
language sql
security definer
set search_path = public
as $$
  with ranking as (
    select *
    from public.recalculate_bolao_points()
  )
  select
    row_number() over (
      order by
        total_points desc,
        exact_scores desc,
        result_hits desc,
        total_guesses desc,
        participant_name asc
    ) as "position",
    ranking.participant_id,
    ranking.participant_name as name,
    ranking.store_sector,
    ranking.total_points as points,
    ranking.total_guesses as guesses
  from ranking
  order by
    ranking.total_points desc,
    ranking.exact_scores desc,
    ranking.result_hits desc,
    ranking.total_guesses desc,
    ranking.participant_name asc;
$$;

commit;
