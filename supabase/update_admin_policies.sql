-- Policies temporarias para a tela admin usando a anon key publica.
-- Nao use service_role no front-end.
-- Estas policies sao amplas e servem para uso interno rapido, como solicitado.

drop policy if exists "Public insert matches" on matches;
drop policy if exists "Public update matches" on matches;
drop policy if exists "Public delete guesses" on guesses;
drop policy if exists "Public delete predictions" on participant_predictions;
drop policy if exists "Public delete participants" on participants;

create policy "Public insert matches"
  on matches for insert
  with check (true);

create policy "Public update matches"
  on matches for update
  using (true)
  with check (true);

create policy "Public delete guesses"
  on guesses for delete
  using (true);

create policy "Public delete predictions"
  on participant_predictions for delete
  using (true);

create policy "Public delete participants"
  on participants for delete
  using (true);
