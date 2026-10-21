// Multi-Tenant Static Schedule Web Application — Thin Controller (web/app.js)

const _AppState = (typeof AppState !== "undefined")
  ? AppState
  : (typeof require !== "undefined" ? require("./js/state.js") : null);

const _TenantConfig = (typeof TenantConfig !== "undefined")
  ? TenantConfig
  : (typeof require !== "undefined" ? require("./js/tenant-config.js") : null);

const _ScheduleEngine = (typeof ScheduleEngine !== "undefined")
  ? ScheduleEngine
  : (typeof require !== "undefined" ? require("./js/schedule-engine.js") : null);

const _Timeline = (typeof Timeline !== "undefined")
  ? Timeline
  : (typeof require !== "undefined" ? require("./js/timeline.js") : null);

const _ScheduleRender = (typeof ScheduleRender !== "undefined")
  ? ScheduleRender
  : (typeof require !== "undefined" ? require("./js/render.js") : null);

const _EventsService = (typeof EventsService !== "undefined")
  ? EventsService
  : (typeof require !== "undefined" ? require("./js/modules/events.js") : null);

const _LessonHiding = (typeof LessonHiding !== "undefined")
  ? LessonHiding
  : (typeof require !== "undefined" ? require("./js/modules/lesson-hiding.js") : null);

const _ChangelogModule = (typeof ChangelogModule !== "undefined")
  ? ChangelogModule
  : (typeof require !== "undefined" ? require("./js/modules/changelog.js") : null);

const _VotingModule = (typeof VotingModule !== "undefined")
  ? VotingModule
  : (typeof require !== "undefined" ? require("./js/modules/voting.js") : null);

let ACADEMIC_CALENDAR = _Timeline && typeof _Timeline.loadDefaultCalendar === "function"
  ? _Timeline.loadDefaultCalendar()
  : { daySwaps: {}, holidays: {}, periods: [] };

let engine = _ScheduleEngine ? _ScheduleEngine.create(ACADEMIC_CALENDAR) : null;

const state = _AppState && _AppState.state ? _AppState.state : {
  tenantId: "umg_wn",
  tenantConfig: null,
  plansData: null,
  studyMode: "stacjonarne",
  selectedPlanId: null,
  selectedGroup: null,
  scheduleData: null,
  crossRefData: null,
  weekOffset: 0,
  daysView: "workdays",
  selectedDayTab: "ALL",
  dismissedDuplicatePlans: new Set(),
  dismissedModificationPlans: new Set(),
  hiddenLessonSlots: new Set(),
  previewHiddenLessons: false,
  dismissedHiddenLessonsBanner: false,
  theme: "light"
};

function icon(name, extraClass = "", style = "") {
  return _ScheduleRender ? _ScheduleRender.icon(name, extraClass, style) : "";
}

function escapeHtml(str) {
  return _ScheduleRender ? _ScheduleRender.escapeHtml(str) : String(str || "");
}

function _getStorage(key, legacyKey = null) {
  if (_AppState && typeof _AppState.getStorageItem === "function") {
    return _AppState.getStorageItem(key, legacyKey, _AppState.getTenantId(state));
  }
  return typeof localStorage !== "undefined" ? localStorage.getItem(legacyKey || key) : null;
}

function _setStorage(key, val, legacyKey = null) {
  if (_AppState && typeof _AppState.setStorageItem === "function") {
    _AppState.setStorageItem(key, val, legacyKey, _AppState.getTenantId(state));
    return;
  }
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(legacyKey || key, String(val));
  }
}

function _removeStorage(key, legacyKey = null) {
  if (_AppState && typeof _AppState.removeStorageItem === "function") {
    _AppState.setStorageItem && _AppState.removeStorageItem(key, legacyKey, _AppState.getTenantId(state));
    return;
  }
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(legacyKey || key);
  }
}

function isFeatureEnabled(featurePath) {
  if (_TenantConfig && typeof _TenantConfig.isFeatureEnabled === "function") {
    return _TenantConfig.isFeatureEnabled(state && state.tenantConfig, featurePath);
  }
  return true;
}

function getTodayCode(respectMode = false) {
  return _Timeline ? _Timeline.getTodayCode(respectMode, state.daysView) : "PON";
}

state.selectedDayTab = typeof window !== "undefined" && window.innerWidth >= 900 ? "ALL" : getTodayCode(true);

const elements = typeof document !== "undefined" ? {
  menuToggleBtn: document.getElementById("menu-toggle"),
  openMenuCta: document.getElementById("open-menu-cta"),
  closeSidebarBtn: document.getElementById("close-sidebar"),
  sidebarBackdrop: document.getElementById("sidebar-backdrop"),
  appSidebar: document.getElementById("app-sidebar"),
  headerActiveGroup: document.getElementById("header-active-group"),
  headerSearchBtn: document.getElementById("header-search-btn"),
  sidebarSearchInput: document.getElementById("sidebar-search-input"),
  clearSearchBtn: document.getElementById("clear-search-btn"),
  searchResults: document.getElementById("search-results"),
  planSelect: document.getElementById("plan-select"),
  planMetaInfo: document.getElementById("plan-meta-info"),
  planPubDate: document.getElementById("plan-pub-date"),
  planVersionBadge: document.getElementById("plan-version-badge"),
  groupSelect: document.getElementById("group-select"),
  daysViewSelect: document.getElementById("days-view-select"),
  studyModeSelect: document.getElementById("study-mode-select"),
  freeRoomsBtn: document.getElementById("free-rooms-btn"),
  currentWeekLabel: document.getElementById("current-week-label"),
  weekDatePicker: document.getElementById("week-date-picker"),
  prevWeekBtn: document.getElementById("prev-week"),
  nextWeekBtn: document.getElementById("next-week"),
  todayBtn: document.getElementById("today-btn"),
  dayTabs: document.getElementById("day-tabs"),
  calendarNotice: document.getElementById("calendar-notice"),
  hiddenLessonsBanner: document.getElementById("hidden-lessons-banner"),
  hiddenLessonsBannerText: document.getElementById("hidden-lessons-banner-text"),
  previewHiddenLessonsBtn: document.getElementById("preview-hidden-lessons-btn"),
  restoreHiddenLessonsBtn: document.getElementById("restore-hidden-lessons-btn"),
  dismissHiddenLessonsBtn: document.getElementById("dismiss-hidden-lessons-btn"),
  bannerElectivesBtn: document.getElementById("banner-electives-btn"),
  loadingState: document.getElementById("loading-state"),
  emptyState: document.getElementById("empty-state"),
  noClassesState: document.getElementById("no-classes-state"),
  scheduleContent: document.getElementById("schedule-content"),
  calendarBtn: document.getElementById("calendar-btn"),
  calendarModal: document.getElementById("calendar-modal"),
  closeModalBtn: document.getElementById("close-modal"),
  calGoogleBtn: document.getElementById("cal-google-btn"),
  calAppleBtn: document.getElementById("cal-apple-btn"),
  calDownloadBtn: document.getElementById("cal-download-btn"),
  calGoogleCard: document.getElementById("cal-google-card"),
  calAppleCard: document.getElementById("cal-apple-card"),
  calendarUrlInput: document.getElementById("calendar-url-input"),
  copyUrlBtn: document.getElementById("copy-url-btn"),
  copyFeedback: document.getElementById("copy-feedback"),
  crossModal: document.getElementById("cross-modal"),
  crossModalTitle: document.getElementById("cross-modal-title"),
  crossModalBadge: document.getElementById("cross-modal-badge"),
  crossModalBody: document.getElementById("cross-modal-body"),
  closeCrossModalBtn: document.getElementById("close-cross-modal"),
  themeToggle: document.getElementById("theme-toggle"),
  lastUpdated: document.getElementById("last-updated"),
  headerInstallBtn: document.getElementById("header-install-btn"),
  pwaInstallBtn: document.getElementById("pwa-install-btn"),
  pwaInstallBtnText: document.getElementById("pwa-install-btn-text"),
  iosInstallModal: document.getElementById("ios-install-modal"),
  closeIosModalBtn: document.getElementById("close-ios-modal"),
  closeIosModalActionBtn: document.getElementById("close-ios-modal-btn"),
  aboutAppBtn: document.getElementById("about-app-btn"),
  footerAboutBtn: document.getElementById("footer-about-btn"),
  aboutModal: document.getElementById("about-modal"),
  closeAboutModalBtn: document.getElementById("close-about-modal"),
  reportMailBtn: document.getElementById("report-mail-btn"),
  changelogModal: document.getElementById("changelog-modal"),
  closeChangelogModalBtn: document.getElementById("close-changelog-modal"),
  confirmChangelogBtn: document.getElementById("confirm-changelog-btn"),
  changelogVersionBadge: document.getElementById("changelog-version-badge"),
  changelogDate: document.getElementById("changelog-date"),
  changelogFeaturesList: document.getElementById("changelog-features-list"),
  eventDetailsDialog: document.getElementById("event-details-dialog"),
  closeEventDialogBtn: document.getElementById("close-event-dialog"),
  eventsBtn: document.getElementById("events-btn"),
  eventsModal: document.getElementById("events-modal"),
  closeEventsModalBtn: document.getElementById("close-events-modal"),
  eventsModalList: document.getElementById("events-modal-list"),
  electivesBtn: document.getElementById("electives-btn"),
  electivesDialog: document.getElementById("electives-dialog"),
  closeElectivesModalBtn: document.getElementById("close-electives-modal"),
  confirmElectivesBtn: document.getElementById("confirm-electives-btn"),
  restoreAllElectivesBtn: document.getElementById("restore-all-electives-btn"),
  electivesList: document.getElementById("electives-list"),
  proposeBtn: document.getElementById("propose-btn"),
  proposeDialog: document.getElementById("propose-dialog"),
  closeProposeModalBtn: document.getElementById("close-propose-modal"),
  proposalsList: document.getElementById("proposals-list"),
  proposeForm: document.getElementById("propose-form"),
  proposeLessonSelect: document.getElementById("propose-lesson-select"),
  proposeScopeSelect: document.getElementById("propose-scope-select"),
  proposeTargetDateWrap: document.getElementById("propose-target-date-wrap"),
  proposeTargetDate: document.getElementById("propose-target-date"),
  proposeNewDay: document.getElementById("propose-new-day"),
  proposeNewRoom: document.getElementById("propose-new-room"),
  proposeNewStart: document.getElementById("propose-new-start"),
  proposeNewEnd: document.getElementById("propose-new-end"),
  proposeReason: document.getElementById("propose-reason"),
  proposeFeedback: document.getElementById("propose-feedback"),
  submitProposeBtn: document.getElementById("submit-propose-btn")
} : {};

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", async () => {
    await loadTenantConfig();
    initTheme();
    setupThemeListener();
    setupEventListeners();
    initPwaInstall();
    if (isFeatureEnabled("cross_reference")) initCrossRefUI();
    loadAcademicCalendarConfig();
    if (isFeatureEnabled("events")) loadEventsData();
    updateDayTabsUI();
    loadPlans();
  });
}

