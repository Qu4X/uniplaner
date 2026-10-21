/**
 * voting.js — Moduł propozycji i społecznego głosowania nad zmianami planu (ES/UMD).
 * Integracja z bazą Supabase: zgłaszanie przeniesień zajęć, oddawanie głosów (RPC),
 * aplikowanie zatwierdzonych propozycji (overlay) w runtime oraz obsługa modala #propose-dialog.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.VotingModule = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

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
      if (!supabaseUrl || !supabaseAnonKey || !voterToken || !doFetch) {
        return new Set();
      }

      const pIds = Array.isArray(proposalIds) ? proposalIds : (proposalIds ? [proposalIds] : []);
      if (pIds.length === 0) return new Set();

      const url = `${supabaseUrl}/rest/v1/rpc/get_user_votes`;
      try {
        const res = await doFetch(url, {
          method: "POST",
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            p_voter_token: voterToken,
            p_proposal_ids: pIds
          })
        });
        if (!res.ok) return new Set();
        const data = await res.json();
        if (!Array.isArray(data)) return new Set();
        return new Set(data.map((item) => (typeof item === "string" ? item : item.proposal_id)));
      } catch (err) {
        console.warn("[VotingModule] Błąd pobierania głosów użytkownika przez RPC:", err.message);
        return new Set();
      }
    },

    async submitProposal(proposalData, clientOpts = {}) {
      const resolvedClientOpts = (clientOpts && clientOpts.supabaseUrl)
        ? clientOpts
        : (proposalData && proposalData.client) ? proposalData.client : clientOpts;

      const { supabaseUrl, supabaseAnonKey, doFetch } = _resolveClient(resolvedClientOpts);
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error("Brak konfiguracji Supabase");
      }
      if (!doFetch) throw new Error("Brak funkcji fetch");

      const scope = proposalData.scope || proposalData.proposedScope || "single";
      const targetDate = scope === "single" ? (proposalData.target_date || proposalData.proposedDate || null) : null;

      const payload = {
        tenant_id: proposalData.tenant_id || proposalData.tenantId,
        plan_id: proposalData.plan_id || proposalData.planId,
        group_name: proposalData.group_name || proposalData.groupName,
        lesson_id: proposalData.lesson_id || proposalData.lessonId,
        subject: proposalData.subject || proposalData.proposedSubject || "Zajęcia",
        scope: scope,
        target_date: targetDate,
        original_day_of_week: proposalData.original_day_of_week || proposalData.originalDay || "MON",
        original_start_time: proposalData.original_start_time || proposalData.originalStart || "08:00",
        original_end_time: proposalData.original_end_time || proposalData.originalEnd || "09:30",
        new_day_of_week: proposalData.new_day_of_week || proposalData.proposedNewDay || "MON",
        new_start_time: proposalData.new_start_time || proposalData.proposedStart || "08:00",
        new_end_time: proposalData.new_end_time || proposalData.proposedEnd || "09:30",
        new_room: proposalData.new_room || proposalData.proposedRoom || null,
        reason: (proposalData.reason || proposalData.proposedReason || "").substring(0, 500),
        plan_version_token: proposalData.plan_version_token || proposalData.sourceVersionToken || null,
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

      const url = `${supabaseUrl}/rest/v1/rpc/cast_vote`;
      const res = await doFetch(url, {
        method: "POST",
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          p_proposal_id: proposalId,
          p_voter_token: voterToken
        })
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Błąd oddawania głosu (HTTP ${res.status}): ${text}`);
      }
      const data = await res.json();
      if (data && data.ok === false) {
        throw new Error(data.error || "Nie udało się zapisać głosu");
      }
      return true;
    },

    async retractVote(opts = {}) {
      const { proposalId, voterToken } = opts;
      const { supabaseUrl, supabaseAnonKey, doFetch } = _resolveClient(opts);
      if (!supabaseUrl || !supabaseAnonKey) throw new Error("Brak konfiguracji Supabase");
      if (!doFetch) throw new Error("Brak funkcji fetch");

      const url = `${supabaseUrl}/rest/v1/rpc/retract_vote`;
      const res = await doFetch(url, {
        method: "POST",
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          p_proposal_id: proposalId,
          p_voter_token: voterToken
        })
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Błąd wycofywania głosu (HTTP ${res.status}): ${text}`);
      }
      return true;
    },

    applyProposalOverlay(scheduleData, proposals, currentPlanVersionToken = null) {
      if (!scheduleData || !Array.isArray(scheduleData.lessons) || !Array.isArray(proposals)) {
        return scheduleData;
      }

      const cloned = JSON.parse(JSON.stringify(scheduleData));
      const approvedProposals = proposals.filter((p) => {
        if (p.status !== "approved") return false;
        if (p.plan_version_token && currentPlanVersionToken && p.plan_version_token !== currentPlanVersionToken) {
          return false;
        }
        return true;
      });

      const DAY_INDEX = { MON: 0, TUE: 1, WED: 2, THU: 3, FRI: 4, SAT: 5, SUN: 6 };

      function shiftDateISO(dateStr, deltaDays) {
        if (!dateStr || deltaDays === 0) return dateStr;
        const parts = dateStr.split("-").map(Number);
        const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
        d.setUTCDate(d.getUTCDate() + deltaDays);
        return d.toISOString().slice(0, 10);
      }

      for (const prop of approvedProposals) {
        const lesson = cloned.lessons.find((l) => l.id === prop.lesson_id);
        if (!lesson) continue;

        if (prop.scope === "permanent") {
          const oldDay = lesson.day_of_week;
          const oldIdx = DAY_INDEX[oldDay];
          const newIdx = DAY_INDEX[prop.new_day_of_week];
          const dayDelta = (oldIdx !== undefined && newIdx !== undefined) ? (newIdx - oldIdx) : 0;

          lesson.day_of_week = prop.new_day_of_week;
          lesson.start_time = prop.new_start_time;
          lesson.end_time = prop.new_end_time;
          if (prop.new_room) lesson.room = prop.new_room;
          lesson._proposalOverlay = {
            id: prop.id,
            scope: "permanent",
            reason: prop.reason
          };

          if (Array.isArray(lesson.occurrences)) {
            lesson.occurrences.forEach((occ) => {
              occ.start_time = prop.new_start_time;
              occ.end_time = prop.new_end_time;
              if (prop.new_room) occ.room = prop.new_room;
              if (dayDelta !== 0 && occ.date) {
                occ.date = shiftDateISO(occ.date, dayDelta);
              }
            });
          }
        } else if (prop.scope === "single" && prop.target_date) {
          if (Array.isArray(lesson.occurrences)) {
            const occIdx = lesson.occurrences.findIndex((o) => o.date === prop.target_date);
            if (occIdx !== -1) {
              const origOcc = lesson.occurrences[occIdx];
              lesson.occurrences.splice(occIdx, 1);

              const origDay = prop.original_day_of_week || lesson.day_of_week;
              const origIdx = DAY_INDEX[origDay];
              const newIdx = DAY_INDEX[prop.new_day_of_week];
              const dayDelta = (origIdx !== undefined && newIdx !== undefined) ? (newIdx - origIdx) : 0;
              const newOccDate = prop.new_date || (dayDelta !== 0 ? shiftDateISO(prop.target_date, dayDelta) : prop.target_date);

              const singleLesson = {
                ...JSON.parse(JSON.stringify(lesson)),
                id: `${lesson.id}_override_${prop.target_date}`,
                day_of_week: prop.new_day_of_week,
                start_time: prop.new_start_time,
                end_time: prop.new_end_time,
                room: prop.new_room || lesson.room,
                occurrences: [
                  {
                    date: newOccDate,
                    start_time: prop.new_start_time,
                    end_time: prop.new_end_time,
                    room: prop.new_room || lesson.room,
                    number: origOcc && origOcc.number !== undefined ? origOcc.number : 1,
                    of: origOcc && origOcc.of !== undefined ? origOcc.of : 1,
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
    },

    renderProposalsList(arg1, arg2) {
      let elements = arg1;
      let appState = arg2;
      if (elements && !elements.proposalsList && appState && appState.proposalsList) {
        elements = appState;
        appState = arg1;
      }

      const listEl = elements && elements.proposalsList;
      if (!listEl) return;

      const proposals = (appState && Array.isArray(appState.proposals)) ? appState.proposals : [];
      const threshold = (appState && appState.tenantConfig && appState.tenantConfig.features && appState.tenantConfig.features.voting && appState.tenantConfig.features.voting.threshold) || 10;
      const userVotes = (appState && appState.userVotes) || new Set();

      if (proposals.length === 0) {
        listEl.innerHTML = `<p class="subtext" style="text-align: center; padding: 1.25rem 0;">Brak zgłoszonych propozycji zmian dla aktualnie wybranej grupy.</p>`;
        return;
      }

      const dayLabels = { MON: "Pon", TUE: "Wt", WED: "Śr", THU: "Czw", FRI: "Pt", SAT: "Sob", SUN: "Nd" };
      listEl.innerHTML = proposals
        .map((p) => {
          const isApproved = p.status === "approved";
          const hasVoted = userVotes.has(p.id);
          const statusBadge = isApproved
            ? `<span class="proposal-overlay-badge" style="background: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.4); padding: 2px 8px; border-radius: 999px; font-weight: 700; font-size: 0.78rem;">✓ Zatwierdzona (${p.votes_count || 0}/${threshold})</span>`
            : `<span class="subtext">Głosy: <strong>${p.votes_count || 0} / ${threshold}</strong></span>`;
          const scopeLabel = p.scope === "permanent" ? "Stała (cały semestr)" : `Jednorazowa (${escapeHtml(p.target_date || "")})`;
          const newDay = dayLabels[p.new_day_of_week] || p.new_day_of_week || "";
          const voteBtnText = hasVoted ? "✓ Poparto (cofnij)" : "👍 Popieram";
          const voteBtnStyle = hasVoted ? "background: rgba(2, 132, 199, 0.25); border-color: #0284c7; color: #38bdf8;" : "";

          return `
            <div class="proposal-item" data-proposal-id="${escapeHtml(p.id)}" style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 0; border-bottom: 1px solid var(--border-subtle); gap: 0.75rem;">
              <div style="flex: 1;">
                <strong>${escapeHtml(p.subject || "Zajęcia")}</strong>
                <div class="subtext" style="font-size: 0.8rem; margin-top: 2px;">
                  ${scopeLabel} → <strong>${escapeHtml(newDay)} ${escapeHtml(p.new_start_time)}–${escapeHtml(p.new_end_time)}</strong>${p.new_room ? ` (${escapeHtml(p.new_room)})` : ""}
                </div>
                ${p.reason ? `<div class="subtext" style="font-size: 0.76rem; font-style: italic; margin-top: 2px;">„${escapeHtml(p.reason)}”</div>` : ""}
              </div>
              <div style="display: flex; align-items: center; gap: 0.6rem; flex-shrink: 0;">
                ${statusBadge}
                ${isApproved ? "" : `<button type="button" class="btn-secondary btn-vote-proposal" data-proposal-id="${escapeHtml(p.id)}" data-voted="${hasVoted ? "true" : "false"}" style="padding: 0.35rem 0.75rem; font-size: 0.82rem; border-radius: var(--radius-sm); ${voteBtnStyle}">${voteBtnText}</button>`}
              </div>
            </div>
          `;
        })
        .join("");
    },

    populateProposeLessonSelect(arg1, arg2) {
      let elements = arg1;
      let appState = arg2;
      if (elements && !elements.proposeLessonSelect && appState && appState.proposeLessonSelect) {
        elements = appState;
        appState = arg1;
      }

      const sel = elements && elements.proposeLessonSelect;
      if (!sel) return;
      sel.innerHTML = "";
      const lessons = (appState && appState.scheduleData && Array.isArray(appState.scheduleData.lessons))
        ? appState.scheduleData.lessons
        : [];
      if (lessons.length === 0) {
        sel.innerHTML = `<option value="">Wybierz najpierw plan i grupę...</option>`;
        return;
      }
      const dayLabels = { MON: "Pon", TUE: "Wt", WED: "Śr", THU: "Czw", FRI: "Pt", SAT: "Sob", SUN: "Nd" };
      for (const l of lessons) {
        if (!l || !l.id) continue;
        const opt = document.createElement("option");
        opt.value = l.id;
        const dayStr = dayLabels[l.day_of_week] || l.day_of_week || "";
        opt.textContent = `${l.subject || l.przedmiot} (${dayStr} ${l.start_time}–${l.end_time})`;
        sel.appendChild(opt);
      }
    },

    openProposeModal(arg1, arg2) {
      let elements = arg1;
      let appState = arg2;
      if (elements && !elements.proposeDialog && appState && appState.proposeDialog) {
        elements = arg2;
        appState = arg1;
      }

      const dialog = elements && elements.proposeDialog;
      if (!dialog) return;
      this.renderProposalsList(elements, appState);
      this.populateProposeLessonSelect(elements, appState);
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.classList.remove("hidden");
      }
    },

    closeProposeModal(elements) {
      const dialog = elements && elements.proposeDialog;
      if (!dialog) return;
      if (typeof dialog.close === "function") {
        dialog.close();
      } else {
        dialog.classList.add("hidden");
      }
    }
  };

  return VotingModule;
});
