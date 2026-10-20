"""
Główny orchestrator kompilacji statycznej strony planów zajęć (core.build).
Zapewnia multi-tenantowość, detekcję zmian, zasadę fail-safe (last known good) oraz generowanie JSON i ICS zgodnych z Kontraktem v1.
"""
import os
import sys
import json
import re
import shutil
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone

# Ensure project root is in sys.path
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from sources.base import ScheduleSource, PlanMetadata, RawLesson
from core.contracts import GroupSchedule, Lesson, PlanEntry, PlansIndex
from core.ids import generate_lesson_id
from core.expand import expand_occurrences
from core.validate import validate_group_schedule, validate_plans_index
from core.ics import generate_group_ics
from core.detector import ChangeDetector
from core.diff import diff_schedules
from core.cross_ref import build_cross_reference_indexes
from core.writer import (
    sanitize_group_name,
    read_existing_group_schedule,
    write_group_schedule,
    write_group_ics,
    write_plans_index
)

logger = logging.getLogger("core.build")


def is_winter_plan_archived(
    semester_number: Optional[int],
    academic_calendar: Dict[str, Any],
    now_iso: Optional[str] = None
) -> bool:
    """
    Sprawdza, czy plan semestru zimowego powinien zostać oznaczony jako zarchiwizowany.
    Plan zimowy jest archiwizowany dopiero po zakończeniu zimowej sesji poprawkowej (lub zimowej sesji egzaminacyjnej).
    """
    if not isinstance(semester_number, int) or semester_number % 2 == 0:
        return False

    periods = (academic_calendar or {}).get("periods", [])
    if not periods:
        return False

    winter_exam_ends: List[str] = []
    for p in periods:
        p_type = p.get("type", "")
        p_name = p.get("name", "").lower()
        p_end = p.get("end", "")
        if not p_end:
            continue
        if p_type in ("exam", "retake", "retake_exam") and ("zimow" in p_name or p_end[5:7] in ("01", "02", "03")):
            winter_exam_ends.append(p_end)

    if not winter_exam_ends:
        return False

    cutoff_date = max(winter_exam_ends)
    current_date = (now_iso or datetime.now(timezone.utc).strftime("%Y-%m-%d"))[:10]
    return current_date > cutoff_date


