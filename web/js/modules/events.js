/**
 * events.js — Moduł wydarzeń studenckich (web/js/modules/events.js).
 * Odpowiada za wczytywanie data/events.json, filtrowanie dla daty/trybu,
 * renderowanie kart w siatce dnia oraz obsługę modali szczegółów i listy nadchodzących wydarzeń.
 */

(function (root, factory) {
  const mod = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = mod;
  } else {
    root.EventsService = mod;
    root.EventsModule = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const THEME_PRESETS = {
    academic: {
      defaultBadge: "Uczelnia",
      defaultIcon: "🎓",
      defaultColor: "#0d3b66"
    },
    party: {
      defaultBadge: "Impreza",
      defaultIcon: "🎉",
      defaultColor: "#7c3aed"
    },
    flanki: {
      defaultBadge: "Flanki",
      defaultIcon: "🍻",
      defaultColor: "#d97706"
    },
    warning: {
      defaultBadge: "Ważne",
      defaultIcon: "⚠️",
      defaultColor: "#f59e0b"
    },
    info: {
      defaultBadge: "Wydarzenie",
      defaultIcon: "📌",
      defaultColor: "#3b82f6"
    }
  };

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatDateISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const EventsService = {
    events: [],
    loaded: false,
    loadingPromise: null,

    getService() {
      return this;
    },

    async loadEvents(dataUrl = "data/events.json", customFetch = null) {
      if (this.loaded) return this.events;
      if (this.loadingPromise) return this.loadingPromise;

      const doFetch = customFetch || (typeof fetch !== "undefined" ? fetch.bind(typeof window !== "undefined" ? window : global) : null);
      if (!doFetch) {
        this.events = [];
        this.loaded = true;
        return this.events;
      }

      this.loadingPromise = (async () => {
        try {
          const res = await doFetch(dataUrl);
          if (!res.ok) {
            this.events = [];
          } else {
            const data = await res.json();
            this.events = Array.isArray(data) ? data : [];
          }
        } catch (_) {
          this.events = [];
        } finally {
          this.loaded = true;
          this.loadingPromise = null;
        }
        return this.events;
      })();

      return this.loadingPromise;
    },

    getEventsForDate(dateISO, context = {}) {
      if (!dateISO || !Array.isArray(this.events)) return [];

      return this.events.filter((ev) => {
        if (!ev || ev.date !== dateISO) return false;
        if (ev.enabled === false) return false;

        if (ev.target && typeof ev.target === "object") {
          const targetMode = ev.target.mode;
          if (targetMode && targetMode !== "all" && context.studyMode && targetMode !== context.studyMode) {
            return false;
          }

          const targetDegree = ev.target.degree;
          if (targetDegree && targetDegree !== "all" && context.degree !== undefined && targetDegree !== context.degree) {
            return false;
          }
        }

        return true;
      });
    },

    hasEventOnDate(dateISO, context = {}) {
      return this.getEventsForDate(dateISO, context).length > 0;
    },

    getThemeDetails(event) {
      const typeKey = ((event && event.type) || "info").toLowerCase();
      const preset = THEME_PRESETS[typeKey] || THEME_PRESETS.info;

      return {
        badge: (event && event.badge) || preset.defaultBadge,
        icon: (event && event.icon) || preset.defaultIcon,
        color: (event && event.color) || preset.defaultColor,
        type: typeKey
      };
    },

    renderEventCard(event) {
      if (!event) return "";

      const theme = this.getThemeDetails(event);
      const timeStr = event.time_start && event.time_end
        ? `${escapeHtml(event.time_start)} – ${escapeHtml(event.time_end)}`
        : (event.time_start ? escapeHtml(event.time_start) : "");

      const locationHtml = event.location
        ? `<div class="event-location">
             <span class="event-location-icon" aria-hidden="true">📍</span>
             <span class="event-location-text">${escapeHtml(event.location)}</span>
           </div>`
        : "";

      return `
        <article class="event-card event-theme-${escapeHtml(theme.type)}" data-event-id="${escapeHtml(event.id)}" role="button" tabindex="0" aria-haspopup="dialog" style="--event-accent-color: ${escapeHtml(theme.color)};">
          <div class="event-card-header">
            <span class="event-badge">${escapeHtml(theme.badge)}</span>
            ${timeStr ? `<time class="event-time">${timeStr}</time>` : ""}
          </div>
          <div class="event-card-body">
            <h4 class="event-title">
              <span class="event-icon" aria-hidden="true">${escapeHtml(theme.icon)}</span>
              <span class="event-title-text">${escapeHtml(event.title)}</span>
            </h4>
            ${locationHtml}
          </div>
        </article>
      `.trim();
    },

    renderEventsSection(events) {
      if (!events || !Array.isArray(events) || events.length === 0) {
        return "";
      }

      const cardsHtml = events.map((ev) => this.renderEventCard(ev)).join("\n");

      return `
        <section class="day-events-section" aria-label="Wydarzenia w tym dniu">
          <div class="day-events-header">
            <span class="day-events-icon" aria-hidden="true">📅</span>
            <span class="day-events-title">Wydarzenia</span>
          </div>
          <div class="day-events-list">
            ${cardsHtml}
          </div>
        </section>
      `.trim();
    },

    getEventById(id) {
      if (!id || !Array.isArray(this.events)) return null;
      return this.events.find((ev) => ev && ev.id === id) || null;
    },

    openEventModal(eventId, triggerEl = null) {
      if (typeof document === "undefined") return;
      const event = this.getEventById(eventId);
      if (!event) return;

      const dialog = document.getElementById("event-details-dialog");
      if (!dialog) return;

      this.previouslyFocusedEl = triggerEl || document.activeElement;

      const theme = this.getThemeDetails(event);
      const iconEl = dialog.querySelector("#event-dialog-icon");
      const badgeEl = dialog.querySelector("#event-dialog-badge");
      const titleEl = dialog.querySelector("#event-dialog-title");
      const dateEl = dialog.querySelector("#event-dialog-date");
      const timeEl = dialog.querySelector("#event-dialog-time");
      const locationRow = dialog.querySelector("#event-dialog-location-row");
      const locationEl = dialog.querySelector("#event-dialog-location");
      const descEl = dialog.querySelector("#event-dialog-description");
      const footerEl = dialog.querySelector("#event-dialog-footer");
      const linkEl = dialog.querySelector("#event-dialog-link");

      if (iconEl) iconEl.textContent = theme.icon;
      if (badgeEl) {
        badgeEl.textContent = theme.badge;
        badgeEl.className = `event-badge event-theme-${escapeHtml(theme.type)}`;
      }
      if (titleEl) titleEl.textContent = event.title;

      if (dateEl) {
        let dateFormatted = event.date;
        try {
          const [y, m, d] = event.date.split("-").map(Number);
          const dt = new Date(y, m - 1, d);
          dateFormatted = dt.toLocaleDateString("pl-PL", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric"
          });
          dateFormatted = dateFormatted.charAt(0).toUpperCase() + dateFormatted.slice(1);
        } catch (_) {}
        dateEl.textContent = dateFormatted;
      }

      if (timeEl) {
        const timeStr = event.time_start && event.time_end
          ? `${event.time_start} – ${event.time_end}`
          : (event.time_start || "Cały dzień");
        timeEl.textContent = timeStr;
      }

      if (locationRow && locationEl) {
        if (event.location) {
          locationEl.textContent = event.location;
          locationRow.classList.remove("hidden");
        } else {
          locationRow.classList.add("hidden");
        }
      }

      if (descEl) {
        descEl.textContent = event.description || "Brak dodatkowego opisu wydarzenia.";
      }

      if (footerEl && linkEl) {
        const isValidUrl = typeof event.url === "string" && /^https?:\/\//i.test(event.url.trim());
        if (isValidUrl) {
          linkEl.href = event.url.trim();
          const linkTextEl = dialog.querySelector("#event-dialog-link-text") || linkEl.querySelector("span");
          if (linkTextEl) {
            linkTextEl.textContent = event.button_text || event.link_text || "Więcej informacji";
          }
          footerEl.classList.remove("hidden");
        } else {
          if (typeof linkEl.removeAttribute === "function") {
            linkEl.removeAttribute("href");
          } else {
            delete linkEl.href;
          }
          footerEl.classList.add("hidden");
        }
      }

      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.classList.remove("hidden");
      }
    },

    closeEventModal() {
      if (typeof document === "undefined") return;
      const dialog = document.getElementById("event-details-dialog");
      if (!dialog) return;

      if (typeof dialog.close === "function") {
        dialog.close();
      } else {
        dialog.classList.add("hidden");
      }

      if (this.previouslyFocusedEl && typeof this.previouslyFocusedEl.focus === "function") {
        this.previouslyFocusedEl.focus();
        this.previouslyFocusedEl = null;
      }
    },

    formatEventFullDate(dateISO) {
      if (!dateISO) return "";
      try {
        const parts = dateISO.split("-");
        if (parts.length === 3) {
          const dt = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
          let formatted = dt.toLocaleDateString("pl-PL", {
            weekday: "short",
            day: "numeric",
            month: "long",
            year: "numeric"
          });
          return formatted.charAt(0).toUpperCase() + formatted.slice(1);
        }
      } catch (_) {}
      return dateISO;
    },

    getUpcomingEvents(todayISO) {
      if (!Array.isArray(this.events)) return [];
      const nowISO = todayISO || formatDateISO(new Date());
      return this.events
        .filter((ev) => ev && ev.enabled !== false && (!ev.date || ev.date >= nowISO))
        .sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.time_start || "").localeCompare(b.time_start || ""));
    },

    renderEventsModalList(elements) {
      const listEl = elements && elements.eventsModalList;
      if (!listEl) return;
      const activeEvents = this.getUpcomingEvents(formatDateISO(new Date()));

      if (activeEvents.length === 0) {
        listEl.innerHTML = `<div class="events-empty-state" style="text-align:center; padding: 2rem 1rem; color: var(--text-secondary);">Brak zaplanowanych nadchodzących wydarzeń.</div>`;
        return;
      }

      const itemsHtml = activeEvents.map((event) => {
        const theme = this.getThemeDetails(event);
        const dateFormatted = this.formatEventFullDate(event.date);

        const metaParts = [];
        if (event.time_start) {
          const timeStr = event.time_end ? `${escapeHtml(event.time_start)} – ${escapeHtml(event.time_end)}` : escapeHtml(event.time_start);
          metaParts.push(`<span>⏰ ${timeStr}</span>`);
        }
        if (event.location) {
          metaParts.push(`<span>📍 ${escapeHtml(event.location)}</span>`);
        }
        const metaHtml = metaParts.length > 0 ? `<div class="events-modal-item-meta">${metaParts.join(" &bull; ")}</div>` : "";

        const descHtml = event.description
          ? `<p class="events-modal-item-desc">${escapeHtml(event.description)}</p>`
          : "";

        let targetLabel = "";
        if (event.target && typeof event.target === "object") {
          const parts = [];
          if (event.target.mode === "stacjonarne") parts.push("Stacjonarne");
          else if (event.target.mode === "niestacjonarne") parts.push("Niestacjonarne");
          if (event.target.degree === 1) parts.push("I st.");
          else if (event.target.degree === 2) parts.push("II st.");
          if (parts.length > 0) targetLabel = parts.join(" • ");
        }
        const targetHtml = targetLabel
          ? `<div class="events-modal-item-target"><span>🎯 ${escapeHtml(targetLabel)}</span></div>`
          : "";

        const isValidUrl = typeof event.url === "string" && /^https?:\/\//i.test(event.url.trim());
        const actionBtn = isValidUrl
          ? `<div class="events-modal-item-actions">
               <a href="${escapeHtml(event.url.trim())}" class="btn-primary events-modal-item-btn" target="_blank" rel="noopener noreferrer">
                 <span>${escapeHtml(event.button_text || "Więcej informacji")}</span>
                 <span aria-hidden="true">↗</span>
               </a>
             </div>`
          : "";

        return `
          <article class="events-modal-item" style="--event-accent-color: ${escapeHtml(theme.color)};">
            <div class="events-modal-item-header">
              <span class="event-badge event-theme-${escapeHtml(theme.type)}">${escapeHtml(theme.badge)}</span>
              <span class="events-modal-item-date">${escapeHtml(dateFormatted)}</span>
            </div>
            <h4 class="events-modal-item-title">
              <span class="events-modal-item-icon" aria-hidden="true">${escapeHtml(theme.icon)}</span>
              <span>${escapeHtml(event.title)}</span>
            </h4>
            ${metaHtml}
            ${descHtml}
            ${targetHtml}
            ${actionBtn}
          </article>
        `.trim();
      }).join("\n");

      listEl.innerHTML = itemsHtml;
    },

    openEventsModal(elements, onBeforeOpen = null) {
      const modal = elements && elements.eventsModal;
      if (!modal) return;
      if (typeof onBeforeOpen === "function") onBeforeOpen();
      this.renderEventsModalList(elements);
      if (typeof modal.showModal === "function") {
        modal.showModal();
      } else {
        modal.classList.remove("hidden");
      }
      if (!this.loaded) {
        this.loadEvents("data/events.json").then(() => {
          this.renderEventsModalList(elements);
        }).catch(() => {});
      }
    },

    closeEventsModal(elements) {
      const modal = elements && elements.eventsModal;
      if (!modal) return;
      if (typeof modal.close === "function") {
        modal.close();
      } else {
        modal.classList.add("hidden");
      }
    }
  };

  return EventsService;
});
