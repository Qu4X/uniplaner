-- Supabase Schema for Multi-Tenant Schedule Proposal Voting
-- Specs: docs/specs/voting-supabase.md

create table if not exists tenants (
  id text primary key,                 -- e.g. 'umg_wn', 'sggw_wmw', 'agh_wtk'
  vote_threshold int not null default 10
);

-- Seed initial tenants
insert into tenants (id, vote_threshold)
values 
  ('umg_wn', 10),
  ('sggw_wmw', 10),
  ('agh_wtk', 10)
on conflict (id) do update 
  set vote_threshold = excluded.vote_threshold;

create table if not exists proposals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  tenant_id text not null references tenants(id),
  plan_id text not null,
  group_name text not null,
  lesson_id text not null,             -- deterministic SHA-256 from core/ids.py
  subject text not null,
  scope text not null check (scope in ('single', 'permanent')),
  target_date date,                    -- required when scope = 'single'
  original_day_of_week text not null,
  original_start_time text not null,
  original_end_time text not null,
  new_day_of_week text not null check (new_day_of_week in ('MON','TUE','WED','THU','FRI','SAT','SUN')),
  new_start_time text not null,        -- 'HH:MM'
  new_end_time text not null,          -- 'HH:MM'
  new_room text,
  reason text check (char_length(reason) <= 500),
  plan_version_token text,             -- plan version token when proposed
  votes_count int not null default 0,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected'))
);

create table if not exists votes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  proposal_id uuid not null references proposals(id) on delete cascade,
  voter_token text not null,
  unique(proposal_id, voter_token)
);

-- Performance indices
create index if not exists idx_proposals_tenant_plan_group on proposals(tenant_id, plan_id, group_name);
create index if not exists idx_votes_proposal on votes(proposal_id);
create index if not exists idx_votes_token on votes(voter_token);

-- Enable RLS
alter table tenants enable row level security;
alter table proposals enable row level security;
alter table votes enable row level security;

-- Policies for anon role
create policy tenants_select on tenants for select using (true);

create policy proposals_select on proposals for select using (true);
create policy proposals_insert on proposals for insert
  with check (status = 'pending' and votes_count = 0);

-- Note: direct SELECT/INSERT/DELETE on votes is restricted from anon.
-- Voting and retracting is managed via secure RPC functions below to prevent token harvesting or unauthorized vote deletions.

-- Vote counter & auto-approval trigger
create or replace function update_proposal_vote_count()
returns trigger
security definer
set search_path = public
as $$
declare
    t_prop_id uuid;
    v_count int;
    req_threshold int;
    t_id text;
begin
    t_prop_id := coalesce(new.proposal_id, old.proposal_id);

    select tenant_id into t_id from proposals where id = t_prop_id;
    select coalesce(vote_threshold, 10) into req_threshold from tenants where id = t_id;

    select count(*) into v_count from votes where proposal_id = t_prop_id;

    update proposals
    set 
        votes_count = v_count,
        status = case when v_count >= req_threshold then 'approved' else 'pending' end
    where id = t_prop_id and status != 'rejected';

    return coalesce(new, old);
end;
$$ language plpgsql;

drop trigger if exists trg_vote_change on votes;
create trigger trg_vote_change
after insert or delete on votes
for each row
execute function update_proposal_vote_count();

-- Secure RPC procedures for voting without user login
create or replace function cast_vote(p_proposal_id uuid, p_voter_token text)
returns json
security definer
set search_path = public
as $$
declare
    v_status text;
begin
    if p_voter_token is null or length(trim(p_voter_token)) < 10 then
        return json_build_object('ok', false, 'error', 'Invalid voter token');
    end if;

    select status into v_status from proposals where id = p_proposal_id;
    if v_status is null then
        return json_build_object('ok', false, 'error', 'Proposal not found');
    end if;
    if v_status != 'pending' then
        return json_build_object('ok', false, 'error', 'Proposal is not pending');
    end if;

    insert into votes (proposal_id, voter_token)
    values (p_proposal_id, p_voter_token)
    on conflict (proposal_id, voter_token) do nothing;

    return json_build_object('ok', true);
end;
$$ language plpgsql;

create or replace function retract_vote(p_proposal_id uuid, p_voter_token text)
returns json
security definer
set search_path = public
as $$
begin
    if p_voter_token is null or length(trim(p_voter_token)) < 10 then
        return json_build_object('ok', false, 'error', 'Invalid voter token');
    end if;

    delete from votes
    where proposal_id = p_proposal_id and voter_token = p_voter_token;

    return json_build_object('ok', true);
end;
$$ language plpgsql;

create or replace function get_user_votes(p_voter_token text, p_proposal_ids uuid[])
returns table (proposal_id uuid)
security definer
set search_path = public
as $$
begin
    if p_voter_token is null or length(trim(p_voter_token)) < 10 then
        return;
    end if;

    return query
    select v.proposal_id
    from votes v
    where v.voter_token = p_voter_token
      and (p_proposal_ids is null or v.proposal_id = any(p_proposal_ids));
end;
$$ language plpgsql;

grant execute on function cast_vote(uuid, text) to anon, authenticated;
grant execute on function retract_vote(uuid, text) to anon, authenticated;
grant execute on function get_user_votes(text, uuid[]) to anon, authenticated;
