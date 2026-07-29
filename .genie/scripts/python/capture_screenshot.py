#!/usr/bin/env python3
"""Screenshot tool using Chrome/Chromium headless mode with CDP.

Uses Chrome DevTools Protocol via a Node.js helper for precise screenshot
timing, ensuring CSS animations have completed before capture.
"""

import sys
import subprocess
import platform
import time
import urllib.request
import urllib.error
import json
import socket
import os
from pathlib import Path
import shutil
import tempfile

try:
    from PIL import Image
except ImportError:
    sys.exit("❌ 请运行 'pip install Pillow' 安装图像处理库")


def _copy_fallback_image(output_path: str = None) -> None:
    script_dir = Path(__file__).parent
    project_root = script_dir.parent.parent.parent
    source_png = script_dir / "assets" / "genie.png"
    output_path = Path(output_path)
    if output_path.is_absolute():
        output_path = project_root / str(output_path).lstrip("/")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_png, output_path)
    print(f"✅ Copied image to: {output_path}", file=sys.stderr)
    print(f"   Target file: {output_path}")

# Default URL to capture
DEFAULT_URL = "http://localhost:5173"

# Window sizes for different preview types (width, height)
WINDOW_SIZES = {
    "mobile": (510, 932),     # iPhone 14 Pro Max size
    "desktop": (1280, 720),   # Default desktop size
}

# Extra height for capture, will be cropped after screenshot
CAPTURE_HEIGHT_PADDING = 200

# Seconds to wait after page load for CSS animations to complete
ANIMATION_WAIT_SECONDS = 8


