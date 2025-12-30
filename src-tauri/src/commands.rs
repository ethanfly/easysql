use crate::database::{
    ConnectionConfig, ConnectionInfo, DbConnection, DbError, CONNECTIONS,
    TableInfo, ColumnInfo, QueryResult, TableDataResult, resolve_host
};
use crate::config;
use crate::ssh::SshTunnel;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use tauri::{AppHandle, Manager, WebviewWindow};

#[derive(Serialize)]
pub struct CommandResult {
    success: bool,
    message: String,
}

// ============ 窗口控制 ============

#[tauri::command]
pub async fn window_minimize(window: WebviewWindow) {
    let _ = window.minimize();
}

#[tauri::command]
pub async fn window_maximize(window: WebviewWindow) {
    if window.is_maximized().unwrap_or(false) {
        let _ = window.unmaximize();
    } else {
        let _ = window.maximize();
    }
}

#[tauri::command]
pub async fn window_close(window: WebviewWindow) {
    let _ = window.close();
}

// ============ 数据库操作 ============

#[tauri::command]
pub async fn db_test(config: ConnectionConfig) -> CommandResult {
    let mut target_host = resolve_host(&config.host);
    let mut target_port = config.port;
    let mut _ssh_tunnel: Option<SshTunnel> = None;

    // SSH 隧道
    if config.ssh_enabled.unwrap_or(false) {
        if let Some(ssh_host) = &config.ssh_host {
            match SshTunnel::create(
                ssh_host,
                config.ssh_port.unwrap_or(22),
                config.ssh_user.as_deref().unwrap_or(""),
                config.ssh_password.as_deref(),
                config.ssh_key.as_deref(),
                &config.host,
                config.port,
            ).await {
                Ok(tunnel) => {
                    target_host = "127.0.0.1".to_string();
                    target_port = tunnel.local_port;
                    _ssh_tunnel = Some(tunnel);
                }
                Err(e) => {
                    return CommandResult {
                        success: false,
                        message: format!("SSH 隧道失败: {}", e),
                    };
                }
            }
        }
    }

    let result = match config.db_type.as_str() {
        "mysql" | "mariadb" => {
            DbConnection::test_mysql(
                &target_host,
                target_port,
                &config.username,
                &config.password,
                config.database.as_deref(),
            ).await
        }
        "postgres" => {
            DbConnection::test_postgres(
                &target_host,
                target_port,
                &config.username,
                &config.password,
                config.database.as_deref(),
            ).await
        }
        "sqlite" => {
            let path = config.database.as_deref().unwrap_or(&config.host);
            DbConnection::test_sqlite(path).await
        }
        "sqlserver" => {
            DbConnection::test_sqlserver(
                &target_host,
                target_port,
                &config.username,
                &config.password,
                config.database.as_deref(),
            ).await
        }
        _ => Err(DbError::UnsupportedType(config.db_type.clone())),
    };

    match result {
        Ok(_) => {
            let msg = if _ssh_tunnel.is_some() {
                "连接成功 (SSH隧道)"
            } else {
                "连接成功"
            };
            CommandResult {
                success: true,
                message: msg.to_string(),
            }
        }
        Err(e) => CommandResult {
            success: false,
            message: e.to_string(),
        },
    }
}

#[tauri::command]
pub async fn db_connect(config: ConnectionConfig) -> CommandResult {
    let mut target_host = resolve_host(&config.host);
    let mut target_port = config.port;
    let mut ssh_tunnel: Option<SshTunnel> = None;

    // SSH 隧道
    if config.ssh_enabled.unwrap_or(false) {
        if let Some(ssh_host) = &config.ssh_host {
            match SshTunnel::create(
                ssh_host,
                config.ssh_port.unwrap_or(22),
                config.ssh_user.as_deref().unwrap_or(""),
                config.ssh_password.as_deref(),
                config.ssh_key.as_deref(),
                &config.host,
                config.port,
            ).await {
                Ok(tunnel) => {
                    target_host = "127.0.0.1".to_string();
                    target_port = tunnel.local_port;
                    ssh_tunnel = Some(tunnel);
                }
                Err(e) => {
                    return CommandResult {
                        success: false,
                        message: format!("SSH 隧道失败: {}", e),
                    };
                }
            }
        }
    }

    let connection = match config.db_type.as_str() {
        "mysql" | "mariadb" => {
            DbConnection::connect_mysql(
                &target_host,
                target_port,
                &config.username,
                &config.password,
                config.database.as_deref(),
            ).await
        }
        "postgres" => {
            DbConnection::connect_postgres(
                &target_host,
                target_port,
                &config.username,
                &config.password,
                config.database.as_deref(),
            ).await
        }
        "sqlite" => {
            let path = config.database.as_deref().unwrap_or(&config.host);
            DbConnection::connect_sqlite(path).await
        }
        "sqlserver" => {
            DbConnection::connect_sqlserver(
                &target_host,
                target_port,
                &config.username,
                &config.password,
                config.database.as_deref(),
            ).await
        }
        _ => Err(DbError::UnsupportedType(config.db_type.clone())),
    };

    match connection {
        Ok(conn) => {
            let conn_info = ConnectionInfo {
                connection: conn,
                config: config.clone(),
                ssh_tunnel,
            };
            
            let mut connections = CONNECTIONS.write();
            connections.insert(config.id.clone(), Arc::new(conn_info));
            
            let msg = if ssh_tunnel.is_some() {
                "连接成功 (SSH隧道)"
            } else {
                "连接成功"
            };
            CommandResult {
                success: true,
                message: msg.to_string(),
            }
        }
        Err(e) => CommandResult {
            success: false,
            message: e.to_string(),
        },
    }
}

