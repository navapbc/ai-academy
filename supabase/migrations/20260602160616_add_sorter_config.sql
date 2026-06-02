-- add_sorter_config (P3.5): additive jsonb column holding scenario-sorter config
-- for cells whose interactive is a sorter (mirrors lab_config_json). Nullable, no
-- backfill, no FK. RLS unchanged — the existing authenticated SELECT policy on
-- public.modules covers the new column.
alter table public.modules add column if not exists sorter_config_json jsonb;