async function loadTenantConfig() {
  const loaded = _TenantConfig && typeof _TenantConfig.load === "function"
    ? await _TenantConfig.load("data/tenant_config.json", state, elements)
    : null;
  if (state.tenantConfig && state.tenantConfig.id) {
    state.tenantId = state.tenantConfig.id;
    const savedStudyMode = _getStorage("study_mode", "umg_study_mode");
    if (savedStudyMode) state.studyMode = savedStudyMode;
    const savedDaysView = _getStorage("days_view", "umg_days_view");
    if (savedDaysView) state.daysView = savedDaysView;
    const savedTheme = _getStorage("theme", "umg_theme");
    if (savedTheme) state.theme = savedTheme;
  }
  return loaded;
}

function initCrossRefUI() {
  if (typeof window !== "undefined" && window.CrossRef && window.CrossRef.UI) {
    window.CrossRef.UI.init({
      elements: {
        modal: elements.crossModal,
        title: elements.crossModalTitle,
        badge: elements.crossModalBadge,
        body: elements.crossModalBody,
        searchInput: elements.sidebarSearchInput,
        searchResults: elements.searchResults,
        clearSearchBtn: elements.clearSearchBtn
      },
      scheduleEngine: engine,
      onBeforeOpen: closeSidebar
    });
    const tid = _AppState ? _AppState.getTenantId(state) : "umg_wn";
    window.CrossRef.DataService.load({ tenantId: tid });
  }
}

function setAcademicCalendar(data) {
  if (!data) return;
  ACADEMIC_CALENDAR = data;
  state.academicCalendar = data;
  if (_ScheduleEngine) {
    engine = _ScheduleEngine.create(ACADEMIC_CALENDAR);
    if (typeof window !== "undefined" && window.CrossRef && window.CrossRef.UI) {
      window.CrossRef.UI.scheduleEngine = engine;
    }
  }
}

async function loadAcademicCalendarConfig() {
  try {
    const res = await fetch("data/academic_calendar.json");
    if (res.ok) {
      const data = await res.json();
      if (data && data.periods) {
        setAcademicCalendar(data);
        updateDayTabsUI();
        if (state.scheduleData) renderSchedule();
      }
    }
  } catch (_) {}
}

async function loadEventsData() {
  if (!isFeatureEnabled("events") || !_EventsService || typeof _EventsService.loadEvents !== "function") return;
  try {
    await _EventsService.loadEvents("data/events.json");
    if (state.scheduleData) renderSchedule();
  } catch (e) {
    console.warn("[Events] Could not load events:", e);
  }
}

function initTheme() {
  if (typeof document === "undefined") return;
  if (document.documentElement) document.documentElement.setAttribute("data-theme", state.theme);
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta) {
    const lightThemeColor = (state.tenantConfig && state.tenantConfig.theme_color) || "#0d233a";
    themeColorMeta.setAttribute("content", state.theme === "dark" ? "#0b1828" : lightThemeColor);
  }
  if (elements.themeToggle) {
    const isDark = state.theme === "dark";
    elements.themeToggle.innerHTML = icon(isDark ? "light_mode" : "dark_mode");
    const label = isDark ? "Przełącz na jasny motyw" : "Przełącz na ciemny motyw";
    elements.themeToggle.setAttribute("title", label);
    elements.themeToggle.setAttribute("aria-label", label);
  }
}

let _themeListenerAttached = false;
function setupThemeListener() {
  if (_themeListenerAttached || typeof window === "undefined" || !window.matchMedia) return;
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = (e) => {
    if (!_getStorage("theme", "umg_theme")) {
      state.theme = e.matches ? "dark" : "light";
      initTheme();
    }
  };
  if (mq.addEventListener) mq.addEventListener("change", handler);
  else if (mq.addListener) mq.addListener(handler);
  _themeListenerAttached = true;
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  _setStorage("theme", state.theme, "umg_theme");
  initTheme();
}

function openSidebar() {
  if (elements.appSidebar) elements.appSidebar.classList.add("open");
  if (elements.sidebarBackdrop) elements.sidebarBackdrop.classList.remove("hidden");
}

function closeSidebar() {
  if (elements.appSidebar) elements.appSidebar.classList.remove("open");
  if (elements.sidebarBackdrop) elements.sidebarBackdrop.classList.add("hidden");
}

