#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs::{create_dir_all, OpenOptions},
    io::{Error, ErrorKind, Read, Write},
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{atomic::{AtomicBool, Ordering}, Mutex},
    thread,
    time::{Duration, Instant},
};

use tauri::{path::BaseDirectory, App, AppHandle, Manager, RunEvent, WindowEvent};

const SERVICE_HOST: &str = "127.0.0.1";
const SERVICE_PORT: u16 = 3210;
const HEALTH_TIMEOUT: Duration = Duration::from_secs(30);
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(5);

struct ServiceState {
    child: Mutex<Option<Child>>,
    shutdown_token: String,
    production_service: bool,
    shutting_down: AtomicBool,
    log_path: PathBuf,
}

type DesktopResult<T> = Result<T, Box<dyn std::error::Error>>;

fn main() {
    let app = tauri::Builder::default()
        .setup(|app| {
            if let Err(error) = setup(app) {
                show_startup_error(&error.to_string());
                return Err(error);
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::CloseRequested { .. }) {
                shutdown_service_once(&window.app_handle());
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to build Chordnote desktop shell");

    app.run(|app_handle, event| {
        if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
            shutdown_service_once(app_handle);
        }
    });
}

fn setup(app: &mut App) -> DesktopResult<()> {
    let state = if cfg!(debug_assertions) {
        ServiceState {
            child: Mutex::new(None),
            shutdown_token: String::new(),
            production_service: false,
            shutting_down: AtomicBool::new(false),
            log_path: desktop_log_path(app)?,
        }
    } else {
        start_production_service(app)?
    };

    let production_service = state.production_service;
    app.manage(state);

    if production_service {
        watch_service_process(app.handle().clone());
        let window = app
            .get_webview_window("main")
            .ok_or_else(|| Error::new(ErrorKind::NotFound, "主窗口不存在"))?;
        window.navigate(format!("http://{SERVICE_HOST}:{SERVICE_PORT}").parse()?)?;
        window.show()?;
        window.set_focus()?;
    } else {
        // 开发模式由 beforeDevCommand 启动现有 Next.js dev server。
        app.get_webview_window("main")
            .ok_or_else(|| Error::new(ErrorKind::NotFound, "主窗口不存在"))?
            .show()?;
    }

    Ok(())
}

fn start_production_service(app: &App) -> DesktopResult<ServiceState> {
    let app_data = app.path().local_data_dir()?.join("Chordnote");
    let db_dir = app_data.join("db");
    let settings_file = app_data.join("settings.json");
    let logs_dir = app_data.join("logs");
    create_dir_all(&db_dir)?;
    create_dir_all(&logs_dir)?;

    let log_path = logs_dir.join("desktop.log");
    let runtime_dir = app.path().resolve("runtime", BaseDirectory::Resource)?;
    let node_path = runtime_dir.join("node.exe");
    let server_path = runtime_dir.join("server.js");
    let migrations_dir = runtime_dir.join("drizzle");

    for required in [&node_path, &server_path, &migrations_dir] {
        if !required.exists() {
            return Err(Error::new(
                ErrorKind::NotFound,
                "安装资源不完整；请重新安装 Chordnote。",
            )
            .into());
        }
    }

    ensure_port_available()?;
    let shutdown_token = random_token()?;
    append_log(&log_path, "Starting local Next.js service.");

    let mut child = Command::new(node_path)
        .current_dir(&runtime_dir)
        .arg("server.js")
        .env("HOSTNAME", SERVICE_HOST)
        .env("PORT", SERVICE_PORT.to_string())
        .env("CHORDNOTE_DESKTOP", "1")
        .env("PGLITE_DATA_DIR", &db_dir)
        .env("CHORDNOTE_SETTINGS_FILE", &settings_file)
        .env("CHORDNOTE_MIGRATIONS_DIR", &migrations_dir)
        .env("CHORDNOTE_LOG_DIR", &logs_dir)
        .env("CHORDNOTE_SHUTDOWN_TOKEN", &shutdown_token)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;

    if let Err(error) = wait_for_health(&mut child) {
        let _ = child.kill();
        let _ = child.wait();
        append_log(&log_path, "Local Next.js service failed its health check.");
        return Err(error);
    }

    append_log(&log_path, "Local Next.js service is healthy.");
    Ok(ServiceState {
        child: Mutex::new(Some(child)),
        shutdown_token,
        production_service: true,
        shutting_down: AtomicBool::new(false),
        log_path,
    })
}

fn desktop_log_path(app: &App) -> DesktopResult<PathBuf> {
    let logs_dir = app.path().local_data_dir()?.join("Chordnote").join("logs");
    create_dir_all(&logs_dir)?;
    Ok(logs_dir.join("desktop.log"))
}

fn ensure_port_available() -> DesktopResult<()> {
    let address = SocketAddr::from(([127, 0, 0, 1], SERVICE_PORT));
    if TcpStream::connect_timeout(&address, Duration::from_millis(250)).is_ok() {
        return Err(Error::new(
            ErrorKind::AddrInUse,
            format!("端口 {SERVICE_PORT} 已被其他程序占用。请关闭占用端口的程序后重试。"),
        )
        .into());
    }

    Ok(())
}

fn wait_for_health(child: &mut Child) -> DesktopResult<()> {
    let deadline = Instant::now() + HEALTH_TIMEOUT;

    while Instant::now() < deadline {
        if let Some(status) = child.try_wait()? {
            return Err(Error::new(
                ErrorKind::ConnectionAborted,
                format!("本地服务在启动时退出（{status}）。"),
            )
            .into());
        }

        if health_check() {
            return Ok(());
        }

        thread::sleep(Duration::from_millis(200));
    }

    Err(Error::new(
        ErrorKind::TimedOut,
        "本地服务未能在 30 秒内通过健康检查。",
    )
    .into())
}

fn health_check() -> bool {
    let address = SocketAddr::from(([127, 0, 0, 1], SERVICE_PORT));
    let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(250)) else {
        return false;
    };

    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(500)));
    if stream
        .write_all(
            format!(
                "GET /api/health HTTP/1.1\r\nHost: {SERVICE_HOST}:{SERVICE_PORT}\r\nConnection: close\r\n\r\n"
            )
            .as_bytes(),
        )
        .is_err()
    {
        return false;
    }

    let mut response = [0_u8; 128];
    match stream.read(&mut response) {
        Ok(size) => std::str::from_utf8(&response[..size])
            .map(|text| text.starts_with("HTTP/1.1 200"))
            .unwrap_or(false),
        Err(_) => false,
    }
}

