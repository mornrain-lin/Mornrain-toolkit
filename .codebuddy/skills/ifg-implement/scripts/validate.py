#!/usr/bin/env python3
"""
IFG (Interactive Film Game) story.json 数据合规校验器。

用法:
    # 校验项目中的 story.json（<project_root>/frontend/public/story/story.json）
    python3 validate.py <project_root> [--stage <stage>] [--watch]

    # 直接校验任意路径的 story.json（用于落盘前校验，如 /tmp 下载的文件）
    python3 validate.py --file <path/to/story.json> [--stage <stage>]

校验流程:
    所有阶段都会先执行 references/story.schema.json 结构校验。

校验阶段:
    tree    - 图结构校验（入口/孤儿/可达性）
    media   - media 素材 URL 语义校验
    logic   - 状态逻辑（变量/道具声明与引用自洽）
    full    - 全部阶段

退出码:
    0 = PASS，非 0 = FAIL（打印失败清单）
"""

import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse


# ── 工具函数 ────────────────────────────────────────────

def err(msg, node_id=None, field=None):
    """输出错误"""
    loc = f"[{node_id}" + (f".{field}" if field else "") + "] " if node_id else ""
    print(f"  FAIL  {loc}{msg}")
    return False


def warn(msg, node_id=None, field=None):
    """输出警告"""
    loc = f"[{node_id}" + (f".{field}" if field else "") + "] " if node_id else ""
    print(f"  WARN  {loc}{msg}")


def is_valid_url(url):
    """检查是否为合法 http(s) URL"""
    if not url or not isinstance(url, str):
        return False
    try:
        result = urlparse(url)
        return result.scheme in ("http", "https") and bool(result.netloc)
    except Exception:
        return False


def json_parse(filepath):
    """解析 JSON 文件，返回 (data, error)"""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
        return json.loads(content), None
    except json.JSONDecodeError as e:
        return None, f"JSON 语法错误 (行 {e.lineno}, 列 {e.colno}): {e.msg}"
    except FileNotFoundError:
        return None, f"文件不存在: {filepath}"
    except Exception as e:
        return None, str(e)


SCHEMA_PATH = Path(__file__).resolve().parent.parent / "references" / "story.schema.json"
_SCHEMA_KEYWORDS = {
    "$schema", "$id", "$ref", "$comment", "title", "description",
    "type", "required", "properties", "additionalProperties", "definitions",
    "items", "minItems", "minProperties", "enum", "const", "pattern",
    "minimum", "maximum", "format", "oneOf", "allOf", "not", "if", "then", "else",
}


def _find_unsupported_keywords(schema, path="$"):
    """确保 bundled schema 只使用本校验器支持的 Draft-07 关键字。"""
    if not isinstance(schema, dict):
        return []

    errors = [f"{path}: 不支持的 Schema 关键字 {key}" for key in schema if key not in _SCHEMA_KEYWORDS]

    for container in ("properties", "definitions"):
        for name, child in schema.get(container, {}).items():
            errors.extend(_find_unsupported_keywords(child, f"{path}.{container}.{name}"))

    for key in ("items", "additionalProperties", "not", "if", "then", "else"):
        child = schema.get(key)
        if isinstance(child, dict):
            errors.extend(_find_unsupported_keywords(child, f"{path}.{key}"))

    for key in ("oneOf", "allOf"):
        for index, child in enumerate(schema.get(key, [])):
            errors.extend(_find_unsupported_keywords(child, f"{path}.{key}[{index}]"))

    return errors


def _resolve_ref(root_schema, ref):
    if not ref.startswith("#/"):
        raise ValueError(f"仅支持本地 Schema 引用: {ref}")

    target = root_schema
    for part in ref[2:].split("/"):
        key = part.replace("~1", "/").replace("~0", "~")
        target = target[key]
    return target