#[tauri::command]
pub async fn db_disconnect(id: String) -> CommandResult {
    let mut connections = CONNECTIONS.write();
    if connections.remove(&id).is_some() {
        CommandResult {
            success: true,
            message: "断开成功".to_string(),
        }
    } else {
        CommandResult {
            success: false,
            message: "连接不存在".to_string(),
        }
    }
}

#[tauri::command]
pub async fn db_query(id: String, sql: String) -> QueryResult {
    let connections = CONNECTIONS.read();
    let conn_info = match connections.get(&id) {
        Some(c) => c.clone(),
        None => return QueryResult {
            columns: vec![],
            rows: vec![],
            error: Some("未连接".to_string()),
            affected_rows: None,
        },
    };
    drop(connections);

    match &conn_info.connection {
        DbConnection::MySql(pool) => {
            query_mysql(pool, &sql).await
        }
        DbConnection::Postgres(pool) => {
            query_postgres(pool, &sql).await
        }
        DbConnection::Sqlite(pool) => {
            query_sqlite(pool, &sql).await
        }
        DbConnection::SqlServer(conn) => {
            query_sqlserver(conn, &sql).await
        }
    }
}

async fn query_mysql(pool: &sqlx::MySqlPool, sql: &str) -> QueryResult {
    use sqlx::Row;
    
    // 判断是否是查询语句
    let sql_upper = sql.trim().to_uppercase();
    let is_select = sql_upper.starts_with("SELECT") || 
                    sql_upper.starts_with("SHOW") || 
                    sql_upper.starts_with("DESCRIBE") ||
                    sql_upper.starts_with("EXPLAIN");

    if is_select {
        match sqlx::query(sql).fetch_all(pool).await {
            Ok(rows) => {
                if rows.is_empty() {
                    return QueryResult {
                        columns: vec![],
                        rows: vec![],
                        error: None,
                        affected_rows: None,
                    };
                }

                let columns: Vec<String> = rows[0]
                    .columns()
                    .iter()
                    .map(|c| c.name().to_string())
                    .collect();

                let data: Vec<Vec<Value>> = rows
                    .iter()
                    .map(|row| {
                        columns
                            .iter()
                            .enumerate()
                            .map(|(i, _)| {
                                row.try_get_raw(i)
                                    .ok()
                                    .and_then(|v| {
                                        if v.is_null() {
                                            Some(Value::Null)
                                        } else {
                                            row.try_get::<String, _>(i)
                                                .map(Value::String)
                                                .or_else(|_| row.try_get::<i64, _>(i).map(|n| json!(n)))
                                                .or_else(|_| row.try_get::<f64, _>(i).map(|n| json!(n)))
                                                .or_else(|_| row.try_get::<bool, _>(i).map(|b| json!(b)))
                                                .ok()
                                        }
                                    })
                                    .unwrap_or(Value::Null)
                            })
                            .collect()
                    })
                    .collect();

                QueryResult {
                    columns,
                    rows: data,
                    error: None,
                    affected_rows: None,
                }
            }
            Err(e) => QueryResult {
                columns: vec![],
                rows: vec![],
                error: Some(e.to_string()),
                affected_rows: None,
            },
        }
    } else {
        match sqlx::query(sql).execute(pool).await {
            Ok(result) => QueryResult {
                columns: vec![],
                rows: vec![],
                error: None,
                affected_rows: Some(result.rows_affected() as i64),
            },
            Err(e) => QueryResult {
                columns: vec![],
                rows: vec![],
                error: Some(e.to_string()),
                affected_rows: None,
            },
        }
    }
}

