# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""A headless Chrome page, driven over the DevTools protocol.

Clicks are real mouse events at the element's center, never
`element.click()`: a dialog opened without a user activation is closed,
with every dialog grouped with it, by a single Escape. Element lookups
return booleans or plain values -- a DOM node returned by value fails.
"""

from __future__ import annotations

import base64
import io
import json
import time
from typing import Any

import httpx
from PIL import Image
from websockets.sync.client import ClientConnection, connect


class BrowserError(RuntimeError):
    """Chrome refused a command, or a page never reached the state asked for."""


#: Finds the element a selector names, or the visible element whose own
#: text is exactly the text given: `text=Save`. A `>>` picks the nth match.
_FIND = """
(spec) => {
  let [sel, nth] = spec.split(' >> ');
  nth = nth === undefined ? 0 : Number(nth);
  let found;
  if (sel.startsWith('text=') || sel.startsWith('starts=')) {
    const exact = sel.startsWith('text=');
    const want = sel.slice(exact ? 5 : 7).trim();
    const said = (el) => el.textContent.replace(/\\s+/g, ' ').trim();
    found = [...document.querySelectorAll(
      'button, a, label, summary, th, td, li, span, div, h1, h2, h3, p'
    )].filter((el) => el.offsetParent !== null
      && (exact ? said(el) === want : said(el).startsWith(want)));
    // The innermost match: a cell, not the row that holds it.
    found = found.filter((el) => !found.some((o) => o !== el && el.contains(o)));
  } else {
    found = [...document.querySelectorAll(sel)].filter(
      (el) => el.offsetParent !== null || el.getClientRects().length);
  }
  return found.at(nth) || null;
}
"""


class Page:
    """One tab of a headless Chrome started with a remote-debugging port."""

    def __init__(self, port: int) -> None:
        """Attach to the first page target Chrome has open."""
        targets = httpx.get(f"http://127.0.0.1:{port}/json", timeout=10).json()
        pages = [t for t in targets if t.get("type") == "page"]
        if not pages:
            raise BrowserError("Chrome has no page open")
        self._ws: ClientConnection = connect(
            pages[0]["webSocketDebuggerUrl"], max_size=None, open_timeout=20
        )
        self._next = 0
        self.width = 1400
        self.height = 900
        self.send("Page.enable")
        self.send("Runtime.enable")
        self.send(
            "Emulation.setEmulatedMedia",
            {"features": [{"name": "prefers-color-scheme", "value": "light"}]},
        )

    def close(self) -> None:
        """Let go of the tab."""
        self._ws.close()

    def send(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        """Send one command and return its result, skipping events between."""
        self._next += 1
        ident = self._next
        self._ws.send(
            json.dumps({"id": ident, "method": method, "params": params or {}})
        )
        while True:
            message = json.loads(self._ws.recv(timeout=60))
            if message.get("id") != ident:
                continue
            if "error" in message:
                raise BrowserError(f"{method}: {message['error']}")
            return dict(message.get("result", {}))

    # -- the page ----------------------------------------------------------

    def viewport(self, width: int, height: int, *, mobile: bool = False) -> None:
        """Size the page as a window of this size (a phone's when mobile)."""
        self.width, self.height = width, height
        self.send(
            "Emulation.setDeviceMetricsOverride",
            {
                "width": width,
                "height": height,
                "deviceScaleFactor": 1,
                "mobile": mobile,
            },
        )

    def evaluate(self, expression: str) -> object:
        """The value of a JavaScript expression, promises awaited."""
        result = self.send(
            "Runtime.evaluate",
            {
                "expression": expression,
                "returnByValue": True,
                "awaitPromise": True,
            },
        )
        if "exceptionDetails" in result:
            detail = result["exceptionDetails"]
            text = detail.get("exception", {}).get("description") or detail.get("text")
            raise BrowserError(f"script failed: {text}\n{expression[:300]}")
        return result.get("result", {}).get("value")

    def call(self, function: str, *args: object) -> object:
        """The value of `(function)(...args)`, the arguments passed as JSON."""
        joined = ", ".join(json.dumps(arg) for arg in args)
        return self.evaluate(f"({function})({joined})")

    def numbers(self, function: str, *args: object) -> list[float]:
        """The array of numbers `(function)(...args)` returns."""
        value = self.call(function, *args)
        if not isinstance(value, list):
            raise BrowserError(f"not a list of numbers: {value!r}")
        return [float(number) for number in value]

    def goto(self, url: str) -> None:
        """Open a page and wait for its document to load."""
        self.send("Page.navigate", {"url": url})
        self.wait_for("document.readyState === 'complete'")

    def wait_for(self, condition: str, seconds: float = 20) -> None:
        """Wait until a JavaScript condition holds."""
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            try:
                if self.evaluate(f"!!({condition})"):
                    return
            except BrowserError:
                pass
            time.sleep(0.2)
        raise BrowserError(f"timed out waiting for {condition}")

    def settle(self, seconds: float = 0.6) -> None:
        """Wait until nothing says Loading and no request is in flight."""
        time.sleep(seconds)
        self.wait_for("!/Loading|Searching/.test(document.body.innerText)", seconds=20)
        time.sleep(0.2)

    # -- elements ----------------------------------------------------------

    def exists(self, spec: str) -> bool:
        """Whether a visible element matches the spec."""
        return bool(self.call(f"(s) => !!({_FIND})(s)", spec))

    def wait_until_shown(self, spec: str, seconds: float = 20) -> None:
        """Wait for a visible element matching the spec."""
        self.wait_for(f"({_FIND})({json.dumps(spec)})", seconds)

    def rect(self, spec: str) -> dict[str, float]:
        """The element's box in the viewport, scrolled into view first."""
        box = self.call(
            f"""(s) => {{
              const el = ({_FIND})(s);
              if (!el) return null;
              el.scrollIntoView({{block: 'center', inline: 'nearest'}});
              const r = el.getBoundingClientRect();
              return {{x: r.x, y: r.y, width: r.width, height: r.height}};
            }}""",
            spec,
        )
        if not isinstance(box, dict):
            raise BrowserError(f"no element {spec!r}")
        return {key: float(value) for key, value in box.items()}

    def click(self, spec: str) -> None:
        """A real left click at the center of the element."""
        self.wait_until_shown(spec)
        box = self.rect(spec)
        x = box["x"] + box["width"] / 2
        y = box["y"] + box["height"] / 2
        for kind in ("mouseMoved", "mousePressed", "mouseReleased"):
            self.send(
                "Input.dispatchMouseEvent",
                {"type": kind, "x": x, "y": y, "button": "left", "clickCount": 1},
            )
        time.sleep(0.3)

    def type(self, spec: str, text: str, *, clear: bool = True) -> None:
        """Focus a field and type into it, as a person would."""
        self.wait_until_shown(spec)
        self.call(
            f"""(s, clear) => {{
              const el = ({_FIND})(s);
              el.focus();
              if (clear && 'value' in el) {{ el.select && el.select(); }}
            }}""",
            spec,
            clear,
        )
        if clear:
            self.key("Delete")
        self.send("Input.insertText", {"text": text})
        time.sleep(0.2)

    def choose(self, spec: str, label: str) -> None:
        """Pick the option of a <select> whose text is `label`."""
        self.wait_until_shown(spec)
        done = self.call(
            f"""(s, label) => {{
              const el = ({_FIND})(s);
              const option = [...el.options].find((o) => o.text.trim() === label);
              if (!option) return false;
              const set = Object.getOwnPropertyDescriptor(
                HTMLSelectElement.prototype, 'value').set;
              set.call(el, option.value);
              el.dispatchEvent(new Event('change', {{bubbles: true}}));
              return true;
            }}""",
            spec,
            label,
        )
        if not done:
            raise BrowserError(f"{spec!r} offers no {label!r}")
        time.sleep(0.3)

    def key(self, name: str) -> None:
        """Press and release one key: Enter, Escape, Delete, Tab."""
        codes = {"Enter": 13, "Escape": 27, "Delete": 46, "Tab": 9}
        for kind in ("keyDown", "keyUp"):
            self.send(
                "Input.dispatchKeyEvent",
                {
                    "type": kind,
                    "key": name,
                    "code": name,
                    "windowsVirtualKeyCode": codes[name],
                    "text": "\r" if name == "Enter" and kind == "keyDown" else "",
                },
            )
        time.sleep(0.2)

    def blur(self) -> None:
        """Take focus off whatever field holds it."""
        self.evaluate("document.activeElement && document.activeElement.blur()")

    # -- pictures ----------------------------------------------------------

    def shot(self, clip: dict[str, float] | None = None) -> Image.Image:
        """The viewport, or the clip of it given, as an image."""
        params: dict[str, Any] = {"format": "png"}
        if clip is not None:
            params["clip"] = {**clip, "scale": 1}
        data = self.send("Page.captureScreenshot", params)["data"]
        return Image.open(io.BytesIO(base64.b64decode(data))).convert("RGB")
