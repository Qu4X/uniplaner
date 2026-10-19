#!/usr/bin/env python3
"""
Cienki wrapper CLI dla kompilacji statycznej tenanta UMG WN (deleguje do core.build).
"""
import argparse
import logging
import sys
from typing import List, Optional
from core.build import build_tenant

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("build_static")


def build(
    limit: Optional[int] = None,
    plan_ids: Optional[List[str]] = None,
    filter_query: Optional[str] = None,
    dist_dir: str = "dist",
    force: bool = False
) -> int:
    res = build_tenant(
        "umg_wn",
        dist_dir=dist_dir,
        force=force,
        plan_filter=plan_ids,
        limit=limit
    )
    total = res.get("total_groups_processed", 0)
    total_plans = res.get("total_plans", 0)
    if total == 0 and total_plans == 0:
        logger.error("Quality gate failure: 0 plans and 0 groups processed. Aborting build.")
        sys.exit(1)
    return total


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate static schedule site for UMG (wrapper for core.build)")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of plans processed")
    parser.add_argument("--plan-ids", type=str, default=None, help="Comma-separated plan IDs")
    parser.add_argument("--filter", type=str, default=None, help="Filter plans by name substring")
    parser.add_argument("--force", action="store_true", help="Force rebuild all plans")
    args = parser.parse_args()
    plan_ids_list = [p.strip() for p in args.plan_ids.split(",")] if args.plan_ids else None
    build(limit=args.limit, plan_ids=plan_ids_list, filter_query=args.filter, force=args.force)
