import pkg from 'pg';
import { safeFetch } from './fetchs.js';
import { getEmbedding } from './ollama.js';

const { Pool } = pkg;

interface PostgreSQLConnection {
  host: string;
  port?: number;
  username: string;
  password: string;
  database: string;
  ssl?: boolean;
}

interface PostgreSQLTableInfo {
  name: string;
  schema: string;
  columns: Array<{
    name: string;
    type: string;
    nullable: boolean;
    default?: string;
    primaryKey: boolean;
    foreignKey?: {
      table: string;
      column: string;
    };
  }>;
  rowCount: number;
  size: string;
  indexes: Array<{
    name: string;
    columns: string[];
    unique: boolean;
    type: string;
  }>;
}

interface PostgreSQLAnalysis {
  databaseName: string;
  version: string;
  tables: PostgreSQLTableInfo[];
  totalTables: number;
  totalSize: string;
  schemas: string[];
  extensions: string[];
}

interface PostgreSQLQueryResult {
  columns: string[];
  rows: any[];
  rowCount: number;
  executionTime: number;
}

/**
 * Crea una conexión a PostgreSQL
 */
function createPostgreSQLPool(config: PostgreSQLConnection) {
  return new Pool({
    host: config.host,
    port: config.port || 5432,
    user: config.username,
    password: config.password,
    database: config.database,
    ssl: config.ssl,
  });
}

/**
 * Analiza completamente una base de datos PostgreSQL
 */
