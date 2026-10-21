"""Real browser smoke through normal Better Auth and persisted API records.

Requires local web/API servers, an empty test DB with both schemas, demo enabled,
and CHROME_BINARY pointing at a headless-capable Chromium. No auth bypasses.
Artifacts go to ONRECORD_SMOKE_ARTIFACTS (default /tmp/onrecord-browser-artifacts).
"""
import base64
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import uuid
from urllib.parse import urlparse

import httpx
from websockets.sync.client import connect


class Browser:
    def __init__(self, websocket):
        self.socket = connect(websocket, max_size=30_000_000)
        self.sequence = 0

    def command(self, method, params=None):
        self.sequence += 1
        self.socket.send(json.dumps({"id": self.sequence, "method": method, "params": params or {}}))
        while True:
            result = json.loads(self.socket.recv(timeout=30))
            if result.get("id") == self.sequence:
                if "error" in result:
                    raise AssertionError(result["error"])
                return result.get("result", {})

    def evaluate(self, expression):
        result = self.command("Runtime.evaluate", {"expression": expression, "returnByValue": True, "awaitPromise": True})
        if "exceptionDetails" in result:
            raise AssertionError(result["exceptionDetails"].get("text"))
        return result.get("result", {}).get("value")

    def wait(self, expression, timeout=30):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self.evaluate(expression):
                return
            time.sleep(0.1)
        raise AssertionError(f"Browser condition timed out: {expression}")

    def navigate(self, url):
        self.command("Page.navigate", {"url": url})
        self.wait("document.readyState === 'complete'")

    def fill(self, selector, value):
        self.evaluate(f"""(() => {{
          const el = document.querySelector({json.dumps(selector)});
          if (!el) throw Error('Missing field');
          const prototype = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(prototype, 'value').set.call(el, {json.dumps(value)});
          el.dispatchEvent(new Event('input', {{ bubbles: true }}));
          el.dispatchEvent(new Event('change', {{ bubbles: true }}));
        }})()""")

    def click_text(self, text, selector="button"):
        self.evaluate(f"""(() => {{
          const el = [...document.querySelectorAll({json.dumps(selector)})].find(el => el.textContent.trim() === {json.dumps(text)});
          if (!el) throw Error('Missing button/link'); el.click();
        }})()""")


