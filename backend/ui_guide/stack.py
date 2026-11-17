# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""The demo stack: its settings, its database, and the processes it starts.

Every port and folder comes from `app.runtime_settings` (the CCWEB_GUIDE_*
keys); the database is `DEMO_DATABASE` in the test cluster, never the
collection's. Nothing here imports `app.config`: the API's settings are read
when it is first imported, so `environment()` must be in place before that.
"""

from __future__ import annotations

import contextlib
import json
import os
import secrets
import shutil
import signal
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import IO

import httpx
from app.portpid import listening_pid, tcp_rows
from app.runtime_settings import REPO_ROOT, RuntimeSettings, assignments
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL, make_url
from websockets.exceptions import ConnectionClosed
from websockets.sync.client import connect

#: The demo database, in the test cluster. Named so that nothing else makes
#: or drops it: the test session builds and drops only `ccwebdb_test`, its
#: per-worker `ccwebdb_gw<N>_test`, scratch databases named from those, and
#: `ccwebdb_proof_*`; the backup copies are `ccwebdb_bak*`. A name not
#: starting `ccwebdb` and not ending `_test` is none of them, and
#: `tests/conftest.py` refuses a TEST_DATABASE_URL not ending `_test`.
DEMO_DATABASE = "ccweb_ui_guide"

#: The demo manager. Its password is new on every run and never written down.
ADMIN_EMAIL = "admin@example.com"

#: What the shop and console call themselves in the pictures.
SHOP_NAME = "Demo Coin Shop"

BACKEND = REPO_ROOT / "backend"
FRONTEND = REPO_ROOT / "frontend"

#: Where Chrome is, by platform; the first that exists is used.
_CHROME = (
    Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
    Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
)
_CHROME_NAMES = (
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
)


class StackError(RuntimeError):
    """The demo stack could not be built or started."""


@dataclass
class Guide:
    """The demo stack's settings, read once."""

    api_host: str
    api_port: int
    frontend_host: str
    frontend_port: int
    browser_port: int
    folder: Path
    demo_url: URL
    #: A signing key for this run's API only.
    jwt_secret: str = field(default_factory=lambda: secrets.token_hex(32))

    @property
    def media(self) -> Path:
        """The demo photographs' MEDIA_ROOT: never the collection's."""
        return self.folder / "media"

    @property
    def logs(self) -> Path:
        """Where the API's, Vite's and Chrome's output goes."""
        return self.folder / "logs"

    @property
    def console(self) -> str:
        """The frontend's address, which proxies /api to the demo API."""
        return f"http://{self.frontend_host}:{self.frontend_port}"


def load() -> Guide:
    """The settings from the repository's .env, refusing the collection's cluster."""
    read = RuntimeSettings()
    values = assignments(read, include_password=True)
    test_url = make_url(values["CCWEB_TEST_DB_URL"])
    collection = make_url(read.database_url)
    if (test_url.host, test_url.port) == (collection.host, collection.port):
        raise StackError(
            "the test cluster's address is DATABASE_URL's: the demo database "
            "would be built beside the collection"
        )
    return Guide(
        api_host=read.ccweb_api_host,
        api_port=read.ccweb_guide_api_port,
        frontend_host=read.ccweb_frontend_host,
        frontend_port=read.ccweb_guide_frontend_port,
        browser_port=read.ccweb_guide_browser_port,
        folder=read.ccweb_guide_dir,
        demo_url=test_url.set(database=DEMO_DATABASE),
    )