async fn query_postgres(pool: &sqlx::PgPool, sql: &str) -> QueryResult {
    use sqlx::Row;
    
    let sql_upper = sql.trim().to_uppercase();
    let is_select = sql_upper.starts_with("SELECT") || 
                    sql_upper.starts_with("SHOW") ||
                    sql_upper.starts_with("EXPLAIN");

    if is_select {
        match sqlx::query(sql).fetch_all(pool).await {
            Ok(rows) => {
                if rows.is_empty() {
                    return QueryResult {
                        columns: vec![],
                        rows: vec![],
                        error: None,
                        affected_rows: None,
                    };
                }

                let columns: Vec<String> = rows[0]
                    .columns()
                    .iter()
                    .map(|c| c.name().to_string())
                    .collect();

                let data: Vec<Vec<Value>> = rows
                    .iter()
                    .map(|row| {
                        columns
                            .iter()
                            .enumerate()
                            .map(|(i, _)| {
                                row.try_get_raw(i)
                                    .ok()
                                    .and_then(|v| {
                                        if v.is_null() {
                                            Some(Value::Null)
                                        } else {
                                            row.try_get::<String, _>(i)
                                                .map(Value::String)
                                                .or_else(|_| row.try_get::<i64, _>(i).map(|n| json!(n)))
                                                .or_else(|_| row.try_get::<f64, _>(i).map(|n| json!(n)))
                                                .or_else(|_| row.try_get::<bool, _>(i).map(|b| json!(b)))
                                                .ok()
                                        }
                                    })
                                    .unwrap_or(Value::Null)
                            })
                            .collect()
                    })
                    .collect();

                QueryResult {
                    columns,
                    rows: data,
                    error: None,
                    affected_rows: None,
                }
            }
            Err(e) => QueryResult {
                columns: vec![],
                rows: vec![],
                error: Some(e.to_string()),
                affected_rows: None,
            },
        }
    } else {
        match sqlx::query(sql).execute(pool).await {
            Ok(result) => QueryResult {
                columns: vec![],
                rows: vec![],
                error: None,
                affected_rows: Some(result.rows_affected() as i64),
            },
            Err(e) => QueryResult {
                columns: vec![],
                rows: vec![],
                error: Some(e.to_string()),
                affected_rows: None,
            },
        }
    }
}

async fn query_sqlite(pool: &sqlx::SqlitePool, sql: &str) -> QueryResult {
    use sqlx::Row;
    
    let sql_upper = sql.trim().to_uppercase();
    let is_select = sql_upper.starts_with("SELECT") || 
                    sql_upper.starts_with("PRAGMA");

    if is_select {
        match sqlx::query(sql).fetch_all(pool).await {
            Ok(rows) => {
                if rows.is_empty() {
                    return QueryResult {
                        columns: vec![],
                        rows: vec![],
                        error: None,
                        affected_rows: None,
                    };
                }

                let columns: Vec<String> = rows[0]
                    .columns()
                    .iter()
                    .map(|c| c.name().to_string())
                    .collect();

                let data: Vec<Vec<Value>> = rows
                    .iter()
                    .map(|row| {
                        columns
                            .iter()
                            .enumerate()
                            .map(|(i, _)| {
                                row.try_get_raw(i)
                                    .ok()
                                    .and_then(|v| {
                                        if v.is_null() {
                                            Some(Value::Null)
                                        } else {
                                            row.try_get::<String, _>(i)
                                                .map(Value::String)
                                                .or_else(|_| row.try_get::<i64, _>(i).map(|n| json!(n)))
                                                .or_else(|_| row.try_get::<f64, _>(i).map(|n| json!(n)))
                                                .ok()
                                        }
                                    })
                                    .unwrap_or(Value::Null)
                            })
                            .collect()
                    })
                    .collect();

                QueryResult {
                    columns,
                    rows: data,
                    error: None,
                    affected_rows: None,
                }
            }
            Err(e) => QueryResult {
                columns: vec![],
                rows: vec![],
                error: Some(e.to_string()),
                affected_rows: None,
            },
        }
    } else {
        match sqlx::query(sql).execute(pool).await {
            Ok(result) => QueryResult {
                columns: vec![],
                rows: vec![],
                error: None,
                affected_rows: Some(result.rows_affected() as i64),
            },
            Err(e) => QueryResult {
                columns: vec![],
                rows: vec![],
                error: Some(e.to_string()),
                affected_rows: None,
            },
        }
    }
}

