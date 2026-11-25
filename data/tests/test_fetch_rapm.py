from fetch_rapm import normalize_name, match_rate


def test_normalize_name_strips_accents_and_suffixes():
    assert normalize_name("Nikola Jokić") == normalize_name("Nikola Jokic")
    assert normalize_name("Gary Payton II") != normalize_name("Gary Payton")
    assert normalize_name("Jaren Jackson Jr.") == "jaren jackson jr"
    assert normalize_name("  Shaquille  O'Neal ") == "shaquille oneal"


def test_rapm_match_rate_gate():
    seasons = [{"name": f"Player {i}", "year": 2000 + i, "g": 70, "mp": 30.0} for i in range(10)]
    seasons.append({"name": "Bench Guy", "year": 2001, "g": 10, "mp": 8.0})  # < 1000 min, not counted
    rapm = [{"name": f"Player {i}", "year": 2000 + i, "o": 0.0, "d": 0.0} for i in range(8)]
    assert match_rate(rapm, seasons) == 0.8


def test_match_rate_ignores_pre_1997_seasons():
    seasons = [{"name": "Old Guy", "year": 1990, "g": 80, "mp": 36.0},
               {"name": "New Guy", "year": 2005, "g": 80, "mp": 36.0}]
    rapm = [{"name": "New Guy", "year": 2005, "o": 1.0, "d": 1.0}]
    assert match_rate(rapm, seasons) == 1.0
