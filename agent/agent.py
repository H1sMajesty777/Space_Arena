"""Windows-агент. Секрет зашифрован DPAPI для текущей учётной записи."""
import ipaddress
import json
import logging
import os
import threading
import time
import sys
import webbrowser
from ctypes.wintypes import MSG
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from datetime import datetime
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
import tkinter as tk
from tkinter import simpledialog, messagebox
import win32crypt
import win32api
import win32event
import winerror
import win32con
import win32gui
import win32ts

from watchdog import EXIT_SETUP_REQUIRED
from PySide6.QtCore import Qt, QTimer, QUrl, Signal
from PySide6.QtWidgets import QApplication
from PySide6.QtWebEngineCore import QWebEnginePage
from PySide6.QtWebEngineWidgets import QWebEngineView

SETTINGS = Path(os.environ["LOCALAPPDATA"]) / "SpaceArena" / "device.bin"
BANNER = Path(__file__).resolve().parent / "banner"
OVERLAY_SETTLE_DELAY_SECONDS = 5
OVERLAY_DISCARD_DELAY_SECONDS = 60
WM_WTSSESSION_CHANGE = 0x02B1
WTS_SESSION_LOCK = 0x7
WTS_SESSION_UNLOCK = 0x8


class BannerHandler(SimpleHTTPRequestHandler):
    """Отдаёт баннер и временную гостевую ссылку только этому ПК."""

    current = None

    def do_GET(self):
        if self.headers.get("Host") != f"127.0.0.1:{self.server.server_port}":
            self.send_error(403)
            return
        if self.path == "/api/current":
            current = self.current.copy()
            valid = current["url"] and time.time() < current["expires"]
            payload = json.dumps({"order_url": current["url"] if valid else None,
                                  "expires_at": current["expires"], "status": current["status"]}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        super().do_GET()

    def do_POST(self):
        host = f"127.0.0.1:{self.server.server_port}"
        if self.headers.get("Host") != host or self.headers.get("Origin") not in (None, f"http://{host}"):
            self.send_error(403)
            return
        if self.path != "/api/open-order":
            self.send_error(404)
            return
        current = self.current.copy()
        if not current["url"] or time.time() >= current["expires"]:
            self.send_error(403, "QR expired")
            return
        webbrowser.open(current["url"])
        self.send_response(204)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def log_message(self, *args):
        pass  # Не записываем временные ссылки в журналы.


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


def valid_origin(url):
    parsed = urlsplit(url)
    try:
        address = ipaddress.ip_address(parsed.hostname)
        local = address.is_private or address.is_loopback
    except ValueError:
        local = parsed.hostname == "localhost"
    return (parsed.scheme == "https" or (parsed.scheme == "http" and local)) and parsed.path in ("", "/") and not parsed.query and not parsed.fragment and not parsed.username


def load_config(root):
    if SETTINGS.exists() and "--configure" not in sys.argv:
        try:
            return json.loads(win32crypt.CryptUnprotectData(SETTINGS.read_bytes(), None, None, None, 0)[1])
        except Exception:
            messagebox.showerror("SPACE ARENA", "Не удалось прочитать настройки устройства. Настройте подключение заново.")
    origin = simpledialog.askstring("Подключение ПК", "Адрес сервера, например http://192.168.0.134:8080", parent=root)
    if not origin or not valid_origin(origin.strip()):
        raise ValueError("Укажите HTTPS-адрес или локальный IP с портом, без пути")
    secret = simpledialog.askstring("Подключение ПК", "Одноразовый код подключения из панели администратора", show="*", parent=root)
    if not secret:
        raise ValueError("Секрет не указан")
    origin = origin.strip().rstrip("/")
    request = Request(origin + "/api/pc/enroll", data=json.dumps({"code": secret.strip()}).encode(), headers={"Content-Type": "application/json"})
    try:
        with build_opener(NoRedirect()).open(request, timeout=15) as response:
            device = json.load(response)
    except Exception:
        raise ValueError("Не удалось подключить ПК. Проверьте сервер и получите свежий код.")
    config = {"origin": origin, "secret": device["device_secret"]}
    SETTINGS.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS.write_bytes(win32crypt.CryptProtectData(json.dumps(config).encode(), "Space Arena", None, None, None, 0))
    return config


def lower_overlay(handle):
    """Держим баннер ниже обычных окон."""
    win32gui.SetWindowPos(handle, win32con.HWND_BOTTOM, 0, 0, 0, 0,
                          win32con.SWP_NOMOVE | win32con.SWP_NOSIZE |
                          win32con.SWP_NOACTIVATE)


def foreground_is_fullscreen(handle):
    foreground = win32gui.GetForegroundWindow()
    if not foreground or foreground == handle or win32gui.IsIconic(foreground):
        return False
    if win32gui.GetClassName(foreground) in {"Progman", "WorkerW", "Shell_TrayWnd"}:
        return False
    style = win32gui.GetWindowLong(foreground, win32con.GWL_STYLE)
    if style & win32con.WS_MAXIMIZE and style & win32con.WS_CAPTION == win32con.WS_CAPTION:
        return False
    monitor = win32api.MonitorFromWindow(handle, win32con.MONITOR_DEFAULTTONEAREST)
    ml, mt, mr, mb = win32api.GetMonitorInfo(monitor)["Monitor"]
    left, top, right, bottom = win32gui.GetWindowRect(foreground)
    return left <= ml and top <= mt and right >= mr and bottom >= mb


class SessionOverlay(QWebEngineView):
    session_lock_changed = Signal(bool)

    def __init__(self):
        super().__init__()
        self._session_handle = None

    def watch_session(self, handle):
        try:
            win32ts.WTSRegisterSessionNotification(handle, win32ts.NOTIFY_FOR_THIS_SESSION)
        except win32ts.error:
            logging.warning("Could not subscribe to Windows session notifications", exc_info=True)
        else:
            self._session_handle = handle

    def unwatch_session(self):
        if self._session_handle is not None:
            handle = self._session_handle
            self._session_handle = None
            try:
                win32ts.WTSUnRegisterSessionNotification(handle)
            except win32ts.error:
                logging.warning("Could not unsubscribe from Windows session notifications", exc_info=True)

    def nativeEvent(self, event_type, message):
        if event_type == b"windows_generic_MSG":
            event = MSG.from_address(int(message))
            if event.message == WM_WTSSESSION_CHANGE and event.wParam in (WTS_SESSION_LOCK, WTS_SESSION_UNLOCK):
                self.session_lock_changed.emit(event.wParam == WTS_SESSION_LOCK)
                return True, 0
        return super().nativeEvent(event_type, message)

    def closeEvent(self, event):
        self.unwatch_session()
        super().closeEvent(event)


def create_overlay(url):
    window = SessionOverlay()
    window.setWindowTitle("Space Arena Banner")
    window.setWindowFlags(Qt.WindowType.FramelessWindowHint | Qt.WindowType.Tool)
    window.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
    window.setAttribute(Qt.WidgetAttribute.WA_ShowWithoutActivating)
    window.setContextMenuPolicy(Qt.ContextMenuPolicy.NoContextMenu)
    window.page().setBackgroundColor(Qt.GlobalColor.transparent)

    screen = QApplication.primaryScreen().geometry()
    # Отступы выравнивают окно по рамкам на клубных обоях.
    left = round(screen.width() * 0.51)
    top = round(screen.height() * 0.083)
    right_margin = round(screen.width() * 0.021)
    bottom = round(screen.height() * 0.59)
    window.setGeometry(screen.x() + left, screen.y() + top,
                       screen.width() - left - right_margin, bottom - top)
    window.load(QUrl(url))
    return window


def finish_overlay_intro(page):
    page.runJavaScript("""
        for (const animation of document.getAnimations()) {
            if (Number.isFinite(animation.effect.getComputedTiming().endTime)) {
                animation.finish();
            }
        }
    """)


def set_overlay_motion(page, enabled):
    paused = "false" if enabled else "true"
    page.runJavaScript(f'document.documentElement.toggleAttribute("data-motion-paused", {paused})')


def configure_overlay_replay(window, handle):
    page = window.page()
    lifecycle = QWebEnginePage.LifecycleState
    fullscreen_since = None
    settled = False
    locked = False

    fullscreen_timer = QTimer(window)
    fullscreen_timer.setInterval(250)
    unlock_timer = QTimer(window)
    unlock_timer.setSingleShot(True)
    unlock_timer.setInterval(350)

    def restore_overlay():
        if page.lifecycleState() == lifecycle.Discarded:
            # Qt заново загружает страницу при выходе из Discarded.
            page.setLifecycleState(lifecycle.Active)
        else:
            window.reload()
        window.show()
        lower_overlay(handle)

    def check_fullscreen():
        nonlocal fullscreen_since, settled
        if locked:
            return True
        try:
            fullscreen = foreground_is_fullscreen(handle)
        except win32gui.error:
            # Сохраняем текущее состояние, если окно закрылось во время проверки.
            return fullscreen_since is not None

        if not fullscreen:
            was_settled = settled
            fullscreen_since, settled = None, False
            if window.isHidden() and not unlock_timer.isActive():
                restore_overlay()
            elif was_settled and window.isVisible():
                set_overlay_motion(page, True)
            return False

        now = time.monotonic()
        if fullscreen_since is None:
            fullscreen_since = now
        elapsed = now - fullscreen_since
        if elapsed >= OVERLAY_SETTLE_DELAY_SECONDS and not settled:
            settled = True
            finish_overlay_intro(page)
            set_overlay_motion(page, False)
        if elapsed >= OVERLAY_DISCARD_DELAY_SECONDS:
            if window.isVisible():
                window.hide()
                page.setVisible(False)
            if page.lifecycleState() != lifecycle.Discarded and not page.isLoading():
                page.setLifecycleState(lifecycle.Discarded)
        return True

    def replay_on_unlock():
        was_hidden = window.isHidden()
        if not check_fullscreen() and not was_hidden:
            window.reload()

    def on_load_finished(loaded):
        if locked or unlock_timer.isActive():
            return
        if check_fullscreen() and settled and loaded and window.isVisible():
            finish_overlay_intro(page)
            set_overlay_motion(page, False)

    def on_session_lock_changed(is_locked):
        nonlocal fullscreen_since, locked
        locked = is_locked
        if locked:
            fullscreen_timer.stop()
            unlock_timer.stop()
        else:
            fullscreen_since = None
            unlock_timer.start()
            fullscreen_timer.start()

    fullscreen_timer.timeout.connect(check_fullscreen)
    unlock_timer.timeout.connect(replay_on_unlock)
    window.loadFinished.connect(on_load_finished)
    window.session_lock_changed.connect(on_session_lock_changed)
    window.watch_session(handle)
    fullscreen_timer.start()


def run():
    # Окно настройки создаётся только при первом подключении и затем закрывается.
    setup = tk.Tk()
    setup.withdraw()
    try:
        config = load_config(setup)
    except Exception as issue:
        messagebox.showerror("Настройка SPACE ARENA", str(issue), parent=setup)
        setup.destroy()
        return EXIT_SETUP_REQUIRED
    setup.destroy()

    if not BANNER.joinpath("index.html").exists():
        messagebox.showerror("SPACE ARENA", "Не найдены файлы баннера. Переустановите агент.")
        return EXIT_SETUP_REQUIRED

    stop = threading.Event()
    current = {"url": None, "expires": 0, "status": "Подключаемся…"}
    BannerHandler.current = current
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(BannerHandler, directory=str(BANNER)))
    threading.Thread(target=server.serve_forever, daemon=True).start()

    def worker():
        opener = build_opener(NoRedirect())
        refresh_at = 0
        access_version = None
        while not stop.is_set():
            delay = 30
            try:
                if time.time() < refresh_at:
                    heartbeat = Request(config["origin"] + "/api/pc/status",
                                        headers={"Authorization": "Device " + config["secret"]})
                    with opener.open(heartbeat, timeout=15) as response:
                        latest_version = json.load(response).get("access_version")
                    if latest_version == access_version:
                        stop.wait(min(30, max(1, refresh_at - time.time())))
                        continue
                    current.update(url=None, expires=0, status="Обновляем QR…")
                request = Request(config["origin"] + "/api/pc/qr-token",
                                  headers={"Authorization": "Device " + config["secret"]})
                with opener.open(request, timeout=15) as response:
                    result = json.load(response)
                expires = datetime.fromisoformat(result["expires_at"]).timestamp()
                target = urlsplit(result["order_url"])
                if not valid_origin(target.scheme + "://" + target.netloc) or target.path != "/order":
                    raise ValueError("Unexpected origin")
                current.update(url=result["order_url"], expires=expires,
                               status="Отсканируйте QR или нажмите на баннер")
                access_version = result.get("access_version")
                refresh_at = expires - 60
                delay = min(30, max(5, refresh_at - time.time()))
            except HTTPError as issue:
                refresh_at = 0
                text = ("Компьютер отключён. Обратитесь к сотруднику клуба." if issue.code in (401, 403)
                        else "Сервис временно недоступен. Повторяем подключение…")
                current.update(url=None, expires=0, status=text)
            except Exception:
                refresh_at = 0
                current.update(url=None, expires=0, status="Нет связи с сервером. Повторяем подключение…")
            stop.wait(delay)

    try:
        app = QApplication([])
        app.setApplicationName("Space Arena Banner")
        app.setApplicationDisplayName("Space Arena Banner")
        window = create_overlay(f"http://127.0.0.1:{server.server_port}/")
        window.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
        window.destroyed.connect(app.quit)
        window.show()
        handle = int(window.winId())
        lower_overlay(handle)

        app.aboutToQuit.connect(window.unwatch_session)
        configure_overlay_replay(window, handle)
        threading.Thread(target=worker, daemon=True).start()
        return app.exec()
    finally:
        stop.set()
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    mutex = win32event.CreateMutex(None, False, "Local\\SpaceArenaOrdersAgent")
    if win32api.GetLastError() != winerror.ERROR_ALREADY_EXISTS:
        sys.exit(run())
    sys.exit(EXIT_SETUP_REQUIRED)