async fn query_sqlserver(conn: &crate::database::SqlServerConnection, sql: &str) -> QueryResult {
    use tiberius::Client;
    use tokio::net::TcpStream;
    use tokio_util::compat::TokioAsyncWriteCompatExt;

    let tcp = match TcpStream::connect(conn.config.get_addr()).await {
        Ok(t) => t,
        Err(e) => return QueryResult {
            columns: vec![],
            rows: vec![],
            error: Some(e.to_string()),
            affected_rows: None,
        },
    };
    tcp.set_nodelay(true).ok();

    let mut client = match Client::connect(conn.config.clone(), tcp.compat_write()).await {
        Ok(c) => c,
        Err(e) => return QueryResult {
            columns: vec![],
            rows: vec![],
            error: Some(e.to_string()),
            affected_rows: None,
        },
    };

    match client.simple_query(sql).await {
        Ok(result) => {
            let mut columns = vec![];
            let mut rows = vec![];

            for result_set in result.into_results().await.unwrap_or_default() {
                for row in result_set {
                    if columns.is_empty() {
                        columns = row.columns().iter().map(|c| c.name().to_string()).collect();
                    }
                    let row_data: Vec<Value> = (0..row.len())
                        .map(|i| {
                            row.try_get::<&str, _>(i)
                                .ok()
                                .flatten()
                                .map(|s| Value::String(s.to_string()))
                                .or_else(|| row.try_get::<i32, _>(i).ok().flatten().map(|n| json!(n)))
                                .or_else(|| row.try_get::<i64, _>(i).ok().flatten().map(|n| json!(n)))
                                .or_else(|| row.try_get::<f64, _>(i).ok().flatten().map(|n| json!(n)))
                                .unwrap_or(Value::Null)
                        })
                        .collect();
                    rows.push(row_data);
                }
            }

            QueryResult {
                columns,
                rows,
                error: None,
                affected_rows: None,
            }
        }
        Err(e) => QueryResult {
            columns: vec![],
            rows: vec![],
            error: Some(e.to_string()),
            affected_rows: None,
        },
    }
}

#[tauri::command]
pub async fn db_get_databases(id: String) -> Vec<String> {
    let connections = CONNECTIONS.read();
    let conn_info = match connections.get(&id) {
        Some(c) => c.clone(),
        None => return vec![],
    };
    drop(connections);

    match &conn_info.connection {
        DbConnection::MySql(pool) => {
            let result = sqlx::query_as::<_, (String,)>("SHOW DATABASES")
                .fetch_all(pool)
                .await;
            result.map(|rows| rows.into_iter().map(|r| r.0).collect()).unwrap_or_default()
        }
        DbConnection::Postgres(pool) => {
            let result = sqlx::query_as::<_, (String,)>(
                "SELECT datname FROM pg_database WHERE datistemplate = false"
            )
                .fetch_all(pool)
                .await;
            result.map(|rows| rows.into_iter().map(|r| r.0).collect()).unwrap_or_default()
        }
        DbConnection::Sqlite(_) => {
            vec!["main".to_string()]
        }
        DbConnection::SqlServer(conn) => {
            get_sqlserver_databases(conn).await
        }
    }
}

async fn get_sqlserver_databases(conn: &crate::database::SqlServerConnection) -> Vec<String> {
    use tiberius::Client;
    use tokio::net::TcpStream;
    use tokio_util::compat::TokioAsyncWriteCompatExt;

    let tcp = match TcpStream::connect(conn.config.get_addr()).await {
        Ok(t) => t,
        Err(_) => return vec![],
    };
    tcp.set_nodelay(true).ok();

    let mut client = match Client::connect(conn.config.clone(), tcp.compat_write()).await {
        Ok(c) => c,
        Err(_) => return vec![],
    };

    match client.simple_query("SELECT name FROM sys.databases WHERE database_id > 4 ORDER BY name").await {
        Ok(result) => {
            let mut databases = vec![];
            for result_set in result.into_results().await.unwrap_or_default() {
                for row in result_set {
                    if let Some(name) = row.try_get::<&str, _>(0).ok().flatten() {
                        databases.push(name.to_string());
                    }
                }
            }
            databases
        }
        Err(_) => vec![],
    }
}

#[tauri::command]
pub async fn db_get_tables(id: String, database: String) -> Vec<TableInfo> {
    let connections = CONNECTIONS.read();
    let conn_info = match connections.get(&id) {
        Some(c) => c.clone(),
        None => return vec![],
    };
    drop(connections);

    match &conn_info.connection {
        DbConnection::MySql(pool) => {
            get_mysql_tables(pool, &database).await
        }
        DbConnection::Postgres(pool) => {
            get_postgres_tables(pool).await
        }
        DbConnection::Sqlite(pool) => {
            get_sqlite_tables(pool).await
        }
        DbConnection::SqlServer(conn) => {
            get_sqlserver_tables(conn, &database).await
        }
    }
}

async fn get_mysql_tables(pool: &sqlx::MySqlPool, database: &str) -> Vec<TableInfo> {
    // 切换数据库
    let _ = sqlx::query(&format!("USE `{}`", database)).execute(pool).await;
    
    let result = sqlx::query_as::<_, (String, Option<i64>, String)>(
        "SELECT TABLE_NAME, TABLE_ROWS, TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_TYPE, TABLE_NAME"
    )
        .bind(database)
        .fetch_all(pool)
        .await;

    result
        .map(|rows| {
            rows.into_iter()
                .map(|(name, rows, table_type)| TableInfo {
                    name,
                    rows: rows.unwrap_or(0),
                    is_view: table_type == "VIEW",
                })
                .collect()
        })
        .unwrap_or_default()
}

