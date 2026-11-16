"""Запускает баннер и восстанавливает его после завершения процесса."""

import os
import subprocess
import sys
import time
from pathlib import Path

import win32api
import win32event
import win32job
import win32process


EXIT_SETUP_REQUIRED = 78
DISABLED = Path(os.environ["LOCALAPPDATA"]) / "SpaceArena" / "banner-disabled"
AGENT = Path(__file__).resolve().with_name("agent.py")


def run_agent(command):
    # Включаем в Job Object и launcher venv, и процессы Python/Qt, которые он создаёт.
    job = win32job.CreateJobObject(None, "")
    try:
        limits = win32job.QueryInformationJobObject(job, win32job.JobObjectExtendedLimitInformation)
        limits["BasicLimitInformation"]["LimitFlags"] |= win32job.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        win32job.SetInformationJobObject(job, win32job.JobObjectExtendedLimitInformation, limits)
        process, thread, _, _ = win32process.CreateProcess(
            command[0], subprocess.list2cmdline(command), None, None, False,
            win32process.CREATE_SUSPENDED, None, str(AGENT.parent), win32process.STARTUPINFO(),
        )
        try:
            try:
                win32job.AssignProcessToJobObject(job, process)
                win32process.ResumeThread(thread)
            except Exception:
                win32api.TerminateProcess(process, 1)
                raise
            while not DISABLED.exists():
                if win32event.WaitForSingleObject(process, 500) == win32event.WAIT_OBJECT_0:
                    return win32process.GetExitCodeProcess(process)
            return None
        finally:
            thread.Close()
            process.Close()
    finally:
        job.Close()


def supervise(configure=False):
    mutex = win32event.CreateMutex(None, False, "Local\\SpaceArenaBannerSupervisor")
    try:
        acquired = win32event.WaitForSingleObject(mutex, 3000)
        if acquired not in (win32event.WAIT_OBJECT_0, win32event.WAIT_ABANDONED):
            return
        try:
            command = [sys.executable, str(AGENT)]
            if configure:
                command.append("--configure")
            while not DISABLED.exists():
                exit_code = run_agent(command)
                if exit_code == EXIT_SETUP_REQUIRED:
                    return EXIT_SETUP_REQUIRED
                if exit_code is None:
                    return
                command = command[:2]
                time.sleep(2)
        finally:
            win32event.ReleaseMutex(mutex)
    finally:
        win32api.CloseHandle(mutex)


def main():
    if "--stop" in sys.argv:
        DISABLED.parent.mkdir(parents=True, exist_ok=True)
        DISABLED.touch()
        return
    if "--enable" in sys.argv:
        DISABLED.unlink(missing_ok=True)
    return supervise(configure="--configure" in sys.argv)


if __name__ == "__main__":
    sys.exit(main())