def _matches_type(value, expected):
    matchers = {
        "object": lambda v: isinstance(v, dict),
        "array": lambda v: isinstance(v, list),
        "string": lambda v: isinstance(v, str),
        "boolean": lambda v: isinstance(v, bool),
        "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
        "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
        "null": lambda v: v is None,
    }
    return matchers[expected](value)


def _schema_errors(value, schema, root_schema, path="$"):
    """校验当前 story schema 使用到的 Draft-07 关键字子集。"""
    if "$ref" in schema:
        return _schema_errors(value, _resolve_ref(root_schema, schema["$ref"]), root_schema, path)

    errors = []
    expected_type = schema.get("type")
    if expected_type is not None:
        allowed_types = expected_type if isinstance(expected_type, list) else [expected_type]
        if not any(_matches_type(value, item) for item in allowed_types):
            return [f"{path}: 类型应为 {'/'.join(allowed_types)}"]

    for child in schema.get("allOf", []):
        errors.extend(_schema_errors(value, child, root_schema, path))

    if "oneOf" in schema:
        matches = sum(
            not _schema_errors(value, child, root_schema, path)
            for child in schema["oneOf"]
        )
        if matches != 1:
            errors.append(f"{path}: 必须且只能匹配一个 oneOf 分支，实际匹配 {matches} 个")

    if "not" in schema and not _schema_errors(value, schema["not"], root_schema, path):
        errors.append(f"{path}: 命中了禁止的字段组合")

    if "if" in schema:
        condition_matches = not _schema_errors(value, schema["if"], root_schema, path)
        branch = schema.get("then") if condition_matches else schema.get("else")
        if branch:
            errors.extend(_schema_errors(value, branch, root_schema, path))

    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{path}: 值 {value!r} 不在允许范围 {schema['enum']}")
    if "const" in schema and value != schema["const"]:
        errors.append(f"{path}: 值必须为 {schema['const']!r}")

    if isinstance(value, dict):
        required = schema.get("required", [])
        for key in required:
            if key not in value:
                errors.append(f"{path}.{key}: 缺少必填字段")

        properties = schema.get("properties", {})
        for key, child in properties.items():
            if key in value:
                errors.extend(_schema_errors(value[key], child, root_schema, f"{path}.{key}"))

        additional = schema.get("additionalProperties")
        if additional is not None:
            for key in value.keys() - properties.keys():
                if additional is False:
                    errors.append(f"{path}.{key}: 不允许的字段")
                elif isinstance(additional, dict):
                    errors.extend(_schema_errors(value[key], additional, root_schema, f"{path}.{key}"))

        if len(value) < schema.get("minProperties", 0):
            errors.append(f"{path}: 字段数量不能少于 {schema['minProperties']}")

    if isinstance(value, list):
        if len(value) < schema.get("minItems", 0):
            errors.append(f"{path}: 数组元素不能少于 {schema['minItems']} 个")
        if isinstance(schema.get("items"), dict):
            for index, item in enumerate(value):
                errors.extend(_schema_errors(item, schema["items"], root_schema, f"{path}[{index}]"))

    if isinstance(value, str):
        pattern = schema.get("pattern")
        if pattern and re.search(pattern, value) is None:
            errors.append(f"{path}: 字符串不匹配格式 {pattern}")
        if schema.get("format") == "uri" and not urlparse(value).scheme:
            errors.append(f"{path}: 不是合法 URI")

    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            errors.append(f"{path}: 不能小于 {schema['minimum']}")
        if "maximum" in schema and value > schema["maximum"]:
            errors.append(f"{path}: 不能大于 {schema['maximum']}")

    return errors


def validate_schema_contract(data):
    """以 bundled story.schema.json 为唯一结构契约执行校验。"""
    try:
        schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    except Exception as exc:
        return [f"无法读取 Schema: {exc}"]

    unsupported = _find_unsupported_keywords(schema)
    if unsupported:
        return unsupported
    return _schema_errors(data, schema, schema)


# ── 校验器 ──────────────────────────────────────────────

