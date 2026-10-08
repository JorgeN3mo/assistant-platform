#!/usr/bin/env python3
"""Read a Telegram token privately and save it outside the repository."""
import getpass
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import urllib.error
import urllib.request


def main():
    if not sys.stdin.isatty():
        raise SystemExit("Ejecuta este comando desde una terminal interactiva.")
    token = getpass.getpass("Pega el token de BotFather (no se mostrará): ").strip()
    if not re.fullmatch(r"[0-9]+:[A-Za-z0-9_-]+", token):
        raise SystemExit("El formato del token no es válido. No se ha guardado.")
    try:
        request = urllib.request.Request(
            "https://api.telegram.org/bot" + token + "/getMe",
            data=b"", method="POST",
        )
        with urllib.request.urlopen(request, timeout=15) as response:
            result = json.load(response)
    except (urllib.error.URLError, ValueError, TimeoutError):
        raise SystemExit("No se pudo verificar el token con Telegram. No se ha guardado.")
    if not result.get("ok") or not result.get("result", {}).get("is_bot"):
        raise SystemExit("Telegram no ha validado el bot. No se ha guardado.")
    directory = Path("/data/openclaw/secrets")
    directory.mkdir(mode=0o700, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".liki-token-", dir=directory)
    try:
        with os.fdopen(fd, "w") as output:
            output.write(token + "\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, directory / "liki-telegram-token")
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print("Token guardado y validado para @" + result["result"].get("username", "bot"))


if __name__ == "__main__":
    main()