function normalizePlansData(raw) {
  return _Timeline ? _Timeline.normalizePlansData(raw) : (raw || { plans: {} });
}

function parsePlanInfo(rawName) {
  return _Timeline ? _Timeline.parsePlanInfo(rawName) : { cleanName: rawName || "", publishedAt: null, version: null, isSecondDegree: false };
}

function getShortPlanCode(planName) {
  return _Timeline ? _Timeline.getShortPlanCode(planName, state.tenantConfig) : "";
}

function getPlanSortKey(planObj) {
  return _Timeline ? _Timeline.getPlanSortKey(planObj) : { major: "", degreeOrder: 1, semNum: 0, cleanName: "" };
}

function comparePlans(planA, planB) {
  return _Timeline ? _Timeline.comparePlans(planA, planB) : 0;
}

function getDuplicatePlanInfo(planId) {
  return _Timeline ? _Timeline.getDuplicatePlanInfo(planId, state) : null;
}

function getPlanModificationInfo(planId) {
  return _Timeline ? _Timeline.getPlanModificationInfo(planId, state) : null;
}

function populatePlanSelect() {
  if (_ScheduleRender) {
    _ScheduleRender.populatePlanSelect(state, elements, { comparePlans, parsePlanInfo });
  }
}

function onStudyModeChange(newMode) {
  state.studyMode = newMode;
  _setStorage("study_mode", newMode, "umg_study_mode");
  if (newMode === "niestacjonarne" && state.daysView === "workdays") {
    state.daysView = "active_only";
    if (elements.daysViewSelect) elements.daysViewSelect.value = "active_only";
    _setStorage("days_view", "active_only", "umg_days_view");
  }
  populatePlanSelect();
  updateWeekDisplay();
  onPlanChange(null);
}

function onPlanChange(planId, preferredGroup = null) {
  if (state.plansData && Array.isArray(state.plansData.plans)) {
    state.plansData = normalizePlansData(state.plansData);
  }
  state.selectedPlanId = planId;
  state.selectedGroup = null;
  if (elements.planSelect && elements.planSelect.value !== (planId || "")) {
    elements.planSelect.value = planId || "";
  }

  if (!planId) {
    if (elements.planMetaInfo) elements.planMetaInfo.classList.add("hidden");
    elements.groupSelect.disabled = true;
    elements.groupSelect.innerHTML = '<option value="">Najpierw wybierz kierunek...</option>';
    elements.headerActiveGroup.textContent = "Wybierz grupę";
    _removeStorage("selected_plan", "umg_selected_plan");
    _removeStorage("selected_group", "umg_selected_group");
    showEmptyState();
    return;
  }

  _setStorage("selected_plan", planId, "umg_selected_plan");
  const plan = state.plansData.plans[planId];
  const planInfo = parsePlanInfo(plan.name || "");
  const publishedAt = plan.published_at || planInfo.publishedAt;
  const version = plan.version || planInfo.version;
  if (elements.planMetaInfo) {
    if (publishedAt || version) {
      elements.planMetaInfo.classList.remove("hidden");
      elements.planPubDate.textContent = publishedAt ? `Aktualizacja: ${publishedAt}` : "";
      elements.planVersionBadge.textContent = version || "";
      elements.planVersionBadge.style.display = version ? "inline-block" : "none";
    } else {
      elements.planMetaInfo.classList.add("hidden");
    }
  }

  elements.groupSelect.innerHTML = "";
  if (!plan.groups || plan.groups.length === 0) {
    elements.groupSelect.disabled = true;
    elements.groupSelect.innerHTML = '<option value="">Brak grup dla tego planu</option>';
    elements.headerActiveGroup.textContent = "Brak grup";
    return;
  }

  elements.groupSelect.disabled = false;
  elements.groupSelect.innerHTML = '<option value="">Wybierz grupę...</option>';
  plan.groups.forEach((groupName) => {
    const opt = document.createElement("option");
    opt.value = groupName;
    opt.textContent = groupName;
    elements.groupSelect.appendChild(opt);
  });

  const groupToSelect = (preferredGroup && plan.groups.includes(preferredGroup))
    ? preferredGroup
    : plan.groups[0];
  elements.groupSelect.value = groupToSelect;
  selectGroup(groupToSelect);
}

function selectGroup(groupName) {
  state.selectedGroup = groupName;
  _setStorage("selected_group", groupName, "umg_selected_group");
  elements.groupSelect.value = groupName;
  const plan = state.plansData && state.plansData.plans[state.selectedPlanId];
  const shortPlanCode = plan ? getShortPlanCode(plan.name) : "";
  elements.headerActiveGroup.textContent = shortPlanCode ? `${shortPlanCode} • ${groupName}` : groupName;
  loadSchedule();
}

function getSafeGroupName(group) {
  return group ? String(group).replace(/[^\w-]/g, '_') : '';
}

// --- Hidden Lesson Slots Management (Delegated to LessonHiding module) ---
function isHideableLesson(lesson) {
  if (!isFeatureEnabled("lesson_hiding")) return false;
  return _LessonHiding ? _LessonHiding.isHideableLesson(lesson) : false;
}

function getLessonSlotKey(lesson, day = null) {
  return _LessonHiding ? _LessonHiding.getLessonSlotKey(lesson, day) : "";
}

function loadHiddenLessonSlots(planId, group) {
  const tid = _AppState ? _AppState.getTenantId(state) : "umg_wn";
  return _LessonHiding ? _LessonHiding.loadHiddenLessonSlots(planId, group, tid) : new Set();
}

function saveHiddenLessonSlots(planId, group, slotsSet) {
  const tid = _AppState ? _AppState.getTenantId(state) : "umg_wn";
  if (_LessonHiding) _LessonHiding.saveHiddenLessonSlots(planId, group, slotsSet, tid);
}

function toggleLessonSlotHidden(lesson, day = null, forceState = null) {
  return _LessonHiding ? _LessonHiding.toggleLessonSlotHidden(lesson, day, forceState, state) : false;
}

function restoreAllHiddenLessonSlots(planId = state.selectedPlanId, group = state.selectedGroup) {
  if (_LessonHiding) {
    _LessonHiding.restoreAllHiddenLessonSlots(planId, group, state, () => {
      updateHiddenLessonsBannerUI();
      if (state.scheduleData) renderSchedule();
    });
  }
}

function togglePreviewHiddenLessons() {
  state.previewHiddenLessons = !state.previewHiddenLessons;
  updateHiddenLessonsBannerUI();
  if (state.scheduleData) renderSchedule();
}

function updateHiddenLessonsBannerUI() {
  if (!elements.hiddenLessonsBanner) return;
  const count = state.hiddenLessonSlots ? state.hiddenLessonSlots.size : 0;
  if (count === 0 || state.dismissedHiddenLessonsBanner) {
    elements.hiddenLessonsBanner.classList.add("hidden");
    return;
  }
  elements.hiddenLessonsBanner.classList.remove("hidden");
  if (elements.hiddenLessonsBannerText) {
    const label = _LessonHiding ? _LessonHiding.formatHiddenCount(count) : `${count} ukrytych`;
    elements.hiddenLessonsBannerText.textContent = `${label} w planie grupy`;
  }
  if (elements.previewHiddenLessonsBtn) {
    elements.previewHiddenLessonsBtn.textContent = state.previewHiddenLessons ? "Ukryj ponownie" : "Pokaż ukryte";
    elements.previewHiddenLessonsBtn.setAttribute("aria-pressed", state.previewHiddenLessons ? "true" : "false");
  }
}

