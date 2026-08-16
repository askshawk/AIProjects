"""Production config guards: a public deploy must not inherit dev defaults."""

import pytest

from app import config

GOOD = {
    "APP_ENV": "production",
    "JWT_SECRET": "b1946ac92492d2347c6235b4d2611184",
    "CORS_ORIGINS": "https://imperium.vercel.app",
    "DATABASE_URL": "postgresql+psycopg://u:p@host/imperium",
    "COOKIE_SECURE": "1",
}


def test_dev_is_the_default_and_is_never_blocked():
    assert not config.is_production({})
    # A totally default dev environment must start without complaint.
    config.assert_production_ready({})


def test_a_correct_production_config_passes():
    assert config.is_production(GOOD)
    assert config.production_problems(GOOD) == []
    config.assert_production_ready(GOOD)


@pytest.mark.parametrize(
    "override, expected",
    [
        ({"JWT_SECRET": config.DEV_JWT_SECRET}, "JWT_SECRET"),
        ({"CORS_ORIGINS": config.DEFAULT_CORS}, "CORS_ORIGINS"),
        ({"CORS_ORIGINS": "*"}, "'*'"),
        ({"DATABASE_URL": "sqlite:///./imperium.db"}, "SQLite"),
        ({"COOKIE_SECURE": "0"}, "COOKIE_SECURE"),
    ],
)
def test_each_dev_default_is_caught(override, expected):
    env = {**GOOD, **override}
    problems = config.production_problems(env)
    assert any(expected in p for p in problems), problems
    with pytest.raises(RuntimeError, match="Refusing to start"):
        config.assert_production_ready(env)


def test_a_missing_setting_counts_as_the_default():
    """Absent is as dangerous as wrong — an unset JWT_SECRET falls back to the
    published development value."""
    env = {k: v for k, v in GOOD.items() if k != "JWT_SECRET"}
    assert any("JWT_SECRET" in p for p in config.production_problems(env))


def test_every_problem_is_reported_at_once():
    """One restart should reveal the whole list, not the next one each time."""
    problems = config.production_problems({"APP_ENV": "production"})
    assert len(problems) >= 4


def test_dev_config_is_not_checked_even_when_wrong():
    """The guards are about production; local development keeps its friendly
    defaults."""
    assert config.production_problems({"JWT_SECRET": config.DEV_JWT_SECRET})
    config.assert_production_ready({"JWT_SECRET": config.DEV_JWT_SECRET})  # APP_ENV unset