def environment(guide: Guide) -> dict[str, str]:
    """The variables the API, the seeder and Vite run with.

    They take precedence over .env, so a checkout's own collection, shop
    name or closed shop never reaches the pictures. CCWEB_TEST_DB_PORT is
    moved off the test cluster's port because the API refuses a
    DATABASE_URL on it -- here, deliberately, the demo database is there.
    """
    url = guide.demo_url.render_as_string(hide_password=False)
    return {
        "DATABASE_URL": url,
        "TEST_DATABASE_URL": "",
        "CCWEB_TEST_DB_PORT": str(guide.api_port),
        "JWT_SECRET": guide.jwt_secret,
        "MEDIA_ROOT": str(guide.media),
        "PHOTO_LIBRARY_ROOT": str(guide.folder / "photos"),
        "SHOP_OPEN": "true",
        "SALES_TAX_RATE": "0.0635",
        "SALES_TAX_INCLUDES_SHIPPING": "true",
        "DEFAULT_ITEM_KIND": "coin",
        "TIME_ZONE": "",
        "FIRST_ADMIN_EMAIL": ADMIN_EMAIL,
        "FIRST_ADMIN_PASSWORD": "",
        "VITE_SHOP_NAME": SHOP_NAME,
        "VITE_SHOP_OWNER": SHOP_NAME,
        "VITE_DIGICERT_SEAL_ID": "",
        "CCWEB_API_HOST": guide.api_host,
        "CCWEB_API_PORT": str(guide.api_port),
        "CCWEB_FRONTEND_HOST": guide.frontend_host,
        "CCWEB_FRONTEND_PORT": str(guide.frontend_port),
        "CORS_ORIGINS": f'["{guide.console}"]',
    }


def recreate_database(guide: Guide) -> None:
    """Drop the demo database if it is there and create it empty."""
    name = guide.demo_url.database
    if name != DEMO_DATABASE:
        raise StackError(f"refusing to rebuild {name!r}: only {DEMO_DATABASE}")
    admin = create_engine(
        guide.demo_url.set(database="postgres"), isolation_level="AUTOCOMMIT"
    )
    try:
        with admin.connect() as conn:
            conn.execute(
                text(
                    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                    "WHERE datname = :name AND pid <> pg_backend_pid() "
                    "AND backend_type = 'client backend'"
                ),
                {"name": name},
            )
            conn.execute(text(f'DROP DATABASE IF EXISTS "{name}"'))
            conn.execute(text(f'CREATE DATABASE "{name}"'))
    finally:
        admin.dispose()


def run_python(*args: str) -> None:
    """Run `python args` in backend/ with this process's environment, or raise."""
    done = subprocess.run([sys.executable, *args], cwd=BACKEND, check=False)
    if done.returncode != 0:
        raise StackError(f"python {' '.join(args)} exited {done.returncode}")


def chrome_path() -> str:
    """Chrome or Chromium on this machine."""
    for path in _CHROME:
        if path.exists():
            return str(path)
    for name in _CHROME_NAMES:
        found = shutil.which(name)
        if found:
            return found
    raise StackError("Chrome was not found")


@dataclass
class Process:
    """One process the stack started, and the log it writes to."""

    name: str
    popen: subprocess.Popen[bytes]
    log: IO[bytes]


def _start(name: str, args: list[str], cwd: Path, logs: Path) -> Process:
    """Start a process of the stack in its own group, its output to a log."""
    logs.mkdir(parents=True, exist_ok=True)
    log = (logs / f"{name}.log").open("wb")
    if sys.platform == "win32":
        popen = subprocess.Popen(
            args,
            cwd=cwd,
            stdout=log,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
        )
    else:
        popen = subprocess.Popen(
            args,
            cwd=cwd,
            stdout=log,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            start_new_session=True,
        )
    return Process(name, popen, log)


def _wait_for(url: str, process: Process, seconds: float = 90) -> None:
    """Wait until `url` answers, or fail naming the process and its log."""
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if process.name != "chrome" and process.popen.poll() is not None:
            raise StackError(f"{process.name} exited; see its log")
        try:
            if httpx.get(url, timeout=2).status_code < 500:
                return
        except httpx.HTTPError:
            pass
        time.sleep(0.5)
    raise StackError(f"{process.name} did not answer at {url}")


def _port_free(host: str, port: int) -> bool:
    """Whether nothing answers on host:port."""
    try:
        httpx.get(f"http://{host}:{port}/", timeout=1)
    except httpx.HTTPError:
        return True
    return False


