"""Verify README.md exists and contains all required project documentation sections."""

from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent.parent
README_PATH = ROOT_DIR / "README.md"

REQUIRED_HEADINGS = [
    "## 1. What This Project Is",
    "## 2. Current Status",
    "## 3. How to Run",
    "## 4. Repo Map",
    "## 5. Contracts Other People Code Against",
    "## 6. Rules for Contributors and Their AI Agents",
    "## 7. Agent Briefing",
    "## 8. Decisions Log",
    "## 9. Open Questions and ASSUMED Values",
    "## 10. Changelog",
]


def test_readme_exists_and_has_required_sections():
    """README.md must exist at repo root and include all 10 required sections."""
    assert README_PATH.is_file(), "README.md is missing at repo root."
    content = README_PATH.read_text()
    for heading in REQUIRED_HEADINGS:
        assert heading in content, f"README.md is missing required heading: {heading!r}"
