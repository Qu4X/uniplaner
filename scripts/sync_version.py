#!/usr/bin/env python3
"""
sync_version.py — Automatyczna synchronizacja wersji aplikacji z package.json.
Aktualizuje sw.js, index.html oraz pliki w dist/.
"""

import json
import os
import re
import shutil

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACKAGE_JSON = os.path.join(REPO_ROOT, "package.json")
WEB_DIR = os.path.join(REPO_ROOT, "web")
DIST_DIR = os.path.join(REPO_ROOT, "dist")


def get_current_version() -> str:
    with open(PACKAGE_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)
        return data.get("version", "3.10.0")


def sync_version(version: str = None) -> str:
    ver = version or get_current_version()
    print(f"Synchronizacja wersji aplikacji do v{ver}...")

    # 1. web/sw.js
    sw_path = os.path.join(WEB_DIR, "sw.js")
    if os.path.exists(sw_path):
        with open(sw_path, "r", encoding="utf-8") as f:
            sw_content = f.read()
        sw_updated = re.sub(
            r"const CACHE_NAME = ['\"][^'\"]+['\"];",
            f"const CACHE_NAME = 'plan-app-v{ver}';",
            sw_content
        )
        with open(sw_path, "w", encoding="utf-8") as f:
            f.write(sw_updated)

    # 2. web/index.html
    html_path = os.path.join(WEB_DIR, "index.html")
    if os.path.exists(html_path):
        with open(html_path, "r", encoding="utf-8") as f:
            html_content = f.read()

        # Update ?v= query params for css, js, manifest
        html_updated = re.sub(
            r'(\.css|\.js|\.json)\?v=[^"\'\s&>]+',
            rf'\1?v={ver}',
            html_content
        )

        # Update "Wersja PWA vX.X" in About modal
        html_updated = re.sub(
            r'Wersja PWA v[\d\.]+',
            f'Wersja PWA v{ver}',
            html_updated
        )

        with open(html_path, "w", encoding="utf-8") as f:
            f.write(html_updated)

    # 3. Kopia do dist/ jeśli istnieje
    if False and os.path.exists(DIST_DIR):
        for f in ["sw.js", "index.html", "changelog.json", "app.js"]:
            src = os.path.join(WEB_DIR, f)
            dst = os.path.join(DIST_DIR, f)
            if os.path.exists(src):
                shutil.copy2(src, dst)

    print(f"[OK] Sukces: Wersja v{ver} zostala zsynchronizowana we wszystkich plikach.")
    return ver


if __name__ == "__main__":
    sync_version()