class StoryValidator:
    """story.json 数据合规校验器"""

    def __init__(self, data):
        self.data = data
        self.nodes = data.get("nodes", {})
        self.variables = data.get("variables", {})
        self.items = {item.get("id"): item for item in data.get("items", [])}
        self.characters = {c.get("id"): c for c in data.get("characters", [])}
        self.errors = 0
        self.warnings = 0

    def validate_tree(self):
        """阶段：图结构校验"""
        nodes = self.nodes

        # 1. 必须有 nodes
        if not nodes:
            self.errors += 1
            err("nodes 为空或缺失")
            return

        # 2. 必须有且仅有一个 start 节点
        start_nodes = [nid for nid, n in nodes.items() if n.get("type") == "start"]
        if len(start_nodes) == 0:
            self.errors += 1
            err("缺少 start 类型节点")
        elif len(start_nodes) > 1:
            self.errors += 1
            err(f"有多个 start 节点: {', '.join(start_nodes)}")

        # 3. 验证 meta.start
        meta_start = self.data.get("meta", {}).get("start")
        if meta_start:
            if meta_start not in nodes:
                self.errors += 1
                err(f"meta.start 指向不存在的节点: {meta_start}")
        else:
            self.errors += 1
            err("meta.start 缺失")

        # 4. 遍历节点验证基本字段
        for nid, node in nodes.items():
            node_type = node.get("type", "unknown")

            # 所有节点必须包含 text
            if "text" not in node:
                self.errors += 1
                err("缺少 text 字段", nid)

            # type 检查
            valid_types = {"start", "scene", "choice", "ending", "interaction"}
            if node_type not in valid_types:
                self.errors += 1
                err(f"无效节点类型: {node_type}", nid)

            # start 必须有 next，不能有 choices
            if node_type == "start":
                if "next" not in node:
                    self.errors += 1
                    err("start 节点缺少 next", nid)
                if "choices" in node:
                    self.errors += 1
                    err("start 节点不应包含 choices", nid)

            # ending 必须有 ending_type，不能有 next/choices
            if node_type == "ending":
                if "ending_type" not in node:
                    self.errors += 1
                    err("ending 节点缺少 ending_type", nid)
                else:
                    valid_ending = {"good", "bad", "hidden", "normal"}
                    if node["ending_type"] not in valid_ending:
                        self.errors += 1
                        err(f"无效 ending_type: {node['ending_type']}", nid, "ending_type")
                if "next" in node:
                    self.errors += 1
                    err("ending 节点不应包含 next", nid)
                if "choices" in node:
                    self.errors += 1
                    err("ending 节点不应包含 choices", nid)

            # choice 必须有 choices (>=2)
            if node_type == "choice":
                if "choices" not in node or len(node["choices"]) < 2:
                    self.errors += 1
                    err("choice 节点必须包含至少 2 个选项", nid)

            # interaction 必须有 interaction 字段
            if node_type == "interaction":
                if "interaction" not in node:
                    self.errors += 1
                    err("interaction 节点缺少 interaction 字段", nid)
                if "next" not in node:
                    self.errors += 1
                    err("interaction 节点缺少 next", nid)

            # 相邻同 setting 警告
            # （简化校验，仅输出提醒）
            if node.get("setting"):
                pass  # 全量校验需要上下文分析，此处略

            # 检查 choices
            choices = node.get("choices", [])
            if choices:
                for i, choice in enumerate(choices):
                    if "label" not in choice:
                        self.errors += 1
                        err(f"第 {i+1} 个选项缺少 label", nid)
                    if "next" not in choice:
                        self.errors += 1
                        err(f"第 {i+1} 个选项缺少 next", nid)
                    elif choice["next"] not in nodes:
                        self.errors += 1
                        err(f"第 {i+1} 个选项的 next 指向不存在的节点: {choice['next']}", nid)

            # 检查 next
            nxt = node.get("next")
            if nxt and nxt not in nodes:
                self.errors += 1
                err(f"next 指向不存在的节点: {nxt}", nid)

        # 5. 可达性检查（简单 BFS）
        if meta_start and meta_start in nodes:
            reachable = set()
            queue = [meta_start]
            while queue:
                nid = queue.pop(0)
                if nid in reachable:
                    continue
                reachable.add(nid)
                node = nodes.get(nid, {})
                nxt = node.get("next")
                if nxt:
                    queue.append(nxt)
                for choice in node.get("choices", []):
                    cnext = choice.get("next")
                    if cnext:
                        queue.append(cnext)

            unreachable = set(nodes.keys()) - reachable
            if unreachable:
                self.warnings += 1
                warn(f"以下节点从入口不可达: {', '.join(sorted(unreachable)[:10])}")

            # ending 可达性
            endings = [nid for nid, n in nodes.items() if n.get("type") == "ending"]
            unreachable_endings = [e for e in endings if e not in reachable]
            if unreachable_endings:
                self.errors += 1
                err(f"结局节点不可达: {', '.join(unreachable_endings)}")

        return self.errors == 0

    def validate_media(self):
        """阶段：media 结构校验"""
        for nid, node in self.nodes.items():
            media = node.get("media")
            if media is None:
                continue

            # media.type 必须为 video
            if media.get("type") != "video":
                self.errors += 1
                err(f"media.type 必须为 'video'，当前: {media.get('type')}", nid, "media.type")

            # media.src 必须为合法 URL
            src = media.get("src")
            if not src:
                self.errors += 1
                err("media.src 缺失", nid, "media.src")
            elif not is_valid_url(src):
                self.errors += 1
                err(f"media.src 不是合法 http(s) URL: {src}", nid, "media.src")

            # media.subtitle 可选，如有则校验
            subtitle = media.get("subtitle")
            if subtitle and not is_valid_url(subtitle):
                self.errors += 1
                err(f"media.subtitle 不是合法 http(s) URL: {subtitle}", nid, "media.subtitle")

            # bgm 校验
            bgm = node.get("bgm")
            if bgm and not is_valid_url(bgm):
                self.errors += 1
                err(f"bgm 不是合法 http(s) URL: {bgm}", nid, "bgm")

        return self.errors == 0

    def _check_effect(self, effect, nid, path):
        """校验单个 effect（op 结构：set/inc/dec + var，add/remove + item）"""
        op = effect.get("op")
        if op in ("set", "inc", "dec"):
            var = effect.get("var")
            if var is not None and var not in self.variables:
                self.warnings += 1
                warn(f"effect 引用未声明的变量: {var}", nid, f"{path}.var")
        elif op in ("add", "remove"):
            item = effect.get("item")
            if item is not None and item not in self.items:
                self.warnings += 1
                warn(f"effect 引用未定义的道具: {item}", nid, f"{path}.item")
        else:
            self.warnings += 1
            warn(f"effect 使用未知 op: {op}（应为 set/inc/dec/add/remove）", nid, f"{path}.op")

    def _check_condition(self, cond, nid, path):
        """校验结构化 condition（递归 and/or/not；叶子为 op 比较 / has / visited）"""
        if not isinstance(cond, dict):
            self.warnings += 1
            warn(f"condition 必须为结构化对象（如 {{\"op\":\">=\",\"var\":\"x\",\"value\":1}}），当前为 {type(cond).__name__}", nid, path)
            return
        if "and" in cond:
            for j, c in enumerate(cond["and"]):
                self._check_condition(c, nid, f"{path}.and[{j}]")
            return
        if "or" in cond:
            for j, c in enumerate(cond["or"]):
                self._check_condition(c, nid, f"{path}.or[{j}]")
            return
        if "not" in cond:
            self._check_condition(cond["not"], nid, f"{path}.not")
            return
        op = cond.get("op")
        if op == "has":
            if cond.get("item") not in self.items:
                self.warnings += 1
                warn(f"condition(has) 引用未定义道具: {cond.get('item')}", nid, path)
        elif op == "visited":
            if cond.get("node") not in self.nodes:
                self.warnings += 1
                warn(f"condition(visited) 引用不存在节点: {cond.get('node')}", nid, path)
        elif op in (">", ">=", "<", "<=", "==", "!="):
            if cond.get("var") not in self.variables:
                self.warnings += 1
                warn(f"condition 引用未声明变量: {cond.get('var')}", nid, path)
        else:
            self.warnings += 1
            warn(f"condition 使用未知 op: {op}", nid, path)

    def validate_logic(self):
        """阶段：状态逻辑校验（effect/condition 结构与变量/道具/角色引用自洽）"""
        for nid, node in self.nodes.items():
            # 节点级 effects
            for i, effect in enumerate(node.get("effects", [])):
                self._check_effect(effect, nid, f"effects[{i}]")

            # choices 的 effects / condition
            for ci, choice in enumerate(node.get("choices", [])):
                for i, effect in enumerate(choice.get("effects", [])):
                    self._check_effect(effect, nid, f"choices[{ci}].effects[{i}]")
                condition = choice.get("condition")
                if condition is not None:
                    self._check_condition(condition, nid, f"choices[{ci}].condition")

            # 检查 speaker 引用
            speaker = node.get("speaker")
            if speaker and speaker not in self.characters:
                self.warnings += 1
                warn(f"speaker 引用未定义角色: {speaker}", nid, "speaker")

        return self.errors == 0

    def run_all(self):
        """运行全部阶段"""
        results = []
        results.append(("tree", self.validate_tree()))
        results.append(("media", self.validate_media()))
        results.append(("logic", self.validate_logic()))
        return all(r[1] for r in results)


