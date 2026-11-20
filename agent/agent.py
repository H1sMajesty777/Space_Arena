"""Windows-агент. Секрет зашифрован DPAPI для текущей учётной записи."""

import ipaddress
import json
import logging
import os
import sys
import threading
import time
import tkinter as tk
from ctypes.wintypes import MSG
from datetime import datetime
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tkinter import messagebox, simpledialog
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

import pythoncom
import win32api
import win32con
import win32crypt
import win32event
import win32gui
import win32process
import win32ts
import winerror
from win32com.shell import shell
from PySide6.QtCore import Qt, QTimer, QUrl, Signal
from PySide6.QtWebEngineCore import QWebEnginePage
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QApplication

from watchdog import EXIT_SETUP_REQUIRED


# Настройки баннера. Координаты и отступы указаны в процентах от размера основного экрана.
BANNER_WINDOW_TITLE = "Space Arena Banner"
BANNER_LEFT_PERCENT = 51.0
BANNER_TOP_PERCENT = 8.3
BANNER_RIGHT_MARGIN_PERCENT = 2.1
BANNER_BOTTOM_PERCENT = 59.0

# Полноэкранный режим и разблокировка Windows.
FULLSCREEN_CHECK_INTERVAL_MS = 250
UNLOCK_REPLAY_DELAY_MS = 350
OVERLAY_SETTLE_DELAY_SECONDS = 5  # Завершить заставку и приостановить анимацию.
OVERLAY_DISCARD_DELAY_SECONDS = 60  # Скрыть баннер и выгрузить его страницу.

# Связь с сервером и обновление QR. Срок действия ссылки задаёт сервер.
API_TIMEOUT_SECONDS = 15
ACCESS_CHECK_INTERVAL_SECONDS = 30
RETRY_DELAY_SECONDS = 30
QR_REFRESH_BEFORE_EXPIRY_SECONDS = 60
MIN_ACCESS_CHECK_DELAY_SECONDS = 1
MIN_QR_REFRESH_DELAY_SECONDS = 5

# Открытие заказа в развёрнутом окне браузера по умолчанию.
BROWSER_WINDOW_TIMEOUT_SECONDS = 10
BROWSER_WINDOW_CHECK_INTERVAL_SECONDS = 0.1


# Служебные пути и идентификаторы Windows.
DEVICE_SETTINGS_PATH = Path(os.environ["LOCALAPPDATA"]) / "SpaceArena" / "device.bin"
BANNER_DIRECTORY = Path(__file__).resolve().parent / "banner"
BANNER_BIND_HOST = "127.0.0.1"  # Страница баннера доступна только на этом ПК.
AGENT_MUTEX_NAME = r"Local\SpaceArenaOrdersAgent"

WM_WTSSESSION_CHANGE = 0x02B1
WTS_SESSION_LOCK = 0x7
WTS_SESSION_UNLOCK = 0x8
ASSOCF_IS_PROTOCOL = 0x1000
ASSOCSTR_EXECUTABLE = 2


class BannerHandler(SimpleHTTPRequestHandler):
    """Отдаёт баннер и временную гостевую ссылку только этому ПК."""

    current = None

    @property
    def local_host(self):
        return f"{BANNER_BIND_HOST}:{self.server.server_port}"

    def do_GET(self):
        if self.headers.get("Host") != self.local_host:
            self.send_error(403)
            return
        if self.path != "/api/current":
            super().do_GET()
            return

        link = self.current.copy()
        payload = json.dumps({
            "order_url": self.active_order_url(link),
            "expires_at": link["expires_at"],
            "status": link["status"],
        }).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self):
        host = self.local_host
        origin = self.headers.get("Origin")
        if self.headers.get("Host") != host or origin not in (None, f"http://{host}"):
            self.send_error(403)
            return
        if self.path != "/api/open-order":
            self.send_error(404)
            return
        order_url = self.active_order_url(self.current.copy())
        if not order_url:
            self.send_error(403, "QR expired")
            return
        try:
            open_order_in_browser(order_url)
        except Exception:
            logging.warning("Could not open the order browser")
            self.send_error(503, "Could not open browser")
            return
        self.send_response(204)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    @staticmethod
    def active_order_url(link):
        if link["order_url"] and time.time() < link["expires_at"]:
            return link["order_url"]
        return None

    def log_message(self, *args):
        pass  # Не записываем временные ссылки в журналы.


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