async fn get_postgres_tables(pool: &sqlx::PgPool) -> Vec<TableInfo> {
    // 获取表
    let tables_result = sqlx::query_as::<_, (String, Option<i64>)>(
        "SELECT tablename, (SELECT reltuples::bigint FROM pg_class WHERE relname = tablename) FROM pg_tables WHERE schemaname = 'public'"
    )
        .fetch_all(pool)
        .await;

    let mut tables: Vec<TableInfo> = tables_result
        .map(|rows| {
            rows.into_iter()
                .map(|(name, rows)| TableInfo {
                    name,
                    rows: rows.unwrap_or(0),
                    is_view: false,
                })
                .collect()
        })
        .unwrap_or_default();

    // 获取视图
    let views_result = sqlx::query_as::<_, (String,)>(
        "SELECT viewname FROM pg_views WHERE schemaname = 'public'"
    )
        .fetch_all(pool)
        .await;

    if let Ok(views) = views_result {
        for (name,) in views {
            tables.push(TableInfo {
                name,
                rows: 0,
                is_view: true,
            });
        }
    }

    tables
}

async fn get_sqlite_tables(pool: &sqlx::SqlitePool) -> Vec<TableInfo> {
    let result = sqlx::query_as::<_, (String, String)>(
        "SELECT name, type FROM sqlite_master WHERE (type='table' OR type='view') AND name NOT LIKE 'sqlite_%'"
    )
        .fetch_all(pool)
        .await;

    let mut tables = vec![];
    if let Ok(rows) = result {
        for (name, item_type) in rows {
            let count_result = sqlx::query_as::<_, (i64,)>(&format!("SELECT COUNT(*) FROM \"{}\"", name))
                .fetch_one(pool)
                .await;
            let count = count_result.map(|(c,)| c).unwrap_or(0);
            
            tables.push(TableInfo {
                name,
                rows: count,
                is_view: item_type == "view",
            });
        }
    }

    tables
}

async fn get_sqlserver_tables(conn: &crate::database::SqlServerConnection, database: &str) -> Vec<TableInfo> {
    use tiberius::Client;
    use tokio::net::TcpStream;
    use tokio_util::compat::TokioAsyncWriteCompatExt;

    let tcp = match TcpStream::connect(conn.config.get_addr()).await {
        Ok(t) => t,
        Err(_) => return vec![],
    };
    tcp.set_nodelay(true).ok();

    let mut client = match Client::connect(conn.config.clone(), tcp.compat_write()).await {
        Ok(c) => c,
        Err(_) => return vec![],
    };

    let sql = format!(
        "USE [{}]; SELECT t.name, SUM(p.rows) as rows, 0 as is_view FROM sys.tables t \
         LEFT JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0, 1) \
         GROUP BY t.name \
         UNION ALL \
         SELECT name, 0 as rows, 1 as is_view FROM sys.views \
         ORDER BY is_view, name",
        database
    );

    match client.simple_query(&sql).await {
        Ok(result) => {
            let mut tables = vec![];
            for result_set in result.into_results().await.unwrap_or_default() {
                for row in result_set {
                    let name = row.try_get::<&str, _>(0).ok().flatten().unwrap_or_default().to_string();
                    let rows = row.try_get::<i64, _>(1).ok().flatten().unwrap_or(0);
                    let is_view = row.try_get::<i32, _>(2).ok().flatten().unwrap_or(0) == 1;
                    tables.push(TableInfo { name, rows, is_view });
                }
            }
            tables
        }
        Err(_) => vec![],
    }
}

#[tauri::command]
pub async fn db_get_columns(id: String, database: String, table: String) -> Vec<ColumnInfo> {
    let connections = CONNECTIONS.read();
    let conn_info = match connections.get(&id) {
        Some(c) => c.clone(),
        None => return vec![],
    };
    drop(connections);

    match &conn_info.connection {
        DbConnection::MySql(pool) => {
            get_mysql_columns(pool, &database, &table).await
        }
        DbConnection::Postgres(pool) => {
            get_postgres_columns(pool, &table).await
        }
        DbConnection::Sqlite(pool) => {
            get_sqlite_columns(pool, &table).await
        }
        DbConnection::SqlServer(conn) => {
            get_sqlserver_columns(conn, &database, &table).await
        }
    }
}

async fn get_mysql_columns(pool: &sqlx::MySqlPool, database: &str, table: &str) -> Vec<ColumnInfo> {
    let result = sqlx::query_as::<_, (String, String, String, Option<String>, Option<String>)>(
        "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_COMMENT \
         FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? \
         ORDER BY ORDINAL_POSITION"
    )
        .bind(database)
        .bind(table)
        .fetch_all(pool)
        .await;

    result
        .map(|rows| {
            rows.into_iter()
                .map(|(name, data_type, nullable, key, comment)| ColumnInfo {
                    name,
                    data_type,
                    nullable: nullable == "YES",
                    key,
                    comment,
                })
                .collect()
        })
        .unwrap_or_default()
}

