"""Fixed, non-interactive CLI adapters. No model-generated code is executed."""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import threading
import time
from typing import Any

PROVIDERS = ("manual", "codex", "claude", "codebuddy")
MAX_OUTPUT_BYTES = 12 * 1024 * 1024


class ProviderError(RuntimeError):
    """An error safe to show to the browser; detailed stderr stays on disk."""


class ProviderCanceled(ProviderError):
    pass


def available(provider: str) -> bool:
    return provider == "manual" or (provider in PROVIDERS and shutil.which(provider) is not None)


def parse_json(text: str | bytes) -> Any:
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("JSON 含重复字段。")
            result[key] = value
        return result

    def invalid_constant(_value):
        raise ValueError("JSON 不能含 NaN 或 Infinity。")

    return json.loads(text, object_pairs_hook=unique, parse_constant=invalid_constant)


def _private_file(path: Path):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    return os.fdopen(descriptor, "wb")


def _terminate(process: subprocess.Popen) -> None:
    """Stop the process tree on POSIX; kill remaining Windows descendants too."""
    if process.poll() is not None and os.name != "posix":
        return
    try:
        if os.name == "posix":
            os.killpg(process.pid, signal.SIGTERM)
        else:
            subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                           stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL, timeout=5, check=False)
    except (ProcessLookupError, OSError):
        pass
    try:
        process.wait(timeout=0.8)
    except subprocess.TimeoutExpired:
        pass
    # The leader may exit before children; still kill its process group.
    if os.name == "posix":
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except (ProcessLookupError, OSError):
            pass
    elif process.poll() is None:
        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                       stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                       stderr=subprocess.DEVNULL, timeout=5, check=False)
        process.kill()
    try:
        process.wait(timeout=2)
    except subprocess.TimeoutExpired:
        pass


def _arguments(provider: str, schema: dict[str, Any], job_dir: Path) -> list[str]:
    executable = shutil.which(provider)
    if not executable:
        raise ProviderError(f"未找到 {provider} CLI。请先在终端安装并完成其官方登录，或选择 Agent 文件队列。")
    if provider == "codex":
        # The final JSON is validated by geometry_contract. Do not pass its
        # complex union schema to Codex's more restrictive schema subset.
        args = [executable, "--no-daemon", "-a", "never"]
        for feature in ("shell_tool", "apps", "plugins", "hooks", "browser_use",
                        "computer_use", "multi_agent", "image_generation", "skill_search"):
            args.extend(["--disable", feature])
        args.extend(["exec", "--sandbox", "read-only", "--ephemeral", "--ignore-user-config",
                     "--skip-git-repo-check", "--color", "never",
                     "--output-last-message", str(job_dir / "model-final.txt"), "-"])
        return args
    if provider in ("claude", "codebuddy"):
        return [executable, "-p", "--output-format", "json", "--json-schema",
                json.dumps(schema, ensure_ascii=False, separators=(",", ":")),
                "--tools", "", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}',
                "--permission-mode", "dontAsk", "--no-session-persistence",
                "--settings", '{"disableAllHooks":true}']
    raise ProviderError("这个供应商不支持自动调用。")


def _json_object(text: str) -> dict[str, Any]:
    """Accept JSON only, without evaluating or executing any output."""
    text = text.strip()
    # Some models wrap an otherwise valid JSON document despite the prompt.
    if text.startswith("```json\n") and text.endswith("```"):
        text = text[8:-3].strip()
    elif text.startswith("```\n") and text.endswith("```"):
        text = text[4:-3].strip()
    try:
        result = parse_json(text)
    except (ValueError, RecursionError) as exc:
        raise ProviderError("模型没有返回可读取的 JSON。请重试，或让 Agent 查看任务目录中的日志。") from exc
    if not isinstance(result, dict):
        raise ProviderError("模型返回的结果格式不正确，未加载到画板。")
    return result


def generate(provider: str, prompt: str, schema: dict[str, Any], job_dir: Path,
             timeout: float, canceled: threading.Event) -> dict[str, Any]:
    """Run exactly one selected provider. Never fall back to another account."""
    if provider not in PROVIDERS or provider == "manual":
        raise ProviderError("自动调用的供应商无效。")
    if canceled.is_set():
        raise ProviderCanceled("任务已取消。")
    args = _arguments(provider, schema, job_dir)
    stdout_path, stderr_path = job_dir / "provider-stdout.log", job_dir / "provider-stderr.log"
    deadline = time.monotonic() + timeout
    creation = {"start_new_session": True} if os.name == "posix" else {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP}
    try:
        with _private_file(stdout_path) as stdout, _private_file(stderr_path) as stderr:
            process = subprocess.Popen(args, cwd=str(job_dir), stdin=subprocess.PIPE,
                                       stdout=stdout, stderr=stderr, shell=False, **creation)
            first = True
            completed = False
            try:
                while True:
                    if canceled.is_set():
                        raise ProviderCanceled("任务已取消。")
                    if time.monotonic() >= deadline:
                        raise ProviderError("这次生成超时，已停止模型进程。可以缩短题目后重试。")
                    if sum(path.stat().st_size for path in (stdout_path, stderr_path)) > MAX_OUTPUT_BYTES:
                        raise ProviderError("模型输出超过本地限制，已停止这次生成。")
                    try:
                        process.communicate(input=prompt.encode("utf-8") if first else None, timeout=0.2)
                        completed = True
                        break
                    except subprocess.TimeoutExpired:
                        first = False
            finally:
                if not completed or canceled.is_set():
                    _terminate(process)
            if canceled.is_set():
                raise ProviderCanceled("任务已取消。")
            if process.returncode != 0:
                raise ProviderError(f"{provider} 调用失败。请检查该 CLI 的登录、额度和网络；详细信息保存在本地任务日志中。")
    except ProviderError:
        raise
    except (OSError, subprocess.SubprocessError) as exc:
        raise ProviderError(f"无法运行 {provider} CLI。请在终端检查安装与访问权限。") from exc

    final_path = job_dir / "model-final.txt" if provider == "codex" else stdout_path
    if not final_path.is_file() or final_path.is_symlink() or final_path.stat().st_size > MAX_OUTPUT_BYTES:
        raise ProviderError("模型没有留下有效的 JSON 结果。")
    try:
        data = _json_object(final_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError) as exc:
        raise ProviderError("模型结果无法读取，未加载到画板。") from exc
    if provider != "codex":
        if data.get("is_error"):
            raise ProviderError(f"{provider} 没有完成生成。请检查其登录、额度和本地任务日志。")
        structured = data.get("structured_output")
        if not isinstance(structured, dict):
            raise ProviderError("模型没有返回要求的结构化结果，未加载到画板。")
        data = structured
    return data