async function analyzePostgreSQLDatabase(config: PostgreSQLConnection): Promise<PostgreSQLAnalysis> {
  const pool = createPostgreSQLPool(config);

  try {
    // Obtener versión
    const versionResult = await pool.query('SELECT version()');
    const version = versionResult.rows[0]?.version;

    // Obtener esquemas
    const schemasResult = await pool.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
    `);
    const schemas = schemasResult.rows.map(row => row.schema_name);

    // Obtener extensiones
    const extensionsResult = await pool.query('SELECT extname FROM pg_extension');
    const extensions = extensionsResult.rows.map(row => row.extname);

    // Obtener todas las tablas con información detallada
    const tablesResult = await pool.query(`
      SELECT 
        t.table_name,
        t.table_schema,
        pg_stat_user_tables.n_tup_ins + pg_stat_user_tables.n_tup_upd + pg_stat_user_tables.n_tup_del as row_count,
        pg_total_relation_size(pgc.oid) as size_bytes
      FROM information_schema.tables t
      LEFT JOIN pg_class pgc ON pgc.relname = t.table_name
      LEFT JOIN pg_stat_user_tables ON pg_stat_user_tables.relname = t.table_name
      WHERE t.table_type = 'BASE TABLE' AND t.table_schema = ANY($1)
      ORDER BY t.table_schema, t.table_name
    `, [schemas]);

    const tables: PostgreSQLTableInfo[] = [];
    
    for (const table of tablesResult.rows) {
      const tableName = table.table_name;
      const tableSchema = table.table_schema;
      
      // Obtener información de columnas
      const columnsResult = await pool.query(`
        SELECT 
          c.column_name,
          c.data_type,
          c.is_nullable,
          c.column_default,
          CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key,
          fk.foreign_table_name,
          fk.foreign_column_name
        FROM information_schema.columns c
        LEFT JOIN (
          SELECT ku.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name
          WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_name = $1 AND tc.table_schema = $2
        ) pk ON c.column_name = pk.column_name
        LEFT JOIN (
          SELECT 
            kcu.column_name,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
          JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
          WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = $1 AND tc.table_schema = $2
        ) fk ON c.column_name = fk.column_name
        WHERE c.table_name = $1 AND c.table_schema = $2
        ORDER BY c.ordinal_position
      `, [tableName, tableSchema]);

      const columns = columnsResult.rows.map(col => ({
        name: col.column_name,
        type: col.data_type,
        nullable: col.is_nullable === 'YES',
        default: col.column_default,
        primaryKey: col.is_primary_key,
        foreignKey: col.foreign_table_name ? {
          table: col.foreign_table_name,
          column: col.foreign_column_name,
        } : undefined,
      }));

      // Obtener índices
      const indexesResult = await pool.query(`
        SELECT 
          i.indexname,
          i.indexdef,
          ix.indisunique,
          am.amname as index_type,
          array_agg(a.attname ORDER BY a.attnum) as columns
        FROM pg_indexes i
        JOIN pg_class c ON c.relname = i.indexname
        JOIN pg_index ix ON ix.indexrelid = c.oid
        JOIN pg_am am ON am.oid = c.relam
        JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = ANY(ix.indkey)
        WHERE i.tablename = $1 AND i.schemaname = $2
        GROUP BY i.indexname, i.indexdef, ix.indisunique, am.amname
      `, [tableName, tableSchema]);

      const indexes = indexesResult.rows.map(idx => ({
        name: idx.indexname,
        columns: idx.columns,
        unique: idx.indisunique,
        type: idx.index_type,
      }));

      tables.push({
        name: tableName,
        schema: tableSchema,
        columns,
        rowCount: parseInt(table.row_count) || 0,
        size: table.size_bytes ? `${Math.round(table.size_bytes / 1024)} KB` : 'N/A',
        indexes,
      });
    }

    // Calcular tamaño total
    const totalSizeBytes = tablesResult.rows.reduce((sum, table) => sum + (table.size_bytes || 0), 0);
    const totalSize = `${Math.round(totalSizeBytes / 1024 / 1024)} MB`;

    return {
      databaseName: config.database,
      version,
      tables,
      totalTables: tables.length,
      totalSize,
      schemas,
      extensions,
    };
  } finally {
    await pool.end();
  }
}

/**
 * Ejecuta una query personalizada en PostgreSQL
 */
async function executePostgreSQLQuery(config: PostgreSQLConnection, query: string, params?: any[]): Promise<PostgreSQLQueryResult> {
  const pool = createPostgreSQLPool(config);
  const startTime = Date.now();

  try {
    const result = await pool.query(query, params);
    const executionTime = Date.now() - startTime;

    return {
      columns: result.fields.map(field => field.name),
      rows: result.rows,
      rowCount: result.rowCount || 0,
      executionTime,
    };
  } finally {
    await pool.end();
  }
}

/**
 * Busca datos específicos en PostgreSQL usando texto libre
 */
async function searchPostgreSQLData(config: PostgreSQLConnection, searchTerm: string, tables?: string[]): Promise<any[]> {
  const pool = createPostgreSQLPool(config);

  try {
    const results: any[] = [];
    
    // Si no se especifican tablas, buscar en todas las tablas públicas
    if (!tables || tables.length === 0) {
      const tablesResult = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      `);
      tables = tablesResult.rows.map(row => row.table_name);
    }

    for (const tableName of tables) {
      // Obtener columnas de texto de la tabla
      const columnsResult = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1 
        AND data_type IN ('text', 'varchar', 'character varying', 'char', 'character')
      `, [tableName]);

      const textColumns = columnsResult.rows.map(col => col.column_name);

      if (textColumns.length > 0) {
        // Construir query de búsqueda usando full-text search si está disponible
        try {
          // Intentar búsqueda de texto completo
          const tsQuery = `SELECT * FROM ${tableName} WHERE to_tsvector('english', ${textColumns.join(' || \' \' || ')}) @@ plainto_tsquery('english', $1) LIMIT 100`;
          const searchResult = await pool.query(tsQuery, [searchTerm]);
          
          if (searchResult.rows.length > 0) {
            results.push({
              table: tableName,
              searchType: 'fulltext',
              matches: searchResult.rows,
            });
          }
        } catch (error) {
          // Si falla full-text search, usar ILIKE
          const whereClause = textColumns.map(col => `${col} ILIKE $1`).join(' OR ');
          const ilikeQuery = `SELECT * FROM ${tableName} WHERE ${whereClause} LIMIT 100`;
          const searchResult = await pool.query(ilikeQuery, [`%${searchTerm}%`]);
          
          if (searchResult.rows.length > 0) {
            results.push({
              table: tableName,
              searchType: 'ilike',
              matches: searchResult.rows,
            });
          }
        }
      }
    }

    return results;
  } finally {
    await pool.end();
  }
}

/**
 * Genera embeddings para datos de PostgreSQL
 */
async function generatePostgreSQLEmbeddings(
  config: PostgreSQLConnection,
  tableName: string,
  textColumn: string,
  embeddingApiUrl: string = 'http://localhost:11434/api/embeddings'
): Promise<any[]> {
  const pool = createPostgreSQLPool(config);

  try {
    const textData = await pool.query(`SELECT id, ${textColumn} FROM ${tableName}`);
    const results: any[] = [];
    
    for (const row of textData.rows) {
      try {
        const embedding = await getEmbedding(row[textColumn]);
        
        results.push({
          id: row.id,
          text: row[textColumn],
          embedding: embedding,
        });
      } catch (error) {
        console.error(`Error generating embedding for row ${row.id}:`, error);
      }
    }

    return results;
  } finally {
    pool.end();
  }
}

/**
 * Busca datos usando similitud de embeddings en PostgreSQL con pgvector
 */
async function searchPostgreSQLBySimilarity(
  config: PostgreSQLConnection,
  tableName: string,
  embeddingColumn: string,
  queryEmbedding: number[],
  limit: number = 10
): Promise<any[]> {
  const pool = createPostgreSQLPool(config);

  try {
    // Buscar por similitud coseno usando pgvector
    const result = await pool.query(`
      SELECT *, 1 - (${embeddingColumn} <=> $1) as similarity
      FROM ${tableName}
      ORDER BY ${embeddingColumn} <=> $1
      LIMIT $2
    `, [JSON.stringify(queryEmbedding), limit]);

    return result.rows;
  } finally {
    await pool.end();
  }
}

export {
  analyzePostgreSQLDatabase,
  executePostgreSQLQuery,
  searchPostgreSQLData,
  generatePostgreSQLEmbeddings,
  searchPostgreSQLBySimilarity,
  type PostgreSQLConnection,
  type PostgreSQLAnalysis,
  type PostgreSQLQueryResult,
  createPostgreSQLPool,
}; 