async fn get_postgres_columns(pool: &sqlx::PgPool, table: &str) -> Vec<ColumnInfo> {
    let result = sqlx::query_as::<_, (String, String, String)>(
        "SELECT column_name, data_type, is_nullable FROM information_schema.columns \
         WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position"
    )
        .bind(table)
        .fetch_all(pool)
        .await;

    result
        .map(|rows| {
            rows.into_iter()
                .map(|(name, data_type, nullable)| ColumnInfo {
                    name,
                    data_type,
                    nullable: nullable == "YES",
                    key: None,
                    comment: None,
                })
                .collect()
        })
        .unwrap_or_default()
}

async fn get_sqlite_columns(pool: &sqlx::SqlitePool, table: &str) -> Vec<ColumnInfo> {
    let result = sqlx::query_as::<_, (String, String, i32, i32)>(
        &format!("PRAGMA table_info(\"{}\")", table)
    )
        .fetch_all(pool)
        .await;

    result
        .map(|rows| {
            rows.into_iter()
                .map(|(name, data_type, notnull, pk)| ColumnInfo {
                    name,
                    data_type,
                    nullable: notnull == 0,
                    key: if pk == 1 { Some("PRI".to_string()) } else { None },
                    comment: None,
                })
                .collect()
        })
        .unwrap_or_default()
}

async fn get_sqlserver_columns(conn: &crate::database::SqlServerConnection, database: &str, table: &str) -> Vec<ColumnInfo> {
    use tiberius::Client;
    use tokio::net::TcpStream;
    use tokio_util::compat::TokioAsyncWriteCompatExt;

    let tcp = match TcpStream::connect(conn.config.get_addr()).await {
        Ok(t) => t,
        Err(_) => return vec![],
    };
    tcp.set_nodelay(true).ok();

    let mut client = match Client::connect(conn.config.clone(), tcp.compat_write()).await {
        Ok(c) => c,
        Err(_) => return vec![],
    };

    let sql = format!(
        "USE [{}]; SELECT c.name, t.name as type, c.is_nullable \
         FROM sys.columns c JOIN sys.types t ON c.user_type_id = t.user_type_id \
         WHERE c.object_id = OBJECT_ID('{}') ORDER BY c.column_id",
        database, table
    );

    match client.simple_query(&sql).await {
        Ok(result) => {
            let mut columns = vec![];
            for result_set in result.into_results().await.unwrap_or_default() {
                for row in result_set {
                    let name = row.try_get::<&str, _>(0).ok().flatten().unwrap_or_default().to_string();
                    let data_type = row.try_get::<&str, _>(1).ok().flatten().unwrap_or_default().to_string();
                    let nullable = row.try_get::<bool, _>(2).ok().flatten().unwrap_or(false);
                    columns.push(ColumnInfo {
                        name,
                        data_type,
                        nullable,
                        key: None,
                        comment: None,
                    });
                }
            }
            columns
        }
        Err(_) => vec![],
    }
}

#[tauri::command]
pub async fn db_get_table_data(
    id: String,
    database: String,
    table: String,
    page: Option<i32>,
    page_size: Option<i32>,
) -> TableDataResult {
    let page = page.unwrap_or(1);
    let page_size = page_size.unwrap_or(100);
    let offset = (page - 1) * page_size;

    let connections = CONNECTIONS.read();
    let conn_info = match connections.get(&id) {
        Some(c) => c.clone(),
        None => return TableDataResult {
            columns: vec![],
            rows: vec![],
            total: 0,
            page,
            page_size,
        },
    };
    drop(connections);

    let columns = db_get_columns(id.clone(), database.clone(), table.clone()).await;

    match &conn_info.connection {
        DbConnection::MySql(pool) => {
            let _ = sqlx::query(&format!("USE `{}`", database)).execute(pool).await;
            
            // 获取总数
            let total = sqlx::query_as::<_, (i64,)>(&format!("SELECT COUNT(*) FROM `{}`", table))
                .fetch_one(pool)
                .await
                .map(|(c,)| c)
                .unwrap_or(0);

            // 获取数据
            let sql = format!("SELECT * FROM `{}` LIMIT {} OFFSET {}", table, page_size, offset);
            let result = db_query(id, sql).await;

            TableDataResult {
                columns,
                rows: result.rows,
                total,
                page,
                page_size,
            }
        }
        DbConnection::Postgres(pool) => {
            let total = sqlx::query_as::<_, (i64,)>(&format!("SELECT COUNT(*) FROM \"{}\"", table))
                .fetch_one(pool)
                .await
                .map(|(c,)| c)
                .unwrap_or(0);

            let sql = format!("SELECT * FROM \"{}\" LIMIT {} OFFSET {}", table, page_size, offset);
            let result = db_query(id, sql).await;

            TableDataResult {
                columns,
                rows: result.rows,
                total,
                page,
                page_size,
            }
        }
        DbConnection::Sqlite(pool) => {
            let total = sqlx::query_as::<_, (i64,)>(&format!("SELECT COUNT(*) FROM \"{}\"", table))
                .fetch_one(pool)
                .await
                .map(|(c,)| c)
                .unwrap_or(0);

            let sql = format!("SELECT * FROM \"{}\" LIMIT {} OFFSET {}", table, page_size, offset);
            let result = db_query(id, sql).await;

            TableDataResult {
                columns,
                rows: result.rows,
                total,
                page,
                page_size,
            }
        }
        DbConnection::SqlServer(_) => {
            let sql = format!(
                "USE [{}]; SELECT COUNT(*) FROM [{}]",
                database, table
            );
            let count_result = db_query(id.clone(), sql).await;
            let total = count_result.rows.first()
                .and_then(|r| r.first())
                .and_then(|v| v.as_i64())
                .unwrap_or(0);

            let sql = format!(
                "USE [{}]; SELECT * FROM [{}] ORDER BY (SELECT NULL) OFFSET {} ROWS FETCH NEXT {} ROWS ONLY",
                database, table, offset, page_size
            );
            let result = db_query(id, sql).await;

            TableDataResult {
                columns,
                rows: result.rows,
                total,
                page,
                page_size,
            }
        }
    }
}

