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

// SQL 关键字
const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN',
  'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'ALTER', 'DROP',
  'TABLE', 'DATABASE', 'INDEX', 'VIEW', 'TRIGGER', 'PROCEDURE', 'FUNCTION',
  'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS', 'ON', 'USING',
  'GROUP', 'BY', 'HAVING', 'ORDER', 'ASC', 'DESC', 'LIMIT', 'OFFSET',
  'UNION', 'ALL', 'DISTINCT', 'AS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'NULL', 'IS', 'TRUE', 'FALSE', 'EXISTS', 'ANY', 'SOME',
  'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'UNIQUE', 'CHECK', 'DEFAULT',
  'AUTO_INCREMENT', 'NOT NULL', 'CONSTRAINT'
]

// SQL 函数
const SQL_FUNCTIONS = [
  'COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'GROUP_CONCAT',
  'CONCAT', 'SUBSTRING', 'LENGTH', 'UPPER', 'LOWER', 'TRIM', 'LTRIM', 'RTRIM',
  'REPLACE', 'REVERSE', 'LEFT', 'RIGHT', 'LPAD', 'RPAD', 'INSTR', 'LOCATE',
  'ABS', 'CEIL', 'FLOOR', 'ROUND', 'MOD', 'POWER', 'SQRT', 'RAND',
  'NOW', 'CURDATE', 'CURTIME', 'DATE', 'TIME', 'YEAR', 'MONTH', 'DAY',
  'HOUR', 'MINUTE', 'SECOND', 'DATE_FORMAT', 'DATE_ADD', 'DATE_SUB', 'DATEDIFF',
  'IF', 'IFNULL', 'NULLIF', 'COALESCE', 'GREATEST', 'LEAST',
  'CAST', 'CONVERT',
]

// 数据类型
const SQL_TYPES = [
  'INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT',
  'DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE', 'REAL',
  'VARCHAR', 'CHAR', 'TEXT', 'LONGTEXT', 'MEDIUMTEXT', 'TINYTEXT',
  'DATE', 'TIME', 'DATETIME', 'TIMESTAMP', 'YEAR',
  'BOOLEAN', 'BOOL', 'BLOB', 'JSON', 'ENUM', 'SET'
]

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
      triggerCharacters: ['.', ' ', '`'],
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position)
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        }

        // 获取最新的数据
        const { databases: dbs, tables: tbls, columns: cols } = dataRef.current

        const suggestions: monaco.languages.CompletionItem[] = []

        // SQL 关键字
        SQL_KEYWORDS.forEach(keyword => {
          suggestions.push({
            label: keyword,
            kind: monacoInstance.languages.CompletionItemKind.Keyword,
            insertText: keyword,
            range,
            detail: '关键字',
            sortText: '3' + keyword,
          })
          // 小写版本
          suggestions.push({
            label: keyword.toLowerCase(),
            kind: monacoInstance.languages.CompletionItemKind.Keyword,
            insertText: keyword.toLowerCase(),
            range,
            detail: '关键字',
            sortText: '3' + keyword,
          })
        })

        // SQL 函数
        SQL_FUNCTIONS.forEach(func => {
          suggestions.push({
            label: func,
            kind: monacoInstance.languages.CompletionItemKind.Function,
            insertText: `${func}($0)`,
            insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
            detail: '函数',
            sortText: '4' + func,
          })
        })

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

        // 数据库名 - 高优先级
        dbs.forEach(db => {
          suggestions.push({
            label: db,
            kind: monacoInstance.languages.CompletionItemKind.Module,
            insertText: `\`${db}\``,
            range,
            detail: '📁 数据库',
            sortText: '0' + db,
          })
        })

        // 表名 - 高优先级
        tbls.forEach(table => {
          suggestions.push({
            label: table.name,
            kind: monacoInstance.languages.CompletionItemKind.Class,
            insertText: table.name,
            range,
            detail: `📋 表 (${table.rows} 行)`,
            sortText: '1' + table.name,
          })
          // 带反引号版本
          suggestions.push({
            label: `\`${table.name}\``,
            kind: monacoInstance.languages.CompletionItemKind.Class,
            insertText: `\`${table.name}\``,
            range,
            detail: `📋 表 (${table.rows} 行)`,
            sortText: '1' + table.name,
          })
        })

        // 字段名 - 高优先级
        cols.forEach((colList, tableName) => {
          colList.forEach(col => {
            const comment = col.comment ? ` - ${col.comment}` : ''
            suggestions.push({
              label: col.name,
              kind: monacoInstance.languages.CompletionItemKind.Field,
              insertText: col.name,
              range,
              detail: `📌 ${tableName}.${col.name}`,
              documentation: `类型: ${col.type}\n可空: ${col.nullable ? '是' : '否'}${col.key ? `\n键: ${col.key}` : ''}${comment}`,
              sortText: '2' + col.name,
            })
            // 带表名前缀版本
            suggestions.push({
              label: `${tableName}.${col.name}`,
              kind: monacoInstance.languages.CompletionItemKind.Field,
              insertText: `${tableName}.${col.name}`,
              range,
              detail: `📌 字段 (${col.type})`,
              documentation: `类型: ${col.type}\n可空: ${col.nullable ? '是' : '否'}${col.key ? `\n键: ${col.key}` : ''}${comment}`,
              sortText: '2' + tableName + col.name,
            })
          })
        })

        // 常用代码片段
        const snippets = [
          { label: 'sel', insertText: 'SELECT * FROM ${1:table} WHERE ${2:condition}', detail: 'SELECT 模板' },
          { label: 'selc', insertText: 'SELECT COUNT(*) FROM ${1:table}', detail: 'COUNT 模板' },
          { label: 'selt', insertText: 'SELECT * FROM ${1:table} LIMIT ${2:10}', detail: 'SELECT TOP 模板' },
          { label: 'ins', insertText: 'INSERT INTO ${1:table} (${2:columns}) VALUES (${3:values})', detail: 'INSERT 模板' },
          { label: 'upd', insertText: 'UPDATE ${1:table} SET ${2:column} = ${3:value} WHERE ${4:condition}', detail: 'UPDATE 模板' },
          { label: 'del', insertText: 'DELETE FROM ${1:table} WHERE ${2:condition}', detail: 'DELETE 模板' },
          { label: 'crt', insertText: 'CREATE TABLE ${1:table_name} (\n  id INT PRIMARY KEY AUTO_INCREMENT,\n  ${2:column} ${3:type}\n)', detail: 'CREATE TABLE 模板' },
          { label: 'join', insertText: 'SELECT * FROM ${1:table1} t1\nINNER JOIN ${2:table2} t2 ON t1.${3:id} = t2.${4:id}', detail: 'JOIN 模板' },
          { label: 'ljoin', insertText: 'SELECT * FROM ${1:table1} t1\nLEFT JOIN ${2:table2} t2 ON t1.${3:id} = t2.${4:id}', detail: 'LEFT JOIN 模板' },
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
