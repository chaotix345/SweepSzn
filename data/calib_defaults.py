"""Fallback-model coefficients card_model.py needs when no calibrated coefficients are passed.
Loaded from the committed coefficients.json so the pipeline and the engine share one source."""
import json
import os

_PATH = os.path.join(os.path.dirname(__file__), "..", "web", "public", "data", "coefficients.json")
DEFAULT_COEFF = json.load(open(_PATH, encoding="utf-8"))