#[tauri::command]
pub async fn db_update_row(
    id: String,
    database: String,
    table: String,
    primary_key: serde_json::Value,
    updates: serde_json::Value,
) -> CommandResult {
    let connections = CONNECTIONS.read();
    let conn_info = match connections.get(&id) {
        Some(c) => c.clone(),
        None => return CommandResult {
            success: false,
            message: "未连接".to_string(),
        },
    };
    drop(connections);

    let pk_col = primary_key.get("column").and_then(|v| v.as_str()).unwrap_or("");
    let pk_val = primary_key.get("value");
    let updates_obj = updates.as_object();

    if pk_col.is_empty() || pk_val.is_none() || updates_obj.is_none() {
        return CommandResult {
            success: false,
            message: "参数错误".to_string(),
        };
    }

    let updates_obj = updates_obj.unwrap();
    let pk_val = pk_val.unwrap();

    let set_clause: Vec<String> = updates_obj
        .iter()
        .map(|(k, v)| {
            let value = match v {
                Value::Null => "NULL".to_string(),
                Value::String(s) => format!("'{}'", s.replace("'", "''")),
                Value::Number(n) => n.to_string(),
                Value::Bool(b) => if *b { "1" } else { "0" }.to_string(),
                _ => format!("'{}'", v.to_string().replace("'", "''")),
            };
            format!("`{}` = {}", k, value)
        })
        .collect();

    let pk_value = match pk_val {
        Value::String(s) => format!("'{}'", s.replace("'", "''")),
        Value::Number(n) => n.to_string(),
        _ => format!("'{}'", pk_val.to_string()),
    };

    let sql = match &conn_info.connection {
        DbConnection::MySql(_) => {
            format!(
                "USE `{}`; UPDATE `{}` SET {} WHERE `{}` = {}",
                database,
                table,
                set_clause.join(", ").replace("`", "`"),
                pk_col,
                pk_value
            )
        }
        DbConnection::Postgres(_) => {
            format!(
                "UPDATE \"{}\" SET {} WHERE \"{}\" = {}",
                table,
                set_clause.join(", ").replace("`", "\""),
                pk_col,
                pk_value
            )
        }
        DbConnection::Sqlite(_) => {
            format!(
                "UPDATE \"{}\" SET {} WHERE \"{}\" = {}",
                table,
                set_clause.join(", ").replace("`", "\""),
                pk_col,
                pk_value
            )
        }
        DbConnection::SqlServer(_) => {
            format!(
                "USE [{}]; UPDATE [{}] SET {} WHERE [{}] = {}",
                database,
                table,
                set_clause.join(", ").replace("`", "[").replace("]", "]"),
                pk_col,
                pk_value
            )
        }
    };

    let result = db_query(id, sql).await;
    if result.error.is_some() {
        CommandResult {
            success: false,
            message: result.error.unwrap(),
        }
    } else {
        CommandResult {
            success: true,
            message: format!("更新成功，影响 {} 行", result.affected_rows.unwrap_or(0)),
        }
    }
}