def run():
    origin = os.environ.get("ONRECORD_SMOKE_URL", "http://localhost:3300")
    if urlparse(origin).hostname not in {"localhost", "127.0.0.1"}:
        raise RuntimeError("Smoke tests create fictional users and must target localhost.")
    binary = os.environ["CHROME_BINARY"]
    artifacts = Path(os.environ.get("ONRECORD_SMOKE_ARTIFACTS", "/private/tmp/onrecord-browser-artifacts"))
    artifacts.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="onrecord-chrome-") as profile:
        chrome = subprocess.Popen([binary, "--headless=new", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=9339", f"--user-data-dir={profile}", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            for _ in range(100):
                try:
                    targets = httpx.get("http://127.0.0.1:9339/json", timeout=1).json()
                    break
                except (httpx.HTTPError, ValueError):
                    time.sleep(0.1)
            else:
                raise RuntimeError("Chromium did not start.")
            browser = Browser(next(row["webSocketDebuggerUrl"] for row in targets if row["type"] == "page"))
            browser.command("Page.enable")
            browser.command("Emulation.setDeviceMetricsOverride", {"width": 1440, "height": 1050, "deviceScaleFactor": 1, "mobile": False})
            browser.navigate(origin)
            email = f"farm-smoke-{uuid.uuid4().hex}@example.test"
            result = browser.evaluate(f"""fetch('/api/auth/sign-up/email', {{method: 'POST', headers: {{'Content-Type': 'application/json'}}, body: JSON.stringify({{name:'Fictional Farm Tester', email:{json.dumps(email)}, password:'Local-smoke-test-password-726!'}})}}).then(async r => ({{status:r.status}}))""")
            assert result["status"] == 200, result
            browser.navigate(origin + "/setup")
            browser.wait("!!document.querySelector('input[placeholder=\"e.g. Adom Provisions\"]')")
            browser.fill('input[placeholder="e.g. Adom Provisions"]', "Fictional Browser Farm")
            browser.click_text("Continue")
            browser.wait("location.pathname === '/dashboard' && document.body.innerText.includes('Welcome back')")
            browser.navigate(origin + "/farm")
            browser.wait("[...document.querySelectorAll('button')].some(el => el.textContent === 'Try Yaw’s tomato demo')")
            browser.click_text("Try Yaw’s tomato demo")
            browser.wait("document.querySelector('.farm-workspace')?.innerText.includes('GH₵13,750.00')")
            (artifacts / "overview-desktop.png").write_bytes(base64.b64decode(browser.command("Page.captureScreenshot")["data"]))
            browser.click_text("Transactions", ".farm-tabs a")
            browser.wait("!!document.querySelector('input[name=amount]')")
            browser.fill('input[name="occurred_on"]', "2026-09-22")
            browser.fill('input[name="amount"]', "0.29")
            browser.fill('input[name="description"]', "Browser smoke expense")
            browser.click_text("Save transaction")
            browser.wait("document.querySelector('.farm-table')?.innerText.includes('Browser smoke expense')")
            browser.evaluate("[...document.querySelectorAll('tr')].find(el => el.innerText.includes('Browser smoke expense')).querySelector('button').click()")
            browser.wait("!![...document.querySelectorAll('button')].find(el => el.textContent === 'Save changes')")
            browser.fill('input[name="amount"]', "0.49")
            browser.click_text("Save changes")
            browser.wait("document.querySelector('.farm-table')?.innerText.includes('GH₵0.49')")
            browser.click_text("Insights", ".farm-tabs a")
            browser.wait("document.querySelector('.farm-workspace')?.innerText.includes('GH₵13,749.51')")
            browser.click_text("Finance report", ".farm-tabs a")
            browser.wait("!!document.querySelector('.farm-report-paper')")
            assert browser.evaluate("document.querySelector('.farm-report-paper').innerText.includes('GH₵13,749.51')")
            pdf = browser.command("Page.printToPDF", {"printBackground": True, "preferCSSPageSize": True})
            (artifacts / "yaw-report.pdf").write_bytes(base64.b64decode(pdf["data"]))
            browser.click_text("Overview", ".farm-tabs a")
            browser.wait("!!document.querySelector('.farm-hero')")
            for name, surplus in [("Akosua Mixed Farm", "11,730.00"), ("Ibrahim Poultry", "2,770.00"), ("Esi Fish Farm", "4,150.00"), ("Abena Cocoa Growers", "6,150.00")]:
                option = browser.evaluate(f"[...document.querySelector('select[aria-label=Business]').options].find(el => el.textContent.includes({json.dumps(name)})).value")
                browser.fill('select[aria-label="Business"]', option)
                browser.wait(f"document.querySelector('.farm-hero')?.textContent.includes({json.dumps(name)}) && document.querySelector('.farm-stat-grid')?.innerText.includes({json.dumps(surplus)})")
                if name == "Ibrahim Poultry":
                    browser.click_text("Transactions", ".farm-tabs a")
                    browser.wait("!!document.querySelector('select[name=category]')")
                    assert browser.evaluate("document.querySelector('select[name=category]').innerText.includes('Feed') && !document.querySelector('select[name=category]').innerText.includes('Seeds')")
                    browser.click_text("Overview", ".farm-tabs a")
                    browser.wait("!!document.querySelector('.farm-hero')")
            yaw = browser.evaluate("[...document.querySelector('select[aria-label=Business]').options].find(el => el.textContent.includes('Yaw Mensah')).value")
            browser.fill('select[aria-label="Business"]', yaw)
            browser.wait("document.querySelector('.farm-stat-grid')?.innerText.includes('13,749.51')")
            browser.command("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 1, "mobile": True})
            browser.wait("window.innerWidth === 390")
            assert browser.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "Horizontal overflow on mobile"
            (artifacts / "overview-mobile.png").write_bytes(base64.b64decode(browser.command("Page.captureScreenshot")["data"]))
            print("PASS: normal signup/onboarding, all five profiles, persisted transaction add/edit, poultry categories, matching insight/report totals, PDF and mobile layout.")
            print(f"Artifacts: {artifacts}")
            browser.socket.close()
        finally:
            chrome.terminate()
            chrome.wait(timeout=10)


if __name__ == "__main__":
    run()
