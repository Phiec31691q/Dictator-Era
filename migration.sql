create table public.de_profiles (
 user_id uuid primary key references auth.users(id),
 username text not null check (char_length(username) between 3 and 18),
 username_key text not null unique,
 country text not null check (country ~ '^[A-Z]{2}$'),
 device_hash text not null unique,
 recovery_hash text not null,
 gold integer not null default 0 check (gold >= 0),
 victories integer not null default 0 check (victories >= 0),
 is_test boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.de_campaigns (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.de_profiles(user_id),
 player integer not null check (player between 1 and 241),
 scenario text not null check (scenario in ('modern','iron','steel','equal','fracture','peace')),
 difficulty numeric not null check (difficulty in (0.75,1,1.3)),
 seed integer not null,
 status text not null default 'active' check (status in ('active','abandoned','finished')),
 month_count integer not null default 0 check (month_count >= 0),
 land integer not null default 0 check (land between 0 and 245117),
 checkpoints integer not null default 0,
 started_at timestamptz not null default now(),
 last_checkpoint timestamptz,
 finished_at timestamptz
);
create unique index de_campaigns_one_active on public.de_campaigns(user_id) where status='active';
create index de_campaigns_user_history on public.de_campaigns(user_id,started_at desc);
create index de_profiles_ranking on public.de_profiles(gold desc,created_at) where not is_test;
create table public.de_rate_limits (
 key text primary key,
 window_start timestamptz not null default now(),
 hits integer not null default 1
);
alter table public.de_profiles enable row level security;
alter table public.de_campaigns enable row level security;
alter table public.de_rate_limits enable row level security;
revoke all on public.de_profiles,public.de_campaigns,public.de_rate_limits from anon,authenticated;
grant all on public.de_profiles,public.de_campaigns,public.de_rate_limits to service_role;

create function public.de_rate_limit(p_key text,p_limit integer,p_seconds integer) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
 insert into public.de_rate_limits(key) values(p_key)
 on conflict(key) do update set
 hits=case when de_rate_limits.window_start < now()-make_interval(secs=>p_seconds) then 1 else de_rate_limits.hits+1 end,
 window_start=case when de_rate_limits.window_start < now()-make_interval(secs=>p_seconds) then now() else de_rate_limits.window_start end
 returning hits into n;
 return n<=p_limit;
end; $$;

create function public.de_start_campaign(p_user uuid,p_player integer,p_scenario text,p_difficulty numeric,p_seed integer) returns public.de_campaigns
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.de_campaigns;
begin
 perform 1 from public.de_profiles where user_id=p_user for update;
 update public.de_campaigns set status='abandoned' where user_id=p_user and status='active';
 insert into public.de_campaigns(user_id,player,scenario,difficulty,seed)
 values(p_user,p_player,p_scenario,p_difficulty,p_seed) returning * into c;
 return c;
end; $$;

create function public.de_checkpoint(p_user uuid,p_id uuid,p_month integer,p_land integer) returns public.de_campaigns
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.de_campaigns;
begin
 select * into c from public.de_campaigns where id=p_id and user_id=p_user for update;
 if not found or c.status <> 'active' then raise exception 'CAMPAIGN_INACTIVE'; end if;
 if p_month<c.month_count or p_month>100000 or p_land<0 or p_land>245117 then raise exception 'INVALID_PROGRESS'; end if;
 if p_month*10 > extract(epoch from now()-c.started_at)+45 then raise exception 'IMPOSSIBLE_TIME'; end if;
 if c.last_checkpoint is null or c.last_checkpoint<now()-interval '60 seconds' then
  update public.de_campaigns set month_count=p_month,land=p_land,checkpoints=checkpoints+1,last_checkpoint=now()
  where id=p_id returning * into c;
 end if;
 return c;
end; $$;

create function public.de_complete_campaign(p_user uuid,p_id uuid) returns public.de_profiles
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.de_campaigns; p public.de_profiles;
begin
 select * into c from public.de_campaigns where id=p_id and user_id=p_user for update;
 if not found then raise exception 'CAMPAIGN_NOT_FOUND'; end if;
 if c.status='finished' then select * into p from public.de_profiles where user_id=p_user; return p; end if;
 if c.status<>'active' or c.checkpoints<3 or c.month_count<12 or c.started_at>now()-interval '10 minutes' then
  raise exception 'MORE_PLAY_REQUIRED';
 end if;
 update public.de_campaigns set status='finished',finished_at=now(),land=245117 where id=p_id;
 update public.de_profiles set gold=gold+50,victories=victories+1 where user_id=p_user returning * into p;
 return p;
end; $$;
revoke all on function public.de_rate_limit(text,integer,integer),public.de_start_campaign(uuid,integer,text,numeric,integer),public.de_checkpoint(uuid,uuid,integer,integer),public.de_complete_campaign(uuid,uuid) from public,anon,authenticated;
grant execute on function public.de_rate_limit(text,integer,integer),public.de_start_campaign(uuid,integer,text,numeric,integer),public.de_checkpoint(uuid,uuid,integer,integer),public.de_complete_campaign(uuid,uuid) to service_role;
