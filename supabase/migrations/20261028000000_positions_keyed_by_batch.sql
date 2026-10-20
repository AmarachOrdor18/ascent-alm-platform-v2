-- A position id repeats every month-end (the same loan is reported again), so keying the row by it alone
-- made each new month's upload overwrite the previous month's book - and with it every earlier run's inputs.
-- Rows are now keyed by batch + position id; `data` (and so every reader) is unchanged.
alter table public.positions drop constraint if exists positions_id_matches_data;

update public.positions
   set id = (data->>'batchId') || ':' || (data->>'id')
 where id = data->>'id';

alter table public.positions
  add constraint positions_id_matches_data check (id = (data->>'batchId') || ':' || (data->>'id'));
