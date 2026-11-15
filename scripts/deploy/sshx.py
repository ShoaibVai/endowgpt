"""Minimal password-based SSH runner, used by `deploy.bat`.

Windows ships an OpenSSH client but no way to feed it a password
non-interactively, and there is no sshpass/plink here, so Paramiko does the one
thing we need: upload a bash script, run it, and stream the output back.

Usage:
    python sshx.py --script server-update.sh [--arg build] [--sudo] [--timeout 2400]

Connection details come from the environment: EH_HOST, EH_USER, EH_PASS.
The remote script is uploaded to /tmp/eh_step_<pid>.sh and executed with bash;
its exit code becomes ours. Line endings are normalised to LF before upload,
because a CRLF script fails on the server with a confusing `$'\\r'` error.
"""

import argparse
import io
import os
import shlex
import sys
import time

try:
    import paramiko
except ImportError:  # pragma: no cover - environment problem, not a code path
    sys.exit("paramiko is not installed. Run: pip install paramiko")


def fail(message: str) -> "NoReturn":  # noqa: F821 - string annotation keeps imports lean
    print("[sshx] " + message, file=sys.stderr)
    raise SystemExit(2)


def main() -> int:
    parser = argparse.ArgumentParser(add_help=True)
    parser.add_argument("--script", required=True, help="local bash script to run remotely")
    parser.add_argument("--arg", action="append", default=[], help="argument passed to the script")
    parser.add_argument("--sudo", action="store_true", help="run the script through sudo")
    parser.add_argument("--timeout", type=float, default=900.0, help="overall seconds")
    args = parser.parse_args()

    host = os.environ.get("EH_HOST", "").strip()
    user = os.environ.get("EH_USER", "").strip()
    password = os.environ.get("EH_PASS", "")
    for name, value in (("EH_HOST", host), ("EH_USER", user), ("EH_PASS", password)):
        if not value:
            fail("%s is not set" % name)

    if not os.path.isfile(args.script):
        fail("script not found: %s" % args.script)

    # CRLF would break the remote shebang line; normalise before sending.
    with open(args.script, "rb") as handle:
        payload = handle.read().replace(b"\r\n", b"\n")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(
            host,
            username=user,
            password=password,
            timeout=30,
            banner_timeout=30,
            auth_timeout=30,
            look_for_keys=False,
            allow_agent=False,
        )
    except paramiko.AuthenticationException:
        fail("authentication failed for %s@%s" % (user, host))
    except Exception as error:  # noqa: BLE001 - report the transport error verbatim
        fail("could not connect to %s: %s" % (host, error))

    remote = "/tmp/eh_step_%d.sh" % os.getpid()
    try:
        sftp = client.open_sftp()
        sftp.putfo(io.BytesIO(payload), remote)
        sftp.close()
        client.exec_command("chmod +x %s" % remote)[1].channel.recv_exit_status()
    except Exception as error:  # noqa: BLE001
        client.close()
        fail("upload failed: %s" % error)

    inner = " ".join(["bash", shlex.quote(remote)] + [shlex.quote(a) for a in args.arg])
    command = "echo %s | sudo -S -p '' %s" % (shlex.quote(password), inner) if args.sudo else inner

    channel = client.get_transport().open_session()
    channel.settimeout(1.0)
    channel.exec_command(command)

    deadline = time.time() + args.timeout
    timed_out = False
    while True:
        moved = False
        while channel.recv_ready():
            sys.stdout.write(channel.recv(65536).decode("utf-8", "replace"))
            sys.stdout.flush()
            moved = True
        while channel.recv_stderr_ready():
            sys.stdout.write(channel.recv_stderr(65536).decode("utf-8", "replace"))
            sys.stdout.flush()
            moved = True
        if channel.exit_status_ready() and not channel.recv_ready() and not channel.recv_stderr_ready():
            break
        if time.time() > deadline:
            timed_out = True
            break
        if not moved:
            time.sleep(0.05)

    if timed_out:
        channel.close()
        client.close()
        print("\n[sshx] timed out after %d seconds" % args.timeout, file=sys.stderr)
        return 124

    status = channel.recv_exit_status()
    channel.close()

    try:
        client.exec_command("rm -f %s" % remote)
    finally:
        client.close()
    return status


if __name__ == "__main__":
    sys.exit(main())
