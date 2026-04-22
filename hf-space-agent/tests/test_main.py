import unittest

from startup_config import resolve_startup_enabled_skills


class MainStartupSkillsTest(unittest.TestCase):
    def test_resolve_startup_enabled_skills_preserves_explicit_selection(self):
        self.assertEqual(resolve_startup_enabled_skills(["alpha", "beta"]), ["alpha", "beta"])

    def test_resolve_startup_enabled_skills_treats_empty_as_load_all(self):
        self.assertIsNone(resolve_startup_enabled_skills([]))


if __name__ == "__main__":
    unittest.main()
