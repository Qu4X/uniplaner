# Specyfikacja Modułu Głosowania i Bazy Supabase (`voting-supabase.md`)

Wersja: `1`  
Status: Zaakceptowany (Faza 0)  
Data utworzenia: 2026-10-19  

Moduł głosowania (`modules/voting.js`) pozwala studentom proponować przesunięcia terminów zajęć (np. przeniesienie wykładu na inny dzień lub godzinę) i wspólnie przegłosowywać je w ramach grupy.

---

## 1. Model Danych i Baza Supabase

Wspólna instancja bazy Supabase obsługuje wielu tenantów (`umg_wn`, `sggw_weta`). Każdy wpis w bazie jest jednoznacznie powiązany z `tenant_id`.

Plik schematu: `supabase/schema.sql`

```sql
create table tenants (
  id text primary key,                 -- np. 'umg_wn', 'sggw_weta'
  vote_threshold int not null default 10
);

create table proposals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  tenant_id text not null references tenants(id),
  plan_id text not null,
  group_name text not null,
  lesson_id text not null,             -- deterministyczny SHA-256 z core/ids.py
  subject text not null,
  scope text not null check (scope in ('single', 'permanent')),
  target_date date,                    -- wymagane gdy scope = 'single'
  original_day_of_week text not null,
  original_start_time text not null,
  original_end_time text not null,
  new_day_of_week text not null check (new_day_of_week in ('MON','TUE','WED','THU','FRI','SAT','SUN')),
  new_start_time text not null,        -- 'HH:MM'
  new_end_time text not null,          -- 'HH:MM'
  new_room text,
  reason text check (char_length(reason) <= 500),
  plan_version_token text,             -- token wersji planu, dla którego zgłoszono zmianę
  votes_count int not null default 0,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected'))
);

create table votes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  proposal_id uuid references proposals(id) on delete cascade,
  voter_token text not null,
  unique(proposal_id, voter_token)
);
```

---

## 2. Bezpieczeństwo i Polityki RLS (Naprawa Luki z Forka)

W dotychczasowym schemacie forka rola `anon` miała pełny `INSERT ... WITH CHECK (true)`, co pozwalało każdemu wysłać żądanie HTTP ze `status: 'approved'` i `votes_count: 100` bez oddawania głosów.

W nowym schemacie:
1. Rola `anon` może dodawać propozycje wyłącznie ze statusem `pending` i licznikiem `votes_count = 0`:
   ```sql
   create policy proposals_insert on proposals for insert
     with check (status = 'pending' and votes_count = 0);
   ```
2. Modyfikacja licznika głosów i statusu propozycji może odbywać się **wyłącznie przez funkcję triggera** działającą w trybie `SECURITY DEFINER` (z uprawnieniami bazy, a nie roli anonimowej).
3. Funkcja triggera odczytuje próg głosów z tabeli `tenants.vote_threshold` dla danego `tenant_id`:
   ```sql
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

       return new;
   end;
   $$ language plpgsql;
   ```

---

## 3. Znane Ograniczenia Modelu Bez Logowania

Aplikacja nie wymaga logowania użytkowników, aby zachować maksymalną lekkość i prywatność.
* Identyfikator `voter_token` jest generowany losowo po stronie klienta i zapisywany w `localStorage` pod kluczem `${tenant}_voter_token`.
* **Znana podatność**: Wyczyszczenie pamięci podręcznej przeglądarki (`localStorage.clear()`) pozwala użytkownikowi wygenerować nowy token i oddać kolejny głos na tę samą propozycję.
* **Mitygacja**: Rozwiązanie to jest kompromisem pomiędzy bezpieczeństwem a brakiem konieczności logowania kontem USOS/uczelnianym. Propozycje dotyczą wyłącznie lokalnej społeczności danej grupy studenckiej.
