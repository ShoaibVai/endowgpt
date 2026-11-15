"""Read a password without echoing it.

`deploy.bat` captures this through `for /f`, so the value goes to stdout and the
prompt is drawn by getpass on the console. Kept separate from sshx.py because
batch quoting around PowerShell's SecureString dance is fragile, and Python is
already a hard requirement for the SSH transport.

getpass() on Windows reads CONIN$ directly, which blocks forever when no console
is attached. `sys.stdin.isatty()` cannot be used to detect that: on Windows it
reports True for any character device, including NUL. GetConsoleMode is the only
reliable probe, and where it fails we accept piped stdin instead of hanging.
"""

import getpass
import sys


def stdin_is_console() -> bool:
    if sys.platform != "win32":
        return sys.stdin is not None and sys.stdin.isatty()

    import ctypes

    handle = ctypes.windll.kernel32.GetStdHandle(-10)  # STD_INPUT_HANDLE
    mode = ctypes.c_uint()
    return bool(ctypes.windll.kernel32.GetConsoleMode(handle, ctypes.byref(mode)))


def read_password(prompt: str) -> str:
    if stdin_is_console():
        try:
            return getpass.getpass(prompt)
        except (KeyboardInterrupt, EOFError):
            return ""

    # No console: accept a piped value, otherwise report rather than block.
    line = sys.stdin.readline() if sys.stdin is not None else ""
    if not line:
        sys.stderr.write("[askpass] no console and no piped input; set EH_PASS instead\n")
        return ""
    return line.rstrip("\r\n")


def main() -> int:
    prompt = sys.argv[1] if len(sys.argv) > 1 else "password: "
    value = read_password(prompt)
    if not value:
        return 1
    sys.stdout.write(value)
    return 0


if __name__ == "__main__":
    sys.exit(main())
