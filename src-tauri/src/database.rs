use once_cell::sync::Lazy;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum DbError {
    #[error("连接失败: {0}")]
    ConnectionError(String),
    #[error("查询失败: {0}")]
    QueryError(String),
    #[error("未连接")]
    NotConnected,
    #[error("不支持的数据库类型: {0}")]
    UnsupportedType(String),
    #[error("SSH 隧道错误: {0}")]
    SshError(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionConfig {
    pub id: String,
    #[serde(rename = "type")]
    pub db_type: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub database: Option<String>,
    pub ssh_enabled: Option<bool>,
    pub ssh_host: Option<String>,
    pub ssh_port: Option<u16>,
    pub ssh_user: Option<String>,
    pub ssh_password: Option<String>,
    pub ssh_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableInfo {
    pub name: String,
    pub rows: i64,
    #[serde(rename = "isView")]
    pub is_view: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnInfo {
    pub name: String,
    #[serde(rename = "type")]
    pub data_type: String,
    pub nullable: bool,
    pub key: Option<String>,
    pub comment: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub error: Option<String>,
    #[serde(rename = "affectedRows")]
    pub affected_rows: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableDataResult {
    pub columns: Vec<ColumnInfo>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub total: i64,
    pub page: i32,
    #[serde(rename = "pageSize")]
    pub page_size: i32,
}

// 数据库连接枚举
pub enum DbConnection {
    MySql(sqlx::MySqlPool),
    Postgres(sqlx::PgPool),
    Sqlite(sqlx::SqlitePool),
    SqlServer(SqlServerConnection),
}

pub struct SqlServerConnection {
    pub config: tiberius::Config,
}

// 连接信息存储
pub struct ConnectionInfo {
    pub connection: DbConnection,
    pub config: ConnectionConfig,
    pub ssh_tunnel: Option<crate::ssh::SshTunnel>,
}

// 全局连接管理器
pub static CONNECTIONS: Lazy<RwLock<HashMap<String, Arc<ConnectionInfo>>>> = 
    Lazy::new(|| RwLock::new(HashMap::new()));

pub fn init() {
    tracing::info!("数据库管理器初始化完成");
}

impl DbConnection {
    pub async fn test_mysql(host: &str, port: u16, user: &str, password: &str, database: Option<&str>) -> Result<(), DbError> {
        let db = database.unwrap_or("mysql");
        let url = format!("mysql://{}:{}@{}:{}/{}", user, password, host, port, db);
        
        let pool = sqlx::mysql::MySqlPoolOptions::new()
            .max_connections(1)
            .acquire_timeout(std::time::Duration::from_secs(10))
            .connect(&url)
            .await
            .map_err(|e| DbError::ConnectionError(e.to_string()))?;
        
        sqlx::query("SELECT 1")
            .execute(&pool)
            .await
            .map_err(|e| DbError::QueryError(e.to_string()))?;
        
        pool.close().await;
        Ok(())
    }

    pub async fn test_postgres(host: &str, port: u16, user: &str, password: &str, database: Option<&str>) -> Result<(), DbError> {
        let db = database.unwrap_or("postgres");
        let url = format!("postgres://{}:{}@{}:{}/{}", user, password, host, port, db);
        
        let pool = sqlx::postgres::PgPoolOptions::new()
            .max_connections(1)
            .acquire_timeout(std::time::Duration::from_secs(10))
            .connect(&url)
            .await
            .map_err(|e| DbError::ConnectionError(e.to_string()))?;
        
        sqlx::query("SELECT 1")
            .execute(&pool)
            .await
            .map_err(|e| DbError::QueryError(e.to_string()))?;
        
        pool.close().await;
        Ok(())
    }

    pub async fn test_sqlite(path: &str) -> Result<(), DbError> {
        let url = format!("sqlite:{}?mode=rwc", path);
        
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await
            .map_err(|e| DbError::ConnectionError(e.to_string()))?;
        
        sqlx::query("SELECT 1")
            .execute(&pool)
            .await
            .map_err(|e| DbError::QueryError(e.to_string()))?;
        
        pool.close().await;
        Ok(())
    }

    pub async fn test_sqlserver(host: &str, port: u16, user: &str, password: &str, database: Option<&str>) -> Result<(), DbError> {
        use tiberius::{Client, Config, AuthMethod};
        use tokio::net::TcpStream;
        use tokio_util::compat::TokioAsyncWriteCompatExt;

        let mut config = Config::new();
        config.host(host);
        config.port(port);
        config.authentication(AuthMethod::sql_server(user, password));
        if let Some(db) = database {
            config.database(db);
        }
        config.trust_cert();

        let tcp = TcpStream::connect(config.get_addr())
            .await
            .map_err(|e| DbError::ConnectionError(e.to_string()))?;

        tcp.set_nodelay(true).ok();

        let mut client = Client::connect(config, tcp.compat_write())
            .await
            .map_err(|e| DbError::ConnectionError(e.to_string()))?;

        client.simple_query("SELECT 1")
            .await
            .map_err(|e| DbError::QueryError(e.to_string()))?;

        Ok(())
    }

    pub async fn connect_mysql(host: &str, port: u16, user: &str, password: &str, database: Option<&str>) -> Result<Self, DbError> {
        let db = database.unwrap_or("mysql");
        let url = format!("mysql://{}:{}@{}:{}/{}", user, password, host, port, db);
        
        let pool = sqlx::mysql::MySqlPoolOptions::new()
            .max_connections(10)
            .min_connections(1)
            .acquire_timeout(std::time::Duration::from_secs(30))
            .idle_timeout(std::time::Duration::from_secs(600))
            .connect(&url)
            .await
            .map_err(|e| DbError::ConnectionError(e.to_string()))?;
        
        Ok(DbConnection::MySql(pool))
    }

    pub async fn connect_postgres(host: &str, port: u16, user: &str, password: &str, database: Option<&str>) -> Result<Self, DbError> {
        let db = database.unwrap_or("postgres");
        let url = format!("postgres://{}:{}@{}:{}/{}", user, password, host, port, db);
        
        let pool = sqlx::postgres::PgPoolOptions::new()
            .max_connections(10)
            .min_connections(1)
            .acquire_timeout(std::time::Duration::from_secs(30))
            .idle_timeout(std::time::Duration::from_secs(600))
            .connect(&url)
            .await
            .map_err(|e| DbError::ConnectionError(e.to_string()))?;
        
        Ok(DbConnection::Postgres(pool))
    }

    pub async fn connect_sqlite(path: &str) -> Result<Self, DbError> {
        let url = format!("sqlite:{}?mode=rwc", path);
        
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(5)
            .connect(&url)
            .await
            .map_err(|e| DbError::ConnectionError(e.to_string()))?;
        
        Ok(DbConnection::Sqlite(pool))
    }

    pub async fn connect_sqlserver(host: &str, port: u16, user: &str, password: &str, database: Option<&str>) -> Result<Self, DbError> {
        let mut config = tiberius::Config::new();
        config.host(host);
        config.port(port);
        config.authentication(tiberius::AuthMethod::sql_server(user, password));
        if let Some(db) = database {
            config.database(db);
        }
        config.trust_cert();

        Ok(DbConnection::SqlServer(SqlServerConnection { config }))
    }
}

// 解析 localhost 为 127.0.0.1
pub fn resolve_host(host: &str) -> String {
    if host == "localhost" {
        "127.0.0.1".to_string()
    } else {
        host.to_string()
    }
}

