use crate::database::ConnectionConfig;
use std::fs;
use std::path::PathBuf;

fn get_config_path() -> PathBuf {
    let config_dir = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("easysql");
    
    fs::create_dir_all(&config_dir).ok();
    config_dir.join("connections.json")
}

pub fn save_connections(connections: &[ConnectionConfig]) -> Result<(), std::io::Error> {
    let path = get_config_path();
    let json = serde_json::to_string_pretty(connections)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    fs::write(path, json)
}

pub fn load_connections() -> Result<Vec<ConnectionConfig>, std::io::Error> {
    let path = get_config_path();
    if !path.exists() {
        return Ok(vec![]);
    }
    
    let content = fs::read_to_string(path)?;
    serde_json::from_str(&content)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
}

