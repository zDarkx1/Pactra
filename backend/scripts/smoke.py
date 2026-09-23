"""Exercise the built local binary; standard-library-only integration smoke test."""
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import time
import urllib.request

binary = str(Path(__file__).resolve().parents[1] / "bin" / "pactra")
with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
env = dict(os.environ, HOST="127.0.0.1", PORT=str(port))
process = subprocess.Popen(binary, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
# Explicitly bypass machine proxy settings: this test only contacts loopback.
client = urllib.request.build_opener(urllib.request.ProxyHandler({}))
base = f"http://127.0.0.1:{port}"
try:
    deadline = time.monotonic() + 5
    while True:
        try:
            with client.open(base + "/health", timeout=0.5) as response:
                assert json.load(response) == {"status": "ok"}
                assert response.headers["X-Content-Type-Options"] == "nosniff"
            break
        except OSError:
            if process.poll() is not None or time.monotonic() > deadline:
                raise
            time.sleep(0.02)
    with client.open(base + "/ready", timeout=2) as response:
        assert json.load(response) == {"status": "ready", "mode": "stateless-checker"}
    body = json.dumps({
        "source": {"a": "Hello {name} Pactra"},
        "submission": {"a": "Bonjour {name} Pactra"},
        "rules": {"preserve_placeholders": True, "required_terms": ["Pactra"]},
    }).encode()
    request = urllib.request.Request(base + "/api/v1/check", data=body,
                                     headers={"Content-Type": "application/json"})
    with client.open(request, timeout=2) as response:
        data = json.load(response)
        assert data["passed"] is True
        assert len(data["checks"]) == 4
    print("HTTP smoke: health, ready, valid check PASS")
    busy = subprocess.run(binary, env=env, capture_output=True, timeout=3)
    assert busy.returncode != 0
    print("Occupied bind exits nonzero: PASS")
    process.send_signal(signal.SIGTERM)
    out, err = process.communicate(timeout=12)
    assert process.returncode == 0
    assert out == b"" and err == b""
    print("SIGTERM graceful exit 0; no request/body logs: PASS")
    for key, value in [("HOST", "http://localhost"), ("PORT", "65536")]:
        bad = subprocess.run(binary, env=dict(env, **{key: value}),
                             capture_output=True, timeout=3)
        assert bad.returncode != 0
    print("Invalid HOST/PORT exit nonzero: PASS")
finally:
    if process.poll() is None:
        process.kill()
        process.communicate()
