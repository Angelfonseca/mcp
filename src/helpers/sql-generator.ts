import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface TableColumn {
  name: string;
  type: string;
  nullable?: boolean;
  primaryKey?: boolean;
  foreignKey?: {
    table: string;
    column: string;
  };
  unique?: boolean;
  defaultValue?: string;
  autoIncrement?: boolean;
  comment?: string;
}

export interface TableDefinition {
  name: string;
  columns: TableColumn[];
  indexes?: {
    name: string;
    columns: string[];
    unique?: boolean;
  }[];
  comment?: string;
}

export interface DatabaseSchema {
  name: string;
  tables: TableDefinition[];
  views?: {
    name: string;
    query: string;
    comment?: string;
  }[];
  relationships?: {
    from: { table: string; column: string };
    to: { table: string; column: string };
    type: 'one-to-one' | 'one-to-many' | 'many-to-many';
  }[];
}

export interface SQLGeneratorOptions {
  outputDir?: string;
  dbType: 'mysql' | 'postgresql' | 'sqlite';
  includeDropStatements?: boolean;
  includeComments?: boolean;
  generateSampleData?: boolean;
}

/**
 * Clase principal para generar SQL y documentación de BD
 */
export class SQLGenerator {
  private outputDir: string;

  constructor(options: { outputDir?: string } = {}) {
    this.outputDir = options.outputDir || path.join(os.homedir(), 'Documents', 'db-exports');
    this.ensureOutputDirectory();
  }

