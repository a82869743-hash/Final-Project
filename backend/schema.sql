-- 🚀 STEP 0: ENSURE EXTENSIONS
create extension if not exists "pgcrypto";

-- 🚀 STEP 1: CREATE VEHICLES TABLE
create table if not exists public.vehicles (
  id text primary key,
  lat double precision,
  lng double precision,
  status text,
  last_updated timestamp default now()
);

-- 🚀 STEP 2: CREATE DISPATCH LOGS
create table if not exists public.dispatch_logs (
  id uuid default gen_random_uuid() primary key,
  vehicle_id text references public.vehicles(id) on delete cascade,
  hotspot_lat double precision,
  hotspot_lng double precision,
  eta double precision,
  risk_score double precision,
  risk_level text,
  timestamp timestamp default now()
);

-- 🚀 STEP 3: CREATE PREDICTIONS TABLE
create table if not exists public.predictions (
  id uuid default gen_random_uuid() primary key,
  risk_score double precision,
  lat double precision,
  lng double precision,
  timestamp timestamp default now()
);

-- 🚀 STEP 4: INSERT TEST DATA
insert into public.vehicles (id, lat, lng, status)
values ('test-1', 22.3072, 73.1812, 'available')
on conflict (id) do nothing;

-- 🚀 STEP 5: ADD DATABASE INDEXES & PRODUCTION OPTIMIZATIONS
create index if not exists idx_dispatch_time
on public.dispatch_logs (timestamp desc);

create index if not exists idx_dispatch_vehicle
on public.dispatch_logs (vehicle_id);

alter table public.dispatch_logs
add column if not exists status text default 'assigned';

alter table public.dispatch_logs
add column if not exists meta jsonb;

create index if not exists idx_dispatch_dedupe
on public.dispatch_logs (
  vehicle_id,
  hotspot_lat,
  hotspot_lng,
  date_trunc('minute', timestamp)
);

-- 🚀 ML UPGRADE: CREATE VEHICLE HISTORY TABLE
create table if not exists public.vehicle_history (
  id uuid default gen_random_uuid() primary key,
  vehicle_id text references public.vehicles(id) on delete cascade,
  lat double precision,
  lng double precision,
  status text,
  timestamp timestamp default now()
);

-- 🚀 ML UPGRADE: EXTEND PREDICTIONS TABLE
alter table public.predictions
add column if not exists time_of_day text,
add column if not exists day_of_week text,
add column if not exists vehicle_density int,
add column if not exists past_incidents int,
add column if not exists weather text,
add column if not exists predicted_level text,
add column if not exists confidence double precision,
add column if not exists model_version text,
add column if not exists drift_detected boolean,
add column if not exists actual_outcome text,
add column if not exists actual_response_time double precision;
