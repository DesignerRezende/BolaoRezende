insert into matches (home_team, away_team, match_date, phase, status, home_score, away_score)
values
  ('Brasil', 'México', '2026-06-10 16:00:00', 'Amistoso', 'aberto', null, null),
  ('Brasil', 'Japão', '2026-06-15 19:00:00', 'Fase de grupos', 'aberto', null, null),
  ('Brasil', 'Croácia', '2026-06-20 16:00:00', 'Fase de grupos', 'aberto', null, null),
  ('Brasil', 'Portugal', '2026-06-25 21:00:00', 'Fase de grupos', 'aberto', null, null),
  ('Brasil', 'Argentina', '2026-06-30 18:00:00', 'Oitavas de final', 'aberto', null, null)
on conflict (home_team, away_team, match_date) do update
set
  phase = excluded.phase,
  status = excluded.status,
  home_score = excluded.home_score,
  away_score = excluded.away_score;
