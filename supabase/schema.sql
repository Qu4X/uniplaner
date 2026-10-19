-- Supabase Schema for Multi-Tenant Schedule Proposal Voting
-- Specs: docs/specs/voting-supabase.md

create table if not exists tenants (
  id text primary key,                 -- e.g. 'umg_wn', 'sggw_weta'
  vote_threshold int not null default 10
);

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

create policy votes_select on votes for select using (true);
create policy votes_insert on votes for insert with check (true);
create policy votes_delete on votes for delete using (true);

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