def get_preview_type() -> str:
    """Read preview_type from docs/project.json.

    Returns:
        The preview type string, defaults to 'desktop' if not found.
    """
    script_dir = Path(__file__).parent
    project_root = script_dir.parent.parent.parent
    project_json_path = project_root / "docs" / "project.json"

    try:
        if project_json_path.exists():
            with open(project_json_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
                preview_type = config.get("preview_type", "desktop")
                print(f"📱 Preview type from project.json: {preview_type}", file=sys.stderr)
                return preview_type
    except (json.JSONDecodeError, IOError) as e:
        print(f"⚠️  Failed to read project.json: {e}", file=sys.stderr)

    return "desktop"


def wait_for_server(url: str, timeout: int = 30) -> bool:
    """Wait for server to be ready (return 200 status code).

    Args:
        url: The URL to probe
        timeout: Maximum time to wait in seconds (default 30s)

    Returns:
        True if server is ready, False if timeout reached
    """
    print(f"🔍 Waiting for server at {url} to be ready (timeout: {timeout}s)...", file=sys.stderr)
    start_time = time.time()
    attempt = 0

    while time.time() - start_time < timeout:
        attempt += 1
        try:
            req = urllib.request.Request(url, method='GET')
            with urllib.request.urlopen(req, timeout=5) as response:
                if response.status == 200:
                    elapsed = time.time() - start_time
                    print(f"✅ Server ready! (attempt {attempt}, {elapsed:.1f}s elapsed)", file=sys.stderr)
                    return True
        except urllib.error.HTTPError as e:
            print(f"⚠️  Attempt {attempt}: HTTP {e.code}", file=sys.stderr)
        except urllib.error.URLError as e:
            print(f"⚠️  Attempt {attempt}: {e.reason}", file=sys.stderr)
        except Exception as e:
            print(f"⚠️  Attempt {attempt}: {type(e).__name__}: {e}", file=sys.stderr)

        time.sleep(1)

    elapsed = time.time() - start_time
    print(f"❌ Server not ready after {elapsed:.1f}s ({attempt} attempts)", file=sys.stderr)
    return False


def _find_free_port() -> int:
    """Find a free TCP port for Chrome debugging."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('', 0))
        return s.getsockname()[1]


def _generate_cdp_node_script(debug_port: int, target_url: str, output_path: str,
                                width: int, height: int, animation_wait: int) -> str:
    """Generate a Node.js script that captures screenshot via CDP.

    Uses Node.js net module for raw WebSocket (avoids Node 22 built-in
    WebSocket compatibility issues with Chrome CDP).
    """
    return f'''
import http from "http";
import net from "net";
import {{ URL }} from "url";
import crypto from "crypto";
import fs from "fs";

const DEBUG_PORT = {debug_port};
const TARGET_URL = "{target_url}";
const OUTPUT_PATH = "{output_path}";
const CLIP_WIDTH = {width};
const CLIP_HEIGHT = {height};
const ANIMATION_WAIT = {animation_wait} * 1000;

function fetchJSON(path) {{
  return new Promise((resolve, reject) => {{
    http.get(`http://127.0.0.1:${{DEBUG_PORT}}${{path}}`, (res) => {{
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(JSON.parse(data)));
      res.on("error", reject);
    }}).on("error", reject);
  }});
}}

async function main() {{
  // Find the correct page target (not extensions or service workers)
  const targets = await fetchJSON("/json/list");
  const target = targets.find(t => t.url.includes(TARGET_URL.replace("http://", "")))
    || targets.find(t => t.type === "page")
    || targets[0];

  if (!target) {{
    console.error("No suitable CDP target found");
    console.error("Available targets:", targets.map(t => t.type + " " + t.url).join(", "));
    process.exit(1);
  }}
  console.error("Target: " + target.title + " (" + target.url + ")");

  const wsUrl = target.webSocketDebuggerUrl;
  const parsed = new URL(wsUrl);

  // Connect via raw TCP WebSocket (Node 22 built-in WebSocket has issues with CDP)
  const sock = net.connect(parseInt(parsed.port), parsed.hostname);
  await new Promise((resolve, reject) => {{
    sock.on("connect", resolve);
    sock.on("error", reject);
    setTimeout(() => reject(new Error("TCP connect timeout")), 10000);
  }});

  // WebSocket handshake
  const key = crypto.randomBytes(16).toString("base64");
  sock.write(
    "GET " + parsed.pathname + " HTTP/1.1\\r\\n" +
    "Host: " + parsed.host + "\\r\\n" +
    "Upgrade: websocket\\r\\n" +
    "Connection: Upgrade\\r\\n" +
    "Sec-WebSocket-Key: " + key + "\\r\\n" +
    "Sec-WebSocket-Version: 13\\r\\n\\r\\n"
  );

  let buffer = Buffer.alloc(0);
  let handshakeDone = false;
  let msgId = 0;
  let pendingResolve = null;
  let pendingId = 0;

  function sendWs(obj) {{
    const msg = JSON.stringify(obj);
    const msgBuf = Buffer.from(msg);
    const mask = crypto.randomBytes(4);
    let frame;
    if (msgBuf.length < 126) {{
      frame = Buffer.alloc(6 + msgBuf.length);
      frame[0] = 0x81; frame[1] = 0x80 | msgBuf.length;
      mask.copy(frame, 2);
      for (let i = 0; i < msgBuf.length; i++) frame[6 + i] = msgBuf[i] ^ mask[i % 4];
    }} else if (msgBuf.length < 65536) {{
      frame = Buffer.alloc(8 + msgBuf.length);
      frame[0] = 0x81; frame[1] = 0x80 | 126;
      frame.writeUInt16BE(msgBuf.length, 2); mask.copy(frame, 4);
      for (let i = 0; i < msgBuf.length; i++) frame[8 + i] = msgBuf[i] ^ mask[i % 4];
    }} else {{
      frame = Buffer.alloc(14 + msgBuf.length);
      frame[0] = 0x81; frame[1] = 0x80 | 127;
      frame.writeBigUInt64BE(BigInt(msgBuf.length), 2); mask.copy(frame, 10);
      for (let i = 0; i < msgBuf.length; i++) frame[14 + i] = msgBuf[i] ^ mask[i % 4];
    }}
    sock.write(frame);
  }}

  function processFrames() {{
    while (buffer.length >= 2) {{
      const opcode = buffer[0] & 0x0F;
      let payloadLen = buffer[1] & 0x7F;
      let offset = 2;
      if (payloadLen === 126) {{
        if (buffer.length < 4) return;
        payloadLen = buffer.readUInt16BE(2); offset = 4;
      }} else if (payloadLen === 127) {{
        if (buffer.length < 10) return;
        payloadLen = Number(buffer.readBigUInt64BE(2)); offset = 10;
      }}
      if (buffer.length < offset + payloadLen) return;
      const payload = buffer.subarray(offset, offset + payloadLen);
      buffer = buffer.subarray(offset + payloadLen);
      if (opcode === 1) {{
        const msg = JSON.parse(payload.toString("utf8"));
        if (msg.id === pendingId && pendingResolve) {{
          const resolve = pendingResolve;
          pendingResolve = null;
          resolve(msg);
        }}
      }}
    }}
  }}

  function cdpSend(method, params) {{
    return new Promise((resolve, reject) => {{
      msgId++;
      pendingId = msgId;
      pendingResolve = resolve;
      sendWs({{ id: msgId, method, params }});
      setTimeout(() => {{
        if (pendingResolve === resolve) {{
          pendingResolve = null;
          reject(new Error("Timeout: " + method));
        }}
      }}, 60000);
    }});
  }}

  // Wait for handshake and set up data handler
  await new Promise((resolve, reject) => {{
    const onData = (chunk) => {{
      if (!handshakeDone) {{
        buffer = Buffer.concat([buffer, chunk]);
        const idx = buffer.indexOf("\\r\\n\\r\\n");
        if (idx === -1) return;
        const statusLine = buffer.subarray(0, idx).toString().split("\\r\\n")[0];
        if (!statusLine.includes("101")) {{
          reject(new Error("WS handshake failed: " + statusLine));
          return;
        }}
        buffer = buffer.subarray(idx + 4);
        handshakeDone = true;
        resolve();
      }} else {{
        buffer = Buffer.concat([buffer, chunk]);
        processFrames();
      }}
    }};
    sock.on("data", onData);
    sock.on("error", reject);
    setTimeout(() => reject(new Error("WS handshake timeout")), 10000);
  }});

  console.error("CDP connected");

  // Verify page is loaded
  const rs = await cdpSend("Runtime.evaluate", {{ expression: "document.readyState" }});
  console.error("Page readyState: " + (rs.result?.result?.value || "unknown"));

  // Wait for CSS animations to complete
  console.error("Waiting " + ({animation_wait}) + "s for animations...");
  await new Promise(r => setTimeout(r, ANIMATION_WAIT));

  // Capture screenshot
  console.error("Capturing screenshot...");
  const result = await cdpSend("Page.captureScreenshot", {{
    format: "png",
    clip: {{ x: 0, y: 0, width: CLIP_WIDTH, height: CLIP_HEIGHT, scale: 1 }},
    captureBeyondViewport: false,
  }});

  if (result.result && result.result.data) {{
    const imgBuf = Buffer.from(result.result.data, "base64");
    fs.writeFileSync(OUTPUT_PATH, imgBuf);
    const size = imgBuf.length;
    console.error("Screenshot saved: " + OUTPUT_PATH + " (" + size + " bytes)");
    // Output path to stdout for the Python caller
    console.log(OUTPUT_PATH);
  }} else {{
    console.error("Screenshot command failed: " + JSON.stringify(result).substring(0, 200));
    process.exit(1);
  }}

  sock.destroy();
  process.exit(0);
}}

main().catch(e => {{
  console.error("Fatal: " + e.message);
  process.exit(1);
}});
'''


def _cdp_capture(chrome_path: str, url: str, output_path: str, width: int, height: int,
                  preview_type: str, animation_wait: int = ANIMATION_WAIT_SECONDS) -> bool:
    """Capture screenshot using Chrome CDP via a Node.js helper script.

    Launches Chrome with --remote-debugging-port and --disable-extensions,
    then uses a Node.js script to connect via CDP, wait for CSS animations
    to complete, and capture the screenshot.

    Args:
        chrome_path: Path to Chrome executable
        url: URL to capture
        output_path: Output file path (absolute path)
        width: Viewport width
        height: Viewport height
        preview_type: 'mobile' or 'desktop'
        animation_wait: Seconds to wait for animations after page load

    Returns:
        True if screenshot was captured successfully
    """
    debug_port = _find_free_port()
    capture_height = height + CAPTURE_HEIGHT_PADDING

    chrome_args = [
        chrome_path,
        "--headless=new",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-dbus",
        "--disable-extensions",
        f"--window-size={width},{capture_height}",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        f"--remote-debugging-port={debug_port}",
    ]

    if preview_type == "mobile":
        chrome_args.append(
            "--user-agent=Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) "
            "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
        )

    chrome_args.append(url)
    print(f"🚀 Starting Chrome with CDP on port {debug_port}...", file=sys.stderr)

    chrome_proc = subprocess.Popen(
        chrome_args,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    try:
        # Wait for CDP to be ready
        cdp_ready = False
        for i in range(30):
            try:
                req = urllib.request.Request(f"http://127.0.0.1:{debug_port}/json/version")
                with urllib.request.urlopen(req, timeout=2) as resp:
                    if resp.status == 200:
                        cdp_ready = True
                        print(f"✅ CDP ready (attempt {i + 1})", file=sys.stderr)
                        break
            except Exception:
                pass
            time.sleep(0.5)

        if not cdp_ready:
            print("❌ CDP did not become ready", file=sys.stderr)
            return False

        # Resolve output_path to absolute
        abs_output = str(Path(output_path).resolve())

        # Generate and run Node.js CDP script
        node_script = _generate_cdp_node_script(
            debug_port=debug_port,
            target_url=url,
            output_path=abs_output,
            width=width,
            height=height,
            animation_wait=animation_wait,
        )

        with tempfile.NamedTemporaryFile(mode='w', suffix='.mjs', delete=False) as f:
            f.write(node_script)
            script_path = f.name

        try:
            print(f"📸 Running CDP screenshot (waiting {animation_wait}s for animations)...", file=sys.stderr)
            result = subprocess.run(
                ["node", script_path],
                capture_output=True,
                text=True,
                timeout=animation_wait + 60,  # animation wait + buffer
            )

            # Print Node.js stderr (progress messages)
            if result.stderr:
                for line in result.stderr.strip().split('\n'):
                    print(f"   {line}", file=sys.stderr)

            output_file = Path(abs_output)
            if result.returncode == 0 and output_file.exists() and output_file.stat().st_size > 0:
                size = output_file.stat().st_size
                print(f"✅ Screenshot captured successfully!", file=sys.stderr)
                print(f"✅ {output_path} ({size:,} bytes)")
                return True
            else:
                print(f"❌ CDP screenshot failed (exit code {result.returncode})", file=sys.stderr)
                return False
        finally:
            Path(script_path).unlink(missing_ok=True)

    finally:
        try:
            chrome_proc.terminate()
            chrome_proc.wait(timeout=5)
        except Exception:
            chrome_proc.kill()


def capture_screenshot(output_path: str, url: str = DEFAULT_URL) -> None:
    """Capture screenshot of a webpage using CDP for accurate rendering."""
    output_file = Path(output_path)
    output_file.parent.mkdir(parents=True, exist_ok=True)

    # Wait 3 seconds before starting to allow service to initialize
    print("⏳ Waiting 3s for service to initialize...", file=sys.stderr)
    time.sleep(3)

    # Get preview type and determine window size
    preview_type = get_preview_type()
    width, height = WINDOW_SIZES.get(preview_type, WINDOW_SIZES["desktop"])
    print(f"📐 Viewport: {width}x{height} ({preview_type})", file=sys.stderr)

    # Wait for server to be ready
    if not wait_for_server(url, timeout=60):
        print("❌ Server not responding, using fallback image.", file=sys.stderr)
        # _copy_fallback_image(output_path)
        return

    # Chrome paths for different systems
    chrome_paths = {
        "Darwin": [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
        ],
        "Linux": [
            "google-chrome", "chromium", "chromium-browser",
            "/usr/bin/google-chrome", "/usr/bin/chromium",
        ]
    }.get(platform.system(), [])

    if not chrome_paths:
        sys.exit(f"❌ Unsupported OS: {platform.system()}")

    print(f"📋 OS: {platform.system()}", file=sys.stderr)
    print(f"💾 Output: {output_path}", file=sys.stderr)

    # Try each Chrome path with CDP
    last_error = None
    attempt = 0
    for chrome_path in chrome_paths:
        attempt += 1
        # Check if Chrome exists
        if "/" in chrome_path:
            if not Path(chrome_path).exists():
                print(f"⚠️  [{attempt}/{len(chrome_paths)}] Path not found: {chrome_path}", file=sys.stderr)
                continue
        elif subprocess.run(["which", chrome_path], capture_output=True).returncode != 0:
            print(f"⚠️  [{attempt}/{len(chrome_paths)}] Command not found: {chrome_path}", file=sys.stderr)
            continue

        print(f"🔍 [{attempt}/{len(chrome_paths)}] Trying: {chrome_path}", file=sys.stderr)

        try:
            success = _cdp_capture(
                chrome_path=chrome_path,
                url=url,
                output_path=output_path,
                width=width,
                height=height,
                preview_type=preview_type,
                animation_wait=ANIMATION_WAIT_SECONDS,
            )
            if success:
                return
            else:
                last_error = "CDP capture failed"
        except Exception as e:
            last_error = f"{type(e).__name__}: {e}"
            print(f"❌ [{attempt}/{len(chrome_paths)}] {last_error}", file=sys.stderr)
            continue

    print(f"\n❌ All {attempt} attempts failed, using fallback image.", file=sys.stderr)
    # _copy_fallback_image(output_path)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: python capture_screenshot.py <output_path>")

    capture_screenshot(sys.argv[1])
