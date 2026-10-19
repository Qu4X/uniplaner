"""
Wykrywanie zmian w planach zajęć na podstawie version_token.
Umożliwia selektywne pobieranie tylko zmienionych planów, oszczędzając ruch sieciowy i czas buildu.
"""
import os
import json
import logging
from typing import Dict, List, Tuple, Optional, Any
from sources.base import PlanMetadata

logger = logging.getLogger("core.detector")


class ChangeDetector:
    """
    Zarządza stanem kompilacji (.build-state.json) i wykrywa zmiany na podstawie tokenów wersji.
    """

    def __init__(self, state_file_path: str):
        self.state_file_path = state_file_path
        self.state: Dict[str, Any] = self._load_state()

    def _load_state(self) -> Dict[str, Any]:
        if os.path.exists(self.state_file_path):
            try:
                with open(self.state_file_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"Nie udało się wczytać stanu buildu {self.state_file_path}: {e}")
        return {"plans": {}}

    def save_state(self) -> None:
        try:
            os.makedirs(os.path.dirname(os.path.abspath(self.state_file_path)), exist_ok=True)
            with open(self.state_file_path, "w", encoding="utf-8") as f:
                json.dump(self.state, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"Błąd zapisu stanu buildu {self.state_file_path}: {e}")

    def detect_changes(
        self,
        discovered_plans: List[PlanMetadata],
        force: bool = False
    ) -> Tuple[List[PlanMetadata], List[PlanMetadata]]:
        """
        Porównuje discovered_plans ze stanem poprzedniego buildu.
        Zwraca: (plans_to_fetch, plans_unchanged)
        """
        if force:
            logger.info("Wymuszono pełny build (--force). Wszystkie plany zostaną przetworzone.")
            return list(discovered_plans), []

        plans_to_fetch: List[PlanMetadata] = []
        plans_unchanged: List[PlanMetadata] = []
        saved_plans = self.state.get("plans", {})

        for plan in discovered_plans:
            prev = saved_plans.get(plan.id)
            if not prev:
                logger.info(f"Nowy plan: {plan.id} ({plan.name})")
                plans_to_fetch.append(plan)
            elif prev.get("version_token") != plan.version_token:
                logger.info(
                    f"Wykryto nową wersję planu {plan.id}: "
                    f"'{prev.get('version_token')}' -> '{plan.version_token}'"
                )
                plans_to_fetch.append(plan)
            else:
                plans_unchanged.append(plan)

        return plans_to_fetch, plans_unchanged

    def record_success(self, plan: PlanMetadata, group_count: int) -> None:
        """Odnotowuje pomyślne przetworzenie planu w stanie."""
        if "plans" not in self.state:
            self.state["plans"] = {}

        self.state["plans"][plan.id] = {
            "name": plan.name,
            "version_token": plan.version_token,
            "published_at": plan.published_at,
            "group_count": group_count
        }
