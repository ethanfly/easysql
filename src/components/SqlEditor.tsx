import { useRef, useEffect, useCallback } from 'react'
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
  onFetchTableColumns?: (tableName: string) => Promise<void>  // 获取表字段的回调
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

// SQL 比较操作符
const SQL_OPERATORS = [
  { label: '=', desc: '等于', insertText: '= ' },
  { label: '<>', desc: '不等于', insertText: '<> ' },
  { label: '!=', desc: '不等于', insertText: '!= ' },
  { label: '>', desc: '大于', insertText: '> ' },
  { label: '<', desc: '小于', insertText: '< ' },
  { label: '>=', desc: '大于等于', insertText: '>= ' },
  { label: '<=', desc: '小于等于', insertText: '<= ' },
  { label: 'LIKE', desc: '模糊匹配', insertText: "LIKE '${1:%}'" },
  { label: 'NOT LIKE', desc: '不匹配', insertText: "NOT LIKE '${1:%}'" },
  { label: 'IN', desc: '在列表中', insertText: 'IN (${1:values})' },
  { label: 'NOT IN', desc: '不在列表中', insertText: 'NOT IN (${1:values})' },
  { label: 'BETWEEN', desc: '在范围内', insertText: 'BETWEEN ${1:start} AND ${2:end}' },
  { label: 'NOT BETWEEN', desc: '不在范围内', insertText: 'NOT BETWEEN ${1:start} AND ${2:end}' },
  { label: 'IS NULL', desc: '为空', insertText: 'IS NULL' },
  { label: 'IS NOT NULL', desc: '不为空', insertText: 'IS NOT NULL' },
  { label: 'EXISTS', desc: '存在子查询', insertText: 'EXISTS (${1:SELECT 1 FROM table WHERE condition})' },
  { label: 'NOT EXISTS', desc: '不存在子查询', insertText: 'NOT EXISTS (${1:SELECT 1 FROM table WHERE condition})' },
  { label: 'REGEXP', desc: '正则匹配(MySQL)', insertText: "REGEXP '${1:pattern}'" },
  { label: '~', desc: '正则匹配(PostgreSQL)', insertText: "~ '${1:pattern}'" },
]

// LIKE 模式模板
const LIKE_PATTERNS = [
  { label: "'%value%'", desc: '包含value', insertText: "'%${1:value}%'" },
  { label: "'value%'", desc: '以value开头', insertText: "'${1:value}%'" },
  { label: "'%value'", desc: '以value结尾', insertText: "'%${1:value}'" },
  { label: "'_value'", desc: '单字符+value', insertText: "'_${1:value}'" },
  { label: "'%_%'", desc: '包含任意字符', insertText: "'%_%'" },
]

// WHERE 子句中的条件关键字
const WHERE_KEYWORDS = [
  { label: 'AND', desc: '并且', insertText: 'AND ' },
  { label: 'OR', desc: '或者', insertText: 'OR ' },
  { label: 'NOT', desc: '非', insertText: 'NOT ' },
  { label: 'IN', desc: '在列表中', insertText: 'IN (${1:values})' },
  { label: 'BETWEEN', desc: '在范围内', insertText: 'BETWEEN ${1:start} AND ${2:end}' },
  { label: 'LIKE', desc: '模糊匹配', insertText: "LIKE '${1:%}'" },
  { label: 'IS', desc: 'IS 判断', insertText: 'IS ' },
  { label: 'NULL', desc: '空值', insertText: 'NULL' },
  { label: 'TRUE', desc: '真', insertText: 'TRUE' },
  { label: 'FALSE', desc: '假', insertText: 'FALSE' },
  { label: 'EXISTS', desc: '存在子查询', insertText: 'EXISTS (' },
]

