"""Offline backend-path checks; no renderer packages, SDK or network required.

Run with: python -B -m unittest discover -s tools/test/doc-export -p test_python_home.py
"""
import os
from pathlib import Path
import runpy
import sys
import tempfile
import unittest
from unittest.mock import patch

SHIM = Path(__file__).resolve().parents[3] / "payload" / ".agents" / "skills" / "sn-doc-export" / "render.py"


class PythonHomeTests(unittest.TestCase):
    def setUp(self):
        original = sys.path[:]
        self.addCleanup(lambda: sys.path.__setitem__(slice(None), original))

    def inject(self, home):
        with patch.dict(os.environ):
            if home is None:
                os.environ.pop("SN_AGENT_HOME", None)
            else:
                os.environ["SN_AGENT_HOME"] = home
            shim = runpy.run_path(str(SHIM), run_name="backend_path_test")
        return shim["_inject_paths"]()

    def assert_rejected_without_import_changes(self, home, message):
        before = sys.path[:]
        issues = self.inject(home)
        self.assertTrue(issues)
        self.assertIn(message, " ".join(issues))
        self.assertEqual(sys.path, before)

    def test_unset_empty_and_whitespace_have_no_default(self):
        for home in (None, "", "   "):
            with self.subTest(home=home):
                self.assert_rejected_without_import_changes(home, "no default")

    def test_relative_home_is_rejected(self):
        self.assert_rejected_without_import_changes("relative-backend", "absolute path")

    def test_missing_home_is_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            self.assert_rejected_without_import_changes(str(Path(root) / "absent"), "does not exist")

    def test_partial_layout_is_not_added_to_import_path(self):
        with tempfile.TemporaryDirectory() as root:
            (Path(root) / "tools").mkdir()
            self.assert_rejected_without_import_changes(root, "_doc_lib not found")

    def test_explicit_complete_layout_is_used_without_other_discovery(self):
        with tempfile.TemporaryDirectory() as root:
            lib = Path(root) / "tools" / "_doc_lib"
            lib.mkdir(parents=True)
            before = sys.path[:]
            self.assertEqual(self.inject(root), [])
            self.assertEqual(sys.path, [str(lib.parent), str(lib)] + before)


if __name__ == "__main__":
    unittest.main()