async function loadPlans() {
  try {
    elements.loadingState.classList.remove("hidden");
    elements.emptyState.classList.add("hidden");

    const response = await fetch("data/plans.json");
    if (!response.ok) throw new Error("Błąd wczytywania plans.json");

    state.plansData = normalizePlansData(await response.json());
    if (state.plansData.last_updated) {
      elements.lastUpdated.textContent = `Aktualizacja: ${state.plansData.last_updated}`;
    }

    const savedPlan = _getStorage("selected_plan", "umg_selected_plan");
    const savedGroup = _getStorage("selected_group", "umg_selected_group");

    if (savedPlan && state.plansData.plans[savedPlan]) {
      const planObj = state.plansData.plans[savedPlan];
      const planMode = planObj.mode || (planObj.name && /niestacjonarne/i.test(planObj.name) ? "niestacjonarne" : "stacjonarne");
      state.studyMode = planMode;
      if (elements.studyModeSelect) elements.studyModeSelect.value = planMode;
      populatePlanSelect();
      elements.planSelect.value = savedPlan;
      onPlanChange(savedPlan, savedGroup);
    } else {
      populatePlanSelect();
      if (elements.studyModeSelect) elements.studyModeSelect.value = state.studyMode;
      elements.loadingState.classList.add("hidden");
      elements.emptyState.classList.remove("hidden");
      openSidebar();
    }

    updateWeekDisplay();
    updateDayTabsUI();

    if (isFeatureEnabled("events") && _EventsService && typeof _EventsService.loadEvents === "function") {
      _EventsService.loadEvents().then(() => {
        if (state.scheduleData) renderSchedule();
      }).catch(() => {});
    }

    if (isFeatureEnabled("changelog")) checkChangelogNotification();
  } catch (err) {
    console.error(err);
    elements.loadingState.innerHTML = `<p style="color: #ef4444;">Nie udało się wczytać listy planów. Uruchom build_static.py.</p>`;
  }
}

async function loadSchedule() {
  if (!state.selectedPlanId || !state.selectedGroup) return;

  elements.loadingState.classList.remove("hidden");
  elements.scheduleContent.classList.add("hidden");
  elements.noClassesState.classList.add("hidden");
  elements.emptyState.classList.add("hidden");

  try {
    const safeGroup = getSafeGroupName(state.selectedGroup);
    const response = await fetch(`data/schedules/${state.selectedPlanId}_${safeGroup}.json`);
    if (!response.ok) throw new Error("Brak pliku planu dla tej grupy");

    let loadedSchedule = await response.json();

    if (isFeatureEnabled("voting") && _VotingModule && state.tenantConfig && state.tenantConfig.supabase_url) {
      try {
        const tid = _AppState ? _AppState.getTenantId(state) : "umg_wn";
        const proposals = await _VotingModule.fetchProposals({
          tenantId: tid,
          planId: state.selectedPlanId,
          groupName: state.selectedGroup,
          client: {
            supabaseUrl: state.tenantConfig.supabase_url,
            supabaseAnonKey: state.tenantConfig.supabase_anon_key
          }
        });
        state.proposals = proposals;

        if (proposals.length > 0) {
          const voterToken = _VotingModule.getVoterToken(tid);
          state.voterToken = voterToken;
          const userVotes = await _VotingModule.fetchUserVotes({
            proposalIds: proposals.map((p) => p.id),
            voterToken: voterToken,
            client: {
              supabaseUrl: state.tenantConfig.supabase_url,
              supabaseAnonKey: state.tenantConfig.supabase_anon_key
            }
          });
          state.userVotes = userVotes;
        } else {
          state.userVotes = new Set();
        }

        const planMeta = state.plansData && state.plansData.plans && state.plansData.plans[state.selectedPlanId];
        const verToken = (planMeta && (planMeta.version_token || planMeta.version)) || null;
        loadedSchedule = _VotingModule.applyProposalOverlay(loadedSchedule, proposals, verToken);
      } catch (voteErr) {
        console.warn("[Voting] Could not apply proposal overlay:", voteErr);
      }
    }

    state.scheduleData = loadedSchedule;
    elements.loadingState.classList.add("hidden");

    state.hiddenLessonSlots = loadHiddenLessonSlots(state.selectedPlanId, state.selectedGroup);
    state.previewHiddenLessons = false;
    state.dismissedHiddenLessonsBanner = false;

    resolveInitialWeekOffset(state.scheduleData);
    updateWeekDisplay();
    renderSchedule();
  } catch (err) {
    console.error(err);
    elements.loadingState.innerHTML = `<p style="color: #ef4444;">Brak danych planu dla grupy ${escapeHtml(state.selectedGroup || "")}.</p>`;
  }
}

function formatDateISO(date) {
  return _Timeline ? _Timeline.formatDateISO(date) : "";
}

function getMonday(d) {
  return _Timeline ? _Timeline.getMonday(d) : new Date(d);
}

function getWeekMonday(offsetWeeks = 0) {
  return _Timeline ? _Timeline.getWeekMonday(offsetWeeks) : new Date();
}

function withViewTransition(callback) {
  if (
    typeof document !== "undefined" &&
    typeof document.startViewTransition === "function" &&
    typeof window !== "undefined" &&
    window.matchMedia &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return document.startViewTransition(callback);
  }
  return callback();
}

function changeWeek(direction) {
  withViewTransition(() => {
    state.weekOffset += direction;
    updateWeekDisplay();
    renderSchedule();
  });
}

function resolveInitialWeekOffset(scheduleData) {
  if (_Timeline) {
    state.weekOffset = _Timeline.resolveInitialWeekOffset(scheduleData);
    return state.weekOffset;
  }
}

function getAcademicInfoForWeek(targetMonday) {
  const isNst = Boolean(state && state.studyMode === "niestacjonarne");
  return _Timeline
    ? _Timeline.getAcademicInfoForWeek(targetMonday, ACADEMIC_CALENDAR, { isNst })
    : { periodName: "", periodType: "", weekNum: null, daySwaps: [], holidays: [] };
}

function isTeachingDay(iso) {
  return engine ? engine.isTeachingDay(iso) : true;
}

function getLessonProgress(lesson, baseDay, targetMonday, targetDate = null) {
  return engine ? engine.getLessonProgress(lesson, baseDay, targetMonday, targetDate) : null;
}

function renderLessonCard(lesson, targetMonday = null, day = null) {
  return _ScheduleRender ? _ScheduleRender.renderLessonCard(lesson, targetMonday, day, {
    getLessonProgress,
    isHideableLesson,
    getLessonSlotKey,
    hiddenLessonSlots: state.hiddenLessonSlots
  }) : "";
}

function updateCalendarNotice(academicInfo) {
  if (_ScheduleRender) {
    _ScheduleRender.updateCalendarNotice(academicInfo, state, elements, {
      getAcademicInfoForWeek,
      getWeekMonday,
      getDuplicatePlanInfo,
      getPlanModificationInfo
    });
  }
}

function updateWeekDisplay() {
  if (_ScheduleRender) {
    _ScheduleRender.updateWeekDisplay(state, elements, {
      getWeekMonday,
      getAcademicInfoForWeek,
      updateCalendarNotice
    });
  }
}

function updateDayTabsUI(filteredSchedule = null) {
  if (_ScheduleRender) {
    _ScheduleRender.updateDayTabsUI(filteredSchedule, state, elements, {
      getWeekMonday,
      formatDateISO,
      parsePlanInfo,
      academicCalendar: ACADEMIC_CALENDAR,
      eventsService: _EventsService
    });
  }
}

function renderSchedule() {
  if (_ScheduleRender) {
    _ScheduleRender.renderSchedule(state, elements, {
      getWeekMonday,
      getTodayCode,
      formatDateISO,
      getAcademicInfoForWeek,
      resolveInitialWeekOffset,
      updateWeekDisplay,
      updateDayTabsUI,
      updateHiddenLessonsBannerUI,
      getLessonSlotKey,
      isHideableLesson,
      renderLessonCard,
      parsePlanInfo,
      engine,
      eventsService: _EventsService
    });
  }
}

