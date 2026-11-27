#!/usr/bin/env python3
"""
ZETICUZ Telemetry Wrapper
Invokes the unified Node.js GraphQL/manifest telemetry generator (scripts/sync-profile.mjs).
"""
import os
import subprocess
import sys


def main() -> int:
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    script_path = os.path.join(root_dir, "scripts", "sync-profile.mjs")
    proc = subprocess.run(["node", script_path], cwd=root_dir)
    return proc.returncode


if __name__ == "__main__":
    sys.exit(main())
