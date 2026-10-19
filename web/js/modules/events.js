/**
 * events.js — Moduł wydarzeń studenckich dla Plan WN (ES/UMD).
 * Odpowiada za integrację wydarzeń z widokiem kalendarza i modalem nadchodzących wydarzeń.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    const eventsService = require("../events-service.js");
    module.exports = factory(eventsService);
  } else {
    root.EventsModule = factory(root.EventsService);
  }
})(typeof self !== "undefined" ? self : this, function (EventsService) {
  "use strict";

  const EventsModule = {
    getService() {
      return EventsService;
    },

    formatEventFullDate(dateISO) {
      if (!dateISO) return "";
      const days = ["Niedziela", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"];
      const months = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
      const d = new Date(dateISO + "T00:00:00");
      if (isNaN(d.getTime())) return dateISO;
      const dayName = days[d.getDay()];
      const dayNum = d.getDate();
      const monthName = months[d.getMonth()];
      const year = d.getFullYear();
      return `${dayName}, ${dayNum} ${monthName} ${year}`;
    },

    getUpcomingEvents(todayISO) {
      if (!EventsService || !Array.isArray(EventsService.events)) return [];
      const nowISO = todayISO || new Date().toISOString().split("T")[0];
      return EventsService.events
        .filter((ev) => ev && ev.date && ev.date >= nowISO)
        .sort((a, b) => (a.date > b.date ? 1 : -1));
    }
  };

  return EventsModule;
});