class BuildOrchestrator:
    def __init__(
        self,
        tenant_config: Dict[str, Any],
        sources: List[ScheduleSource],
        dist_dir: str,
        state_file: Optional[str] = None
    ):
        self.tenant_config = tenant_config
        self.sources = sources
        self.dist_dir = dist_dir
        self.schedules_dir = os.path.join(self.dist_dir, "data", "schedules")
        self.calendars_dir = os.path.join(self.dist_dir, "calendars")
        self.data_dir = os.path.join(self.dist_dir, "data")
        self.state_file = state_file or os.path.join(self.dist_dir, ".build-state.json")
        self.detector = ChangeDetector(self.state_file)

        os.makedirs(self.schedules_dir, exist_ok=True)
        os.makedirs(self.calendars_dir, exist_ok=True)
        os.makedirs(self.data_dir, exist_ok=True)

    def check_only(self, sources: Optional[List[ScheduleSource]] = None) -> List[PlanMetadata]:
        """Sprawdza jedynie (poprzez discover()), które plany uległy zmianie względem .build-state.json."""
        all_discovered: List[PlanMetadata] = []
        for src in (sources or self.sources):
            try:
                all_discovered.extend(src.discover())
            except Exception as e:
                logger.error(f"Błąd podczas discover w źródle {src.source_id}: {e}")
        plans_to_fetch, _ = self.detector.detect_changes(all_discovered, force=False)
        return plans_to_fetch

    def run(
        self,
        force: bool = False,
        plan_filter: Optional[List[str]] = None,
        limit: Optional[int] = None,
        now_iso: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Główna pętla kompilacji:
        1. Discover na źródłach
        2. Detect changes
        3. Fetch, expand, validate (zasada last known good), diff, write JSON + ICS
        4. Cross-reference
        5. Save state
        """
        tenant_id = self.tenant_config.get("id", "default")
        logger.info(f"Rozpoczynanie buildu dla tenanta: {tenant_id}...")
        academic_calendar = self.tenant_config.get("academic_calendar") or {}
        generated_timestamp = now_iso or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        # 1. Discover
        all_discovered: List[PlanMetadata] = []
        source_map: Dict[str, ScheduleSource] = {}
        for src in self.sources:
            try:
                plans = src.discover()
                for p in plans:
                    all_discovered.append(p)
                    source_map[p.id] = src
            except Exception as e:
                logger.error(f"Błąd podczas discover w źródle {src.source_id}: {e}")

        if plan_filter:
            all_discovered = [p for p in all_discovered if p.id in plan_filter]

        if limit and limit > 0:
            all_discovered = all_discovered[:limit]

        logger.info(f"Odkryto łącznie {len(all_discovered)} planów.")

        # 2. Change detection
        plans_to_fetch, plans_unchanged = self.detector.detect_changes(all_discovered, force=force)
        logger.info(f"Plany do pobrania: {len(plans_to_fetch)}, Plany niezmienione: {len(plans_unchanged)}")

        total_groups_processed = 0
        failed_plans: List[str] = []
        plan_diffs: Dict[str, Dict[str, Any]] = {}
        plans_metadata_dict: Dict[str, PlanEntry] = {}

        # Zachowaj istniejące metadane dla niezmienionych lub awaryjnych planów
        plans_json_path = os.path.join(self.data_dir, "plans.json")
        if os.path.exists(plans_json_path):
            try:
                with open(plans_json_path, "r", encoding="utf-8") as f:
                    old_index = json.load(f)
                    old_plans = old_index.get("plans", [])
                    if isinstance(old_plans, list):
                        for p_entry in old_plans:
                            if isinstance(p_entry, dict) and "id" in p_entry:
                                plans_metadata_dict[str(p_entry["id"])] = p_entry
                    elif isinstance(old_plans, dict):
                        for pid, p_entry in old_plans.items():
                            if isinstance(p_entry, dict):
                                plans_metadata_dict[str(pid)] = p_entry
            except Exception:
                pass

        # 3. Przetwarzanie planów wymagających odświeżenia
        for plan in plans_to_fetch:
            src = source_map.get(plan.id)
            if not src:
                continue

            logger.info(f"Pobieranie i przetwarzanie planu {plan.id} ({plan.name})...")
            try:
                schedule_by_group = src.fetch_schedule(plan.id)
                if not schedule_by_group:
                    raise ValueError(f"Plan {plan.id} zwrócił 0 grup (pusty harmonogram).")

                groups = sorted(list(schedule_by_group.keys()))
                staged_schedules: Dict[str, GroupSchedule] = {}
                staged_ics: Dict[str, str] = {}

                tenant_aliases = self.tenant_config.get("aliases") or {}
                subject_aliases = tenant_aliases.get("subjects") if isinstance(tenant_aliases, dict) and "subjects" in tenant_aliases else tenant_aliases
                teacher_aliases = tenant_aliases.get("teachers", {}) if isinstance(tenant_aliases, dict) and "teachers" in tenant_aliases else {}

                for grp in groups:
                    raw_lessons = schedule_by_group[grp]
                    contract_lessons: List[Lesson] = []

                    for rl in raw_lessons:
                        clean_subject = rl.subject
                        if isinstance(subject_aliases, dict) and clean_subject in subject_aliases:
                            clean_subject = subject_aliases[clean_subject]

                        clean_teacher = rl.teacher
                        if clean_teacher and isinstance(teacher_aliases, dict) and clean_teacher in teacher_aliases:
                            clean_teacher = teacher_aliases[clean_teacher]

                        occurrences = rl.occurrences
                        if occurrences is None:
                            occurrences = expand_occurrences(rl, academic_calendar)

                        first_occ = occurrences[0]["date"] if occurrences else None
                        lesson_id = generate_lesson_id(rl, first_occurrence_date=first_occ)

                        lesson_dict: Lesson = {
                            "id": lesson_id,
                            "subject": clean_subject,
                            "raw_subject": rl.raw_subject or rl.subject,
                            "start_time": rl.start_time,
                            "end_time": rl.end_time,
                            "duration_minutes": rl.duration_minutes,
                            "form": rl.form,
                            "teacher": clean_teacher,
                            "room": rl.room,
                            "remote": rl.remote,
                            "hideable": rl.hideable,
                            "day_of_week": rl.day_of_week,
                            "occurrences": occurrences,
                            "groups": rl.groups
                        }
                        contract_lessons.append(lesson_dict)

                    group_schedule: GroupSchedule = {
                        "schema_version": 1,
                        "plan_id": plan.id,
                        "group": grp,
                        "generated_at": generated_timestamp,
                        "lessons": contract_lessons
                    }

                    # Zasada last known good: walidacja przed zapisem na dysk
                    is_valid, val_errors = validate_group_schedule(group_schedule)
                    if not is_valid:
                        raise ValueError(f"Błąd walidacji {plan.id}_{grp}: {val_errors}")

                    ics_domain = self.tenant_config.get("source_label") or "schedule.local"
                    ics_data = generate_group_ics(group_schedule, grp, institution_domain=ics_domain)
                    staged_schedules[grp] = group_schedule
                    staged_ics[grp] = ics_data

                # Wszystkie grupy planu przeszły walidację -> oblicz diff i zapisz na dysk
                for grp in groups:
                    old_sched = read_existing_group_schedule(self.schedules_dir, plan.id, grp)
                    new_sched = staged_schedules[grp]
                    diff_res = diff_schedules(old_sched, new_sched)
                    if diff_res["has_changes"]:
                        plan_diffs[f"{plan.id}_{grp}"] = diff_res

                    write_group_schedule(self.schedules_dir, plan.id, grp, new_sched)
                    write_group_ics(self.calendars_dir, plan.id, grp, staged_ics[grp])
                    total_groups_processed += 1

                # Sukces planu: odnotuj w stanie i metadanych
                self.detector.record_success(plan, len(groups))
                entry: PlanEntry = {
                    "id": plan.id,
                    "name": plan.name,
                    "institution": plan.institution,
                    "faculty": plan.faculty,
                    "study_mode": plan.study_mode,
                    "semester_number": plan.semester_number,
                    "published_at": plan.published_at,
                    "version_token": plan.version_token,
                    "groups": groups,
                    "archived": is_winter_plan_archived(plan.semester_number, academic_calendar, generated_timestamp)
                }
                plans_metadata_dict[plan.id] = entry

            except Exception as e:
                logger.warning(f"Fail-safe (last known good) dla planu {plan.id}: {e}")
                failed_plans.append(plan.id)
                # Zachowujemy poprzednie pliki JSON i ICS na dysku oraz poprzedni stan w detectorze

        # Aktualizuj metadane dla planów, które pozostały niezmienione
        for plan in plans_unchanged:
            existing = plans_metadata_dict.get(plan.id)
            groups_list = (existing.get("groups") if existing else None) or plan.groups or []
            plans_metadata_dict[plan.id] = {
                "id": plan.id,
                "name": plan.name,
                "institution": plan.institution,
                "faculty": plan.faculty,
                "study_mode": plan.study_mode,
                "semester_number": plan.semester_number,
                "published_at": plan.published_at,
                "version_token": plan.version_token,
                "groups": groups_list,
                "archived": is_winter_plan_archived(plan.semester_number, academic_calendar, generated_timestamp)
            }

        # Zapis plans.json zgodny z PlansIndex (schema_version: 1, tenant, plans: list)
        plans_list: List[PlanEntry] = list(plans_metadata_dict.values())
        plans_index: PlansIndex = {
            "schema_version": 1,
            "tenant": tenant_id,
            "generated_at": generated_timestamp,
            "plans": plans_list
        }
        idx_ok, idx_errors = validate_plans_index(plans_index)
        if not idx_ok:
            logger.warning(f"Ostrzeżenie walidacji plans.json: {idx_errors}")
        write_plans_index(self.data_dir, plans_index)

        # 4. Cross-reference
        logger.info("Budowanie połączonych indeksów wyszukiwarki cross_reference.json...")
        cross_ref_path = os.path.join(self.data_dir, "cross_reference.json")
        build_cross_reference_indexes(
            plans_metadata=plans_index,
            schedules_dir=self.schedules_dir,
            output_path=cross_ref_path,
            curriculum_catalog_path=self.tenant_config.get("curriculum_catalog_path")
        )

        # 5. Zapis stanu
        self.detector.save_state()

        logger.info(
            f"Build zakończony: {total_groups_processed} przetworzonych grup w tej iteracji. "
            f"Błędy planów: {len(failed_plans)}"
        )
        return {
            "total_groups_processed": total_groups_processed,
            "failed_plans": failed_plans,
            "total_plans": len(plans_list),
            "diffs": plan_diffs
        }


def resolve_tenant_dir(tenant_id: str, repo_root: Optional[str] = None) -> str:
    base = repo_root or _REPO_ROOT
    clean_id = tenant_id.replace(":", "/").strip("/")
    if clean_id in ("sggw/weta", "sggw_weta"):
        clean_id = "sggw/wmw"
    if tenant_id == "sggw_weta":
        tenant_id = "sggw_wmw"
    parts = clean_id.split("/")
    hierarchical = os.path.join(base, "tenants", *parts)
    if os.path.exists(hierarchical):
        return hierarchical

    if "_" in tenant_id:
        u_parts = tenant_id.split("_", 1)
        u_hierarchical = os.path.join(base, "tenants", *u_parts)
        if os.path.exists(u_hierarchical):
            return u_hierarchical

    flat = os.path.join(base, "tenants", tenant_id)
    if os.path.exists(flat):
        return flat

    raise FileNotFoundError(f"Brak pliku konfiguracji tenanta dla: {tenant_id}")


def load_tenant_config(tenant_id: str, repo_root: Optional[str] = None) -> Dict[str, Any]:
    base = repo_root or _REPO_ROOT
    tenant_dir = resolve_tenant_dir(tenant_id, repo_root=base)
    config_file = os.path.join(tenant_dir, "config.json")
    if not os.path.exists(config_file):
        raise FileNotFoundError(f"Brak pliku konfiguracji tenanta: {config_file}")
    with open(config_file, "r", encoding="utf-8") as f:
        config = json.load(f)

    cal_file = os.path.join(tenant_dir, "academic_calendar.json")
    if os.path.exists(cal_file):
        with open(cal_file, "r", encoding="utf-8") as f:
            config["academic_calendar"] = json.load(f)

    catalog_path = config.get("curriculum_catalog_path")
    if catalog_path:
        full_catalog = os.path.join(base, catalog_path) if not os.path.isabs(catalog_path) else catalog_path
        if os.path.exists(full_catalog):
            config["curriculum_catalog_path"] = full_catalog
        else:
            logger.warning(f"Zdefiniowany katalog przedmiotów nie istnieje: {full_catalog}")

    aliases_file = os.path.join(tenant_dir, "aliases.json")
    if os.path.exists(aliases_file):
        try:
            with open(aliases_file, "r", encoding="utf-8") as af:
                config["aliases"] = json.load(af)
        except Exception as e:
            logger.warning(f"Błąd podczas wczytywania {aliases_file}: {e}")

    return config


def get_tenant_sources(tenant_id: str, tenant_config: Optional[Dict[str, Any]] = None) -> List[ScheduleSource]:
    config = tenant_config
    if config is None:
        try:
            config = load_tenant_config(tenant_id)
        except Exception:
            config = {}

    adapters = config.get("source_adapters") or config.get("adapters")
    if adapters:
        import importlib
        sources_list: List[ScheduleSource] = []
        for adapter_path in adapters:
            if ":" in adapter_path:
                mod_name, cls_name = adapter_path.split(":", 1)
            else:
                parts = adapter_path.rsplit(".", 1)
                mod_name, cls_name = parts[0], parts[1]
            mod = importlib.import_module(mod_name)
            cls = getattr(mod, cls_name)
            sources_list.append(cls())
        return sources_list

    # Dynamiczny fallback do sources.<tenant_id>.adapter
    import importlib
    try:
        mod = importlib.import_module(f"sources.{tenant_id}.adapter")
        sources_list = []
        for attr_name in dir(mod):
            attr = getattr(mod, attr_name)
            if isinstance(attr, type) and issubclass(attr, ScheduleSource) and attr is not ScheduleSource:
                sources_list.append(attr())
        if sources_list:
            return sources_list
    except ModuleNotFoundError:
        pass

    raise ValueError(f"Nieznany tenant lub brak zdefiniowanych źródeł (source_adapters) dla: {tenant_id}")


def discover_all_tenants(repo_root: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Skanuje katalog tenants/ w poszukiwaniu wszystkich podkatalogów zawierających config.json.
    Zwraca listę metadanych tenantów posortowaną wg nazwy uczelni i wydziału.
    """
    base = repo_root or _REPO_ROOT
    tenants_dir = os.path.join(base, "tenants")
    results = []
    if not os.path.exists(tenants_dir):
        return results

    for root, dirs, files in os.walk(tenants_dir):
        rel = os.path.relpath(root, tenants_dir)
        parts = rel.replace("\\", "/").split("/")
        if any(p.startswith(("_", ".")) for p in parts):
            continue

        if "config.json" in files:
            tenant_slug = "/".join(parts)
            try:
                cfg = load_tenant_config(tenant_slug, repo_root=base)
                has_logo = os.path.exists(os.path.join(root, "logo.svg"))
                has_icon = os.path.exists(os.path.join(root, "icon.png"))

                tenant_id = cfg.get("id") or tenant_slug.replace("/", "_")
                institution = cfg.get("institution", "")
                institution_full = cfg.get("institution_full", institution)
                faculty = cfg.get("faculty", "")
                faculty_full = cfg.get("faculty_full", faculty)

                logo_rel_path = f"assets/tenants/{tenant_id}/logo.svg" if has_logo else None
                icon_rel_path = f"assets/tenants/{tenant_id}/icon.png" if has_icon else None

                results.append({
                    "tenant_id": tenant_id,
                    "path": tenant_slug,
                    "institution": institution,
                    "institution_full": institution_full,
                    "faculty": faculty,
                    "faculty_full": faculty_full,
                    "name": cfg.get("name", f"{institution_full} — {faculty_full}"),
                    "short_name": cfg.get("short_name", f"Plan {faculty}"),
                    "icon": cfg.get("icon", "📅"),
                    "theme_color": cfg.get("theme_color", "#0d233a"),
                    "plugin_version": cfg.get("plugin_version", "1.0.0"),
                    "plugin_author": cfg.get("plugin_author", ""),
                    "source_label": cfg.get("source_label", ""),
                    "has_logo": has_logo,
                    "has_icon": has_icon,
                    "logo_url": logo_rel_path,
                    "icon_url": icon_rel_path,
                    "url": f"./{tenant_slug}/"
                })
            except Exception as e:
                logger.warning(f"Błąd podczas wczytywania tenanta z {root}: {e}")

    results.sort(key=lambda t: (t["institution_full"], t["faculty_full"]))
    return results


def generate_tenants_registry(repo_root: Optional[str] = None, dist_dir: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Generuje statyczny plik dist/tenants.json oraz kopiuje logotypy tenantów do dist/assets/tenants/<tenant_id>/.
    """
    base = repo_root or _REPO_ROOT
    target_dist = dist_dir or os.path.join(base, "dist")
    os.makedirs(target_dist, exist_ok=True)

    tenants = discover_all_tenants(repo_root=base)

    assets_dir = os.path.join(target_dist, "assets")
    os.makedirs(assets_dir, exist_ok=True)

    uni_svg_src = os.path.join(base, "uniplaner.svg")
    if os.path.exists(uni_svg_src):
        shutil.copy2(uni_svg_src, os.path.join(assets_dir, "uniplaner.svg"))
        shutil.copy2(uni_svg_src, os.path.join(target_dist, "uniplaner.svg"))

    for t in tenants:
        t_id = t["tenant_id"]
        t_dir = resolve_tenant_dir(t["path"], repo_root=base)
        t_assets = os.path.join(assets_dir, "tenants", t_id)
        os.makedirs(t_assets, exist_ok=True)

        if t["has_logo"]:
            shutil.copy2(os.path.join(t_dir, "logo.svg"), os.path.join(t_assets, "logo.svg"))
        if t["has_icon"]:
            shutil.copy2(os.path.join(t_dir, "icon.png"), os.path.join(t_assets, "icon.png"))

    registry_path = os.path.join(target_dist, "tenants.json")
    with open(registry_path, "w", encoding="utf-8") as f:
        json.dump(tenants, f, ensure_ascii=False, indent=2)

    logger.info(f"Wygenerowano rejestr {len(tenants)} tenantów w {registry_path}")
    return tenants


def build_portal(dist_dir: Optional[str] = None, repo_root: Optional[str] = None) -> None:
    """
    Kopiuje pliki portalu (portal/) do dist/ i generuje tenants.json.
    """
    base = repo_root or _REPO_ROOT
    target_dist = dist_dir or os.path.join(base, "dist")
    os.makedirs(target_dist, exist_ok=True)

    portal_dir = os.path.join(base, "portal")
    if os.path.exists(portal_dir):
        for item in os.listdir(portal_dir):
            s = os.path.join(portal_dir, item)
            d = os.path.join(target_dist, item)
            if os.path.isdir(s):
                shutil.copytree(s, d, dirs_exist_ok=True)
            else:
                shutil.copy2(s, d)

    generate_tenants_registry(repo_root=base, dist_dir=target_dist)


def build_all_tenants(
    dist_dir: Optional[str] = None,
    force: bool = False,
    limit: Optional[int] = None,
    repo_root: Optional[str] = None
) -> Dict[str, Any]:
    """
    Buduje portal w katalogu głównym dist/ oraz każdego wykrytego tenanta w podkatalogu dist/<u_id>/<w_id>/.
    """
    base = repo_root or _REPO_ROOT
    target_dist = dist_dir or os.path.join(base, "dist")

    logger.info("=== Rozpoczynanie multi-tenant buildu Uniplaner ===")


    tenants = discover_all_tenants(repo_root=base)
    results = {}
    for t in tenants:
        t_slug = t["path"]
        t_dist = os.path.join(target_dist, *t_slug.split("/"))
        logger.info(f"--- Budowanie tenanta: {t_slug} do {t_dist} ---")
        try:
            res = build_tenant(t_slug, dist_dir=t_dist, force=force, limit=limit)
            results[t_slug] = res
        except Exception as e:
            logger.error(f"Błąd podczas budowania tenanta {t_slug}: {e}", exc_info=True)
            results[t_slug] = {"error": str(e)}

    build_portal(dist_dir=target_dist, repo_root=base)
    return results


def build_tenant(
    tenant_id: str,
    dist_dir: Optional[str] = None,
    force: bool = False,
    plan_filter: Optional[List[str]] = None,
    limit: Optional[int] = None
) -> Dict[str, Any]:
    if tenant_id == "all":
        return build_all_tenants(dist_dir=dist_dir, force=force, limit=limit, repo_root=_REPO_ROOT)
    if tenant_id == "portal":
        build_portal(dist_dir=dist_dir, repo_root=_REPO_ROOT)
        return {"portal": True}

    import shutil
    base = _REPO_ROOT
    target_dist = dist_dir or os.path.join(base, "dist")
    config = load_tenant_config(tenant_id, repo_root=base)
    sources = get_tenant_sources(tenant_id, tenant_config=config)

    try:
        from scripts.sync_version import sync_version
        sync_version()
    except Exception as e:
        logger.debug(f"Pominięto synchronizację wersji: {e}")

    os.makedirs(target_dist, exist_ok=True)
    web_dir = os.path.join(base, "web")
    if os.path.exists(web_dir):
        for item in os.listdir(web_dir):
            s = os.path.join(web_dir, item)
            d = os.path.join(target_dist, item)
            if os.path.isdir(s):
                shutil.copytree(s, d, dirs_exist_ok=True)
            else:
                shutil.copy2(s, d)

    # Dołączenie motywu tenanta (theme.css)
    tenant_dir = resolve_tenant_dir(tenant_id, repo_root=base)
    theme_file = os.path.join(tenant_dir, "theme.css")
    if os.path.exists(theme_file):
        with open(theme_file, "r", encoding="utf-8") as tf:
            theme_css = tf.read()
        target_style = os.path.join(target_dist, "style.css")
        if os.path.exists(target_style):
            with open(target_style, "a", encoding="utf-8") as sf:
                sf.write("\n/* Tenant Theme Overrides */\n" + theme_css)

    # Modularne ikony tenanta i branding
    tenant_icon = os.path.join(tenant_dir, "icon.png")
    tenant_logo = os.path.join(tenant_dir, "logo.svg")
    has_icon = os.path.exists(tenant_icon)
    has_logo = os.path.exists(tenant_logo)

    if has_icon:
        for target_name in ["icon.png", "apple-touch-icon.png", "favicon.png", "icon-192.png", "icon-512.png"]:
            shutil.copy2(tenant_icon, os.path.join(target_dist, target_name))

    if has_logo:
        shutil.copy2(tenant_logo, os.path.join(target_dist, "logo.svg"))

    index_html_path = os.path.join(target_dist, "index.html")
    if os.path.exists(index_html_path):
        with open(index_html_path, "r", encoding="utf-8") as hf:
            html_text = hf.read()
        if has_icon:
            html_text = re.sub(
                r'<link rel="icon"\s+href="[^"]+">',
                '<link rel="icon" type="image/png" href="icon.png">',
                html_text
            )
        if has_logo:
            html_text = html_text.replace('src="planwn.svg"', 'src="logo.svg"')
        elif has_icon:
            html_text = html_text.replace('src="planwn.svg"', 'src="icon.png"')
        with open(index_html_path, "w", encoding="utf-8") as hf:
            hf.write(html_text)

    # Dynamiczny manifest.json per-tenant (Zainstalowana nazwa PWA: "Plan [akronim]")
    faculty_abbr = config.get("faculty", "").strip()
    pwa_app_name = f"Plan {faculty_abbr}".strip() if faculty_abbr else config.get("short_name", "Plan Zajęć")
    manifest_data = {
        "name": pwa_app_name,
        "short_name": pwa_app_name,
        "start_url": "./",
        "scope": "./",
        "display": "standalone",
        "background_color": config.get("theme_color", "#ffffff"),
        "theme_color": config.get("theme_color", "#0d233a"),
        "description": config.get("name", "Plan Zajęć"),
        "icons": [
            {
                "src": "icon.png" if has_icon else "icon-192.png",
                "sizes": "192x192",
                "type": "image/png",
                "purpose": "any"
            },
            {
                "src": "icon.png" if has_icon else "icon-512.png",
                "sizes": "512x512",
                "type": "image/png",
                "purpose": "any"
            }
        ]
    }
    with open(os.path.join(target_dist, "manifest.json"), "w", encoding="utf-8") as mf:
        json.dump(manifest_data, mf, ensure_ascii=False, indent=2)

    # Scalanie changeloga: globalny web/changelog.json + lokalny tenant changelog.json
    tenant_changelog = os.path.join(tenant_dir, "changelog.json")
    global_changelog = os.path.join(base, "web", "changelog.json")
    all_changelogs = []
    if os.path.exists(global_changelog):
        try:
            with open(global_changelog, "r", encoding="utf-8") as gf:
                g_data = json.load(gf)
                if isinstance(g_data, list):
                    all_changelogs.extend(g_data)
        except Exception as e:
            logger.warning(f"Błąd wczytywania globalnego changeloga: {e}")

    if os.path.exists(tenant_changelog):
        try:
            with open(tenant_changelog, "r", encoding="utf-8") as tf:
                t_data = json.load(tf)
                if isinstance(t_data, list):
                    faculty_tag = config.get("faculty", "Wydział")
                    for entry in t_data:
                        t_copy = dict(entry)
                        if "title" in t_copy and not t_copy["title"].startswith(f"[{faculty_tag}]"):
                            t_copy["title"] = f"[{faculty_tag}] {t_copy['title']}"
                        all_changelogs.append(t_copy)
        except Exception as e:
            logger.warning(f"Błąd wczytywania changeloga tenanta: {e}")

    if all_changelogs:
        all_changelogs.sort(key=lambda x: str(x.get("date", "")), reverse=True)
        with open(os.path.join(target_dist, "changelog.json"), "w", encoding="utf-8") as cf:
            json.dump(all_changelogs, cf, ensure_ascii=False, indent=2)

    data_dir = os.path.join(target_dist, "data")
    os.makedirs(data_dir, exist_ok=True)
    with open(os.path.join(data_dir, "tenant_config.json"), "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)

    if "academic_calendar" in config:
        with open(os.path.join(data_dir, "academic_calendar.json"), "w", encoding="utf-8") as f:
            json.dump(config["academic_calendar"], f, ensure_ascii=False, indent=2)

    events_file = os.path.join(tenant_dir, "events.json")
    if os.path.exists(events_file):
        shutil.copy2(events_file, os.path.join(data_dir, "events.json"))

    orchestrator = BuildOrchestrator(
        tenant_config=config,
        sources=sources,
        dist_dir=target_dist
    )
    return orchestrator.run(force=force, plan_filter=plan_filter, limit=limit)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    import argparse
    parser = argparse.ArgumentParser(description="Multi-tenant Static Build Orchestrator")
    parser.add_argument("--tenant", type=str, default="umg_wn", help="Tenant ID (umg_wn, sggw_wmw, all, portal)")
    parser.add_argument("--portal", action="store_true", help="Build landing page portal only")
    parser.add_argument("--all", action="store_true", help="Build portal and all discovered tenants")
    parser.add_argument("--out", "--output", dest="out", type=str, default="dist", help="Output directory")
    parser.add_argument("--force", action="store_true", help="Force rebuild all plans")
    parser.add_argument("--check-only", action="store_true", help="Only check if any plans changed via discover()")
    parser.add_argument("--plan", type=str, default=None, help="Filter specific plan ID")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of plans")
    args = parser.parse_args()

    plans_list = [p.strip() for p in args.plan.split(",")] if args.plan else None
    if args.portal or args.tenant == "portal":
        build_portal(dist_dir=args.out)
    elif args.all or args.tenant == "all":
        build_all_tenants(dist_dir=args.out, force=args.force, limit=args.limit)
    elif args.check_only:
        config = load_tenant_config(args.tenant)
        sources = get_tenant_sources(args.tenant, tenant_config=config)
        orchestrator = BuildOrchestrator(tenant_config=config, sources=sources, dist_dir=args.out)
        changed = orchestrator.check_only(sources=sources)
        logger.info(f"Check-only result for {args.tenant}: {len(changed)} changed plans: {[p.id for p in changed]}")
    else:
        build_tenant(args.tenant, dist_dir=args.out, force=args.force, plan_filter=plans_list, limit=args.limit)