  private ensureOutputDirectory(): void {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Genera esquema SQL completo
   */
  generateSchema(schema: DatabaseSchema, options: SQLGeneratorOptions): string {
    let sql = `-- Esquema de Base de Datos: ${schema.name}\n`;
    sql += `-- Generado el: ${new Date().toISOString()}\n`;
    sql += `-- Tipo de BD: ${options.dbType.toUpperCase()}\n\n`;

    if (options.includeDropStatements) {
      sql += this.generateDropStatements(schema, options.dbType);
    }

    // Crear base de datos
    sql += this.generateDatabaseCreation(schema.name, options.dbType);

    // Crear tablas
    for (const table of schema.tables) {
      sql += this.generateTableSQL(table, options);
    }

    // Crear índices
    for (const table of schema.tables) {
      if (table.indexes) {
        sql += this.generateIndexesSQL(table, options.dbType);
      }
    }

    // Crear foreign keys
    sql += this.generateForeignKeysSQL(schema, options.dbType);

    // Crear vistas
    if (schema.views) {
      for (const view of schema.views) {
        sql += this.generateViewSQL(view, options.dbType);
      }
    }

    return sql;
  }

  /**
   * Genera consultas SQL avanzadas
   */
  generateQueries(data: any[], tableName: string, options: SQLGeneratorOptions): string {
    let sql = `-- Consultas SQL para tabla: ${tableName}\n`;
    sql += `-- Generado el: ${new Date().toISOString()}\n\n`;

    if (data.length === 0) return sql;

    const columns = Object.keys(data[0]);
    const numericColumns = this.getNumericColumns(data);
    const dateColumns = this.getDateColumns(data);

    // Consultas básicas
    sql += "-- ===== CONSULTAS BÁSICAS =====\n\n";
    sql += `-- Seleccionar todos los registros\nSELECT * FROM ${tableName};\n\n`;
    sql += `-- Contar registros\nSELECT COUNT(*) as total_registros FROM ${tableName};\n\n`;

    // Consultas estadísticas
    if (numericColumns.length > 0) {
      sql += "-- ===== CONSULTAS ESTADÍSTICAS =====\n\n";
      for (const col of numericColumns.slice(0, 3)) {
        sql += `-- Estadísticas de ${col}\n`;
        sql += `SELECT \n`;
        sql += `  COUNT(${col}) as count_${col},\n`;
        sql += `  MIN(${col}) as min_${col},\n`;
        sql += `  MAX(${col}) as max_${col},\n`;
        sql += `  AVG(${col}) as avg_${col}\n`;
        sql += `FROM ${tableName};\n\n`;
      }
    }

    // Consultas de agrupación
    sql += "-- ===== CONSULTAS DE AGRUPACIÓN =====\n\n";
    const categoricalColumns = columns.filter(col => 
      !numericColumns.includes(col) && !dateColumns.includes(col)
    );

    for (const col of categoricalColumns.slice(0, 2)) {
      sql += `-- Distribución por ${col}\n`;
      sql += `SELECT ${col}, COUNT(*) as frecuencia\n`;
      sql += `FROM ${tableName}\n`;
      sql += `GROUP BY ${col}\n`;
      sql += `ORDER BY frecuencia DESC;\n\n`;
    }

    // Consultas temporales
    if (dateColumns.length > 0) {
      sql += "-- ===== CONSULTAS TEMPORALES =====\n\n";
      for (const col of dateColumns.slice(0, 1)) {
        sql += `-- Registros por año en ${col}\n`;
        if (options.dbType === 'mysql') {
          sql += `SELECT YEAR(${col}) as año, COUNT(*) as registros\n`;
        } else if (options.dbType === 'postgresql') {
          sql += `SELECT EXTRACT(YEAR FROM ${col}) as año, COUNT(*) as registros\n`;
        } else {
          sql += `SELECT strftime('%Y', ${col}) as año, COUNT(*) as registros\n`;
        }
        sql += `FROM ${tableName}\n`;
        sql += `GROUP BY año\n`;
        sql += `ORDER BY año;\n\n`;
      }
    }

    // Consultas avanzadas
    sql += "-- ===== CONSULTAS AVANZADAS =====\n\n";
    if (numericColumns.length >= 2) {
      sql += `-- Top 10 registros por ${numericColumns[0]}\n`;
      sql += `SELECT *\n`;
      sql += `FROM ${tableName}\n`;
      sql += `ORDER BY ${numericColumns[0]} DESC\n`;
      sql += `LIMIT 10;\n\n`;
    }

    return sql;
  }

  /**
   * Genera diagrama ER en formato Mermaid
   */
  generateERDiagram(schema: DatabaseSchema): string {
    let mermaid = `erDiagram\n`;

    // Definir entidades
    for (const table of schema.tables) {
      mermaid += `    ${table.name.toUpperCase()} {\n`;
      
      for (const column of table.columns) {
        let line = `        ${column.type} ${column.name}`;
        
        if (column.primaryKey) line += ' PK';
        if (column.foreignKey) line += ' FK';
        if (column.unique) line += ' UK';
        if (!column.nullable) line += ' "NOT NULL"';
        if (column.comment) line += ` "${column.comment}"`;
        
        mermaid += `${line}\n`;
      }
      
      mermaid += `    }\n\n`;
    }

    // Definir relaciones
    if (schema.relationships) {
      for (const rel of schema.relationships) {
        const fromTable = rel.from.table.toUpperCase();
        const toTable = rel.to.table.toUpperCase();
        
        let relationSymbol = '';
        switch (rel.type) {
          case 'one-to-one':
            relationSymbol = '||--||';
            break;
          case 'one-to-many':
            relationSymbol = '||--o{';
            break;
          case 'many-to-many':
            relationSymbol = '}o--o{';
            break;
        }
        
        mermaid += `    ${fromTable} ${relationSymbol} ${toTable} : "${rel.from.column} -> ${rel.to.column}"\n`;
      }
    }

    return mermaid;
  }

  /**
   * Guarda archivo SQL
   */
  saveSQL(content: string, filename: string): string {
    const filepath = path.join(this.outputDir, `${filename}.sql`);
    fs.writeFileSync(filepath, content, 'utf8');
    return filepath;
  }

  /**
   * Guarda diagrama Mermaid
   */
  saveMermaidDiagram(content: string, filename: string): string {
    const filepath = path.join(this.outputDir, `${filename}_diagram.md`);
    const markdownContent = `# Diagrama Entidad-Relación\n\n\`\`\`mermaid\n${content}\n\`\`\`\n`;
    fs.writeFileSync(filepath, markdownContent, 'utf8');
    return filepath;
  }

  /**
   * Genera documentación completa de BD
   */
  generateDocumentation(schema: DatabaseSchema): string {
    let doc = `# Documentación de Base de Datos: ${schema.name}\n\n`;
    doc += `**Generado el:** ${new Date().toLocaleString()}\n\n`;
    doc += `## Resumen\n\n`;
    doc += `- **Número de tablas:** ${schema.tables.length}\n`;
    doc += `- **Número de vistas:** ${schema.views?.length || 0}\n`;
    doc += `- **Número de relaciones:** ${schema.relationships?.length || 0}\n\n`;

    // Documentar tablas
    doc += `## Tablas\n\n`;
    for (const table of schema.tables) {
      doc += `### ${table.name}\n\n`;
      if (table.comment) doc += `${table.comment}\n\n`;
      
      doc += `| Columna | Tipo | Nullable | PK | FK | Comentario |\n`;
      doc += `|---------|------|----------|----|----|------------|\n`;
      
      for (const column of table.columns) {
        const nullable = column.nullable !== false ? '✓' : '✗';
        const pk = column.primaryKey ? '✓' : '';
        const fk = column.foreignKey ? `${column.foreignKey.table}.${column.foreignKey.column}` : '';
        const comment = column.comment || '';
        
        doc += `| ${column.name} | ${column.type} | ${nullable} | ${pk} | ${fk} | ${comment} |\n`;
      }
      doc += `\n`;
    }

    // Documentar vistas
    if (schema.views && schema.views.length > 0) {
      doc += `## Vistas\n\n`;
      for (const view of schema.views) {
        doc += `### ${view.name}\n\n`;
        if (view.comment) doc += `${view.comment}\n\n`;
        doc += `\`\`\`sql\n${view.query}\n\`\`\`\n\n`;
      }
    }

    // Documentar relaciones
    if (schema.relationships && schema.relationships.length > 0) {
      doc += `## Relaciones\n\n`;
      doc += `| Desde | Hacia | Tipo |\n`;
      doc += `|-------|-------|------|\n`;
      
      for (const rel of schema.relationships) {
        doc += `| ${rel.from.table}.${rel.from.column} | ${rel.to.table}.${rel.to.column} | ${rel.type} |\n`;
      }
    }

    return doc;
  }

  /**
   * Guarda documentación
   */
  saveDocumentation(content: string, filename: string): string {
    const filepath = path.join(this.outputDir, `${filename}_documentation.md`);
    fs.writeFileSync(filepath, content, 'utf8');
    return filepath;
  }

  // Métodos privados auxiliares

  private generateDropStatements(schema: DatabaseSchema, dbType: string): string {
    let sql = "-- ===== DROP STATEMENTS =====\n\n";
    
    // Drop views first
    if (schema.views) {
      for (const view of schema.views) {
        sql += `DROP VIEW IF EXISTS ${view.name};\n`;
      }
    }
    
    // Drop tables (reverse order for FK constraints)
    for (const table of [...schema.tables].reverse()) {
      sql += `DROP TABLE IF EXISTS ${table.name};\n`;
    }
    
    sql += `\n`;
    return sql;
  }

  private generateDatabaseCreation(dbName: string, dbType: string): string {
    let sql = "-- ===== CREAR BASE DE DATOS =====\n\n";
    
    if (dbType === 'mysql') {
      sql += `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\n`;
      sql += `USE \`${dbName}\`;\n\n`;
    } else if (dbType === 'postgresql') {
      sql += `CREATE DATABASE "${dbName}" WITH ENCODING 'UTF8' LC_COLLATE 'es_ES.UTF-8' LC_CTYPE 'es_ES.UTF-8';\n`;
      sql += `\\c ${dbName};\n\n`;
    }
    
    return sql;
  }

  private generateTableSQL(table: TableDefinition, options: SQLGeneratorOptions): string {
    let sql = `-- Tabla: ${table.name}\n`;
    if (table.comment && options.includeComments) {
      sql += `-- ${table.comment}\n`;
    }
    
    sql += `CREATE TABLE ${table.name} (\n`;
    
    const columnDefinitions = table.columns.map(column => {
      let def = `  ${column.name} ${column.type}`;
      
      if (!column.nullable) def += ' NOT NULL';
      if (column.autoIncrement) {
        if (options.dbType === 'mysql') def += ' AUTO_INCREMENT';
        if (options.dbType === 'postgresql') def = `  ${column.name} SERIAL`;
      }
      if (column.defaultValue) def += ` DEFAULT ${column.defaultValue}`;
      if (column.unique) def += ' UNIQUE';
      
      return def;
    });
    
    sql += columnDefinitions.join(',\n');
    
    // Primary keys
    const primaryKeys = table.columns.filter(col => col.primaryKey).map(col => col.name);
    if (primaryKeys.length > 0) {
      sql += `,\n  PRIMARY KEY (${primaryKeys.join(', ')})`;
    }
    
    sql += `\n)`;
    
    // Engine and charset for MySQL
    if (options.dbType === 'mysql') {
      sql += ` ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
    }
    
    sql += `;\n\n`;
    
    return sql;
  }

  private generateIndexesSQL(table: TableDefinition, dbType: string): string {
    let sql = '';
    
    if (table.indexes) {
      for (const index of table.indexes) {
        const uniqueKeyword = index.unique ? 'UNIQUE ' : '';
        sql += `CREATE ${uniqueKeyword}INDEX ${index.name} ON ${table.name} (${index.columns.join(', ')});\n`;
      }
      sql += '\n';
    }
    
    return sql;
  }

  private generateForeignKeysSQL(schema: DatabaseSchema, dbType: string): string {
    let sql = "-- ===== FOREIGN KEYS =====\n\n";
    
    for (const table of schema.tables) {
      for (const column of table.columns) {
        if (column.foreignKey) {
          const constraintName = `fk_${table.name}_${column.name}`;
          sql += `ALTER TABLE ${table.name} ADD CONSTRAINT ${constraintName} `;
          sql += `FOREIGN KEY (${column.name}) REFERENCES ${column.foreignKey.table}(${column.foreignKey.column});\n`;
        }
      }
    }
    
    sql += '\n';
    return sql;
  }

  private generateViewSQL(view: { name: string; query: string; comment?: string }, dbType: string): string {
    let sql = `-- Vista: ${view.name}\n`;
    if (view.comment) sql += `-- ${view.comment}\n`;
    
    sql += `CREATE VIEW ${view.name} AS\n${view.query};\n\n`;
    return sql;
  }

  private getNumericColumns(data: any[]): string[] {
    if (data.length === 0) return [];
    
    const sample = data[0];
    return Object.keys(sample).filter(key => {
      const value = sample[key];
      return typeof value === 'number' || (!isNaN(Number(value)) && value !== '' && value !== null);
    });
  }

  private getDateColumns(data: any[]): string[] {
    if (data.length === 0) return [];
    
    const sample = data[0];
    return Object.keys(sample).filter(key => {
      const value = sample[key];
      if (typeof value === 'string') {
        const date = new Date(value);
        return !isNaN(date.getTime()) && value.match(/^\d{4}-\d{2}-\d{2}/) !== null;
      }
      return false;
    });
  }

  /**
   * Analiza datos y genera esquema automáticamente
   */
  analyzeDataAndGenerateSchema(data: any[], tableName: string): TableDefinition {
    if (data.length === 0) {
      throw new Error('No se pueden analizar datos vacíos');
    }

    const sample = data[0];
    const columns: TableColumn[] = [];

    for (const [key, value] of Object.entries(sample)) {
      const column: TableColumn = {
        name: key,
        type: this.inferColumnType(key, data),
        nullable: this.isColumnNullable(key, data)
      };

      // Detectar posibles primary keys
      if (key.toLowerCase().includes('id') && this.isUniqueColumn(key, data)) {
        column.primaryKey = true;
        column.autoIncrement = typeof value === 'number';
      }

      columns.push(column);
    }

    return {
      name: tableName,
      columns,
      comment: `Tabla generada automáticamente a partir de ${data.length} registros`
    };
  }

  private inferColumnType(columnName: string, data: any[]): string {
    const values = data.map(row => row[columnName]).filter(v => v !== null && v !== undefined);
    
    if (values.length === 0) return 'VARCHAR(255)';

    // Detectar tipos
    const isAllNumbers = values.every(v => !isNaN(Number(v)));
    const isAllIntegers = isAllNumbers && values.every(v => Number.isInteger(Number(v)));
    const maxLength = Math.max(...values.map(v => String(v).length));

    if (isAllNumbers) {
      if (isAllIntegers) {
        const maxValue = Math.max(...values.map(v => Math.abs(Number(v))));
        if (maxValue < 128) return 'TINYINT';
        if (maxValue < 32768) return 'SMALLINT';
        if (maxValue < 2147483648) return 'INT';
        return 'BIGINT';
      } else {
        return 'DECIMAL(10,2)';
      }
    }

    // Detectar fechas
    const isAllDates = values.every(v => {
      const date = new Date(v);
      return !isNaN(date.getTime());
    });

    if (isAllDates) {
      return 'DATETIME';
    }

    // Detectar booleanos
    const isAllBooleans = values.every(v => 
      v === true || v === false || v === 'true' || v === 'false' || v === 0 || v === 1
    );

    if (isAllBooleans) {
      return 'BOOLEAN';
    }

    // Texto
    if (maxLength <= 255) {
      return `VARCHAR(${Math.max(255, maxLength * 1.5)})`;
    } else {
      return 'TEXT';
    }
  }

  private isColumnNullable(columnName: string, data: any[]): boolean {
    return data.some(row => row[columnName] === null || row[columnName] === undefined);
  }

  private isUniqueColumn(columnName: string, data: any[]): boolean {
    const values = data.map(row => row[columnName]);
    const uniqueValues = new Set(values);
    return uniqueValues.size === values.length;
  }
} 