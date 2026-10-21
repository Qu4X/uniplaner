# Specyfikacja Modułu Głosowania i Bazy Supabase (`voting-supabase.md`)

Wersja: `2`  
Status: Zaakceptowany (Faza 0 / Naprawa Bezpieczeństwa)  
Data aktualizacji: 2026-10-21  

Moduł głosowania (`modules/voting.js`) pozwala studentom proponować przesunięcia terminów zajęć (np. przeniesienie wykładu na inny dzień lub godzinę) i wspólnie przegłosowywać je w ramach grupy.

---

## 1. Model Danych i Baza Supabase

Wspólna instancja bazy Supabase obsługuje wielu tenantów (`umg_wn`, `sggw_wmw`, `agh_wtk`). Każdy wpis w bazie jest jednoznacznie powiązany z `tenant_id`.

Plik schematu: `supabase/schema.sql`

```sql
create table tenants (
  id text primary key,                 -- np. 'umg_wn', 'sggw_wmw', 'agh_wtk'
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
  proposal_id uuid not null references proposals(id) on delete cascade,
  voter_token text not null,
  unique(proposal_id, voter_token)
);
```

---

## 2. Bezpieczeństwo i Architektura RPC

Aplikacja działa w modelu bez logowania studenckiego (dla zachowania pełnej prywatności i prostoty PWA). Token głosującego (`voter_token`) generowany jest losowo po stronie klienta i trzymany w `localStorage` pod kluczem `${tenant}_voter_token`.

Aby zabezpieczyć bazę przed podglądaniem cudzych tokenów (`token harvesting`) oraz złośliwym usuwaniem głosów:
1. **Brak bezpośredniego dostępu do tabeli `votes` dla roli `anon`**: Rola `anon` nie ma uprawnień `SELECT`, `INSERT` ani `DELETE` na tabeli `votes`.
2. **Procedury składowane RPC (`SECURITY DEFINER`)**:
   - `cast_vote(p_proposal_id uuid, p_voter_token text)`: Waliduje token i status propozycji (`pending`), po czym atomowo wstawia głos.
   - `retract_vote(p_proposal_id uuid, p_voter_token text)`: Usuwa głos wyłącznie dla pary `(p_proposal_id, p_voter_token)`.
   - `get_user_votes(p_voter_token text, p_proposal_ids uuid[])`: Zwraca wyłącznie listę ID propozycji, na które dany token oddał głos.
3. **Automatyczne zatwierdzanie przez trigger**:
   Licznik głosów oraz status propozycji aktualizowane są wyłącznie przez trigger `trg_vote_change` sprawdzający próg `tenants.vote_threshold`.
4. **Wstrzykiwanie konfiguracji**:
   Parametry `supabase_url` oraz `supabase_anon_key` wstrzykiwane są podczas buildu produkcyjnego (`core/build.py`) ze zmiennych środowiskowych `UNIPLANER_SUPABASE_URL` i `UNIPLANER_SUPABASE_ANON_KEY`. W przypadku ich braku moduł voting przechodzi w tryb graceful degradation (brak błędów w konsoli).
