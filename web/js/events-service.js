/**
 * events-service.js — Fasada kompatybilności wstecznej re-eksportująca web/js/modules/events.js
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = require("./modules/events.js");
  } else {
    root.EventsService = root.EventsModule || root.EventsService;
  }
})(typeof self !== "undefined" ? self : this, function () {});
