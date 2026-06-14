import importlib.util
import json
from pathlib import Path

import pytest


MODULE_PATH = (
    Path(__file__).resolve().parents[1] / "src" / "Pro-CAD" / "src" / "data_loader.py"
)
SPEC = importlib.util.spec_from_file_location("procad_data_loader", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
DATA_LOADER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DATA_LOADER)


def test_load_dataset_data_accepts_json_list(tmp_path: Path) -> None:
    dataset_path = tmp_path / "train.json"
    expected = [{"uid": "0001", "description": "Simple block"}]
    dataset_path.write_text(json.dumps(expected), encoding="utf-8")

    loaded = DATA_LOADER.load_dataset_data(str(dataset_path))

    assert loaded == expected


def test_load_dataset_data_accepts_samples_wrapper(tmp_path: Path) -> None:
    dataset_path = tmp_path / "train.json"
    payload = {"samples": [{"uid": "0002", "description": "Bracket"}]}
    dataset_path.write_text(json.dumps(payload), encoding="utf-8")

    loaded = DATA_LOADER.load_dataset_data(str(dataset_path))

    assert loaded == payload["samples"]


def test_load_dataset_data_uses_json_sibling_for_legacy_pickle_path(tmp_path: Path) -> None:
    legacy_path = tmp_path / "train.pkl"
    json_path = tmp_path / "train.json"
    expected = [{"uid": "0003", "description": "Legacy dataset"}]
    json_path.write_text(json.dumps(expected), encoding="utf-8")

    loaded = DATA_LOADER.load_dataset_data(str(legacy_path))

    assert loaded == expected


def test_load_dataset_data_rejects_pickle_without_json_sibling(tmp_path: Path) -> None:
    legacy_path = tmp_path / "train.pkl"

    with pytest.raises(ValueError, match="Refusing to load unsafe pickle dataset"):
        DATA_LOADER.load_dataset_data(str(legacy_path))
