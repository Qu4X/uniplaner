"""
tests/test_portal.py — Testy jednostkowe dla generatora portalu i rejestru tenantów (core.build).
"""
import os
import json
import shutil
import tempfile
import unittest

from core.build import (
    discover_all_tenants,
    generate_tenants_registry,
    build_portal,
    build_tenant
)

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class TestPortalGeneration(unittest.TestCase):

    def setUp(self):
        self.temp_dist = tempfile.mkdtemp(prefix="uniplaner_test_portal_")

    def tearDown(self):
        shutil.rmtree(self.temp_dist, ignore_errors=True)

    def test_discover_all_tenants(self):
        tenants = discover_all_tenants(repo_root=_REPO_ROOT)
        self.assertGreaterEqual(len(tenants), 2, "Powinny zostać wykryte przynajmniej 2 tenanty (UMG WN, SGGW WMW)")
        
        tenant_ids = [t["tenant_id"] for t in tenants]
        self.assertIn("umg_wn", tenant_ids)
        self.assertIn("sggw_wmw", tenant_ids)

        for t in tenants:
            self.assertIn("institution", t)
            self.assertIn("institution_full", t)
            self.assertIn("faculty", t)
            self.assertIn("faculty_full", t)
            self.assertIn("plugin_version", t)
            self.assertIn("plugin_author", t)
            self.assertIn("url", t)
            self.assertTrue(t["url"].startswith("./"))

    def test_generate_tenants_registry(self):
        tenants = generate_tenants_registry(repo_root=_REPO_ROOT, dist_dir=self.temp_dist)
        self.assertGreaterEqual(len(tenants), 2)

        reg_path = os.path.join(self.temp_dist, "tenants.json")
        self.assertTrue(os.path.exists(reg_path), "Plik tenants.json powinien istnieć w dist/")

        with open(reg_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        self.assertIsInstance(data, list)
        self.assertEqual(len(data), len(tenants))

        # Weryfikacja skopiowanych assetów
        assets_dir = os.path.join(self.temp_dist, "assets")
        self.assertTrue(os.path.exists(os.path.join(assets_dir, "uniplaner.svg")))
        self.assertTrue(os.path.exists(os.path.join(self.temp_dist, "uniplaner.svg")))

        # Logo UMG WN
        umg_logo = os.path.join(assets_dir, "tenants", "umg_wn", "logo.svg")
        self.assertTrue(os.path.exists(umg_logo))

    def test_build_portal(self):
        build_portal(dist_dir=self.temp_dist, repo_root=_REPO_ROOT)

        self.assertTrue(os.path.exists(os.path.join(self.temp_dist, "index.html")))
        self.assertTrue(os.path.exists(os.path.join(self.temp_dist, "portal.css")))
        self.assertTrue(os.path.exists(os.path.join(self.temp_dist, "portal.js")))
        self.assertTrue(os.path.exists(os.path.join(self.temp_dist, "tenants.json")))

        # Weryfikacja zawartości index.html
        with open(os.path.join(self.temp_dist, "index.html"), "r", encoding="utf-8") as f:
            html = f.read()
        self.assertIn("Uniplaner", html)
        self.assertIn("assets/uniplaner.svg", html)
        self.assertIn("uni-search-input", html)
        self.assertIn("role=\"combobox\"", html)

    def test_build_tenant_routing_portal(self):
        res = build_tenant("portal", dist_dir=self.temp_dist)
        self.assertTrue(res.get("portal"))
        self.assertTrue(os.path.exists(os.path.join(self.temp_dist, "index.html")))


if __name__ == "__main__":
    unittest.main()