function showEmptyState() {
  elements.loadingState.classList.add("hidden");
  elements.scheduleContent.classList.add("hidden");
  elements.noClassesState.classList.add("hidden");
  elements.emptyState.classList.remove("hidden");
}

function setupDialogBackdropDismiss(dialogEl, closeFn) {
  if (!dialogEl) return;
  dialogEl.addEventListener("click", (e) => {
    const rect = dialogEl.getBoundingClientRect();
    const isInDialog = (
      rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
      rect.left <= e.clientX && e.clientX <= rect.left + rect.width
    );
    if (!isInDialog || e.target === dialogEl) {
      closeFn();
    }
  });
}

function openCalendarModal() {
  if (!state.selectedPlanId || !state.selectedGroup) {
    alert("Wybierz najpierw kierunek i grupę w menu!");
    openSidebar();
    return;
  }

  const origin = window.location.origin;
  const pathname = window.location.pathname.replace(/\/index\.html$/, "").replace(/\/$/, "");
  const safeGroup = getSafeGroupName(state.selectedGroup);
  const icsPath = `${pathname}/calendars/${state.selectedPlanId}_${safeGroup}.ics`;
  const fullHttpUrl = `${origin}${icsPath}`;
  const webcalUrl = fullHttpUrl.replace(/^https?:\/\//, "webcal://");
  const googleCalUrl = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl)}`;

  if (elements.calAppleBtn) elements.calAppleBtn.href = webcalUrl;
  if (elements.calGoogleBtn) elements.calGoogleBtn.href = googleCalUrl;
  if (elements.calDownloadBtn) {
    elements.calDownloadBtn.href = fullHttpUrl;
    elements.calDownloadBtn.setAttribute("download", `${state.selectedPlanId}_${safeGroup}.ics`);
  }
  if (elements.calendarUrlInput) elements.calendarUrlInput.value = fullHttpUrl;
  if (elements.copyFeedback) elements.copyFeedback.classList.add("hidden");

  const navUserAgent = (typeof navigator !== "undefined" && navigator.userAgent) ||
    (typeof window !== "undefined" && window.navigator && window.navigator.userAgent) || "";
  const isApple = /iPhone|iPad|iPod|Macintosh/.test(navUserAgent) && !(typeof window !== "undefined" && window.MSStream);
  if (elements.calAppleCard && elements.calGoogleCard) {
    elements.calAppleCard.classList.toggle("recommended", isApple);
    elements.calGoogleCard.classList.toggle("recommended", !isApple);
  }

  if (typeof elements.calendarModal.showModal === "function") elements.calendarModal.showModal();
  else elements.calendarModal.classList.remove("hidden");
}

function closeCalendarModal() {
  if (!elements.calendarModal) return;
  if (typeof elements.calendarModal.close === "function") elements.calendarModal.close();
  else elements.calendarModal.classList.add("hidden");
}

function openAboutModal() {
  if (!elements.aboutModal) return;
  if (typeof elements.aboutModal.showModal === "function") elements.aboutModal.showModal();
  else elements.aboutModal.classList.remove("hidden");
}

function closeAboutModal() {
  if (!elements.aboutModal) return;
  if (typeof elements.aboutModal.close === "function") elements.aboutModal.close();
  else elements.aboutModal.classList.add("hidden");
}

function formatEventFullDate(dateISO) {
  return _EventsService && typeof _EventsService.formatEventFullDate === "function"
    ? _EventsService.formatEventFullDate(dateISO)
    : dateISO;
}

function renderEventsModalList() {
  if (_EventsService && typeof _EventsService.renderEventsModalList === "function") {
    _EventsService.renderEventsModalList(elements);
  }
}

function openEventsModal() {
  if (_EventsService && typeof _EventsService.openEventsModal === "function") {
    _EventsService.openEventsModal(elements, closeSidebar);
  }
}

function closeEventsModal() {
  if (_EventsService && typeof _EventsService.closeEventsModal === "function") {
    _EventsService.closeEventsModal(elements);
  }
}

function copyCalendarUrl() {
  elements.calendarUrlInput.select();
  navigator.clipboard.writeText(elements.calendarUrlInput.value).then(() => {
    elements.copyFeedback.classList.remove("hidden");
    setTimeout(() => elements.copyFeedback.classList.add("hidden"), 2500);
  });
}

function shouldShowChangelog(latestVersion, lastSeenVersion) {
  return _ChangelogModule ? _ChangelogModule.shouldShowChangelog(latestVersion, lastSeenVersion) : false;
}

function openChangelogModal(changelogEntry) {
  if (_ChangelogModule) _ChangelogModule.openChangelogModal(changelogEntry, elements, escapeHtml);
}

function closeChangelogModal() {
  if (_ChangelogModule) {
    const tid = _AppState ? _AppState.getTenantId(state) : "umg_wn";
    _ChangelogModule.closeChangelogModal(elements, tid);
  }
}

async function checkChangelogNotification() {
  if (_ChangelogModule) {
    const tid = _AppState ? _AppState.getTenantId(state) : "umg_wn";
    await _ChangelogModule.checkChangelogNotification({
      elements,
      escapeHtmlFn: escapeHtml,
      tenantId: tid,
      enabled: isFeatureEnabled("changelog")
    });
  }
}

let deferredPrompt = null;

function openPwaModal(platform = "android") {
  if (_ScheduleRender) {
    _ScheduleRender.openPwaModal(platform, elements, closeIosModal, state.tenantConfig);
  }
}

function closeIosModal() {
  if (_ScheduleRender) _ScheduleRender.closeIosModal(elements);
}

function initPwaInstall() {
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.warn("Service Worker registration failed:", err);
    });
  }

  if (_ScheduleRender && _ScheduleRender.isAppStandalone()) return;

  if (elements.pwaInstallBtn) {
    elements.pwaInstallBtn.classList.remove("hidden");
    if (_ScheduleRender && _ScheduleRender.isIosDevice() && elements.pwaInstallBtnText) {
      elements.pwaInstallBtnText.textContent = "Dodaj do ekranu początkowego";
    }
  }
  if (elements.headerInstallBtn) elements.headerInstallBtn.classList.remove("hidden");

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (elements.pwaInstallBtn) elements.pwaInstallBtn.classList.remove("hidden");
    if (elements.headerInstallBtn) elements.headerInstallBtn.classList.remove("hidden");
  });

  async function handleInstallTrigger() {
    const promptEvent = window.deferredPrompt || deferredPrompt;
    if (promptEvent) {
      try {
        await promptEvent.prompt();
        const choiceResult = await promptEvent.userChoice;
        if (choiceResult && choiceResult.outcome === "accepted") {
          if (elements.pwaInstallBtn) elements.pwaInstallBtn.classList.add("hidden");
          if (elements.headerInstallBtn) elements.headerInstallBtn.classList.add("hidden");
        }
      } catch (err) {
        console.warn("PWA prompt error:", err);
      }
      deferredPrompt = null;
      window.deferredPrompt = null;
      closeSidebar();
    } else if (_ScheduleRender && _ScheduleRender.isIosDevice()) {
      closeSidebar();
      openPwaModal("ios");
    } else {
      closeSidebar();
      openPwaModal("android");
    }
  }

  if (elements.pwaInstallBtn) elements.pwaInstallBtn.addEventListener("click", handleInstallTrigger);
  if (elements.headerInstallBtn) elements.headerInstallBtn.addEventListener("click", handleInstallTrigger);

  window.addEventListener("appinstalled", () => {
    if (elements.pwaInstallBtn) elements.pwaInstallBtn.classList.add("hidden");
    if (elements.headerInstallBtn) elements.headerInstallBtn.classList.add("hidden");
    deferredPrompt = null;
  });

  if (elements.closeIosModalBtn) elements.closeIosModalBtn.addEventListener("click", closeIosModal);
  if (elements.closeIosModalActionBtn) elements.closeIosModalActionBtn.addEventListener("click", closeIosModal);
  if (elements.iosInstallModal) setupDialogBackdropDismiss(elements.iosInstallModal, closeIosModal);
}

function setupEventListeners() {
  elements.themeToggle.addEventListener("click", toggleTheme);
  elements.menuToggleBtn.addEventListener("click", openSidebar);
  if (elements.openMenuCta) elements.openMenuCta.addEventListener("click", openSidebar);
  elements.closeSidebarBtn.addEventListener("click", closeSidebar);
  elements.sidebarBackdrop.addEventListener("click", closeSidebar);

  elements.planSelect.addEventListener("change", (e) => onPlanChange(e.target.value));
  elements.groupSelect.addEventListener("change", (e) => {
    if (e.target.value) {
      selectGroup(e.target.value);
      closeSidebar();
    }
  });

  elements.prevWeekBtn.addEventListener("click", () => changeWeek(-1));
  elements.nextWeekBtn.addEventListener("click", () => changeWeek(1));
  elements.todayBtn.addEventListener("click", () => {
    withViewTransition(() => {
      state.weekOffset = 0;
      state.selectedDayTab = getTodayCode(true);
      updateWeekDisplay();
      updateDayTabsUI();
      renderSchedule();
    });
  });

  if (elements.daysViewSelect) {
    elements.daysViewSelect.value = state.daysView;
    elements.daysViewSelect.addEventListener("change", (e) => {
      state.daysView = e.target.value;
      _setStorage("days_view", state.daysView, "umg_days_view");
      if (state.daysView === "workdays" && (state.selectedDayTab === "SOB" || state.selectedDayTab === "ND")) {
        state.selectedDayTab = "PON";
      }
      updateDayTabsUI();
      renderSchedule();
    });
  }

  if (elements.studyModeSelect) {
    elements.studyModeSelect.value = state.studyMode;
    elements.studyModeSelect.addEventListener("change", (e) => onStudyModeChange(e.target.value));
  }

  if (elements.currentWeekLabel && elements.weekDatePicker) {
    elements.currentWeekLabel.addEventListener("click", () => {
      elements.weekDatePicker.value = formatDateISO(getWeekMonday(state.weekOffset));
      try {
        if (typeof elements.weekDatePicker.showPicker === "function") elements.weekDatePicker.showPicker();
        else { elements.weekDatePicker.focus(); elements.weekDatePicker.click(); }
      } catch (_) {
        elements.weekDatePicker.click();
      }
    });

    elements.weekDatePicker.addEventListener("change", (e) => {
      if (!e.target.value) return;
      const [year, month, day] = e.target.value.split("-").map(Number);
      const selectedDate = new Date(year, month - 1, day);
      const selMonday = getMonday(selectedDate);
      const nowMonday = getMonday(new Date());
      const diffWeeks = Math.round((selMonday.getTime() - nowMonday.getTime()) / (7 * 24 * 60 * 60 * 1000));
      const days = ["ND", "PON", "WT", "ŚR", "CZW", "PT", "SOB"];
      const dayCode = days[selectedDate.getDay()];

      withViewTransition(() => {
        state.weekOffset = diffWeeks;
        state.selectedDayTab = dayCode;
        updateWeekDisplay();
        updateDayTabsUI();
        renderSchedule();
      });
    });
  }

  elements.dayTabs.addEventListener("click", (e) => {
    const tab = e.target.closest(".day-tab");
    if (!tab) return;
    withViewTransition(() => {
      state.selectedDayTab = tab.dataset.day;
      updateDayTabsUI();
      renderSchedule();
    });
  });

  if (elements.calendarNotice) {
    elements.calendarNotice.addEventListener("click", (e) => {
      const switchBtn = e.target.closest("[data-switch-plan]");
      if (switchBtn && switchBtn.dataset.switchPlan) {
        onPlanChange(switchBtn.dataset.switchPlan);
        return;
      }
      const dismissBtn = e.target.closest("[data-dismiss-plan]");
      if (dismissBtn && dismissBtn.dataset.dismissPlan) {
        state.dismissedDuplicatePlans.add(dismissBtn.dataset.dismissPlan);
        updateCalendarNotice();
        return;
      }
      const dismissModBtn = e.target.closest("[data-dismiss-modification]");
      if (dismissModBtn && dismissModBtn.dataset.dismissModification) {
        state.dismissedModificationPlans.add(dismissModBtn.dataset.dismissModification);
        updateCalendarNotice();
      }
    });
  }

  if (elements.previewHiddenLessonsBtn) elements.previewHiddenLessonsBtn.addEventListener("click", togglePreviewHiddenLessons);
  if (elements.restoreHiddenLessonsBtn) elements.restoreHiddenLessonsBtn.addEventListener("click", () => restoreAllHiddenLessonSlots());
  if (elements.dismissHiddenLessonsBtn) {
    elements.dismissHiddenLessonsBtn.addEventListener("click", () => {
      state.dismissedHiddenLessonsBanner = true;
      updateHiddenLessonsBannerUI();
    });
  }

  // Electives Dialog (LessonHiding module)
  const openElectives = () => {
    closeSidebar();
    if (_LessonHiding && typeof _LessonHiding.openElectivesModal === "function") {
      _LessonHiding.openElectivesModal(state, elements, escapeHtml);
    }
  };
  if (elements.electivesBtn) elements.electivesBtn.addEventListener("click", openElectives);
  if (elements.bannerElectivesBtn) elements.bannerElectivesBtn.addEventListener("click", openElectives);
  if (elements.closeElectivesModalBtn) {
    elements.closeElectivesModalBtn.addEventListener("click", () => _LessonHiding?.closeElectivesModal(elements));
  }
  if (elements.confirmElectivesBtn) {
    elements.confirmElectivesBtn.addEventListener("click", () => _LessonHiding?.closeElectivesModal(elements));
  }
  if (elements.restoreAllElectivesBtn) {
    elements.restoreAllElectivesBtn.addEventListener("click", () => {
      restoreAllHiddenLessonSlots();
      if (_LessonHiding) _LessonHiding.renderElectivesModalList(state, elements, escapeHtml);
    });
  }
  if (elements.electivesDialog) {
    setupDialogBackdropDismiss(elements.electivesDialog, () => _LessonHiding?.closeElectivesModal(elements));
  }
  if (elements.electivesList) {
    elements.electivesList.addEventListener("change", (e) => {
      const cb = e.target.closest(".elective-slot-checkbox");
      if (!cb || !cb.dataset.slotKey) return;
      const key = cb.dataset.slotKey;
      if (!state.hiddenLessonSlots) state.hiddenLessonSlots = new Set();
      if (cb.checked) state.hiddenLessonSlots.delete(key);
      else state.hiddenLessonSlots.add(key);
      saveHiddenLessonSlots(state.selectedPlanId, state.selectedGroup, state.hiddenLessonSlots);
      updateHiddenLessonsBannerUI();
      if (state.scheduleData) renderSchedule();
    });
  }

  // Voting / Propose Dialog (VotingModule)
  if (elements.proposeBtn) {
    elements.proposeBtn.addEventListener("click", () => {
      closeSidebar();
      if (_VotingModule) _VotingModule.openProposeModal(elements, state);
    });
  }
  if (elements.closeProposeModalBtn) {
    elements.closeProposeModalBtn.addEventListener("click", () => _VotingModule?.closeProposeModal(elements));
  }
  if (elements.proposeDialog) {
    setupDialogBackdropDismiss(elements.proposeDialog, () => _VotingModule?.closeProposeModal(elements));
  }
  if (elements.proposeScopeSelect && elements.proposeTargetDateWrap) {
    elements.proposeScopeSelect.addEventListener("change", (e) => {
      elements.proposeTargetDateWrap.style.display = e.target.value === "permanent" ? "none" : "";
    });
  }
  if (elements.proposeLessonSelect) {
    elements.proposeLessonSelect.addEventListener("change", (e) => {
      const selectedId = e.target.value;
      const lesson = state.scheduleData?.lessons?.find((l) => l.id === selectedId);
      if (lesson) {
        if (elements.proposeNewDay) elements.proposeNewDay.value = lesson.day_of_week || "MON";
        if (elements.proposeNewStart) elements.proposeNewStart.value = lesson.start_time || "08:00";
        if (elements.proposeNewEnd) elements.proposeNewEnd.value = lesson.end_time || "09:30";
        if (elements.proposeNewRoom) elements.proposeNewRoom.value = lesson.room || "";
      }
    });
  }
  if (elements.proposalsList) {
    elements.proposalsList.addEventListener("click", async (e) => {
      const voteBtn = e.target.closest(".btn-vote-proposal");
      if (!voteBtn || !_VotingModule) return;
      const proposalId = voteBtn.getAttribute("data-proposal-id");
      const hasVoted = voteBtn.getAttribute("data-voted") === "true";
      const tid = _AppState ? _AppState.getTenantId(state) : "umg_wn";
      const voterToken = state.voterToken || _VotingModule.getVoterToken(tid);

      voteBtn.disabled = true;
      try {
        const client = {
          supabaseUrl: state.tenantConfig?.supabase_url,
          supabaseAnonKey: state.tenantConfig?.supabase_anon_key
        };
        if (hasVoted) {
          await _VotingModule.retractVote({ proposalId, voterToken, client });
          if (state.userVotes) state.userVotes.delete(proposalId);
        } else {
          await _VotingModule.castVote({ proposalId, voterToken, client });
          if (!state.userVotes) state.userVotes = new Set();
          state.userVotes.add(proposalId);
        }
        await loadSchedule();
        _VotingModule.renderProposalsList(elements, state);
      } catch (err) {
        alert(`Błąd głosowania: ${err.message}`);
      } finally {
        voteBtn.disabled = false;
      }
    });
  }
  if (elements.proposeForm) {
    elements.proposeForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!_VotingModule || !state.selectedPlanId || !state.selectedGroup) return;
      const tid = _AppState ? _AppState.getTenantId(state) : "umg_wn";
      const planMeta = state.plansData && state.plansData.plans && state.plansData.plans[state.selectedPlanId];
      const selectedLessonId = elements.proposeLessonSelect?.value;
      const lesson = state.scheduleData?.lessons?.find((l) => l.id === selectedLessonId);
      const scope = elements.proposeScopeSelect?.value || "single";
      const targetDate = scope === "single" ? (elements.proposeTargetDate?.value || null) : null;
      const newDay = elements.proposeNewDay?.value || (lesson?.day_of_week || "MON");
      const newStart = elements.proposeNewStart?.value || "08:00";
      const newEnd = elements.proposeNewEnd?.value || "09:30";
      const newRoom = elements.proposeNewRoom?.value?.trim() || null;
      const reason = elements.proposeReason?.value?.trim() || "";

      if (scope === "single" && !targetDate) {
        if (elements.proposeFeedback) {
          elements.proposeFeedback.textContent = "Wskaż datę dla jednorazowego przeniesienia zajęć.";
          elements.proposeFeedback.style.color = "#ef4444";
          elements.proposeFeedback.classList.remove("hidden");
        }
        return;
      }

      try {
        await _VotingModule.submitProposal({
          tenant_id: tid,
          plan_id: state.selectedPlanId,
          group_name: state.selectedGroup,
          lesson_id: selectedLessonId,
          subject: (lesson && (lesson.subject || lesson.przedmiot)) || "Zajęcia",
          scope: scope,
          target_date: targetDate,
          original_day_of_week: (lesson && lesson.day_of_week) || "MON",
          original_start_time: (lesson && lesson.start_time) || "08:00",
          original_end_time: (lesson && lesson.end_time) || "09:30",
          new_day_of_week: newDay,
          new_start_time: newStart,
          new_end_time: newEnd,
          new_room: newRoom,
          reason: reason,
          plan_version_token: (planMeta && (planMeta.version_token || planMeta.version)) || null,
          client: {
            supabaseUrl: state.tenantConfig?.supabase_url,
            supabaseAnonKey: state.tenantConfig?.supabase_anon_key
          }
        });
        if (elements.proposeFeedback) {
          elements.proposeFeedback.textContent = "Propozycja została pomyślnie wysłana i oczekuje na głosy!";
          elements.proposeFeedback.style.color = "#10b981";
          elements.proposeFeedback.classList.remove("hidden");
        }
        elements.proposeForm.reset();
        await loadSchedule();
        _VotingModule.renderProposalsList(elements, state);
      } catch (err) {
        if (elements.proposeFeedback) {
          elements.proposeFeedback.textContent = `Błąd: ${err.message}`;
          elements.proposeFeedback.style.color = "#ef4444";
          elements.proposeFeedback.classList.remove("hidden");
        }
      }
    });
  }

  if (elements.calendarBtn) {
    elements.calendarBtn.addEventListener("click", () => { closeSidebar(); openCalendarModal(); });
  }
  if (elements.closeModalBtn) elements.closeModalBtn.addEventListener("click", closeCalendarModal);
  if (elements.calendarModal) setupDialogBackdropDismiss(elements.calendarModal, closeCalendarModal);
  if (elements.copyUrlBtn) elements.copyUrlBtn.addEventListener("click", copyCalendarUrl);

  if (elements.closeCrossModalBtn) {
    elements.closeCrossModalBtn.addEventListener("click", () => window.CrossRef?.UI?.closeModal());
  }
  if (elements.crossModal) {
    setupDialogBackdropDismiss(elements.crossModal, () => window.CrossRef?.UI?.closeModal());
  }

  if (elements.eventsBtn) {
    elements.eventsBtn.addEventListener("click", () => { closeSidebar(); openEventsModal(); });
  }
  if (elements.closeEventsModalBtn) elements.closeEventsModalBtn.addEventListener("click", closeEventsModal);
  if (elements.eventsModal) setupDialogBackdropDismiss(elements.eventsModal, closeEventsModal);

  if (elements.aboutAppBtn) {
    elements.aboutAppBtn.addEventListener("click", () => { closeSidebar(); openAboutModal(); });
  }
  if (elements.footerAboutBtn) elements.footerAboutBtn.addEventListener("click", openAboutModal);
  if (elements.closeAboutModalBtn) elements.closeAboutModalBtn.addEventListener("click", closeAboutModal);
  if (elements.aboutModal) setupDialogBackdropDismiss(elements.aboutModal, closeAboutModal);
  if (elements.closeChangelogModalBtn) elements.closeChangelogModalBtn.addEventListener("click", closeChangelogModal);
  if (elements.confirmChangelogBtn) elements.confirmChangelogBtn.addEventListener("click", closeChangelogModal);
  if (elements.changelogModal) setupDialogBackdropDismiss(elements.changelogModal, closeChangelogModal);

  if (elements.closeEventDialogBtn) {
    elements.closeEventDialogBtn.addEventListener("click", () => _EventsService?.closeEventModal());
  }
  if (elements.eventDetailsDialog) {
    setupDialogBackdropDismiss(elements.eventDetailsDialog, () => _EventsService?.closeEventModal());
  }

  if (elements.reportMailBtn) {
    elements.reportMailBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const appTitle = (state.tenantConfig && state.tenantConfig.short_title) || "Plan zajęć";
      const subject = encodeURIComponent(`[${appTitle}] Zgłoszenie błędu / uwaga`);
      const body = encodeURIComponent(
        `Cześć,\n\nOpis problemu lub uwagi:\n\n\n---\nDane diagnostyczne:\nGrupa: ${state.selectedGroup || "Brak"}\nKierunek: ${state.selectedPlanId || "Brak"}\nPrzeglądarka: ${navigator.userAgent}\n`
      );
      window.location.href = `mailto:?subject=${subject}&body=${body}`;
    });
  }

  document.addEventListener("click", (e) => {
    const tallyLink = e.target.closest("a[data-tally-open], a[href*='tally-open=']");
    if (tallyLink) {
      if (elements.aboutModal && (elements.aboutModal.open || !elements.aboutModal.classList.contains("hidden"))) {
        closeAboutModal();
      }
      if (!window.Tally || typeof window.Tally.openPopup !== "function") {
        e.preventDefault();
        const formId = tallyLink.getAttribute("data-tally-open") || "2E2vNj";
        window.open(`https://tally.so/r/${formId}`, "_blank", "noopener");
      }
    }
  }, true);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeAboutModal();
      closeEventsModal();
      window.CrossRef?.UI?.closeModal();
      closeCalendarModal();
      closeChangelogModal();
      closeIosModal();
      _EventsService?.closeEventModal();
      _LessonHiding?.closeElectivesModal(elements);
      _VotingModule?.closeProposeModal(elements);
    }
  });

  if (elements.headerSearchBtn) {
    elements.headerSearchBtn.addEventListener("click", () => {
      openSidebar();
      setTimeout(() => elements.sidebarSearchInput.focus(), 250);
    });
  }
  if (elements.sidebarSearchInput) {
    elements.sidebarSearchInput.addEventListener("input", (e) => window.CrossRef?.UI?.handleSearch(e.target.value));
  }
  if (elements.clearSearchBtn) {
    elements.clearSearchBtn.addEventListener("click", () => {
      window.CrossRef?.UI?.clearSearch();
      if (elements.sidebarSearchInput) elements.sidebarSearchInput.focus();
    });
  }
  if (elements.searchResults) {
    elements.searchResults.addEventListener("click", (e) => {
      const item = e.target.closest(".search-result-item");
      if (!item) return;
      closeSidebar();
      elements.searchResults.classList.add("hidden");
      if (item.dataset.type === "teacher") window.CrossRef?.UI?.openTeacher(item.dataset.id);
      else if (item.dataset.type === "room") window.CrossRef?.UI?.openRoom(item.dataset.id);
      else if (item.dataset.type === "subject") window.CrossRef?.UI?.openSubject(item.dataset.id);
    });
  }
  if (elements.freeRoomsBtn) {
    elements.freeRoomsBtn.addEventListener("click", () => {
      closeSidebar();
      window.CrossRef?.UI?.openFreeRooms();
    });
  }

  if (elements.scheduleContent) {
    elements.scheduleContent.addEventListener("click", (e) => {
      const hideBtn = e.target.closest(".btn-hide-lesson");
      if (hideBtn && hideBtn.dataset.slotKey) {
        e.stopPropagation();
        const slotKey = hideBtn.dataset.slotKey;
        if (!state.hiddenLessonSlots) state.hiddenLessonSlots = new Set();
        if (state.hiddenLessonSlots.has(slotKey)) state.hiddenLessonSlots.delete(slotKey);
        else state.hiddenLessonSlots.add(slotKey);
        saveHiddenLessonSlots(state.selectedPlanId, state.selectedGroup, state.hiddenLessonSlots);
        renderSchedule();
        return;
      }
      const roomBtn = e.target.closest(".lesson-room-btn");
      if (roomBtn && roomBtn.dataset.room) {
        e.stopPropagation();
        window.CrossRef?.UI?.openRoom(roomBtn.dataset.room);
        return;
      }
      const teacherBtn = e.target.closest(".lesson-teacher-btn");
      if (teacherBtn && teacherBtn.dataset.teacher) {
        e.stopPropagation();
        window.CrossRef?.UI?.openTeacher(teacherBtn.dataset.teacher);
        return;
      }
      const eventCard = e.target.closest(".event-card");
      if (eventCard && eventCard.dataset.eventId) {
        e.stopPropagation();
        _EventsService?.openEventModal(eventCard.dataset.eventId, eventCard);
      }
    });

    elements.scheduleContent.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        const eventCard = e.target.closest(".event-card");
        if (eventCard && eventCard.dataset.eventId) {
          e.preventDefault();
          _EventsService?.openEventModal(eventCard.dataset.eventId, eventCard);
        }
      }
    });
  }

  if (elements.crossModalBody) {
    elements.crossModalBody.addEventListener("click", (e) => {
      const roomBtn = e.target.closest(".lesson-room-btn");
      if (roomBtn && roomBtn.dataset.room) {
        e.stopPropagation();
        window.CrossRef?.UI?.openRoom(roomBtn.dataset.room);
        return;
      }
      const teacherBtn = e.target.closest(".lesson-teacher-btn");
      if (teacherBtn && teacherBtn.dataset.teacher) {
        e.stopPropagation();
        window.CrossRef?.UI?.openTeacher(teacherBtn.dataset.teacher);
      }
    });
  }
}