fn watch_service_process(app: AppHandle) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(1));
        let state = app.state::<ServiceState>();
        let mut child_guard = match state.child.lock() {
            Ok(guard) => guard,
            Err(_) => return,
        };
        let Some(child) = child_guard.as_mut() else {
            return;
        };

        match child.try_wait() {
            Ok(Some(status)) => {
                child_guard.take();
                if !state.shutting_down.load(Ordering::SeqCst) {
                    append_log(&state.log_path, &format!("Local Next.js service exited unexpectedly: {status}."));
                }
                return;
            }
            Ok(None) => {}
            Err(_) => return,
        }
    });
}

fn shutdown_service_once(app: &AppHandle) {
    let state = app.state::<ServiceState>();
    if !state.production_service || state.shutting_down.swap(true, Ordering::SeqCst) {
        return;
    }

    append_log(&state.log_path, "Stopping local Next.js service.");
    let _ = request_graceful_shutdown(&state.shutdown_token);

    let mut child_guard = match state.child.lock() {
        Ok(guard) => guard,
        Err(_) => return,
    };
    let Some(child) = child_guard.as_mut() else {
        return;
    };

    let deadline = Instant::now() + SHUTDOWN_TIMEOUT;
    while Instant::now() < deadline {
        match child.try_wait() {
            Ok(Some(_)) => {
                child_guard.take();
                append_log(&state.log_path, "Local Next.js service stopped cleanly.");
                return;
            }
            Ok(None) => thread::sleep(Duration::from_millis(100)),
            Err(_) => break,
        }
    }

    let _ = child.kill();
    let _ = child.wait();
    child_guard.take();
    append_log(&state.log_path, "Local Next.js service exceeded shutdown timeout and was terminated.");
}

fn request_graceful_shutdown(token: &str) -> DesktopResult<()> {
    let address = SocketAddr::from(([127, 0, 0, 1], SERVICE_PORT));
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(1))?;
    stream.set_read_timeout(Some(Duration::from_secs(2)))?;
    stream.set_write_timeout(Some(Duration::from_secs(2)))?;
    stream.write_all(
        format!(
            "POST /api/desktop/shutdown HTTP/1.1\r\nHost: {SERVICE_HOST}:{SERVICE_PORT}\r\nX-Chordnote-Shutdown-Token: {token}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
        )
        .as_bytes(),
    )?;
    stream.flush()?;
    Ok(())
}

fn random_token() -> DesktopResult<String> {
    let mut bytes = [0_u8; 32];
    getrandom::fill(&mut bytes).map_err(|error| {
        Error::new(
            ErrorKind::Other,
            format!("无法生成本地服务关闭令牌：{error}"),
        )
    })?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn append_log(path: &Path, message: &str) {
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{:?} {message}", std::time::SystemTime::now());
    }
}

#[cfg(windows)]
fn show_startup_error(detail: &str) {
    #[link(name = "user32")]
    extern "system" {
        fn MessageBoxW(
            window: isize,
            text: *const u16,
            caption: *const u16,
            message_box_type: u32,
        ) -> i32;
    }

    let text: Vec<u16> = format!("Chordnote 无法启动本地服务。\n\n{detail}\n\n请查看 %LOCALAPPDATA%\\Chordnote\\logs\\desktop.log。")
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    let caption: Vec<u16> = "Chordnote 启动失败"
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        MessageBoxW(0, text.as_ptr(), caption.as_ptr(), 0x0000_0010);
    }
}

#[cfg(not(windows))]
fn show_startup_error(_detail: &str) {}
