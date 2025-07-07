import mysql from 'mysql2/promise';
import { safeFetch } from './fetchs.js';

interface MySQLConnection {
  host: string;
  port?: number;
  username: string;
  password: string;
  database: string;
}

interface MySQLTableInfo {
  name: string;
  columns: Array<{
    name: string;
    type: string;
    nullable: boolean;
    default?: string;
    key?: string;
    extra?: string;
  }>;
  rowCount: number;
  size: string;
  indexes: Array<{
    name: string;
    columns: string[];
    unique: boolean;
  }>;
}

interface MySQLAnalysis {
  databaseName: string;
  version: string;
  tables: MySQLTableInfo[];
  totalTables: number;
  totalSize: string;
  charset: string;
  collation: string;
}

interface QueryResult {
  columns: string[];
  rows: any[];
  affectedRows?: number;
  executionTime: number;
}

/**
 * Crea una conexión a MySQL
 */
async function createMySQLConnection(config: MySQLConnection) {
  return await mysql.createConnection({
    host: config.host,
    port: config.port || 3306,
    user: config.username,
    password: config.password,
    database: config.database,
  });
}

/**
 * Analiza completamente una base de datos MySQL
 */
async function analyzeMySQLDatabase(config: MySQLConnection): Promise<MySQLAnalysis> {
  const conn = await createMySQLConnection(config);

  try {
    // Obtener información básica
    const [versionResult] = await conn.execute('SELECT VERSION() as version');
    const version = (versionResult as any)[0]?.version;

    const [charsetResult] = await conn.execute(
      'SELECT DEFAULT_CHARACTER_SET_NAME as charset, DEFAULT_COLLATION_NAME as collation FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?',
      [config.database]
    );
    const { charset, collation } = (charsetResult as any)[0] || {};

    // Obtener todas las tablas con información detallada
    const [tablesResult] = await conn.execute(`
      SELECT 
        TABLE_NAME,
        TABLE_ROWS,
        DATA_LENGTH,
        INDEX_LENGTH,
        (DATA_LENGTH + INDEX_LENGTH) as TOTAL_SIZE
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
    `, [config.database]);

    const tables: MySQLTableInfo[] = [];
    
    for (const table of tablesResult as any[]) {
      const tableName = table.TABLE_NAME;
      
      // Obtener información de columnas
      const [columnsResult] = await conn.execute(`
        SELECT 
          COLUMN_NAME,
          DATA_TYPE,
          IS_NULLABLE,
          COLUMN_DEFAULT,
          COLUMN_KEY,
          EXTRA
        FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
      `, [config.database, tableName]);

      const columns = (columnsResult as any[]).map(col => ({
        name: col.COLUMN_NAME,
        type: col.DATA_TYPE,
        nullable: col.IS_NULLABLE === 'YES',
        default: col.COLUMN_DEFAULT,
        key: col.COLUMN_KEY,
        extra: col.EXTRA,
      }));

      // Obtener índices
      const [indexesResult] = await conn.execute(`
        SELECT 
          INDEX_NAME,
          COLUMN_NAME,
          NON_UNIQUE
        FROM information_schema.STATISTICS 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        ORDER BY INDEX_NAME, SEQ_IN_INDEX
      `, [config.database, tableName]);

      const indexMap = new Map<string, { columns: string[], unique: boolean }>();
      for (const idx of indexesResult as any[]) {
        if (!indexMap.has(idx.INDEX_NAME)) {
          indexMap.set(idx.INDEX_NAME, {
            columns: [],
            unique: idx.NON_UNIQUE === 0,
          });
        }
        indexMap.get(idx.INDEX_NAME)!.columns.push(idx.COLUMN_NAME);
      }

      const indexes = Array.from(indexMap.entries()).map(([name, info]) => ({
        name,
        columns: info.columns,
        unique: info.unique,
      }));

      tables.push({
        name: tableName,
        columns,
        rowCount: table.TABLE_ROWS || 0,
        size: `${Math.round(table.TOTAL_SIZE / 1024)} KB`,
        indexes,
      });
    }

    // Calcular tamaño total
    const totalSizeBytes = (tablesResult as any[]).reduce((sum, table) => sum + (table.TOTAL_SIZE || 0), 0);
    const totalSize = `${Math.round(totalSizeBytes / 1024 / 1024)} MB`;

    return {
      databaseName: config.database,
      version,
      tables,
      totalTables: tables.length,
      totalSize,
      charset,
      collation,
    };
  } finally {
    await conn.end();
  }
}