def browser_windows(executable):
    """Находит видимые окна выбранного браузера в порядке от переднего к заднему."""
    windows = []

    def collect_window(handle, _):
        if not win32gui.IsWindowVisible(handle):
            return
        try:
            _, process_id = win32process.GetWindowThreadProcessId(handle)
            permissions = win32con.PROCESS_QUERY_INFORMATION | win32con.PROCESS_VM_READ
            process = win32api.OpenProcess(permissions, False, process_id)
            try:
                window_executable = win32process.GetModuleFileNameEx(process, 0)
            finally:
                process.Close()
            if os.path.normcase(window_executable) == executable:
                windows.append(handle)
        except win32api.error:
            # Окно могло закрыться во время обхода, часть системных процессов недоступна.
            return

    win32gui.EnumWindows(collect_window, None)
    return windows


def open_order_in_browser(order_url):
    """Открывает ссылку и разворачивает окно, в том числе у уже запущенного браузера."""
    pythoncom.CoInitialize()
    try:
        association = shell.AssocCreate()
        association.Init(ASSOCF_IS_PROTOCOL, urlsplit(order_url).scheme)
        executable = os.path.normcase(association.GetString(0, ASSOCSTR_EXECUTABLE))
        previous_windows = set(browser_windows(executable))

        win32api.ShellExecute(0, "open", order_url, None, None, win32con.SW_SHOWMAXIMIZED)
        deadline = time.monotonic() + BROWSER_WINDOW_TIMEOUT_SECONDS
        while time.monotonic() < deadline:
            windows = browser_windows(executable)
            foreground = win32gui.GetForegroundWindow()
            new_windows = [handle for handle in windows if handle not in previous_windows]
            if foreground in windows:
                target = foreground
            elif new_windows:
                target = new_windows[0]
            else:
                time.sleep(BROWSER_WINDOW_CHECK_INTERVAL_SECONDS)
                continue

            win32gui.ShowWindow(target, win32con.SW_SHOWMAXIMIZED)
            return
        raise TimeoutError("Order browser window did not appear")
    finally:
        pythoncom.CoUninitialize()


def valid_origin(url):
    parsed = urlsplit(url)
    try:
        address = ipaddress.ip_address(parsed.hostname)
        local = address.is_private or address.is_loopback
    except ValueError:
        local = parsed.hostname == "localhost"
    allowed_scheme = parsed.scheme == "https" or (parsed.scheme == "http" and local)
    return (
        allowed_scheme
        and parsed.path in ("", "/")
        and not parsed.query
        and not parsed.fragment
        and not parsed.username
    )


def load_config(root):
    if DEVICE_SETTINGS_PATH.exists() and "--configure" not in sys.argv:
        try:
            encrypted = DEVICE_SETTINGS_PATH.read_bytes()
            _, payload = win32crypt.CryptUnprotectData(encrypted, None, None, None, 0)
            return json.loads(payload)
        except Exception:
            messagebox.showerror(
                "SPACE ARENA",
                "Не удалось прочитать настройки устройства. Настройте подключение заново.",
            )
    return enroll_device(root)


