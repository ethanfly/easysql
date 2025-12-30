import { useRef, useEffect } from 'react'
import Editor, { OnMount, loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import { TableInfo, ColumnInfo } from '../types'

// 配置 Monaco 使用本地加载（避免 CDN 问题）
loader.config({ monaco })

interface Props {
  value: string
  onChange: (value: string) => void
  onRun: () => void
  onSave?: () => void
  onOpen?: () => void
  onFormat?: () => void
  databases: string[]
  tables: TableInfo[]
  columns: Map<string, ColumnInfo[]>
}

// SQL 关键字分组
const SQL_KEYWORDS = {
  // 查询相关
  query: ['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'IS', 'NULL', 'EXISTS', 'ANY', 'SOME'],
  // 连接相关
  join: ['JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS', 'ON', 'USING'],
  // 分组排序
  groupOrder: ['GROUP', 'BY', 'HAVING', 'ORDER', 'ASC', 'DESC', 'LIMIT', 'OFFSET'],
  // 数据操作
  dml: ['INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE'],
  // 数据定义
  ddl: ['CREATE', 'ALTER', 'DROP', 'TABLE', 'DATABASE', 'INDEX', 'VIEW', 'TRIGGER', 'PROCEDURE', 'FUNCTION'],
  // 集合操作
  set: ['UNION', 'ALL', 'DISTINCT', 'INTERSECT', 'EXCEPT'],
  // 条件
  conditional: ['AS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'IF'],
  // 约束
  constraint: ['PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'UNIQUE', 'CHECK', 'DEFAULT', 'AUTO_INCREMENT', 'NOT', 'CONSTRAINT', 'IDENTITY'],
  // 其他
  other: ['TRUE', 'FALSE', 'TOP', 'WITH', 'RECURSIVE', 'TEMPORARY', 'TEMP', 'CASCADE', 'RESTRICT']
}

const ALL_KEYWORDS = Object.values(SQL_KEYWORDS).flat()

// SQL 函数分组
const SQL_FUNCTIONS = {
  // 聚合函数
  aggregate: [
    { name: 'COUNT', desc: '计数', snippet: 'COUNT(${1:*})' },
    { name: 'SUM', desc: '求和', snippet: 'SUM(${1:column})' },
    { name: 'AVG', desc: '平均值', snippet: 'AVG(${1:column})' },
    { name: 'MAX', desc: '最大值', snippet: 'MAX(${1:column})' },
    { name: 'MIN', desc: '最小值', snippet: 'MIN(${1:column})' },
    { name: 'GROUP_CONCAT', desc: '分组连接', snippet: 'GROUP_CONCAT(${1:column} SEPARATOR ${2:\',\'})' },
    { name: 'STRING_AGG', desc: '字符串聚合(SQL Server)', snippet: 'STRING_AGG(${1:column}, ${2:\',\'})' },
  ],
  // 字符串函数
  string: [
    { name: 'CONCAT', desc: '连接字符串', snippet: 'CONCAT(${1:str1}, ${2:str2})' },
    { name: 'SUBSTRING', desc: '截取子串', snippet: 'SUBSTRING(${1:str}, ${2:start}, ${3:length})' },
    { name: 'LENGTH', desc: '字符串长度', snippet: 'LENGTH(${1:str})' },
    { name: 'LEN', desc: '字符串长度(SQL Server)', snippet: 'LEN(${1:str})' },
    { name: 'UPPER', desc: '转大写', snippet: 'UPPER(${1:str})' },
    { name: 'LOWER', desc: '转小写', snippet: 'LOWER(${1:str})' },
    { name: 'TRIM', desc: '去除两端空格', snippet: 'TRIM(${1:str})' },
    { name: 'LTRIM', desc: '去除左侧空格', snippet: 'LTRIM(${1:str})' },
    { name: 'RTRIM', desc: '去除右侧空格', snippet: 'RTRIM(${1:str})' },
    { name: 'REPLACE', desc: '替换', snippet: 'REPLACE(${1:str}, ${2:from}, ${3:to})' },
    { name: 'REVERSE', desc: '反转字符串', snippet: 'REVERSE(${1:str})' },
    { name: 'LEFT', desc: '左侧截取', snippet: 'LEFT(${1:str}, ${2:n})' },
    { name: 'RIGHT', desc: '右侧截取', snippet: 'RIGHT(${1:str}, ${2:n})' },
    { name: 'LPAD', desc: '左侧填充', snippet: 'LPAD(${1:str}, ${2:len}, ${3:padstr})' },
    { name: 'RPAD', desc: '右侧填充', snippet: 'RPAD(${1:str}, ${2:len}, ${3:padstr})' },
    { name: 'INSTR', desc: '查找位置', snippet: 'INSTR(${1:str}, ${2:substr})' },
    { name: 'CHARINDEX', desc: '查找位置(SQL Server)', snippet: 'CHARINDEX(${1:substr}, ${2:str})' },
    { name: 'LOCATE', desc: '查找位置', snippet: 'LOCATE(${1:substr}, ${2:str})' },
    { name: 'SPLIT_PART', desc: '分割取部分(PostgreSQL)', snippet: 'SPLIT_PART(${1:str}, ${2:delimiter}, ${3:part})' },
  ],
  // 数值函数
  numeric: [
    { name: 'ABS', desc: '绝对值', snippet: 'ABS(${1:num})' },
    { name: 'CEIL', desc: '向上取整', snippet: 'CEIL(${1:num})' },
    { name: 'CEILING', desc: '向上取整', snippet: 'CEILING(${1:num})' },
    { name: 'FLOOR', desc: '向下取整', snippet: 'FLOOR(${1:num})' },
    { name: 'ROUND', desc: '四舍五入', snippet: 'ROUND(${1:num}, ${2:decimals})' },
    { name: 'MOD', desc: '取模', snippet: 'MOD(${1:n}, ${2:m})' },
    { name: 'POWER', desc: '幂运算', snippet: 'POWER(${1:base}, ${2:exp})' },
    { name: 'SQRT', desc: '平方根', snippet: 'SQRT(${1:num})' },
    { name: 'RAND', desc: '随机数', snippet: 'RAND()' },
    { name: 'SIGN', desc: '符号函数', snippet: 'SIGN(${1:num})' },
  ],
  // 日期时间函数
  datetime: [
    { name: 'NOW', desc: '当前日期时间', snippet: 'NOW()' },
    { name: 'GETDATE', desc: '当前日期时间(SQL Server)', snippet: 'GETDATE()' },
    { name: 'CURRENT_TIMESTAMP', desc: '当前时间戳', snippet: 'CURRENT_TIMESTAMP' },
    { name: 'CURDATE', desc: '当前日期', snippet: 'CURDATE()' },
    { name: 'CURTIME', desc: '当前时间', snippet: 'CURTIME()' },
    { name: 'DATE', desc: '提取日期', snippet: 'DATE(${1:datetime})' },
    { name: 'TIME', desc: '提取时间', snippet: 'TIME(${1:datetime})' },
    { name: 'YEAR', desc: '提取年份', snippet: 'YEAR(${1:date})' },
    { name: 'MONTH', desc: '提取月份', snippet: 'MONTH(${1:date})' },
    { name: 'DAY', desc: '提取日期', snippet: 'DAY(${1:date})' },
    { name: 'HOUR', desc: '提取小时', snippet: 'HOUR(${1:time})' },
    { name: 'MINUTE', desc: '提取分钟', snippet: 'MINUTE(${1:time})' },
    { name: 'SECOND', desc: '提取秒', snippet: 'SECOND(${1:time})' },
    { name: 'DATE_FORMAT', desc: '格式化日期(MySQL)', snippet: 'DATE_FORMAT(${1:date}, ${2:\'%Y-%m-%d\'})' },
    { name: 'FORMAT', desc: '格式化(SQL Server)', snippet: 'FORMAT(${1:date}, ${2:\'yyyy-MM-dd\'})' },
    { name: 'DATE_ADD', desc: '日期加法', snippet: 'DATE_ADD(${1:date}, INTERVAL ${2:1} ${3:DAY})' },
    { name: 'DATEADD', desc: '日期加法(SQL Server)', snippet: 'DATEADD(${1:day}, ${2:1}, ${3:date})' },
    { name: 'DATE_SUB', desc: '日期减法', snippet: 'DATE_SUB(${1:date}, INTERVAL ${2:1} ${3:DAY})' },
    { name: 'DATEDIFF', desc: '日期差', snippet: 'DATEDIFF(${1:date1}, ${2:date2})' },
    { name: 'TIMESTAMPDIFF', desc: '时间戳差', snippet: 'TIMESTAMPDIFF(${1:SECOND}, ${2:datetime1}, ${3:datetime2})' },
    { name: 'TO_CHAR', desc: '转字符串(PostgreSQL)', snippet: 'TO_CHAR(${1:date}, ${2:\'YYYY-MM-DD\'})' },
    { name: 'TO_DATE', desc: '转日期(PostgreSQL)', snippet: 'TO_DATE(${1:str}, ${2:\'YYYY-MM-DD\'})' },
  ],
  // 条件函数
  conditional: [
    { name: 'IF', desc: '条件判断(MySQL)', snippet: 'IF(${1:condition}, ${2:true_value}, ${3:false_value})' },
    { name: 'IIF', desc: '条件判断(SQL Server)', snippet: 'IIF(${1:condition}, ${2:true_value}, ${3:false_value})' },
    { name: 'IFNULL', desc: '空值替换(MySQL)', snippet: 'IFNULL(${1:expr}, ${2:default})' },
    { name: 'ISNULL', desc: '空值替换(SQL Server)', snippet: 'ISNULL(${1:expr}, ${2:default})' },
    { name: 'NULLIF', desc: '相等则返回空', snippet: 'NULLIF(${1:expr1}, ${2:expr2})' },
    { name: 'COALESCE', desc: '返回第一个非空值', snippet: 'COALESCE(${1:expr1}, ${2:expr2}, ${3:default})' },
    { name: 'NVL', desc: '空值替换(Oracle)', snippet: 'NVL(${1:expr}, ${2:default})' },
    { name: 'GREATEST', desc: '返回最大值', snippet: 'GREATEST(${1:val1}, ${2:val2})' },
    { name: 'LEAST', desc: '返回最小值', snippet: 'LEAST(${1:val1}, ${2:val2})' },
  ],
  // 转换函数
  conversion: [
    { name: 'CAST', desc: '类型转换', snippet: 'CAST(${1:expr} AS ${2:type})' },
    { name: 'CONVERT', desc: '类型转换', snippet: 'CONVERT(${1:type}, ${2:expr})' },
    { name: 'TRY_CAST', desc: '安全类型转换(SQL Server)', snippet: 'TRY_CAST(${1:expr} AS ${2:type})' },
    { name: 'TRY_CONVERT', desc: '安全类型转换(SQL Server)', snippet: 'TRY_CONVERT(${1:type}, ${2:expr})' },
  ],
  // 窗口函数
  window: [
    { name: 'ROW_NUMBER', desc: '行号', snippet: 'ROW_NUMBER() OVER (${1:ORDER BY column})' },
    { name: 'RANK', desc: '排名(有并列)', snippet: 'RANK() OVER (${1:ORDER BY column})' },
    { name: 'DENSE_RANK', desc: '密集排名', snippet: 'DENSE_RANK() OVER (${1:ORDER BY column})' },
    { name: 'NTILE', desc: '分组编号', snippet: 'NTILE(${1:n}) OVER (${2:ORDER BY column})' },
    { name: 'LAG', desc: '前一行值', snippet: 'LAG(${1:column}, ${2:1}) OVER (${3:ORDER BY column})' },
    { name: 'LEAD', desc: '后一行值', snippet: 'LEAD(${1:column}, ${2:1}) OVER (${3:ORDER BY column})' },
    { name: 'FIRST_VALUE', desc: '第一个值', snippet: 'FIRST_VALUE(${1:column}) OVER (${2:ORDER BY column})' },
    { name: 'LAST_VALUE', desc: '最后一个值', snippet: 'LAST_VALUE(${1:column}) OVER (${2:ORDER BY column})' },
    { name: 'SUM', desc: '窗口求和', snippet: 'SUM(${1:column}) OVER (${2:PARTITION BY column})' },
  ],
}

const ALL_FUNCTIONS = Object.values(SQL_FUNCTIONS).flat()

// 数据类型
const SQL_TYPES = [
  'INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT',
  'DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE', 'REAL', 'MONEY',
  'VARCHAR', 'NVARCHAR', 'CHAR', 'NCHAR', 'TEXT', 'NTEXT', 'LONGTEXT', 'MEDIUMTEXT', 'TINYTEXT',
  'DATE', 'TIME', 'DATETIME', 'DATETIME2', 'TIMESTAMP', 'YEAR', 'SMALLDATETIME',
  'BOOLEAN', 'BOOL', 'BIT', 'BLOB', 'BINARY', 'VARBINARY', 'IMAGE',
  'JSON', 'JSONB', 'XML', 'UUID', 'UNIQUEIDENTIFIER',
  'ENUM', 'SET', 'ARRAY'
]

// 分析 SQL 上下文
function analyzeSqlContext(textBeforeCursor: string): {
  context: 'select_columns' | 'from_table' | 'where_condition' | 'join_table' | 'on_condition' | 'order_by' | 'group_by' | 'insert_table' | 'update_table' | 'set_column' | 'general',
  tableAlias: Map<string, string>, // 别名 -> 表名
  currentTable: string | null, // 当前正在输入的表名（用于 table. 场景）
} {
  const text = textBeforeCursor.toUpperCase()
  const tableAlias = new Map<string, string>()
  let currentTable: string | null = null
  
  // 提取表别名 (FROM table AS alias 或 FROM table alias 或 JOIN table alias)
  const aliasRegex = /(?:FROM|JOIN)\s+[`\[\"]?(\w+)[`\]\"]?\s+(?:AS\s+)?([A-Z]\w*)/gi
  let match
  while ((match = aliasRegex.exec(textBeforeCursor)) !== null) {
    tableAlias.set(match[2].toLowerCase(), match[1].toLowerCase())
  }
  
  // 检查是否在 table. 后面
  const dotMatch = textBeforeCursor.match(/[`\[\"]?(\w+)[`\]\"]?\.\s*$/i)
  if (dotMatch) {
    currentTable = dotMatch[1].toLowerCase()
    // 检查是否是别名
    if (tableAlias.has(currentTable)) {
      currentTable = tableAlias.get(currentTable)!
    }
  }
  
  // 判断上下文
  let context: ReturnType<typeof analyzeSqlContext>['context'] = 'general'
  
  // 检查最近的关键字
  const lastKeywordMatch = text.match(/(SELECT|FROM|WHERE|JOIN|ON|ORDER\s+BY|GROUP\s+BY|SET|INSERT\s+INTO|UPDATE|HAVING)\s*[^A-Z]*$/i)
  if (lastKeywordMatch) {
    const keyword = lastKeywordMatch[1].replace(/\s+/g, ' ')
    switch (keyword) {
      case 'SELECT':
        context = 'select_columns'
        break
      case 'FROM':
        context = 'from_table'
        break
      case 'WHERE':
      case 'HAVING':
        context = 'where_condition'
        break
      case 'JOIN':
        context = 'join_table'
        break
      case 'ON':
        context = 'on_condition'
        break
      case 'ORDER BY':
        context = 'order_by'
        break
      case 'GROUP BY':
        context = 'group_by'
        break
      case 'INSERT INTO':
        context = 'insert_table'
        break
      case 'UPDATE':
        context = 'update_table'
        break
      case 'SET':
        context = 'set_column'
        break
    }
  }
  
  return { context, tableAlias, currentTable }
}

export default function SqlEditor({ value, onChange, onRun, onSave, onOpen, onFormat, databases, tables, columns }: Props) {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof monaco | null>(null)
  const disposableRef = useRef<monaco.IDisposable | null>(null)
  
  // 使用 ref 保存最新的数据和回调
  const dataRef = useRef({ databases, tables, columns })
  const callbacksRef = useRef({ onRun, onSave, onOpen, onFormat })
  
  // 更新 ref 中的数据
  useEffect(() => {
    dataRef.current = { databases, tables, columns }
  }, [databases, tables, columns])
  
  // 更新 ref 中的回调
  useEffect(() => {
    callbacksRef.current = { onRun, onSave, onOpen, onFormat }
  }, [onRun, onSave, onOpen, onFormat])

  const handleEditorMount: OnMount = (editor, monacoInstance) => {
    editorRef.current = editor
    monacoRef.current = monacoInstance

    // 注册 SQL 语言的自动补全
    disposableRef.current = monacoInstance.languages.registerCompletionItemProvider('sql', {
      triggerCharacters: ['.', ' ', '`', '[', '"', ','],
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position)
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        }

        // 获取光标前的文本进行上下文分析
        const textBeforeCursor = model.getValueInRange({
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        })
        
        const { context, tableAlias, currentTable } = analyzeSqlContext(textBeforeCursor)

        // 获取最新的数据
        const { databases: dbs, tables: tbls, columns: cols } = dataRef.current

        const suggestions: monaco.languages.CompletionItem[] = []

        // 如果在 table. 后面，只提示该表的字段
        if (currentTable) {
          // 检查是否有该表的列信息
          const tableColumns = cols.get(currentTable) || 
            [...cols.entries()].find(([name]) => name.toLowerCase() === currentTable)?.[1]
          
          if (tableColumns) {
            tableColumns.forEach(col => {
              const comment = col.comment ? ` - ${col.comment}` : ''
              suggestions.push({
                label: col.name,
                kind: monacoInstance.languages.CompletionItemKind.Field,
                insertText: col.name,
                range,
                detail: `📌 ${col.type}${col.key === 'PRI' ? ' 🔑' : ''}`,
                documentation: {
                  value: `**${currentTable}.${col.name}**\n\n` +
                    `- 类型: \`${col.type}\`\n` +
                    `- 可空: ${col.nullable ? '✅ 是' : '❌ 否'}\n` +
                    (col.key ? `- 键: ${col.key}\n` : '') +
                    (col.comment ? `- 备注: ${col.comment}` : '')
                },
                sortText: '0' + col.name,
              })
            })
            // 添加 * 选项
            suggestions.push({
              label: '*',
              kind: monacoInstance.languages.CompletionItemKind.Constant,
              insertText: '*',
              range,
              detail: '所有字段',
              sortText: '00',
            })
          }
          return { suggestions }
        }

        // 根据上下文提供不同的建议
        const addKeywords = (priority: string = '3') => {
          ALL_KEYWORDS.forEach(keyword => {
            suggestions.push({
              label: keyword,
              kind: monacoInstance.languages.CompletionItemKind.Keyword,
              insertText: keyword,
              range,
              detail: '关键字',
              sortText: priority + keyword,
            })
            suggestions.push({
              label: keyword.toLowerCase(),
              kind: monacoInstance.languages.CompletionItemKind.Keyword,
              insertText: keyword.toLowerCase(),
              range,
              detail: '关键字',
              sortText: priority + keyword,
            })
          })
        }

        const addFunctions = (categories?: (keyof typeof SQL_FUNCTIONS)[], priority: string = '2') => {
          const funcsToAdd = categories 
            ? categories.flatMap(cat => SQL_FUNCTIONS[cat] || [])
            : ALL_FUNCTIONS
          
          funcsToAdd.forEach(func => {
            suggestions.push({
              label: func.name,
              kind: monacoInstance.languages.CompletionItemKind.Function,
              insertText: func.snippet,
              insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range,
              detail: `ƒ ${func.desc}`,
              sortText: priority + func.name,
            })
          })
        }

        const addTables = (priority: string = '0') => {
          tbls.forEach(table => {
            const isView = table.isView
            suggestions.push({
              label: table.name,
              kind: isView 
                ? monacoInstance.languages.CompletionItemKind.Interface 
                : monacoInstance.languages.CompletionItemKind.Class,
              insertText: table.name,
              range,
              detail: isView 
                ? `👁️ 视图`
                : `📋 表 (${table.rows.toLocaleString()} 行)`,
              sortText: priority + (isView ? '1' : '0') + table.name,
            })
          })
        }

        const addColumns = (priority: string = '1', withTablePrefix: boolean = false) => {
          cols.forEach((colList, tableName) => {
            colList.forEach(col => {
              const comment = col.comment ? ` - ${col.comment}` : ''
              const label = withTablePrefix ? `${tableName}.${col.name}` : col.name
              const isPK = col.key === 'PRI'
              
              suggestions.push({
                label,
                kind: monacoInstance.languages.CompletionItemKind.Field,
                insertText: label,
                range,
                detail: `📌 ${tableName} · ${col.type}${isPK ? ' 🔑' : ''}`,
                documentation: {
                  value: `**${tableName}.${col.name}**\n\n` +
                    `- 类型: \`${col.type}\`\n` +
                    `- 可空: ${col.nullable ? '✅ 是' : '❌ 否'}\n` +
                    (col.key ? `- 键: ${col.key}\n` : '') +
                    (col.comment ? `- 备注: ${col.comment}` : '')
                },
                sortText: priority + (isPK ? '0' : '1') + col.name,
              })
            })
          })
        }

        const addDatabases = (priority: string = '0') => {
          dbs.forEach(db => {
            suggestions.push({
              label: db,
              kind: monacoInstance.languages.CompletionItemKind.Module,
              insertText: db,
              range,
              detail: '📁 数据库',
              sortText: priority + db,
            })
          })
        }

        // 根据上下文添加建议
        switch (context) {
          case 'select_columns':
            // SELECT 后优先提示字段、聚合函数、*
            suggestions.push({
              label: '*',
              kind: monacoInstance.languages.CompletionItemKind.Constant,
              insertText: '*',
              range,
              detail: '所有字段',
              sortText: '00',
            })
            addColumns('0', true)
            addFunctions(['aggregate', 'string', 'datetime', 'conditional', 'window'], '1')
            addTables('3')
            addKeywords('4')
            break
            
          case 'from_table':
          case 'join_table':
          case 'insert_table':
          case 'update_table':
            // FROM/JOIN/INSERT/UPDATE 后优先提示表名
            addTables('0')
            addDatabases('1')
            addKeywords('4')
            break
            
          case 'where_condition':
          case 'on_condition':
            // WHERE/ON 后优先提示字段、比较运算符
            addColumns('0', true)
            addFunctions(['conditional', 'string', 'datetime'], '2')
            addKeywords('3')
            break
            
          case 'order_by':
          case 'group_by':
            // ORDER BY/GROUP BY 后优先提示字段
            addColumns('0', true)
            addFunctions(['aggregate'], '2')
            addKeywords('3')
            break
            
          case 'set_column':
            // SET 后优先提示字段
            addColumns('0', false)
            addFunctions(['conditional', 'string', 'datetime'], '2')
            break
            
          default:
            // 通用情况
            addKeywords('3')
            addFunctions(undefined, '4')
            addTables('1')
            addColumns('2', true)
            addDatabases('0')
        }

        // 数据类型
        SQL_TYPES.forEach(type => {
          suggestions.push({
            label: type,
            kind: monacoInstance.languages.CompletionItemKind.TypeParameter,
            insertText: type,
            range,
            detail: '数据类型',
            sortText: '5' + type,
          })
        })

        // 常用代码片段
        const snippets = [
          { label: 'sel', insertText: 'SELECT * FROM ${1:table} WHERE ${2:1=1}', detail: 'SELECT 查询' },
          { label: 'selc', insertText: 'SELECT COUNT(*) as count FROM ${1:table}', detail: 'COUNT 计数' },
          { label: 'selt', insertText: 'SELECT TOP ${1:10} * FROM ${2:table}', detail: 'SELECT TOP (SQL Server)' },
          { label: 'sell', insertText: 'SELECT * FROM ${1:table} LIMIT ${2:10}', detail: 'SELECT LIMIT' },
          { label: 'selp', insertText: 'SELECT * FROM ${1:table} LIMIT ${2:10} OFFSET ${3:0}', detail: 'SELECT 分页' },
          { label: 'seld', insertText: 'SELECT DISTINCT ${1:column} FROM ${2:table}', detail: 'SELECT DISTINCT' },
          { label: 'ins', insertText: 'INSERT INTO ${1:table} (${2:columns})\nVALUES (${3:values})', detail: 'INSERT 插入' },
          { label: 'insm', insertText: 'INSERT INTO ${1:table} (${2:columns})\nVALUES\n  (${3:values1}),\n  (${4:values2})', detail: 'INSERT 多行' },
          { label: 'upd', insertText: 'UPDATE ${1:table}\nSET ${2:column} = ${3:value}\nWHERE ${4:condition}', detail: 'UPDATE 更新' },
          { label: 'del', insertText: 'DELETE FROM ${1:table}\nWHERE ${2:condition}', detail: 'DELETE 删除' },
          { label: 'crt', insertText: 'CREATE TABLE ${1:table_name} (\n  id INT PRIMARY KEY AUTO_INCREMENT,\n  ${2:column_name} ${3:VARCHAR(255)} NOT NULL,\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP\n)', detail: 'CREATE TABLE' },
          { label: 'crts', insertText: 'CREATE TABLE ${1:table_name} (\n  id INT IDENTITY(1,1) PRIMARY KEY,\n  ${2:column_name} ${3:NVARCHAR(255)} NOT NULL,\n  created_at DATETIME2 DEFAULT GETDATE()\n)', detail: 'CREATE TABLE (SQL Server)' },
          { label: 'alt', insertText: 'ALTER TABLE ${1:table}\nADD ${2:column} ${3:type}', detail: 'ALTER TABLE 添加列' },
          { label: 'idx', insertText: 'CREATE INDEX ${1:idx_name}\nON ${2:table} (${3:column})', detail: 'CREATE INDEX' },
          { label: 'join', insertText: 'SELECT ${1:t1.*}, ${2:t2.*}\nFROM ${3:table1} t1\nINNER JOIN ${4:table2} t2 ON t1.${5:id} = t2.${6:t1_id}', detail: 'INNER JOIN' },
          { label: 'ljoin', insertText: 'SELECT ${1:t1.*}, ${2:t2.*}\nFROM ${3:table1} t1\nLEFT JOIN ${4:table2} t2 ON t1.${5:id} = t2.${6:t1_id}', detail: 'LEFT JOIN' },
          { label: 'rjoin', insertText: 'SELECT ${1:t1.*}, ${2:t2.*}\nFROM ${3:table1} t1\nRIGHT JOIN ${4:table2} t2 ON t1.${5:id} = t2.${6:t1_id}', detail: 'RIGHT JOIN' },
          { label: 'case', insertText: 'CASE\n  WHEN ${1:condition1} THEN ${2:result1}\n  WHEN ${3:condition2} THEN ${4:result2}\n  ELSE ${5:default}\nEND', detail: 'CASE WHEN' },
          { label: 'cte', insertText: 'WITH ${1:cte_name} AS (\n  ${2:SELECT * FROM table}\n)\nSELECT * FROM ${1:cte_name}', detail: 'CTE 公用表表达式' },
          { label: 'sub', insertText: 'SELECT * FROM (\n  ${1:SELECT * FROM table}\n) AS ${2:subquery}', detail: '子查询' },
          { label: 'exs', insertText: 'SELECT * FROM ${1:table1} t1\nWHERE EXISTS (\n  SELECT 1 FROM ${2:table2} t2\n  WHERE t2.${3:t1_id} = t1.${4:id}\n)', detail: 'EXISTS 子查询' },
          { label: 'grp', insertText: 'SELECT ${1:column}, COUNT(*) as count\nFROM ${2:table}\nGROUP BY ${1:column}\nHAVING COUNT(*) > ${3:1}\nORDER BY count DESC', detail: 'GROUP BY 分组' },
          { label: 'pag', insertText: 'SELECT *\nFROM ${1:table}\nORDER BY ${2:id}\nOFFSET ${3:0} ROWS\nFETCH NEXT ${4:10} ROWS ONLY', detail: 'OFFSET FETCH 分页 (SQL Server)' },
        ]
        
        snippets.forEach(snip => {
          suggestions.push({
            label: snip.label,
            kind: monacoInstance.languages.CompletionItemKind.Snippet,
            insertText: snip.insertText,
            insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
            detail: '📝 ' + snip.detail,
            sortText: '6' + snip.label,
          })
        })

        return { suggestions }
      }
    })

    // Ctrl+Enter 执行
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Enter, () => {
      callbacksRef.current.onRun()
    })
    
    // Ctrl+S 保存
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, () => {
      callbacksRef.current.onSave?.()
    })
    
    // Ctrl+O 打开
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyO, () => {
      callbacksRef.current.onOpen?.()
    })
    
    // Ctrl+Shift+F 格式化
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyMod.Shift | monacoInstance.KeyCode.KeyF, () => {
      callbacksRef.current.onFormat?.()
    })
    
    // Alt+Shift+F 格式化（VSCode 风格）
    editor.addCommand(monacoInstance.KeyMod.Alt | monacoInstance.KeyMod.Shift | monacoInstance.KeyCode.KeyF, () => {
      callbacksRef.current.onFormat?.()
    })
  }

  // 清理
  useEffect(() => {
    return () => {
      disposableRef.current?.dispose()
    }
  }, [])

  return (
    <Editor
      height="100%"
      language="sql"
      value={value}
      onChange={(v) => onChange(v || '')}
      onMount={handleEditorMount}
      theme="vs-dark"
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        fontFamily: "'Cascadia Code', 'Consolas', monospace",
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        wordWrap: 'on',
        suggestOnTriggerCharacters: true,
        quickSuggestions: {
          other: true,
          comments: false,
          strings: true,
        },
        snippetSuggestions: 'top',
        suggest: {
          showKeywords: true,
          showSnippets: true,
          showFunctions: true,
          showFields: true,
          showClasses: true,
          showModules: true,
          preview: true,
          filterGraceful: true,
        },
        padding: { top: 10, bottom: 10 },
        acceptSuggestionOnEnter: 'on',
      }}
    />
  )
}
