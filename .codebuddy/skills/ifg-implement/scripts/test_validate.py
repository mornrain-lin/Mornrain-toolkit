#!/usr/bin/env python3

import contextlib
import importlib.util
import io
import json
import re
import unittest
from copy import deepcopy
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
VALIDATOR_PATH = SKILL_ROOT / "scripts" / "validate.py"
SCHEMA_PATH = SKILL_ROOT / "references" / "story.schema.json"
REFERENCE_PATH = SKILL_ROOT / "references" / "story-schema-reference.md"
GOLDEN_PATH = SKILL_ROOT / "references" / "examples" / "golden" / "public" / "story" / "story.json"

spec = importlib.util.spec_from_file_location("ifg_validate", VALIDATOR_PATH)
validator_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator_module)


def base_story():
    return {
        "meta": {"title": "测试", "version": "1.0.0", "start": "start"},
        "nodes": {
            "start": {"type": "start", "text": "开始", "next": "ending"},
            "ending": {"type": "ending", "text": "结束", "ending_type": "normal"},
        },
    }


def semantic_errors(data):
    validator = validator_module.StoryValidator(data)
    with contextlib.redirect_stdout(io.StringIO()):
        validator.run_all()
    return validator.errors


class SchemaContractTest(unittest.TestCase):
    def assert_schema_valid(self, data):
        errors = validator_module.validate_schema_contract(data)
        self.assertEqual([], errors)

    def assert_schema_invalid(self, data):
        errors = validator_module.validate_schema_contract(data)
        self.assertTrue(errors)

    def test_golden_story_passes_schema_and_semantic_validation(self):
        data = json.loads(GOLDEN_PATH.read_text(encoding="utf-8"))
        self.assert_schema_valid(data)
        self.assertEqual(0, semantic_errors(data))

    def test_reference_complete_example_passes_validation(self):
        content = REFERENCE_PATH.read_text(encoding="utf-8")
        match = re.search(r"## 完整示例.*?```jsonc\n(.*?)\n```", content, re.S)
        self.assertIsNotNone(match)
        data = json.loads(match.group(1))
        self.assert_schema_valid(data)
        self.assertEqual(0, semantic_errors(data))

    def test_schema_valid_fx_array_passes_semantic_validation(self):
        data = base_story()
        data["nodes"]["start"]["media"] = {
            "type": "video",
            "src": "https://example.com/opening.mp4",
        }
        data["nodes"]["start"]["fx"] = ["flash"]
        self.assert_schema_valid(data)
        self.assertEqual(0, semantic_errors(data))

    def test_schema_rejects_non_http_media_url(self):
        data = base_story()
        data["nodes"]["start"]["media"] = {
            "type": "video",
            "src": "mailto:test@example.com",
        }
        self.assert_schema_invalid(data)

    def test_schema_rejects_structural_violations(self):
        cases = []

        missing_title = base_story()
        del missing_title["meta"]["title"]
        cases.append(missing_title)

        one_choice = base_story()
        one_choice["nodes"]["start"]["next"] = "scene"
        one_choice["nodes"]["scene"] = {
            "type": "scene",
            "text": "选择",
            "choices": [{"label": "继续", "next": "ending"}],
        }
        cases.append(one_choice)

        invalid_transition = base_story()
        invalid_transition["nodes"]["start"]["transition"] = "spin"
        cases.append(invalid_transition)

        for data in cases:
            with self.subTest(data=data):
                self.assert_schema_invalid(data)

    def test_clip_duration_has_no_upper_limit(self):
        data = base_story()
        data["nodes"]["start"]["clipDuration"] = 3600
        self.assert_schema_valid(data)
        self.assertEqual(0, semantic_errors(data))

    def test_schema_encodes_node_type_constraints(self):
        cases = []

        start_without_next = base_story()
        del start_without_next["nodes"]["start"]["next"]
        cases.append(start_without_next)

        choice_without_choices = base_story()
        choice_without_choices["nodes"]["start"]["next"] = "choice"
        choice_without_choices["nodes"]["choice"] = {
            "type": "choice",
            "text": "选择",
        }
        cases.append(choice_without_choices)

        ending_with_next = base_story()
        ending_with_next["nodes"]["ending"]["next"] = "start"
        cases.append(ending_with_next)

        scene_with_next_and_choices = base_story()
        scene_with_next_and_choices["nodes"]["start"]["next"] = "scene"
        scene_with_next_and_choices["nodes"]["scene"] = {
            "type": "scene",
            "text": "冲突",
            "next": "ending",
            "choices": [
                {"label": "A", "next": "ending"},
                {"label": "B", "next": "ending"},
            ],
        }
        cases.append(scene_with_next_and_choices)

        for data in cases:
            with self.subTest(data=data):
                self.assert_schema_invalid(data)

    def test_cross_node_rules_remain_semantic_validation(self):
        data = base_story()
        data["nodes"]["start"]["next"] = "missing"
        self.assert_schema_valid(data)
        self.assertGreater(semantic_errors(data), 0)


if __name__ == "__main__":
    unittest.main()