#[tauri::command]
pub async fn db_delete_row(
    id: String,
    database: String,
    table: String,
    primary_key: serde_json::Value,
) -> CommandResult {
    let connections = CONNECTIONS.read();
    let conn_info = match connections.get(&id) {
        Some(c) => c.clone(),
        None => return CommandResult {
            success: false,
            message: "未连接".to_string(),
        },
    };
    drop(connections);

    let pk_col = primary_key.get("column").and_then(|v| v.as_str()).unwrap_or("");
    let pk_val = primary_key.get("value");

    if pk_col.is_empty() || pk_val.is_none() {
        return CommandResult {
            success: false,
            message: "参数错误".to_string(),
        };
    }

    let pk_val = pk_val.unwrap();
    let pk_value = match pk_val {
        Value::String(s) => format!("'{}'", s.replace("'", "''")),
        Value::Number(n) => n.to_string(),
        _ => format!("'{}'", pk_val.to_string()),
    };

    let sql = match &conn_info.connection {
        DbConnection::MySql(_) => {
            format!("USE `{}`; DELETE FROM `{}` WHERE `{}` = {}", database, table, pk_col, pk_value)
        }
        DbConnection::Postgres(_) => {
            format!("DELETE FROM \"{}\" WHERE \"{}\" = {}", table, pk_col, pk_value)
        }
        DbConnection::Sqlite(_) => {
            format!("DELETE FROM \"{}\" WHERE \"{}\" = {}", table, pk_col, pk_value)
        }
        DbConnection::SqlServer(_) => {
            format!("USE [{}]; DELETE FROM [{}] WHERE [{}] = {}", database, table, pk_col, pk_value)
        }
    };

    let result = db_query(id, sql).await;
    if result.error.is_some() {
        CommandResult {
            success: false,
            message: result.error.unwrap(),
        }
    } else {
        CommandResult {
            success: true,
            message: format!("删除成功，影响 {} 行", result.affected_rows.unwrap_or(0)),
        }
    }
}

#[tauri::command]
pub async fn db_backup(id: String, database: String) -> CommandResult {
    // 简化版备份 - 导出 SQL
    CommandResult {
        success: false,
        message: "备份功能开发中".to_string(),
    }
}

#[tauri::command]
pub async fn db_export_table(
    id: String,
    database: String,
    table: String,
    format: String,
) -> CommandResult {
    // 简化版导出
    CommandResult {
        success: false,
        message: "导出功能开发中".to_string(),
    }
}

// ============ 配置操作 ============

#[tauri::command]
pub async fn config_save(connections: Vec<ConnectionConfig>) -> CommandResult {
    match config::save_connections(&connections) {
        Ok(_) => CommandResult {
            success: true,
            message: "保存成功".to_string(),
        },
        Err(e) => CommandResult {
            success: false,
            message: e.to_string(),
        },
    }
}

#[tauri::command]
pub async fn config_load() -> Vec<ConnectionConfig> {
    config::load_connections().unwrap_or_default()
}

#[tauri::command]
pub async fn config_export(connections: Vec<ConnectionConfig>, format: String) -> CommandResult {
    CommandResult {
        success: false,
        message: "导出功能开发中".to_string(),
    }
}

#[tauri::command]
pub async fn config_import() -> Vec<ConnectionConfig> {
    vec![]
}

// ============ 文件操作 ============

#[derive(Serialize)]
pub struct FileOpenResult {
    path: String,
    content: String,
    name: String,
}

#[derive(Serialize)]
pub struct FileSaveResult {
    success: bool,
    path: String,
    name: String,
    error: Option<String>,
}

#[tauri::command]
pub async fn file_open() -> Option<FileOpenResult> {
    // 使用原生文件对话框
    let file_path = rfd::FileDialog::new()
        .add_filter("SQL 文件", &["sql"])
        .add_filter("所有文件", &["*"])
        .pick_file();
    
    match file_path {
        Some(path) => {
            match std::fs::read_to_string(&path) {
                Ok(content) => {
                    let name = path.file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| "untitled.sql".to_string());
                    Some(FileOpenResult {
                        path: path.to_string_lossy().to_string(),
                        content,
                        name,
                    })
                }
                Err(_) => None,
            }
        }
        None => None,
    }
}

#[tauri::command]
pub async fn file_save(file_path: Option<String>, content: String) -> FileSaveResult {
    let path = match file_path {
        Some(p) => std::path::PathBuf::from(p),
        None => {
            // 打开保存对话框
            match rfd::FileDialog::new()
                .add_filter("SQL 文件", &["sql"])
                .set_file_name("query.sql")
                .save_file()
            {
                Some(p) => p,
                None => return FileSaveResult {
                    success: false,
                    path: String::new(),
                    name: String::new(),
                    error: Some("用户取消".to_string()),
                },
            }
        }
    };
    
    match std::fs::write(&path, &content) {
        Ok(_) => {
            let name = path.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "untitled.sql".to_string());
            FileSaveResult {
                success: true,
                path: path.to_string_lossy().to_string(),
                name,
                error: None,
            }
        }
        Err(e) => FileSaveResult {
            success: false,
            path: String::new(),
            name: String::new(),
            error: Some(e.to_string()),
        },
    }
}

#[tauri::command]
pub async fn file_select(extensions: Option<Vec<String>>) -> Option<String> {
    let mut dialog = rfd::FileDialog::new();
    
    if let Some(exts) = extensions {
        let ext_refs: Vec<&str> = exts.iter().map(|s| s.as_str()).collect();
        dialog = dialog.add_filter("数据库文件", &ext_refs);
    }
    
    dialog.pick_file().map(|p| p.to_string_lossy().to_string())
}