function getRoomOccupancyAt(daySchedule, queryRange, targetDateIso, baseDay) {
  return engine
    ? engine.getRoomOccupancyAt(daySchedule, queryRange, targetDateIso, baseDay)
    : { isFree: true, occupyingClass: null, nextClass: null };
}

if (typeof window !== "undefined") {
  window.openTeacherSchedule = (t) => window.CrossRef?.UI?.openTeacher(t);
  window.openRoomSchedule = (r) => window.CrossRef?.UI?.openRoom(r);
  window.openSubjectDetail = (s) => window.CrossRef?.UI?.openSubject(s);
  window.openFreeRoomsModal = (d, s) => window.CrossRef?.UI?.openFreeRooms({ dateISO: d, slot: s });
  window.getRoomOccupancyAt = getRoomOccupancyAt;
  window.closeCrossModal = () => window.CrossRef?.UI?.closeModal();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    ACADEMIC_CALENDAR,
    formatDateISO,
    getMonday,
    isTeachingDay,
    getLessonProgress,
    getSafeGroupName,
    getRoomOccupancyAt,
    parsePlanInfo,
    getAcademicInfoForWeek,
    updateCalendarNotice,
    renderSchedule,
    renderLessonCard,
    shouldShowChangelog,
    openChangelogModal,
    closeChangelogModal,
    checkChangelogNotification,
    comparePlans,
    getPlanSortKey,
    populatePlanSelect,
    onStudyModeChange,
    onPlanChange,
    getDuplicatePlanInfo,
    getPlanModificationInfo,
    _EventsService,
    loadEventsData,
    updateDayTabsUI,
    initTheme,
    toggleTheme,
    setupThemeListener,
    withViewTransition,
    openCalendarModal,
    closeCalendarModal,
    openAboutModal,
    closeAboutModal,
    openEventsModal,
    closeEventsModal,
    formatEventFullDate,
    renderEventsModalList,
    openPwaModal,
    closeIosModal,
    setupDialogBackdropDismiss,
    getLessonSlotKey,
    isHideableLesson,
    loadHiddenLessonSlots,
    saveHiddenLessonSlots,
    toggleLessonSlotHidden,
    restoreAllHiddenLessonSlots,
    togglePreviewHiddenLessons,
    updateHiddenLessonsBannerUI,
    setAcademicCalendar,
    _VotingModule,
    state,
    elements
  };
}
