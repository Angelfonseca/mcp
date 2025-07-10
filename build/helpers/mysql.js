import mysql from 'mysql2/promise';
import { getEmbedding } from './ollama.js';
/**
 * Crea una conexión a MySQL
 */
async function createMySQLConnection(config) {
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
async function analyzeMySQLDatabase(config) {
    const conn = await createMySQLConnection(config);
    try {
        // Obtener información básica
        const [versionResult] = await conn.execute('SELECT VERSION() as version');
        const version = versionResult[0]?.version;
        const [charsetResult] = await conn.execute('SELECT DEFAULT_CHARACTER_SET_NAME as charset, DEFAULT_COLLATION_NAME as collation FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [config.database]);
        const { charset, collation } = charsetResult[0] || {};
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
        const tables = [];
        for (const table of tablesResult) {
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
            const columns = columnsResult.map(col => ({
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
            const indexMap = new Map();
            for (const idx of indexesResult) {
                if (!indexMap.has(idx.INDEX_NAME)) {
                    indexMap.set(idx.INDEX_NAME, {
                        columns: [],
                        unique: idx.NON_UNIQUE === 0,
                    });
                }
                indexMap.get(idx.INDEX_NAME).columns.push(idx.COLUMN_NAME);
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
        const totalSizeBytes = tablesResult.reduce((sum, table) => sum + (table.TOTAL_SIZE || 0), 0);
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
    }
    finally {
        await conn.end();
    }
}
/**
 * Ejecuta una query personalizada en MySQL
 */
async function executeMySQLQuery(config, query) {
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
        }
        else {
            // INSERT/UPDATE/DELETE query
            return {
                columns: [],
                rows: [],
                affectedRows: result.affectedRows,
                executionTime,
            };
        }
    }
    finally {
        await conn.end();
    }
}
/**
 * Busca datos específicos en MySQL usando texto libre
 */
async function searchMySQLData(config, searchTerm, tables) {
    const conn = await createMySQLConnection(config);
    try {
        const results = [];
        // Si no se especifican tablas, buscar en todas
        if (!tables || tables.length === 0) {
            const [tablesResult] = await conn.execute('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = "BASE TABLE"', [config.database]);
            tables = tablesResult.map(row => row.TABLE_NAME);
        }
        for (const tableName of tables) {
            // Obtener columnas de texto de la tabla
            const [columnsResult] = await conn.execute(`
        SELECT COLUMN_NAME 
        FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? 
        AND DATA_TYPE IN ('varchar', 'text', 'longtext', 'mediumtext', 'tinytext', 'char')
      `, [config.database, tableName]);
            const textColumns = columnsResult.map(col => col.COLUMN_NAME);
            if (textColumns.length > 0) {
                // Construir query de búsqueda
                const whereClause = textColumns.map(col => `${col} LIKE ?`).join(' OR ');
                const searchParams = textColumns.map(() => `%${searchTerm}%`);
                const [searchResult] = await conn.execute(`SELECT * FROM ${tableName} WHERE ${whereClause} LIMIT 100`, searchParams);
                if (searchResult.length > 0) {
                    results.push({
                        table: tableName,
                        matches: searchResult,
                    });
                }
            }
        }
        return results;
    }
    finally {
        await conn.end();
    }
}
/**
 * Genera embeddings para datos de MySQL usando una API externa
 */
async function generateMySQLEmbeddings(config, tableName, textColumn, embeddingApiUrl = 'http://localhost:11434/api/embeddings') {
    const conn = await createMySQLConnection(config);
    const results = [];
    try {
        const [rows] = await conn.query(`SELECT id, \`${textColumn}\` FROM \`${tableName}\` WHERE \`${textColumn}\` IS NOT NULL LIMIT 1000`);
        for (const row of rows) {
            try {
                const embedding = await getEmbedding(row[textColumn]);
                results.push({
                    id: row.id,
                    text: row[textColumn],
                    embedding: embedding
                });
            }
            catch (error) {
                console.error(`Error generating embedding for row ${row.id}:`, error);
            }
        }
    }
    finally {
        await conn.end();
    }
    return results;
}
export { analyzeMySQLDatabase, executeMySQLQuery, searchMySQLData, generateMySQLEmbeddings, createMySQLConnection, };
