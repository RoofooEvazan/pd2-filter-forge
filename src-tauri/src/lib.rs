//! Desktop shell for PD2 Filter Forge: the web app plus file access a browser can't give it —
//! finding the ProjectD2 folder, listing the launcher's filter folders, and reading/writing
//! .filter files (with an optional .bak of the previous version).

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const DEFAULT_INSTALLS: &[&str] = &[r"C:\Program Files\Diablo II", r"C:\Program Files (x86)\Diablo II", r"C:\Diablo II"];

/// Diablo II's install folder from the game's registry entry, else the usual locations.
fn install_candidates() -> Vec<PathBuf> {
  let mut out = Vec::new();
  #[cfg(windows)]
  {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};
    if let Ok(k) = RegKey::predef(HKEY_CURRENT_USER).open_subkey(r"Software\Blizzard Entertainment\Diablo II") {
      if let Ok(p) = k.get_value::<String, _>("InstallPath") {
        if !p.is_empty() {
          out.push(PathBuf::from(p));
        }
      }
    }
  }
  out.extend(DEFAULT_INSTALLS.iter().map(PathBuf::from));
  out
}

#[tauri::command]
fn detect_pd2_dir() -> Option<String> {
  install_candidates()
    .into_iter()
    .map(|d| d.join("ProjectD2"))
    .find(|p| p.join("filters").is_dir() || p.join("ProjectDiablo.dll").exists())
    .map(|p| p.to_string_lossy().into_owned())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DirEntry {
  name: String,
  path: String,
  size: u64,
  modified: u64,
  is_file: bool,
}

#[tauri::command]
fn list_dir(path: String) -> Result<Vec<DirEntry>, String> {
  let rd = match fs::read_dir(&path) {
    Ok(rd) => rd,
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
    Err(e) => return Err(e.to_string()),
  };
  let mut out = Vec::new();
  for e in rd.flatten() {
    let Ok(meta) = e.metadata() else { continue };
    let modified = meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0);
    out.push(DirEntry {
      name: e.file_name().to_string_lossy().into_owned(),
      path: e.path().to_string_lossy().into_owned(),
      size: meta.len(),
      modified,
      is_file: meta.is_file(),
    });
  }
  out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
  Ok(out)
}

#[tauri::command]
fn read_file(path: String) -> Result<Vec<u8>, String> {
  fs::read(&path).map_err(|e| format!("{e} ({path})"))
}

/// Write a file, first copying any existing version to "<name>.bak" when `backup` is set.
/// Returns the backup path if one was made.
#[tauri::command]
fn write_file(path: String, data: Vec<u8>, backup: bool) -> Result<Option<String>, String> {
  let p = Path::new(&path);
  if let Some(parent) = p.parent() {
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  }
  let mut made = None;
  if backup && p.exists() {
    let bak = PathBuf::from(format!("{path}.bak"));
    fs::copy(p, &bak).map_err(|e| format!("couldn't back up: {e}"))?;
    made = Some(bak.to_string_lossy().into_owned());
  }
  // Write to a temp file and rename so a failed write never leaves a half-written filter.
  let tmp = PathBuf::from(format!("{path}.tmp"));
  fs::write(&tmp, &data).map_err(|e| format!("{e} ({path})"))?;
  fs::rename(&tmp, p).map_err(|e| e.to_string())?;
  Ok(made)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![detect_pd2_dir, list_dir, read_file, write_file])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn write_backs_up_and_reads_back() {
    let dir = std::env::temp_dir().join(format!("ff-test-{}", std::process::id()));
    let path = dir.join("sub").join("t.filter").to_string_lossy().into_owned();
    assert_eq!(write_file(path.clone(), b"one".to_vec(), true).unwrap(), None);
    let bak = write_file(path.clone(), b"two".to_vec(), true).unwrap();
    assert_eq!(read_file(path.clone()).unwrap(), b"two");
    assert_eq!(fs::read(bak.unwrap()).unwrap(), b"one");
    let listed = list_dir(dir.join("sub").to_string_lossy().into_owned()).unwrap();
    assert!(listed.iter().any(|e| e.name == "t.filter" && e.is_file));
    assert!(list_dir(dir.join("missing").to_string_lossy().into_owned()).unwrap().is_empty());
    fs::remove_dir_all(dir).ok();
  }

  #[test]
  fn finds_this_pcs_projectd2() {
    // On a machine with PD2 installed this should find it; elsewhere it must not panic.
    let found = detect_pd2_dir();
    println!("detected: {found:?}");
    if let Some(d) = found {
      assert!(d.ends_with("ProjectD2"));
    }
  }
}