class Stack:
    """The API, Vite and Chrome, started together and stopped together."""

    def __init__(self, guide: Guide) -> None:
        """Nothing is started until `start`."""
        self.guide = guide
        self.processes: list[Process] = []

    def start(self) -> None:
        """Start the three, each on its own port, and wait for each to answer."""
        g = self.guide
        for host, port in (
            (g.api_host, g.api_port),
            (g.frontend_host, g.frontend_port),
            ("127.0.0.1", g.browser_port),
        ):
            if not _port_free(host, port):
                raise StackError(f"something already answers on {host}:{port}")
        api = _start(
            "api",
            [
                sys.executable,
                "-m",
                "uvicorn",
                "app.main:app",
                "--host",
                g.api_host,
                "--port",
                str(g.api_port),
            ],
            BACKEND,
            g.logs,
        )
        self.processes.append(api)
        vite_js = FRONTEND / "node_modules" / "vite" / "bin" / "vite.js"
        if not vite_js.exists():
            raise StackError("frontend/node_modules is missing: run npm ci there")
        node = shutil.which("node") or str(Path(sys.prefix) / "node.exe")
        vite = _start(
            "vite",
            [
                node,
                str(vite_js),
                "--host",
                g.frontend_host,
                "--port",
                str(g.frontend_port),
                "--strictPort",
            ],
            FRONTEND,
            g.logs,
        )
        self.processes.append(vite)
        profile = g.folder / "chrome-profile"
        chrome = _start(
            "chrome",
            [
                chrome_path(),
                "--headless=new",
                f"--remote-debugging-port={g.browser_port}",
                f"--user-data-dir={profile}",
                "--disable-gpu",
                "--no-first-run",
                "--no-default-browser-check",
                "--hide-scrollbars",
                "--window-size=1400,900",
                "about:blank",
            ],
            g.folder,
            g.logs,
        )
        self.processes.append(chrome)
        _wait_for(f"http://{g.api_host}:{g.api_port}/health", api)
        _wait_for(f"{g.console}/management/login", vite)
        _wait_for(f"http://127.0.0.1:{g.browser_port}/json/version", chrome)

    def stop(self) -> None:
        """Stop all three and everything they started; raise if a port stays held.

        Chrome first asked to close over the protocol: its launcher exits as
        soon as the browser is up, so the process started is not the one
        holding the port. Then whatever still listens on each port is ended
        with its children.
        """
        g = self.guide
        _close_browser(g.browser_port)
        for process in reversed(self.processes):
            _kill_tree(process.popen.pid)
            process.log.close()
        self.processes.clear()
        held = []
        for host, port in (
            (g.api_host, g.api_port),
            (g.frontend_host, g.frontend_port),
            ("127.0.0.1", g.browser_port),
        ):
            for _ in range(20):
                pid = _listener(port)
                if pid is None and _port_free(host, port):
                    break
                if pid is not None:
                    _kill_tree(pid)
                time.sleep(0.5)
            else:
                held.append(port)
        if held:
            raise StackError(f"still held after stopping: ports {held}")


def _close_browser(port: int) -> None:
    """Ask the Chrome on this debugging port to close, if one is there."""
    try:
        socket_url = httpx.get(
            f"http://127.0.0.1:{port}/json/version", timeout=2
        ).json()["webSocketDebuggerUrl"]
    except (httpx.HTTPError, KeyError, ValueError):
        return
    try:
        with connect(socket_url, open_timeout=5) as browser:
            browser.send(json.dumps({"id": 1, "method": "Browser.close"}))
            browser.recv(timeout=5)
    except (OSError, TimeoutError, ConnectionClosed):
        pass
    time.sleep(1)


def _listener(port: int) -> int | None:
    """The process listening on this port, if any."""
    if sys.platform == "win32":
        return listening_pid(tcp_rows(), port)
    found = subprocess.run(
        ["fuser", f"{port}/tcp"], check=False, capture_output=True, text=True
    ).stdout.split()
    return int(found[0]) if found else None


def _kill_tree(pid: int) -> None:
    """End a process and everything it started; nothing if it is gone."""
    if sys.platform == "win32":
        subprocess.run(
            ["taskkill", "/PID", str(pid), "/T", "/F"],
            check=False,
            capture_output=True,
        )
        return
    with contextlib.suppress(ProcessLookupError, PermissionError):
        os.killpg(os.getpgid(pid), signal.SIGTERM)