// 分析 SQL 上下文（增强版）
function analyzeSqlContext(textBeforeCursor: string): {
  context: 'select_columns' | 'from_table' | 'where_condition' | 'where_after_column' | 'where_after_operator' | 'where_after_and_or' | 'join_table' | 'on_condition' | 'order_by' | 'group_by' | 'insert_table' | 'update_table' | 'set_column' | 'values' | 'into_columns' | 'general',
  tableAlias: Map<string, string>, // 别名 -> 表名
  currentTable: string | null, // 当前正在输入的表名（用于 table. 场景）
  referencedTables: string[], // 已引用的表名
  lastWord: string, // 最后一个单词
  lastColumn: string | null, // 最后一个字段名（用于操作符推荐）
  inLikePattern: boolean, // 是否在 LIKE 模式中
} {
  const text = textBeforeCursor.toUpperCase()
  const tableAlias = new Map<string, string>()
  let currentTable: string | null = null
  const referencedTables: string[] = []
  let lastColumn: string | null = null
  let inLikePattern = false
  
  // 提取表别名和引用的表 (FROM table AS alias 或 FROM table alias 或 JOIN table alias)
  const aliasRegex = /(?:FROM|JOIN|UPDATE)\s+[`\[\"]?(\w+)[`\]\"]?(?:\s+(?:AS\s+)?([A-Z]\w*))?/gi
  let match
  while ((match = aliasRegex.exec(textBeforeCursor)) !== null) {
    const tableName = match[1].toLowerCase()
    referencedTables.push(tableName)
    if (match[2]) {
      tableAlias.set(match[2].toLowerCase(), tableName)
    }
  }
  
  // 检查是否在 table. 后面（包括正在输入的情况 table.col）
  const dotMatch = textBeforeCursor.match(/[`\[\"]?(\w+)[`\]\"]?\.(\w*)$/i)
  if (dotMatch) {
    currentTable = dotMatch[1].toLowerCase()
    // 检查是否是别名
    if (tableAlias.has(currentTable)) {
      currentTable = tableAlias.get(currentTable)!
    }
  }
  
  // 获取最后一个单词
  const lastWordMatch = textBeforeCursor.match(/(\w+)\s*$/i)
  const lastWord = lastWordMatch ? lastWordMatch[1].toUpperCase() : ''
  
  // 检查是否在 LIKE 模式中
  if (/LIKE\s+['"]$/i.test(textBeforeCursor) || /LIKE\s+['"][^'"]*$/i.test(textBeforeCursor)) {
    inLikePattern = true
  }
  
  // 判断上下文
  let context: ReturnType<typeof analyzeSqlContext>['context'] = 'general'
  
  // 检查是否在括号内（INSERT INTO table (columns) 的情况）
  const lastOpenParen = textBeforeCursor.lastIndexOf('(')
  const lastCloseParen = textBeforeCursor.lastIndexOf(')')
  const inParentheses = lastOpenParen > lastCloseParen
  
  // 检查 INSERT INTO table ( 后面的上下文
  if (inParentheses) {
    const beforeParen = textBeforeCursor.substring(0, lastOpenParen)
    if (/INSERT\s+INTO\s+\w+\s*$/i.test(beforeParen)) {
      context = 'into_columns'
      return { context, tableAlias, currentTable, referencedTables, lastWord, lastColumn, inLikePattern }
    } else if (/VALUES\s*$/i.test(beforeParen)) {
      context = 'values'
      return { context, tableAlias, currentTable, referencedTables, lastWord, lastColumn, inLikePattern }
    }
  }
  
  // 找出最后一个关键字的位置，确定当前处于哪个子句中
  const keywordPositions: { keyword: string; index: number }[] = []
  const keywords = [
    'SELECT', 'FROM', 'WHERE', 'JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 
    'FULL JOIN', 'CROSS JOIN', 'ON', 'AND', 'OR', 'ORDER BY', 'GROUP BY', 
    'HAVING', 'INSERT INTO', 'UPDATE', 'SET', 'VALUES', 'LIMIT', 'OFFSET'
  ]
  
  for (const kw of keywords) {
    // 使用更精确的匹配，确保是独立的关键字
    const regex = new RegExp(`\\b${kw}\\b`, 'gi')
    let m
    while ((m = regex.exec(text)) !== null) {
      keywordPositions.push({ keyword: kw, index: m.index })
    }
  }
  
  // 按位置排序，找到最后一个关键字
  keywordPositions.sort((a, b) => b.index - a.index)
  
  // 辅助函数：检查是否在 WHERE 或 HAVING 子句中
  const isInWhereClause = () => {
    return keywordPositions.some(kp => 
      kp.keyword === 'WHERE' || kp.keyword === 'HAVING' || kp.keyword === 'AND' || kp.keyword === 'OR'
    ) && !keywordPositions.some(kp => 
      kp.keyword === 'ORDER BY' && kp.index > (keywordPositions.find(k => k.keyword === 'WHERE')?.index || -1)
    )
  }
  
  // 分析 WHERE 子句的细粒度上下文
  const analyzeWhereContext = (afterKeyword: string): typeof context => {
    const trimmed = afterKeyword.trim()
    
    // 如果后面是空的，说明刚输入完关键字，需要输入字段名
    if (!trimmed) {
      return 'where_condition'
    }
    
    // 检查最后的 token 来判断上下文
    // 模式: column operator value AND/OR column ...
    
    // 检查是否在操作符后面（刚输入完操作符，等待输入值）
    const afterOperatorMatch = trimmed.match(/(?:=|<>|!=|>=|<=|>|<|LIKE|NOT\s+LIKE|IN|NOT\s+IN|BETWEEN|IS\s+NOT|IS|REGEXP|~)\s*$/i)
    if (afterOperatorMatch) {
      return 'where_after_operator'
    }
    
    // 检查是否刚输入完字段名（准备输入操作符）
    // 字段名后面通常跟着空格，且不是关键字
    const lastToken = trimmed.split(/\s+/).pop() || ''
    const isKeyword = ALL_KEYWORDS.includes(lastToken.toUpperCase())
    const isOperator = /^(=|<>|!=|>=|<=|>|<|LIKE|NOT|IN|BETWEEN|IS|AND|OR|REGEXP|~)$/i.test(lastToken)
    
    // 如果最后一个 token 不是关键字也不是操作符，可能是字段名
    if (lastToken && !isKeyword && !isOperator && /^\w+$/.test(lastToken)) {
      // 检查是否有明确的字段名模式
      // 表.字段格式 或者 关键字后跟字段名
      if (/\w+\.\w+$/i.test(trimmed)) {
        // table.column 格式，推荐操作符
        lastColumn = lastToken.toLowerCase()
        return 'where_after_column'
      }
      // 检查上下文是否表明这是一个字段名
      // 如果最后一个非空 token 看起来像字段名（不是数字、不是字符串常量）
      if (!/^['"]/.test(lastToken) && !/^\d+$/.test(lastToken)) {
        // 如果前面的内容表明这是一个字段（而不是值）
        const tokens = trimmed.split(/\s+/)
        if (tokens.length === 1 || 
            (tokens.length >= 2 && /^(AND|OR|NOT)$/i.test(tokens[tokens.length - 2]))) {
          // 刚输入完字段名，推荐操作符
          lastColumn = lastToken.toLowerCase()
          return 'where_after_column'
        }
      }
    }
    
    // 检查是否刚输入完 AND 或 OR
    if (/\b(AND|OR)\s*$/i.test(trimmed)) {
      return 'where_after_and_or'
    }
    
    // 默认 WHERE 条件上下文（推荐字段）
    return 'where_condition'
  }
  
  if (keywordPositions.length > 0) {
    const lastKeyword = keywordPositions[0].keyword
    const afterKeyword = text.substring(keywordPositions[0].index + lastKeyword.length)
    
    switch (lastKeyword) {
      case 'SELECT':
        // SELECT 后面，如果还没有 FROM，提示字段
        if (!text.includes('FROM')) {
          context = 'select_columns'
        } else {
          context = 'general'
        }
        break
        
      case 'FROM':
      case 'INSERT INTO':
        // FROM 或 INSERT INTO 后面，提示表名
        // 检查是否已经输入了表名（有空格分隔的后续内容且不是继续输入表名）
        if (/^\s+\w+\s+/i.test(afterKeyword)) {
          // 已经输入了完整的表名，不再提示
          context = 'general'
        } else {
          context = lastKeyword === 'FROM' ? 'from_table' : 'insert_table'
        }
        break
        
      case 'UPDATE':
        if (/^\s+\w+\s+/i.test(afterKeyword)) {
          context = 'general'
        } else {
          context = 'update_table'
        }
        break
        
      case 'INNER JOIN':
      case 'LEFT JOIN':
      case 'RIGHT JOIN':
      case 'FULL JOIN':
      case 'CROSS JOIN':
      case 'JOIN':
        if (/^\s+\w+\s+/i.test(afterKeyword)) {
          context = 'general'
        } else {
          context = 'join_table'
        }
        break
        
      case 'ON':
        context = 'on_condition'
        break
        
      case 'WHERE':
      case 'HAVING':
        // 细粒度分析 WHERE 子句
        context = analyzeWhereContext(afterKeyword)
        break
        
      case 'AND':
      case 'OR':
        // 检查是否在 WHERE 子句中（而不是 BETWEEN x AND y）
        if (isInWhereClause()) {
          // 检查是否是 BETWEEN ... AND 的情况
          const beforeAnd = text.substring(0, keywordPositions[0].index)
          if (lastKeyword === 'AND' && /BETWEEN\s+\S+\s*$/i.test(beforeAnd)) {
            // BETWEEN ... AND 的情况，提示值
            context = 'where_after_operator'
          } else {
            context = analyzeWhereContext(afterKeyword)
          }
        } else {
          context = 'general'
        }
        break
        
      case 'ORDER BY':
        context = 'order_by'
        break
        
      case 'GROUP BY':
        context = 'group_by'
        break
        
      case 'SET':
        context = 'set_column'
        break
        
      case 'VALUES':
        context = 'values'
        break
        
      default:
        context = 'general'
    }
  }
  
  return { context, tableAlias, currentTable, referencedTables, lastWord, lastColumn, inLikePattern }
}

export default function SqlEditor({ value, onChange, onRun, onSave, onOpen, onFormat, databases, tables, columns, onFetchTableColumns }: Props) {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof monaco | null>(null)
  const disposableRef = useRef<monaco.IDisposable | null>(null)
  
  // 用于追踪正在加载的表和已请求的表
  const loadingTablesRef = useRef<Set<string>>(new Set())
  const requestedTablesRef = useRef<Set<string>>(new Set())
  
  // 使用 ref 保存最新的数据和回调
  const dataRef = useRef({ databases, tables, columns })
  const callbacksRef = useRef({ onRun, onSave, onOpen, onFormat, onFetchTableColumns })
  
  // 更新 ref 中的数据
  useEffect(() => {
    dataRef.current = { databases, tables, columns }
  }, [databases, tables, columns])
  
  // 更新 ref 中的回调
  useEffect(() => {
    callbacksRef.current = { onRun, onSave, onOpen, onFormat, onFetchTableColumns }
  }, [onRun, onSave, onOpen, onFormat, onFetchTableColumns])
  
  // 自动获取 SQL 中引用的表的列信息
  const fetchReferencedTableColumns = useCallback(async (referencedTables: string[]) => {
    const { columns: cols } = dataRef.current
    const { onFetchTableColumns: fetchFn } = callbacksRef.current
    
    if (!fetchFn) return
    
    for (const tableName of referencedTables) {
      // 检查是否已有列信息
      const hasColumns = cols.has(tableName) || 
        [...cols.keys()].some(name => name.toLowerCase() === tableName.toLowerCase())
      
      // 检查是否已经请求过或正在加载
      if (hasColumns || requestedTablesRef.current.has(tableName) || loadingTablesRef.current.has(tableName)) {
        continue
      }
      
      // 标记为正在加载
      loadingTablesRef.current.add(tableName)
      requestedTablesRef.current.add(tableName)
      
      try {
        await fetchFn(tableName)
      } catch (e) {
        console.error(`获取表 ${tableName} 列信息失败:`, e)
      } finally {
        loadingTablesRef.current.delete(tableName)
      }
    }
  }, [])

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
        
        const { context, tableAlias, currentTable, referencedTables, lastColumn, inLikePattern } = analyzeSqlContext(textBeforeCursor)

        // 获取最新的数据
        const { databases: dbs, tables: tbls, columns: cols } = dataRef.current

        // 自动获取引用表的列信息（异步，不阻塞补全）
        const tablesToFetch = [...referencedTables]
        if (currentTable && !tablesToFetch.includes(currentTable)) {
          tablesToFetch.push(currentTable)
        }
        if (tablesToFetch.length > 0) {
          fetchReferencedTableColumns(tablesToFetch)
        }

        const suggestions: monaco.languages.CompletionItem[] = []

        // 如果在 table. 后面，只提示该表的字段
        if (currentTable) {
          // 检查是否有该表的列信息
          const tableColumns = cols.get(currentTable) || 
            [...cols.entries()].find(([name]) => name.toLowerCase() === currentTable)?.[1]
          
          if (tableColumns) {
            // 添加 * 选项在最前
            suggestions.push({
              label: '*',
              kind: monacoInstance.languages.CompletionItemKind.Constant,
              insertText: '*',
              range,
              detail: '所有字段',
              sortText: '!0',
            })
            
            tableColumns.forEach((col, idx) => {
              const isPK = col.key === 'PRI'
              suggestions.push({
                label: col.name,
                kind: monacoInstance.languages.CompletionItemKind.Field,
                insertText: col.name,
                range,
                detail: `${col.type}${isPK ? ' 🔑' : ''}${col.comment ? ' · ' + col.comment : ''}`,
                documentation: {
                  value: `**${currentTable}.${col.name}**\n\n` +
                    `- 类型: \`${col.type}\`\n` +
                    `- 可空: ${col.nullable ? '✅ 是' : '❌ 否'}\n` +
                    (col.key ? `- 键: ${col.key}\n` : '') +
                    (col.comment ? `- 备注: ${col.comment}` : '')
                },
                sortText: '!1' + (isPK ? '0' : '1') + String(idx).padStart(3, '0'),
              })
            })
          }
          return { suggestions }
        }
        
        // 获取当前语句中引用的表的列
        const getReferencedTableColumns = () => {
          const result: Array<{ tableName: string; col: ColumnInfo }> = []
          for (const tableName of referencedTables) {
            const tableColumns = cols.get(tableName) || 
              [...cols.entries()].find(([name]) => name.toLowerCase() === tableName)?.[1]
            if (tableColumns) {
              tableColumns.forEach(col => result.push({ tableName, col }))
            }
          }
          return result
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

        // 添加当前引用表的字段（优先显示）
        const addReferencedColumns = (priority: string = '0') => {
          const refCols = getReferencedTableColumns()
          if (refCols.length > 0) {
            refCols.forEach(({ tableName, col }, idx) => {
              const isPK = col.key === 'PRI'
              const label = referencedTables.length > 1 ? `${tableName}.${col.name}` : col.name
              suggestions.push({
                label,
                kind: monacoInstance.languages.CompletionItemKind.Field,
                insertText: label,
                range,
                detail: `${col.type}${isPK ? ' 🔑' : ''}${col.comment ? ' · ' + col.comment : ''}`,
                documentation: {
                  value: `**${tableName}.${col.name}**\n\n` +
                    `- 类型: \`${col.type}\`\n` +
                    `- 可空: ${col.nullable ? '✅ 是' : '❌ 否'}\n` +
                    (col.key ? `- 键: ${col.key}\n` : '') +
                    (col.comment ? `- 备注: ${col.comment}` : '')
                },
                sortText: priority + (isPK ? '0' : '1') + String(idx).padStart(4, '0'),
              })
            })
          }
        }

        // 添加操作符建议
        const addOperators = (priority: string = '!0') => {
          SQL_OPERATORS.forEach((op, idx) => {
            const isSnippet = op.insertText.includes('${')
            suggestions.push({
              label: op.label,
              kind: monacoInstance.languages.CompletionItemKind.Operator,
              insertText: op.insertText,
              insertTextRules: isSnippet 
                ? monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet 
                : undefined,
              range,
              detail: `⚡ ${op.desc}`,
              sortText: priority + String(idx).padStart(2, '0'),
            })
          })
        }
        
        // 添加 WHERE 条件关键字
        const addWhereKeywords = (priority: string = '!0') => {
          WHERE_KEYWORDS.forEach((kw, idx) => {
            const isSnippet = kw.insertText.includes('${')
            suggestions.push({
              label: kw.label,
              kind: monacoInstance.languages.CompletionItemKind.Keyword,
              insertText: kw.insertText,
              insertTextRules: isSnippet 
                ? monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet 
                : undefined,
              range,
              detail: `🔑 ${kw.desc}`,
              sortText: priority + String(idx).padStart(2, '0'),
            })
          })
        }
        
        // 添加 LIKE 模式模板
        const addLikePatterns = (priority: string = '!0') => {
          LIKE_PATTERNS.forEach((pattern, idx) => {
            suggestions.push({
              label: pattern.label,
              kind: monacoInstance.languages.CompletionItemKind.Value,
              insertText: pattern.insertText,
              insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range,
              detail: `🎯 ${pattern.desc}`,
              sortText: priority + String(idx).padStart(2, '0'),
            })
          })
        }
        
        // 添加表名（带别名格式）用于 WHERE 条件
        const addTablesForCondition = (priority: string = '2') => {
          tbls.forEach(table => {
            // 表名.字段名 的补全
            suggestions.push({
              label: table.name + '.',
              kind: monacoInstance.languages.CompletionItemKind.Class,
              insertText: table.name + '.',
              range,
              detail: `📋 ${table.name} 的字段`,
              command: {
                id: 'editor.action.triggerSuggest',
                title: 'Trigger Suggest'
              },
              sortText: priority + table.name,
            })
          })
        }

        // 根据上下文添加建议
        switch (context) {
          case 'select_columns':
            // SELECT 后优先提示：* -> 当前表字段 -> 聚合函数 -> 其他表字段
            suggestions.push({
              label: '*',
              kind: monacoInstance.languages.CompletionItemKind.Constant,
              insertText: '*',
              range,
              detail: '所有字段',
              sortText: '!00',
            })
            addReferencedColumns('!1')  // 优先显示当前引用表的字段
            addFunctions(['aggregate', 'window'], '!2')  // 聚合和窗口函数次之
            addColumns('2', false)  // 其他表字段（不带表名前缀，更简洁）
            addFunctions(['string', 'datetime', 'conditional'], '3')
            return { suggestions }  // 直接返回
            
          case 'from_table':
          case 'join_table':
          case 'insert_table':
          case 'update_table':
            // FROM/JOIN/INSERT/UPDATE 后 只 提示表名和数据库，直接返回
            addTables('!0')  // 表名最优先
            // 如果没有表列表，从 columns 的键中提取表名作为备选
            if (tbls.length === 0 && cols.size > 0) {
              cols.forEach((_, tableName) => {
                suggestions.push({
                  label: tableName,
                  kind: monacoInstance.languages.CompletionItemKind.Class,
                  insertText: tableName,
                  range,
                  detail: '📋 表',
                  sortText: '!0' + tableName,
                })
              })
            }
            addDatabases('1')
            // 如果完全没有数据，添加提示
            if (suggestions.length === 0) {
              suggestions.push({
                label: '请先选择数据库',
                kind: monacoInstance.languages.CompletionItemKind.Text,
                insertText: '',
                range,
                detail: '💡 提示：请在上方选择连接和数据库',
                sortText: '0',
              })
            }
            return { suggestions }  // 直接返回，不添加代码片段
            
          case 'where_condition':
          case 'on_condition':
            // WHERE/ON 后优先提示当前表字段
            addReferencedColumns('!0')  // 当前引用表字段最优先
            addColumns('!1', false)  // 所有表字段（不带前缀，更简洁）
            addWhereKeywords('3')  // AND, OR 等关键字
            addTablesForCondition('4')  // 表名（可触发字段补全）- 降低优先级
            addFunctions(['conditional', 'string', 'datetime'], '5')
            addDatabases('6')
            return { suggestions }
            
          case 'where_after_column':
            // 字段名后，优先推荐操作符
            addOperators('!0')
            addWhereKeywords('1')
            return { suggestions }
            
          case 'where_after_operator':
            // 操作符后，推荐值相关的内容
            if (inLikePattern) {
              addLikePatterns('!0')
            }
            // 先推荐常用值
            suggestions.push({
              label: 'NULL',
              kind: monacoInstance.languages.CompletionItemKind.Constant,
              insertText: 'NULL',
              range,
              detail: '空值',
              sortText: '!00',
            })
            addReferencedColumns('!1')  // 可能是子查询或关联字段
            addFunctions(['datetime', 'string', 'conditional'], '!2')
            addLikePatterns('2')  // LIKE 模式备选
            addWhereKeywords('3')
            return { suggestions }
            
          case 'where_after_and_or':
            // AND/OR 后，开始新条件，推荐字段名
            addReferencedColumns('!0')  // 当前引用表字段最优先
            addColumns('!1', false)  // 所有表字段（不带前缀）
            // 也可以是 NOT, EXISTS 等
            suggestions.push({
              label: 'NOT',
              kind: monacoInstance.languages.CompletionItemKind.Keyword,
              insertText: 'NOT ',
              range,
              detail: '🔑 非',
              sortText: '2not',
            })
            suggestions.push({
              label: 'EXISTS',
              kind: monacoInstance.languages.CompletionItemKind.Keyword,
              insertText: 'EXISTS (${1:SELECT 1 FROM table WHERE condition})',
              insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range,
              detail: '🔑 存在子查询',
              sortText: '2exists',
            })
            addTablesForCondition('3')  // 表名（降低优先级）
            addFunctions(['conditional'], '4')
            addDatabases('5')
            return { suggestions }
            
          case 'order_by':
          case 'group_by':
            // ORDER BY/GROUP BY 后优先提示当前表字段
            addReferencedColumns('!0')
            addColumns('2', false)
            if (context === 'group_by') {
              addFunctions(['aggregate'], '3')
            }
            // ORDER BY 后提示 ASC/DESC
            if (context === 'order_by') {
              suggestions.push({
                label: 'ASC',
                kind: monacoInstance.languages.CompletionItemKind.Keyword,
                insertText: 'ASC',
                range,
                detail: '🔑 升序',
                sortText: '1asc',
              })
              suggestions.push({
                label: 'DESC',
                kind: monacoInstance.languages.CompletionItemKind.Keyword,
                insertText: 'DESC',
                range,
                detail: '🔑 降序',
                sortText: '1desc',
              })
            }
            return { suggestions }
            
          case 'set_column':
          case 'into_columns':
            // SET/INSERT (columns) 后只提示当前表字段
            addReferencedColumns('!0')
            if (context === 'set_column') {
              addFunctions(['conditional', 'string', 'datetime', 'numeric'], '2')
            }
            return { suggestions }
            
          case 'values':
            // VALUES 后提示函数和关键字
            addFunctions(['datetime', 'string', 'conditional'], '!0')
            addKeywords('2')
            return { suggestions }
            
          default:
            // 通用情况 - 关键字优先
            addKeywords('!0')
            addTables('1')
            addColumns('2', true)
            addFunctions(undefined, '3')
            addDatabases('4')
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
      theme="vs"
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