def enroll_device(root):
    origin = simpledialog.askstring(
        "Подключение ПК", "Адрес сервера, например http://192.168.0.134:8080", parent=root,
    )
    if not origin or not valid_origin(origin.strip()):
        raise ValueError("Укажите HTTPS-адрес или локальный IP с портом, без пути")
    enrollment_code = simpledialog.askstring(
        "Подключение ПК", "Одноразовый код подключения из панели администратора",
        show="*", parent=root,
    )
    if not enrollment_code:
        raise ValueError("Секрет не указан")
    origin = origin.strip().rstrip("/")
    request = Request(
        origin + "/api/pc/enroll",
        data=json.dumps({"code": enrollment_code.strip()}).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with build_opener(NoRedirect()).open(request, timeout=API_TIMEOUT_SECONDS) as response:
            device = json.load(response)
    except Exception as error:
        raise ValueError("Не удалось подключить ПК. Проверьте сервер и получите свежий код.") from error

    config = {"origin": origin, "secret": device["device_secret"]}
    payload = json.dumps(config).encode()
    encrypted = win32crypt.CryptProtectData(payload, "Space Arena", None, None, None, 0)
    DEVICE_SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    DEVICE_SETTINGS_PATH.write_bytes(encrypted)
    return config


def update_guest_link(config, current, stop):
    """Проверяет доступ стола и обновляет временную ссылку в фоновом потоке."""
    opener = build_opener(NoRedirect())
    refresh_at = 0
    access_version = None

    while not stop.is_set():
        delay = RETRY_DELAY_SECONDS
        try:
            origin = config["origin"]
            headers = {"Authorization": "Device " + config["secret"]}
            if time.time() < refresh_at:
                request = Request(origin + "/api/pc/status", headers=headers)
                with opener.open(request, timeout=API_TIMEOUT_SECONDS) as response:
                    latest_version = json.load(response).get("access_version")

                if latest_version == access_version:
                    seconds_until_refresh = refresh_at - time.time()
                    delay = min(
                        ACCESS_CHECK_INTERVAL_SECONDS,
                        max(MIN_ACCESS_CHECK_DELAY_SECONDS, seconds_until_refresh),
                    )
                    stop.wait(delay)
                    continue

                # Версия изменилась, старый QR больше не действует.
                current.update(order_url=None, expires_at=0, status="Обновляем QR…")

            request = Request(origin + "/api/pc/qr-token", headers=headers)
            with opener.open(request, timeout=API_TIMEOUT_SECONDS) as response:
                result = json.load(response)

            expires_at = datetime.fromisoformat(result["expires_at"]).timestamp()
            order_url = result["order_url"]
            target = urlsplit(order_url)
            target_origin = f"{target.scheme}://{target.netloc}"
            if not valid_origin(target_origin) or target.path != "/order":
                raise ValueError("Unexpected order URL")

            # В QR попадёт готовая ссылка API с публичным адресом из PUBLIC_ORIGIN.
            current.update(
                order_url=order_url,
                expires_at=expires_at,
                status="Отсканируйте QR или нажмите на баннер",
            )
            access_version = result.get("access_version")
            refresh_at = expires_at - QR_REFRESH_BEFORE_EXPIRY_SECONDS
            seconds_until_refresh = refresh_at - time.time()
            delay = min(
                ACCESS_CHECK_INTERVAL_SECONDS,
                max(MIN_QR_REFRESH_DELAY_SECONDS, seconds_until_refresh),
            )
        except HTTPError as error:
            refresh_at = 0
            if error.code in (401, 403):
                status = "Компьютер отключён. Обратитесь к сотруднику клуба."
            else:
                status = "Сервис временно недоступен. Повторяем подключение…"
            current.update(order_url=None, expires_at=0, status=status)
        except Exception:
            refresh_at = 0
            current.update(
                order_url=None, expires_at=0,
                status="Нет связи с сервером. Повторяем подключение…",
            )
        stop.wait(delay)


def lower_overlay(handle):
    """Держим баннер ниже обычных окон."""
    flags = win32con.SWP_NOMOVE | win32con.SWP_NOSIZE | win32con.SWP_NOACTIVATE
    win32gui.SetWindowPos(handle, win32con.HWND_BOTTOM, 0, 0, 0, 0, flags)


def foreground_is_fullscreen(handle):
    foreground = win32gui.GetForegroundWindow()
    if not foreground or foreground == handle or win32gui.IsIconic(foreground):
        return False
    if win32gui.GetClassName(foreground) in {"Progman", "WorkerW", "Shell_TrayWnd"}:
        return False
    style = win32gui.GetWindowLong(foreground, win32con.GWL_STYLE)
    has_title_bar = (style & win32con.WS_CAPTION) == win32con.WS_CAPTION
    if style & win32con.WS_MAXIMIZE and has_title_bar:
        return False
    monitor = win32api.MonitorFromWindow(handle, win32con.MONITOR_DEFAULTTONEAREST)
    screen_left, screen_top, screen_right, screen_bottom = win32api.GetMonitorInfo(monitor)["Monitor"]
    left, top, right, bottom = win32gui.GetWindowRect(foreground)
    return left <= screen_left and top <= screen_top and right >= screen_right and bottom >= screen_bottom


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
            is_lock_change = event.wParam in (WTS_SESSION_LOCK, WTS_SESSION_UNLOCK)
            if event.message == WM_WTSSESSION_CHANGE and is_lock_change:
                self.session_lock_changed.emit(event.wParam == WTS_SESSION_LOCK)
                return True, 0
        return super().nativeEvent(event_type, message)

    def closeEvent(self, event):
        self.unwatch_session()
        super().closeEvent(event)


def create_overlay(url):
    window = SessionOverlay()
    window.setWindowTitle(BANNER_WINDOW_TITLE)
    window.setWindowFlags(Qt.WindowType.FramelessWindowHint | Qt.WindowType.Tool)
    window.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
    window.setAttribute(Qt.WidgetAttribute.WA_ShowWithoutActivating)
    window.setContextMenuPolicy(Qt.ContextMenuPolicy.NoContextMenu)
    window.page().setBackgroundColor(Qt.GlobalColor.transparent)

    screen = QApplication.primaryScreen().geometry()
    screen_width = screen.width()
    screen_height = screen.height()
    left = round(screen_width * (BANNER_LEFT_PERCENT / 100))
    top = round(screen_height * (BANNER_TOP_PERCENT / 100))
    right_margin = round(screen_width * (BANNER_RIGHT_MARGIN_PERCENT / 100))
    bottom = round(screen_height * (BANNER_BOTTOM_PERCENT / 100))
    window.setGeometry(
        screen.x() + left,
        screen.y() + top,
        screen_width - left - right_margin,
        bottom - top,
    )
    window.load(QUrl(url))
    return window


def pause_overlay_animation(page):
    page.runJavaScript("""
        for (const animation of document.getAnimations()) {
            if (Number.isFinite(animation.effect.getComputedTiming().endTime)) {
                animation.finish();
            }
        }
    """)
    set_overlay_motion(page, False)


def set_overlay_motion(page, enabled):
    paused = "false" if enabled else "true"
    page.runJavaScript(f'document.documentElement.toggleAttribute("data-motion-paused", {paused})')


def watch_overlay_visibility(window, handle):
    page = window.page()
    lifecycle = QWebEnginePage.LifecycleState
    fullscreen_since = None
    animation_paused = False
    session_locked = False

    fullscreen_timer = QTimer(window)
    fullscreen_timer.setInterval(FULLSCREEN_CHECK_INTERVAL_MS)
    unlock_timer = QTimer(window)
    unlock_timer.setSingleShot(True)
    unlock_timer.setInterval(UNLOCK_REPLAY_DELAY_MS)

    def restore_overlay():
        if page.lifecycleState() == lifecycle.Discarded:
            # Qt заново загружает страницу при выходе из Discarded.
            page.setLifecycleState(lifecycle.Active)
        else:
            window.reload()
        window.show()
        lower_overlay(handle)

    def check_fullscreen():
        nonlocal fullscreen_since, animation_paused
        if session_locked:
            return True
        try:
            fullscreen = foreground_is_fullscreen(handle)
        except win32gui.error:
            # Сохраняем текущее состояние, если окно закрылось во время проверки.
            return fullscreen_since is not None

        if not fullscreen:
            was_paused = animation_paused
            fullscreen_since = None
            animation_paused = False
            if window.isHidden() and not unlock_timer.isActive():
                restore_overlay()
            elif was_paused and window.isVisible():
                set_overlay_motion(page, True)
            return False

        now = time.monotonic()
        if fullscreen_since is None:
            fullscreen_since = now
        elapsed = now - fullscreen_since
        if elapsed >= OVERLAY_SETTLE_DELAY_SECONDS and not animation_paused:
            animation_paused = True
            pause_overlay_animation(page)
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
        if session_locked or unlock_timer.isActive():
            return
        if check_fullscreen() and animation_paused and loaded and window.isVisible():
            pause_overlay_animation(page)

    def on_session_lock_changed(is_locked):
        nonlocal fullscreen_since, session_locked
        session_locked = is_locked
        if session_locked:
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
    # Скрытое окно Tk нужно для диалогов настройки.
    setup = tk.Tk()
    setup.withdraw()
    try:
        config = load_config(setup)
    except Exception as issue:
        messagebox.showerror("Настройка SPACE ARENA", str(issue), parent=setup)
        return EXIT_SETUP_REQUIRED
    finally:
        setup.destroy()

    if not (BANNER_DIRECTORY / "index.html").exists():
        messagebox.showerror("SPACE ARENA", "Не найдены файлы баннера. Переустановите агент.")
        return EXIT_SETUP_REQUIRED

    stop = threading.Event()
    current = {"order_url": None, "expires_at": 0, "status": "Подключаемся…"}
    BannerHandler.current = current
    handler = partial(BannerHandler, directory=str(BANNER_DIRECTORY))
    # Порт 0 позволяет Windows выбрать свободный порт при каждом запуске.
    server = ThreadingHTTPServer((BANNER_BIND_HOST, 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()

    try:
        app = QApplication([])
        app.setApplicationName(BANNER_WINDOW_TITLE)
        app.setApplicationDisplayName(BANNER_WINDOW_TITLE)
        window = create_overlay(f"http://{BANNER_BIND_HOST}:{server.server_port}/")
        window.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
        window.destroyed.connect(app.quit)
        window.show()
        handle = int(window.winId())
        lower_overlay(handle)

        app.aboutToQuit.connect(window.unwatch_session)
        watch_overlay_visibility(window, handle)
        threading.Thread(target=update_guest_link, args=(config, current, stop), daemon=True).start()
        return app.exec()
    finally:
        stop.set()
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    mutex = win32event.CreateMutex(None, False, AGENT_MUTEX_NAME)
    if win32api.GetLastError() != winerror.ERROR_ALREADY_EXISTS:
        sys.exit(run())
    sys.exit(EXIT_SETUP_REQUIRED)
