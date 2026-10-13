-- Im Supabase SQL Editor ausführen (einmalig). Eigene Tabellen, der Fixkosten-Planer bleibt unberührt.

create table if not exists haendler_inserate (
  id bigint primary key generated always as identity,
  erfasst date default current_date,
  quelle text,
  modell text,
  baujahr int,
  km int,
  preis int,
  anbieter text,
  tage int,
  notiz text,
  ausschliessen boolean default false,
  created_at timestamptz default now()
);

create table if not exists haendler_settings (
  id int primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

alter table haendler_inserate enable row level security;
alter table haendler_settings enable row level security;

create policy "haendler_inserate_all" on haendler_inserate for all using (true) with check (true);
create policy "haendler_settings_all" on haendler_settings for all using (true) with check (true);
