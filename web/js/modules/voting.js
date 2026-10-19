/**
 * voting.js — Moduł propozycji i społecznego głosowania nad zmianami planu (ES/UMD).
 * Integracja z bazą Supabase: zgłaszanie przeniesień zajęć, oddawanie głosów,
 * oraz aplikowanie zatwierdzonych propozycji (overlay) w runtime.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.VotingModule = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function generateUUID() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function _resolveClient(opts = {}) {
    const src = opts.client || opts;
    const supabaseUrl = src.supabaseUrl;
    const supabaseAnonKey = src.supabaseAnonKey;
    const doFetch =
      src.customFetch ||
      (typeof fetch !== "undefined" ? fetch.bind(typeof window !== "undefined" ? window : global) : null);
    return { supabaseUrl, supabaseAnonKey, doFetch };
  }

  const VotingModule = {
    getVoterToken(tenantId = "default") {
      const storageKey = `${tenantId}_voter_token`;
      try {
        if (typeof localStorage !== "undefined") {
          let token = localStorage.getItem(storageKey);
          if (!token) {
            token = generateUUID();
            localStorage.setItem(storageKey, token);
          }
          return token;
        }
      } catch (e) {
        console.warn("[VotingModule] localStorage niedostępne:", e);
      }
      return generateUUID();
    },

    async fetchProposals(opts = {}) {
      const { tenantId, planId, groupName } = opts;
      const { supabaseUrl, supabaseAnonKey, doFetch } = _resolveClient(opts);
      if (!supabaseUrl || !supabaseAnonKey || !doFetch) return [];

      const queryParams = new URLSearchParams({
        tenant_id: `eq.${tenantId}`,
        plan_id: `eq.${planId}`,
        group_name: `eq.${groupName}`,
        select: "*"
      });

      const url = `${supabaseUrl}/rest/v1/proposals?${queryParams.toString()}`;
      try {
        const res = await doFetch(url, {
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
            "Content-Type": "application/json"
          }
        });
        if (!res.ok) {
          console.warn(`[VotingModule] Błąd pobierania propozycji: HTTP ${res.status}`);
          return [];
        }
        return await res.json();
      } catch (err) {
        console.warn("[VotingModule] Wyjątek podczas pobierania propozycji:", err.message);
        return [];
      }
    },

    async fetchUserVotes(opts = {}) {
      const { proposalIds, voterToken } = opts;
      const { supabaseUrl, supabaseAnonKey, doFetch } = _resolveClient(opts);
      if (!supabaseUrl || !supabaseAnonKey || !voterToken || !proposalIds || !proposalIds.length || !doFetch) {
        return new Set();
      }

      const queryParams = new URLSearchParams({
        voter_token: `eq.${voterToken}`,
        proposal_id: `in.(${proposalIds.join(",")})`,
        select: "proposal_id"
      });

      const url = `${supabaseUrl}/rest/v1/votes?${queryParams.toString()}`;
      try {
        const res = await doFetch(url, {
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
            "Content-Type": "application/json"
          }
        });
        if (!res.ok) return new Set();
        const data = await res.json();
        return new Set(data.map((v) => v.proposal_id));
      } catch (err) {
        console.warn("[VotingModule] Błąd pobierania głosów użytkownika:", err.message);
        return new Set();
      }
    },

    async submitProposal(proposalData, clientOpts = {}) {
      const { supabaseUrl, supabaseAnonKey, doFetch } = _resolveClient(clientOpts);
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error("Brak konfiguracji Supabase");
      }
      if (!doFetch) throw new Error("Brak funkcji fetch");

      // Anon payload constraint (RLS check: status='pending' and votes_count=0)
      const payload = {
        tenant_id: proposalData.tenant_id,
        plan_id: proposalData.plan_id,
        group_name: proposalData.group_name,
        lesson_id: proposalData.lesson_id,
        subject: proposalData.subject,
        scope: proposalData.scope || "single",
        target_date: proposalData.scope === "single" ? proposalData.target_date : null,
        original_day_of_week: proposalData.original_day_of_week,
        original_start_time: proposalData.original_start_time,
        original_end_time: proposalData.original_end_time,
        new_day_of_week: proposalData.new_day_of_week,
        new_start_time: proposalData.new_start_time,
        new_end_time: proposalData.new_end_time,
        new_room: proposalData.new_room || null,
        reason: (proposalData.reason || "").substring(0, 500),
        plan_version_token: proposalData.plan_version_token || null,
        status: "pending",
        votes_count: 0
      };

      const url = `${supabaseUrl}/rest/v1/proposals`;
      const res = await doFetch(url, {
        method: "POST",
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Błąd wysyłania propozycji (HTTP ${res.status}): ${text}`);
      }

      const resData = await res.json();
      return Array.isArray(resData) ? resData[0] : resData;
    },

    async castVote(opts = {}) {
      const { proposalId, voterToken } = opts;
      const { supabaseUrl, supabaseAnonKey, doFetch } = _resolveClient(opts);
      if (!supabaseUrl || !supabaseAnonKey) throw new Error("Brak konfiguracji Supabase");
      if (!doFetch) throw new Error("Brak funkcji fetch");

      const url = `${supabaseUrl}/rest/v1/votes`;
      const res = await doFetch(url, {
        method: "POST",
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          proposal_id: proposalId,
          voter_token: voterToken
        })
      });

      if (!res.ok && res.status !== 409) {
        // 409 Conflict = already voted, which is acceptable
        const text = await res.text();
        throw new Error(`Błąd oddawania głosu (HTTP ${res.status}): ${text}`);
      }
      return true;
    },

    async retractVote(opts = {}) {
      const { proposalId, voterToken } = opts;
      const { supabaseUrl, supabaseAnonKey, doFetch } = _resolveClient(opts);
      if (!supabaseUrl || !supabaseAnonKey) throw new Error("Brak konfiguracji Supabase");
      if (!doFetch) throw new Error("Brak funkcji fetch");

      const queryParams = new URLSearchParams({
        proposal_id: `eq.${proposalId}`,
        voter_token: `eq.${voterToken}`
      });

      const url = `${supabaseUrl}/rest/v1/votes?${queryParams.toString()}`;
      const res = await doFetch(url, {
        method: "DELETE",
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`
        }
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Błąd wycofywania głosu (HTTP ${res.status}): ${text}`);
      }
      return true;
    },

    /**
     * Aplikuje zatwierdzone propozycje na dane planu (Contract v1) przed renderowaniem.
     * @param {Object} scheduleData - Obiekt planu grupy { plan_id, group, lessons: [...] }
     * @param {Array} proposals - Tablica pobranych propozycji
     * @param {string|null} currentPlanVersionToken - Aktualny token wersji planu
     * @returns {Object} Sklonowany i zmodyfikowany obiekt scheduleData
     */
    applyProposalOverlay(scheduleData, proposals, currentPlanVersionToken = null) {
      if (!scheduleData || !Array.isArray(scheduleData.lessons) || !Array.isArray(proposals)) {
        return scheduleData;
      }

      // Klonujemy obiekt, aby nie mutować wejścia
      const cloned = JSON.parse(JSON.stringify(scheduleData));
      const approvedProposals = proposals.filter((p) => {
        if (p.status !== "approved") return false;
        // Wygaszanie propozycji: jeśli propozycja ma token wersji, a plan ma inny token, ignorujemy
        if (p.plan_version_token && currentPlanVersionToken && p.plan_version_token !== currentPlanVersionToken) {
          return false;
        }
        return true;
      });

      for (const prop of approvedProposals) {
        const lesson = cloned.lessons.find((l) => l.id === prop.lesson_id);
        if (!lesson) continue;

        if (prop.scope === "permanent") {
          // Zmiana stała (dla całego semestru)
          lesson.day_of_week = prop.new_day_of_week;
          lesson.start_time = prop.new_start_time;
          lesson.end_time = prop.new_end_time;
          if (prop.new_room) lesson.room = prop.new_room;
          lesson._proposalOverlay = {
            id: prop.id,
            scope: "permanent",
            reason: prop.reason
          };

          // Aktualizujemy occurrences jeśli istnieją
          if (Array.isArray(lesson.occurrences)) {
            lesson.occurrences.forEach((occ) => {
              occ.start_time = prop.new_start_time;
              occ.end_time = prop.new_end_time;
              if (prop.new_room) occ.room = prop.new_room;
            });
          }
        } else if (prop.scope === "single" && prop.target_date) {
          // Zmiana jednorazowa dla konkretnej daty
          if (Array.isArray(lesson.occurrences)) {
            const occIdx = lesson.occurrences.findIndex((o) => o.date === prop.target_date);
            if (occIdx !== -1) {
              // Usuwamy to wystąpienie z oryginalnej lekcji
              lesson.occurrences.splice(occIdx, 1);

              // Tworzymy blok zajęć jednorazowych z nowym dniem/godziną (zgodny z Contract v1)
              const singleLesson = {
                ...JSON.parse(JSON.stringify(lesson)),
                id: `${lesson.id}_override_${prop.target_date}`,
                day_of_week: prop.new_day_of_week,
                start_time: prop.new_start_time,
                end_time: prop.new_end_time,
                room: prop.new_room || lesson.room,
                occurrences: [
                  {
                    date: prop.target_date,
                    start_time: prop.new_start_time,
                    end_time: prop.new_end_time,
                    room: prop.new_room || lesson.room,
                    number: 1,
                    of: 1,
                    status: "scheduled"
                  }
                ],
                _proposalOverlay: {
                  id: prop.id,
                  scope: "single",
                  target_date: prop.target_date,
                  reason: prop.reason
                }
              };
              cloned.lessons.push(singleLesson);
            }
          }
        }
      }

      return cloned;
    }
  };

  return VotingModule;
});