/**
 * Ejecuta una query personalizada en MySQL
 */
async function executeMySQLQuery(config: MySQLConnection, query: string): Promise<QueryResult> {
  const conn = await createMySQLConnection(config);
  const startTime = Date.now();

  try {
    const [result, fields] = await conn.execute(query);
    const executionTime = Date.now() - startTime;

    if (Array.isArray(result)) {
      // SELECT query
      const columns = fields ? fields.map(field => field.name) : [];
      return {
        columns,
        rows: result,
        executionTime,
      };
    } else {
      // INSERT/UPDATE/DELETE query
      return {
        columns: [],
        rows: [],
        affectedRows: (result as any).affectedRows,
        executionTime,
      };
    }
  } finally {
    await conn.end();
  }
}

/**
 * Busca datos específicos en MySQL usando texto libre
 */
async function searchMySQLData(config: MySQLConnection, searchTerm: string, tables?: string[]): Promise<any[]> {
  const conn = await createMySQLConnection(config);

  try {
    const results: any[] = [];
    
    // Si no se especifican tablas, buscar en todas
    if (!tables || tables.length === 0) {
      const [tablesResult] = await conn.execute(
        'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = "BASE TABLE"',
        [config.database]
      );
      tables = (tablesResult as any[]).map(row => row.TABLE_NAME);
    }

    for (const tableName of tables) {
      // Obtener columnas de texto de la tabla
      const [columnsResult] = await conn.execute(`
        SELECT COLUMN_NAME 
        FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? 
        AND DATA_TYPE IN ('varchar', 'text', 'longtext', 'mediumtext', 'tinytext', 'char')
      `, [config.database, tableName]);

      const textColumns = (columnsResult as any[]).map(col => col.COLUMN_NAME);

      if (textColumns.length > 0) {
        // Construir query de búsqueda
        const whereClause = textColumns.map(col => `${col} LIKE ?`).join(' OR ');
        const searchParams = textColumns.map(() => `%${searchTerm}%`);

        const [searchResult] = await conn.execute(
          `SELECT * FROM ${tableName} WHERE ${whereClause} LIMIT 100`,
          searchParams
        );

        if ((searchResult as any[]).length > 0) {
          results.push({
            table: tableName,
            matches: searchResult,
          });
        }
      }
    }

    return results;
  } finally {
    await conn.end();
  }
}

/**
 * Genera embeddings para datos de MySQL usando una API externa
 */
async function generateMySQLEmbeddings(
  config: MySQLConnection, 
  tableName: string, 
  textColumn: string,
  embeddingApiUrl: string = 'http://localhost:11434/api/embeddings'
): Promise<any[]> {
  const conn = await createMySQLConnection(config);

  try {
    // Obtener datos de texto
    const [textData] = await conn.execute(
      `SELECT id, ${textColumn} FROM ${tableName} WHERE ${textColumn} IS NOT NULL AND ${textColumn} != '' LIMIT 1000`
    );

    const results = [];
    
    for (const row of textData as any[]) {
      try {
        // Generar embedding usando Ollama
        const embeddingResponse = await safeFetch(embeddingApiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: row[textColumn],
            model: 'nomic-embed-text',
          }),
        });

        results.push({
          id: row.id,
          text: row[textColumn],
          embedding: (embeddingResponse as any).embedding,
        });
      } catch (error) {
        console.error(`Error generating embedding for row ${row.id}:`, error);
      }
    }

    return results;
  } finally {
    await conn.end();
  }
}

export {
  analyzeMySQLDatabase,
  executeMySQLQuery,
  searchMySQLData,
  generateMySQLEmbeddings,
  type MySQLConnection,
  type MySQLAnalysis,
  type QueryResult,
  createMySQLConnection,
}; 