# ── 主入口 ──────────────────────────────────────────────

def main():
    import argparse

    parser = argparse.ArgumentParser(description="IFG story.json 校验器")
    parser.add_argument("project_root", nargs="?",
                        help="项目根目录（校验 <root>/frontend/public/story/story.json）")
    parser.add_argument("--file", help="直接校验指定的 story.json 文件路径（用于落盘前校验，如 /tmp 下载的文件）")
    parser.add_argument("--stage", choices=["tree", "media", "logic", "full"], default="full",
                        help="校验阶段（默认 full）")
    parser.add_argument("--watch", action="store_true", help="监听模式（暂未实现）")

    args = parser.parse_args()

    if args.file:
        story_path = Path(args.file)
    elif args.project_root:
        story_path = Path(args.project_root) / "frontend" / "public" / "story" / "story.json"
    else:
        parser.error("必须提供 project_root 或 --file 之一")

    if not story_path.exists():
        print(f"FAIL  story.json 未找到: {story_path}")
        sys.exit(1)

    print(f"正在校验: {story_path}")
    print()

    data, parse_error = json_parse(story_path)
    if parse_error:
        print(f"FAIL  {parse_error}")
        sys.exit(1)

    schema_errors = validate_schema_contract(data)
    if schema_errors:
        for message in schema_errors:
            print(f"  FAIL  [schema] {message}")
        print()
        print(f"结果: FAIL（{len(schema_errors)} 个 Schema 错误）")
        sys.exit(1)

    validator = StoryValidator(data)

    if args.stage == "tree":
        passed = validator.validate_tree()
    elif args.stage == "media":
        passed = validator.validate_media()
    elif args.stage == "logic":
        passed = validator.validate_logic()
    else:
        passed = validator.run_all()

    print()
    if validator.errors > 0:
        print(f"结果: FAIL（{validator.errors} 个错误，{validator.warnings} 个警告）")
        sys.exit(1)
    elif validator.warnings > 0:
        print(f"结果: PASS（{validator.warnings} 个警告）")
        sys.exit(0)
    else:
        print("结果: PASS（无错误，无警告）")
        sys.exit(0)


if __name__ == "__main__":
    main()
