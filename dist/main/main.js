"use strict";
const electron = require("electron");
const path = require("path");
let mainWindow = null;
let dbConnections = /* @__PURE__ */ new Map();
const isDev = !electron.app.isPackaged;
const gotTheLock = electron.app.requestSingleInstanceLock();
if (!gotTheLock) {
  electron.app.quit();
} else {
  electron.app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    frame: false,
    backgroundColor: "#1f1f1f",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
electron.app.whenReady().then(createWindow);
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
electron.app.on("activate", () => {
  if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
});
electron.ipcMain.handle("window:minimize", () => mainWindow == null ? void 0 : mainWindow.minimize());
electron.ipcMain.handle("window:maximize", () => {
  (mainWindow == null ? void 0 : mainWindow.isMaximized()) ? mainWindow.unmaximize() : mainWindow == null ? void 0 : mainWindow.maximize();
});
electron.ipcMain.handle("window:close", () => mainWindow == null ? void 0 : mainWindow.close());
function resolveHost(host) {
  return host === "localhost" ? "127.0.0.1" : host;
}
electron.ipcMain.handle("db:test", async (_, config) => {
  const host = resolveHost(config.host);
  try {
    if (config.type === "mysql" || config.type === "mariadb") {
      const mysql = require("mysql2/promise");
      const conn = await mysql.createConnection({
        host,
        port: config.port,
        user: config.username,
        password: config.password,
        database: config.database || void 0,
        connectTimeout: 1e4
      });
      await conn.ping();
      await conn.end();
      return { success: true, message: "连接成功" };
    } else if (config.type === "postgres") {
      const { Client } = require("pg");
      const client = new Client({
        host,
        port: config.port,
        user: config.username,
        password: config.password,
        database: config.database || "postgres",
        connectionTimeoutMillis: 1e4
      });
      await client.connect();
      await client.end();
      return { success: true, message: "连接成功" };
    } else if (config.type === "mongodb") {
      const { MongoClient } = require("mongodb");
      const uri = config.username ? `mongodb://${config.username}:${config.password}@${host}:${config.port}/${config.database || "admin"}` : `mongodb://${host}:${config.port}/${config.database || "admin"}`;
      const client = new MongoClient(uri, { serverSelectionTimeoutMS: 1e4 });
      await client.connect();
      await client.close();
      return { success: true, message: "连接成功" };
    } else if (config.type === "redis") {
      const Redis = require("ioredis");
      const client = new Redis({
        host,
        port: config.port,
        password: config.password || void 0,
        connectTimeout: 1e4,
        lazyConnect: true
      });
      await client.connect();
      await client.ping();
      await client.quit();
      return { success: true, message: "连接成功" };
    } else if (config.type === "sqlserver") {
      const sql = require("mssql");
      const poolConfig = {
        server: host,
        port: config.port,
        user: config.username,
        password: config.password,
        database: config.database || "master",
        options: { encrypt: false, trustServerCertificate: true },
        connectionTimeout: 1e4
      };
      const pool = await sql.connect(poolConfig);
      await pool.close();
      return { success: true, message: "连接成功" };
    }
    return { success: false, message: `暂不支持 ${config.type}` };
  } catch (err) {
    return { success: false, message: err.message };
  }
});
electron.ipcMain.handle("db:connect", async (_, config) => {
  const host = resolveHost(config.host);
  try {
    if (config.type === "mysql" || config.type === "mariadb") {
      const mysql = require("mysql2/promise");
      const conn = await mysql.createConnection({
        host,
        port: config.port,
        user: config.username,
        password: config.password,
        database: config.database || void 0
      });
      dbConnections.set(config.id, { type: "mysql", conn });
      return { success: true, message: "连接成功" };
    } else if (config.type === "postgres") {
      const { Client } = require("pg");
      const client = new Client({
        host,
        port: config.port,
        user: config.username,
        password: config.password,
        database: config.database || "postgres"
      });
      await client.connect();
      dbConnections.set(config.id, { type: "postgres", conn: client });
      return { success: true, message: "连接成功" };
    } else if (config.type === "mongodb") {
      const { MongoClient } = require("mongodb");
      const uri = config.username ? `mongodb://${config.username}:${config.password}@${host}:${config.port}/${config.database || "admin"}` : `mongodb://${host}:${config.port}/${config.database || "admin"}`;
      const client = new MongoClient(uri);
      await client.connect();
      dbConnections.set(config.id, { type: "mongodb", conn: client });
      return { success: true, message: "连接成功" };
    } else if (config.type === "redis") {
      const Redis = require("ioredis");
      const client = new Redis({
        host,
        port: config.port,
        password: config.password || void 0,
        lazyConnect: true
      });
      await client.connect();
      dbConnections.set(config.id, { type: "redis", conn: client });
      return { success: true, message: "连接成功" };
    } else if (config.type === "sqlserver") {
      const sql = require("mssql");
      const poolConfig = {
        server: host,
        port: config.port,
        user: config.username,
        password: config.password,
        database: config.database || "master",
        options: { encrypt: false, trustServerCertificate: true }
      };
      const pool = await sql.connect(poolConfig);
      dbConnections.set(config.id, { type: "sqlserver", conn: pool });
      return { success: true, message: "连接成功" };
    }
    return { success: false, message: `暂不支持 ${config.type}` };
  } catch (err) {
    return { success: false, message: err.message };
  }
});
electron.ipcMain.handle("db:disconnect", async (_, id) => {
  const db = dbConnections.get(id);
  if (db) {
    try {
      await db.conn.end();
    } catch {
    }
    dbConnections.delete(id);
  }
});
electron.ipcMain.handle("db:query", async (_, id, sql) => {
  var _a;
  const db = dbConnections.get(id);
  if (!db) return { columns: [], rows: [], error: "未连接" };
  try {
    if (db.type === "mysql") {
      const [rows, fields] = await db.conn.query(sql);
      const columns = (fields == null ? void 0 : fields.map((f) => f.name)) || [];
      return { columns, rows: Array.isArray(rows) ? rows : [] };
    } else if (db.type === "postgres") {
      const result = await db.conn.query(sql);
      const columns = ((_a = result.fields) == null ? void 0 : _a.map((f) => f.name)) || [];
      return { columns, rows: result.rows };
    }
    return { columns: [], rows: [], error: "不支持的类型" };
  } catch (err) {
    return { columns: [], rows: [], error: err.message };
  }
});
electron.ipcMain.handle("db:getDatabases", async (_, id) => {
  const db = dbConnections.get(id);
  if (!db) return [];
  try {
    if (db.type === "mysql") {
      const [rows] = await db.conn.query("SHOW DATABASES");
      return rows.map((r) => r.Database);
    } else if (db.type === "postgres") {
      const result = await db.conn.query("SELECT datname FROM pg_database WHERE datistemplate = false");
      return result.rows.map((r) => r.datname);
    }
  } catch {
  }
  return [];
});
electron.ipcMain.handle("db:getTables", async (_, id, database) => {
  const db = dbConnections.get(id);
  if (!db) return [];
  try {
    if (db.type === "mysql") {
      await db.conn.query(`USE \`${database}\``);
      const [rows] = await db.conn.query(`
        SELECT TABLE_NAME as name, TABLE_ROWS as \`rows\` 
        FROM information_schema.TABLES 
        WHERE TABLE_SCHEMA = ?
      `, [database]);
      return rows.map((r) => ({ name: r.name, rows: r.rows || 0 }));
    } else if (db.type === "postgres") {
      const result = await db.conn.query(`
        SELECT tablename as name, 
               (SELECT reltuples::bigint FROM pg_class WHERE relname = tablename) as rows
        FROM pg_tables WHERE schemaname = 'public'
      `);
      return result.rows.map((r) => ({ name: r.name, rows: parseInt(r.rows) || 0 }));
    }
  } catch (err) {
    console.error("getTables error:", err);
  }
  return [];
});
electron.ipcMain.handle("db:getColumns", async (_, id, database, table) => {
  const db = dbConnections.get(id);
  if (!db) return [];
  try {
    if (db.type === "mysql") {
      const [rows] = await db.conn.query(`
        SELECT COLUMN_NAME as name, DATA_TYPE as type, IS_NULLABLE as nullable, 
               COLUMN_KEY as \`key\`, COLUMN_COMMENT as comment
        FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
      `, [database, table]);
      return rows.map((r) => ({
        name: r.name,
        type: r.type,
        nullable: r.nullable === "YES",
        key: r.key || void 0,
        comment: r.comment || void 0
      }));
    } else if (db.type === "postgres") {
      const result = await db.conn.query(`
        SELECT c.column_name as name, c.data_type as type, c.is_nullable as nullable,
               pgd.description as comment
        FROM information_schema.columns c
        LEFT JOIN pg_catalog.pg_statio_all_tables st ON c.table_schema = st.schemaname AND c.table_name = st.relname
        LEFT JOIN pg_catalog.pg_description pgd ON pgd.objoid = st.relid AND pgd.objsubid = c.ordinal_position
        WHERE c.table_schema = 'public' AND c.table_name = $1
        ORDER BY c.ordinal_position
      `, [table]);
      return result.rows.map((r) => ({
        name: r.name,
        type: r.type,
        nullable: r.nullable === "YES",
        comment: r.comment || void 0
      }));
    }
  } catch (err) {
    console.error("getColumns error:", err);
  }
  return [];
});
electron.ipcMain.handle("db:getTableData", async (_, id, database, table, page = 1, pageSize = 100) => {
  var _a, _b;
  const db = dbConnections.get(id);
  if (!db) return { data: [], total: 0 };
  try {
    const offset = (page - 1) * pageSize;
    if (db.type === "mysql") {
      const [countResult] = await db.conn.query(`SELECT COUNT(*) as total FROM \`${database}\`.\`${table}\``);
      const total = ((_a = countResult[0]) == null ? void 0 : _a.total) || 0;
      const [rows] = await db.conn.query(`SELECT * FROM \`${database}\`.\`${table}\` LIMIT ? OFFSET ?`, [pageSize, offset]);
      return { data: rows, total };
    } else if (db.type === "postgres") {
      const countResult = await db.conn.query(`SELECT COUNT(*) as total FROM "${table}"`);
      const total = parseInt((_b = countResult.rows[0]) == null ? void 0 : _b.total) || 0;
      const result = await db.conn.query(`SELECT * FROM "${table}" LIMIT $1 OFFSET $2`, [pageSize, offset]);
      return { data: result.rows, total };
    }
  } catch (err) {
    console.error("getTableData error:", err);
  }
  return { data: [], total: 0 };
});
const fs = require("fs");
const configPath = path.join(electron.app.getPath("userData"), "connections.json");
electron.ipcMain.handle("config:save", async (_, connections) => {
  fs.writeFileSync(configPath, JSON.stringify(connections, null, 2));
});
electron.ipcMain.handle("config:load", async () => {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, "utf-8"));
    }
  } catch {
  }
  return [];
});
electron.ipcMain.handle("file:open", async () => {
  const result = await electron.dialog.showOpenDialog(mainWindow, {
    title: "打开 SQL 文件",
    filters: [
      { name: "SQL 文件", extensions: ["sql"] },
      { name: "所有文件", extensions: ["*"] }
    ],
    properties: ["openFile"]
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  const filePath = result.filePaths[0];
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return { path: filePath, content, name: path.basename(filePath) };
  } catch (err) {
    return { error: err.message };
  }
});
electron.ipcMain.handle("file:save", async (_, filePath, content) => {
  let targetPath = filePath;
  if (!targetPath) {
    const result = await electron.dialog.showSaveDialog(mainWindow, {
      title: "保存 SQL 文件",
      defaultPath: "query.sql",
      filters: [
        { name: "SQL 文件", extensions: ["sql"] },
        { name: "所有文件", extensions: ["*"] }
      ]
    });
    if (result.canceled || !result.filePath) {
      return null;
    }
    targetPath = result.filePath;
  }
  try {
    fs.writeFileSync(targetPath, content, "utf-8");
    return { path: targetPath, name: path.basename(targetPath) };
  } catch (err) {
    return { error: err.message };
  }
});
electron.ipcMain.handle("db:backup", async (_, id, database) => {
  const db = dbConnections.get(id);
  if (!db) return { error: "未连接数据库" };
  const result = await electron.dialog.showSaveDialog(mainWindow, {
    title: "备份数据库",
    defaultPath: `${database}_backup_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.sql`,
    filters: [
      { name: "SQL 文件", extensions: ["sql"] },
      { name: "所有文件", extensions: ["*"] }
    ]
  });
  if (result.canceled || !result.filePath) {
    return { cancelled: true };
  }
  try {
    let sqlContent = "";
    sqlContent += `-- Database Backup: ${database}
`;
    sqlContent += `-- Generated: ${(/* @__PURE__ */ new Date()).toLocaleString()}
`;
    sqlContent += `-- Tool: EasySQL

`;
    if (db.type === "mysql" || db.type === "mariadb") {
      await db.conn.query(`USE \`${database}\``);
      const [tables] = await db.conn.query(`SHOW TABLES`);
      const tableKey = `Tables_in_${database}`;
      sqlContent += `SET FOREIGN_KEY_CHECKS = 0;

`;
      for (const tableRow of tables) {
        const tableName = tableRow[tableKey];
        const [createResult] = await db.conn.query(`SHOW CREATE TABLE \`${tableName}\``);
        const createStatement = createResult[0]["Create Table"];
        sqlContent += `-- Table: ${tableName}
`;
        sqlContent += `DROP TABLE IF EXISTS \`${tableName}\`;
`;
        sqlContent += `${createStatement};

`;
        const [rows] = await db.conn.query(`SELECT * FROM \`${tableName}\``);
        if (rows.length > 0) {
          const columns = Object.keys(rows[0]);
          for (const row of rows) {
            const values = columns.map((col) => {
              const val = row[col];
              if (val === null) return "NULL";
              if (typeof val === "number") return val;
              if (val instanceof Date) return `'${val.toISOString().slice(0, 19).replace("T", " ")}'`;
              return `'${String(val).replace(/'/g, "''").replace(/\\/g, "\\\\")}'`;
            }).join(", ");
            sqlContent += `INSERT INTO \`${tableName}\` (\`${columns.join("`, `")}\`) VALUES (${values});
`;
          }
          sqlContent += "\n";
        }
      }
      sqlContent += `SET FOREIGN_KEY_CHECKS = 1;
`;
    } else if (db.type === "postgres") {
      const tablesResult = await db.conn.query(`
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
      `);
      for (const tableRow of tablesResult.rows) {
        const tableName = tableRow.tablename;
        const dataResult = await db.conn.query(`SELECT * FROM "${tableName}"`);
        if (dataResult.rows.length > 0) {
          const columns = Object.keys(dataResult.rows[0]);
          sqlContent += `-- Table: ${tableName}
`;
          for (const row of dataResult.rows) {
            const values = columns.map((col) => {
              const val = row[col];
              if (val === null) return "NULL";
              if (typeof val === "number") return val;
              if (val instanceof Date) return `'${val.toISOString().slice(0, 19).replace("T", " ")}'`;
              return `'${String(val).replace(/'/g, "''")}'`;
            }).join(", ");
            sqlContent += `INSERT INTO "${tableName}" ("${columns.join('", "')}") VALUES (${values});
`;
          }
          sqlContent += "\n";
        }
      }
    }
    fs.writeFileSync(result.filePath, sqlContent, "utf-8");
    return { success: true, path: result.filePath };
  } catch (err) {
    return { error: err.message };
  }
});
electron.ipcMain.handle("db:exportTable", async (_, id, database, tableName, format) => {
  const db = dbConnections.get(id);
  if (!db) return { error: "未连接数据库" };
  const ext = format === "excel" ? "xlsx" : format;
  const result = await electron.dialog.showSaveDialog(mainWindow, {
    title: `导出表 ${tableName}`,
    defaultPath: `${tableName}_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.${ext}`,
    filters: [
      { name: format === "excel" ? "Excel 文件" : format === "sql" ? "SQL 文件" : "CSV 文件", extensions: [ext] },
      { name: "所有文件", extensions: ["*"] }
    ]
  });
  if (result.canceled || !result.filePath) {
    return { cancelled: true };
  }
  try {
    let rows = [];
    let columns = [];
    if (db.type === "mysql" || db.type === "mariadb") {
      await db.conn.query(`USE \`${database}\``);
      const [data] = await db.conn.query(`SELECT * FROM \`${tableName}\``);
      rows = data;
      if (rows.length > 0) columns = Object.keys(rows[0]);
    } else if (db.type === "postgres") {
      const data = await db.conn.query(`SELECT * FROM "${tableName}"`);
      rows = data.rows;
      if (rows.length > 0) columns = Object.keys(rows[0]);
    }
    if (format === "sql") {
      let content = `-- Table: ${tableName}
`;
      content += `-- Exported: ${(/* @__PURE__ */ new Date()).toLocaleString()}

`;
      for (const row of rows) {
        const values = columns.map((col) => {
          const val = row[col];
          if (val === null) return "NULL";
          if (typeof val === "number") return val;
          return `'${String(val).replace(/'/g, "''")}'`;
        }).join(", ");
        content += `INSERT INTO \`${tableName}\` (\`${columns.join("`, `")}\`) VALUES (${values});
`;
      }
      fs.writeFileSync(result.filePath, content, "utf-8");
    } else if (format === "csv") {
      let content = columns.join(",") + "\n";
      for (const row of rows) {
        const values = columns.map((col) => {
          const val = row[col];
          if (val === null) return "";
          const str = String(val);
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        });
        content += values.join(",") + "\n";
      }
      fs.writeFileSync(result.filePath, content, "utf-8");
    }
    return { success: true, path: result.filePath };
  } catch (err) {
    return { error: err.message };
  }
});
electron.ipcMain.handle("db:updateRow", async (_, id, database, tableName, primaryKey, updates) => {
  const db = dbConnections.get(id);
  if (!db) return { error: "未连接数据库" };
  try {
    if (db.type === "mysql" || db.type === "mariadb") {
      await db.conn.query(`USE \`${database}\``);
      const setClauses = Object.entries(updates).map(([col, val]) => {
        if (val === null) return `\`${col}\` = NULL`;
        return `\`${col}\` = ?`;
      });
      const values = Object.values(updates).filter((v) => v !== null);
      values.push(primaryKey.value);
      await db.conn.query(
        `UPDATE \`${tableName}\` SET ${setClauses.join(", ")} WHERE \`${primaryKey.column}\` = ?`,
        values
      );
      return { success: true };
    } else if (db.type === "postgres") {
      const setClauses = Object.entries(updates).map(([col, val], i) => {
        if (val === null) return `"${col}" = NULL`;
        return `"${col}" = $${i + 1}`;
      });
      const values = Object.values(updates).filter((v) => v !== null);
      values.push(primaryKey.value);
      await db.conn.query(
        `UPDATE "${tableName}" SET ${setClauses.join(", ")} WHERE "${primaryKey.column}" = $${values.length}`,
        values
      );
      return { success: true };
    }
    return { error: "不支持的数据库类型" };
  } catch (err) {
    return { error: err.message };
  }
});
electron.ipcMain.handle("db:deleteRow", async (_, id, database, tableName, primaryKey) => {
  const db = dbConnections.get(id);
  if (!db) return { error: "未连接数据库" };
  try {
    if (db.type === "mysql" || db.type === "mariadb") {
      await db.conn.query(`USE \`${database}\``);
      await db.conn.query(`DELETE FROM \`${tableName}\` WHERE \`${primaryKey.column}\` = ?`, [primaryKey.value]);
      return { success: true };
    } else if (db.type === "postgres") {
      await db.conn.query(`DELETE FROM "${tableName}" WHERE "${primaryKey.column}" = $1`, [primaryKey.value]);
      return { success: true };
    }
    return { error: "不支持的数据库类型" };
  } catch (err) {
    return { error: err.message };
  }
});
