import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetchHelpers from "./helpers/fetchs.js";
import * as mysqlHelpers from "./helpers/mysql.js";
import * as mongoHelpers from "./helpers/mongodb.js";
import * as postgresHelpers from "./helpers/postgresql.js";
import * as reportsHelpers from './helpers/reports.js';
import { safeFetch } from './helpers/fetchs.js';

export const USER_AGENT = "data-analysis-mcp/1.0.0";

const server = new McpServer({
  name: "mcp-server",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {
      'generate-data-report': {
        description: 'Genera reportes profesionales con gráficos y análisis de datos',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Título del reporte' },
            subtitle: { type: 'string', description: 'Subtítulo opcional' },
            author: { type: 'string', description: 'Autor del reporte' },
            data: { 
              type: 'array', 
              description: 'Datos para analizar (array de objetos)',
              items: { type: 'object' }
            },
            sections: {
              type: 'array',
              description: 'Secciones del reporte',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  type: { 
                    type: 'string', 
                    enum: ['text', 'table', 'chart', 'list'],
                    description: 'Tipo de sección'
                  },
                  content: { type: 'string', description: 'Contenido para tipo text' },
                  chartConfig: {
                    type: 'object',
                    description: 'Configuración del gráfico',
                    properties: {
                      type: { type: 'string', enum: ['bar', 'line', 'pie', 'doughnut', 'scatter'] },
                      title: { type: 'string' },
                      dataColumn: { type: 'string', description: 'Columna para valores' },
                      labelColumn: { type: 'string', description: 'Columna para etiquetas' }
                    }
                  }
                },
                required: ['title', 'type']
              }
            },
            format: { 
              type: 'string', 
              enum: ['html', 'markdown'],
              default: 'html',
              description: 'Formato de salida'
            },
            theme: { 
              type: 'string', 
              enum: ['light', 'dark'],
              default: 'light',
              description: 'Tema visual'
            },
            outputPath: { type: 'string', description: 'Ruta donde guardar el archivo (opcional)' }
          },
          required: ['title', 'sections']
        }
      },
      'transform-api-to-dataframe': {
        description: 'Transforma datos de API a DataFrame para análisis',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL de la API' },
            headers: { 
              type: 'object', 
              description: 'Headers HTTP (opcional)',
              additionalProperties: { type: 'string' }
            },
            params: { 
              type: 'object', 
              description: 'Parámetros de consulta (opcional)',
              additionalProperties: true
            },
            showPreview: { 
              type: 'boolean', 
              default: true,
              description: 'Mostrar preview de los datos'
            }
          },
          required: ['url']
        }
      },
      'migrate-data-to-database': {
        description: 'Migra datos desde archivos o APIs a bases de datos',
        inputSchema: {
          type: 'object',
          properties: {
            source: {
              type: 'object',
              properties: {
                type: { 
                  type: 'string', 
                  enum: ['api', 'csv', 'excel', 'json'],
                  description: 'Tipo de fuente de datos'
                },
                url: { type: 'string', description: 'URL para tipo API' },
                filePath: { type: 'string', description: 'Ruta del archivo para CSV/Excel/JSON' },
                headers: { 
                  type: 'object', 
                  description: 'Headers para API',
                  additionalProperties: { type: 'string' }
                },
                params: { 
                  type: 'object', 
                  description: 'Parámetros para API',
                  additionalProperties: true
                }
              },
              required: ['type']
            },
            target: {
              type: 'object',
              properties: {
                type: { 
                  type: 'string', 
                  enum: ['mysql', 'mongodb', 'postgresql'],
                  description: 'Tipo de base de datos destino'
                },
                connection: {
                  type: 'object',
                  description: 'Configuración de conexión a la BD',
                  additionalProperties: true
                },
                table: { type: 'string', description: 'Nombre de tabla (MySQL/PostgreSQL)' },
                collection: { type: 'string', description: 'Nombre de colección (MongoDB)' },
                batchSize: { 
                  type: 'number', 
                  default: 1000,
                  description: 'Tamaño de lote para inserción'
                }
              },
              required: ['type', 'connection']
            },
            transformations: {
              type: 'array',
              description: 'Transformaciones antes de migrar',
              items: {
                type: 'object',
                properties: {
                  column: { type: 'string' },
                  operation: { 
                    type: 'string', 
                    enum: ['rename', 'cast', 'filter']
                  },
                  params: { type: 'object', additionalProperties: true }
                },
                required: ['column', 'operation', 'params']
              }
            }
          },
          required: ['source', 'target']
        }
      },
      'analyze-dataframe': {
        description: 'Analiza un DataFrame y genera estadísticas descriptivas',
        inputSchema: {
          type: 'object',
          properties: {
            data: { 
              type: 'array', 
              description: 'Datos para analizar (array de objetos)',
              items: { type: 'object' }
            },
            includeInsights: { 
              type: 'boolean', 
              default: true,
              description: 'Incluir insights automáticos'
            },
            groupBy: { 
              type: 'string', 
              description: 'Columna para agrupar datos (opcional)'
            },
            aggregation: { 
              type: 'string', 
              enum: ['count', 'sum', 'avg'],
              description: 'Tipo de agregación para groupBy'
            },
            targetColumn: { 
              type: 'string', 
              description: 'Columna objetivo para agregación'
            }
          },
          required: ['data']
        }
      },
      'upload-dataframe-to-database': {
        description: 'Sube un array de objetos a la base de datos seleccionada, con opción de generar embeddings',
        inputSchema: {
          type: 'object',
          properties: {
            target: z.enum(['mysql', 'postgresql', 'mongodb']).describe("Tipo de base de datos destino"),
            connection: z.any().describe("Configuración de conexión"),
            table: z.string().optional().describe("Nombre de tabla (MySQL/PostgreSQL)"),
            collection: z.string().optional().describe("Nombre de colección (MongoDB)"),
            data: z.array(z.record(z.string(), z.any())).describe("Datos a subir"),
            embed: z.boolean().optional().default(false).describe("Generar embeddings"),
            textField: z.string().optional().describe("Campo de texto para embeddings"),
            embeddingField: z.string().optional().describe("Campo donde guardar el embedding (default: embedding)")
          },
          required: ['target', 'connection', 'data']
        }
      },
    },
  },
});

server.tool(
    "search-with-serper",
    "Tool to search the web with Serper",
    {
        query: z.string().describe("The query to search the web with Serper"),
    },
    async ({ query }) => {
        const data = await fetchHelpers.searchWithSerper(query);
        return {
            content: [
                { type: "text", text: JSON.stringify(data) },
            ],
        };
    }
);

server.tool(
    "fetch-url",
    "Tool to fetch safely a URL",
    {
        url: z.string().describe("The URL to fetch"),
    },
    async ({ url }) => {
        const data = await fetchHelpers.safeFetch(url, { expectJson: false });
        return {
            content: [
                { type: "text", text: JSON.stringify(data) },
            ],
        };
    }
);

// MySQL Tools
server.tool(
    "mysql-analyze",
    "Analiza completamente una base de datos MySQL",
    {
        host: z.string().describe("Host del servidor MySQL"),
        port: z.number().optional().describe("Puerto del servidor MySQL (default: 3306)"),
        username: z.string().describe("Usuario de MySQL"),
        password: z.string().describe("Contraseña de MySQL"),
        database: z.string().describe("Nombre de la base de datos"),
    },
    async ({ host, port, username, password, database }) => {
        const analysis = await mysqlHelpers.analyzeMySQLDatabase({
            host, port, username, password, database
        });
        return {
            content: [
                { type: "text", text: JSON.stringify(analysis, null, 2) },
            ],
        };
    }
);

server.tool(
    "mysql-query",
    "Ejecuta una query personalizada en MySQL",
    {
        host: z.string().describe("Host del servidor MySQL"),
        port: z.number().optional().describe("Puerto del servidor MySQL (default: 3306)"),
        username: z.string().describe("Usuario de MySQL"),
        password: z.string().describe("Contraseña de MySQL"),
        database: z.string().describe("Nombre de la base de datos"),
        query: z.string().describe("Query SQL a ejecutar"),
    },
    async ({ host, port, username, password, database, query }) => {
        const result = await mysqlHelpers.executeMySQLQuery({
            host, port, username, password, database
        }, query);
        return {
            content: [
                { type: "text", text: JSON.stringify(result, null, 2) },
            ],
        };
    }
);

server.tool(
    "mysql-search",
    "Busca datos específicos en MySQL usando texto libre",
    {
        host: z.string().describe("Host del servidor MySQL"),
        port: z.number().optional().describe("Puerto del servidor MySQL (default: 3306)"),
        username: z.string().describe("Usuario de MySQL"),
        password: z.string().describe("Contraseña de MySQL"),
        database: z.string().describe("Nombre de la base de datos"),
        searchTerm: z.string().describe("Término de búsqueda"),
        tables: z.array(z.string()).optional().describe("Tablas específicas donde buscar"),
    },
    async ({ host, port, username, password, database, searchTerm, tables }) => {
        const results = await mysqlHelpers.searchMySQLData({
            host, port, username, password, database
        }, searchTerm, tables);
        return {
            content: [
                { type: "text", text: JSON.stringify(results, null, 2) },
            ],
        };
    }
);

server.tool(
    "mysql-embeddings",
    "Genera embeddings para datos de MySQL",
    {
        host: z.string().describe("Host del servidor MySQL"),
        port: z.number().optional().describe("Puerto del servidor MySQL (default: 3306)"),
        username: z.string().describe("Usuario de MySQL"),
        password: z.string().describe("Contraseña de MySQL"),
        database: z.string().describe("Nombre de la base de datos"),
        tableName: z.string().describe("Nombre de la tabla"),
        textColumn: z.string().describe("Columna que contiene el texto"),
    },
    async ({ host, port, username, password, database, tableName, textColumn }) => {
        const embeddings = await mysqlHelpers.generateMySQLEmbeddings({
            host, port, username, password, database
        }, tableName, textColumn);
        return {
            content: [
                { type: "text", text: JSON.stringify(embeddings, null, 2) },
            ],
        };
    }
);

// MongoDB Tools
server.tool(
    "mongodb-analyze",
    "Analiza completamente una base de datos MongoDB",
    {
        connectionString: z.string().optional().describe("String de conexión MongoDB"),
        host: z.string().optional().describe("Host del servidor MongoDB"),
        port: z.number().optional().describe("Puerto del servidor MongoDB (default: 27017)"),
        username: z.string().optional().describe("Usuario de MongoDB"),
        password: z.string().optional().describe("Contraseña de MongoDB"),
        database: z.string().describe("Nombre de la base de datos"),
        authSource: z.string().optional().describe("Base de datos de autenticación"),
    },
    async ({ connectionString, host, port, username, password, database, authSource }) => {
        const analysis = await mongoHelpers.analyzeMongoDBDatabase({
            connectionString, host, port, username, password, database, authSource
        });
        return {
            content: [
                { type: "text", text: JSON.stringify(analysis, null, 2) },
            ],
        };
    }
);

server.tool(
    "mongodb-query",
    "Ejecuta una query personalizada en MongoDB",
    {
        connectionString: z.string().optional().describe("String de conexión MongoDB"),
        host: z.string().optional().describe("Host del servidor MongoDB"),
        port: z.number().optional().describe("Puerto del servidor MongoDB (default: 27017)"),
        username: z.string().optional().describe("Usuario de MongoDB"),
        password: z.string().optional().describe("Contraseña de MongoDB"),
        database: z.string().describe("Nombre de la base de datos"),
        authSource: z.string().optional().describe("Base de datos de autenticación"),
        collectionName: z.string().describe("Nombre de la colección"),
        operation: z.enum(["find", "aggregate", "count"]).describe("Tipo de operación"),
        query: z.any().describe("Query a ejecutar"),
        options: z.any().optional().describe("Opciones adicionales"),
    },
    async ({ connectionString, host, port, username, password, database, authSource, collectionName, operation, query, options }) => {
        const result = await mongoHelpers.executeMongoDBQuery({
            connectionString, host, port, username, password, database, authSource
        }, collectionName, operation, query, options);
        return {
            content: [
                { type: "text", text: JSON.stringify(result, null, 2) },
            ],
        };
    }
);

server.tool(
    "mongodb-search",
    "Busca datos específicos en MongoDB usando texto libre",
    {
        connectionString: z.string().optional().describe("String de conexión MongoDB"),
        host: z.string().optional().describe("Host del servidor MongoDB"),
        port: z.number().optional().describe("Puerto del servidor MongoDB (default: 27017)"),
        username: z.string().optional().describe("Usuario de MongoDB"),
        password: z.string().optional().describe("Contraseña de MongoDB"),
        database: z.string().describe("Nombre de la base de datos"),
        authSource: z.string().optional().describe("Base de datos de autenticación"),
        searchTerm: z.string().describe("Término de búsqueda"),
        collections: z.array(z.string()).optional().describe("Colecciones específicas donde buscar"),
    },
    async ({ connectionString, host, port, username, password, database, authSource, searchTerm, collections }) => {
        const results = await mongoHelpers.searchMongoDBData({
            connectionString, host, port, username, password, database, authSource
        }, searchTerm, collections);
        return {
            content: [
                { type: "text", text: JSON.stringify(results, null, 2) },
            ],
        };
    }
);

server.tool(
    "mongodb-embeddings",
    "Genera embeddings para datos de MongoDB",
    {
        connectionString: z.string().optional().describe("String de conexión MongoDB"),
        host: z.string().optional().describe("Host del servidor MongoDB"),
        port: z.number().optional().describe("Puerto del servidor MongoDB (default: 27017)"),
        username: z.string().optional().describe("Usuario de MongoDB"),
        password: z.string().optional().describe("Contraseña de MongoDB"),
        database: z.string().describe("Nombre de la base de datos"),
        authSource: z.string().optional().describe("Base de datos de autenticación"),
        collectionName: z.string().describe("Nombre de la colección"),
        textField: z.string().describe("Campo que contiene el texto"),
    },
    async ({ connectionString, host, port, username, password, database, authSource, collectionName, textField }) => {
        const embeddings = await mongoHelpers.generateMongoDBEmbeddings({
            connectionString, host, port, username, password, database, authSource
        }, collectionName, textField);
        return {
            content: [
                { type: "text", text: JSON.stringify(embeddings, null, 2) },
            ],
        };
    }
);

// PostgreSQL Tools
server.tool(
    "postgresql-analyze",
    "Analiza completamente una base de datos PostgreSQL",
    {
        host: z.string().describe("Host del servidor PostgreSQL"),
        port: z.number().optional().describe("Puerto del servidor PostgreSQL (default: 5432)"),
        username: z.string().describe("Usuario de PostgreSQL"),
        password: z.string().describe("Contraseña de PostgreSQL"),
        database: z.string().describe("Nombre de la base de datos"),
        ssl: z.boolean().optional().describe("Usar SSL"),
    },
    async ({ host, port, username, password, database, ssl }) => {
        const analysis = await postgresHelpers.analyzePostgreSQLDatabase({
            host, port, username, password, database, ssl
        });
        return {
            content: [
                { type: "text", text: JSON.stringify(analysis, null, 2) },
            ],
        };
    }
);

server.tool(
    "postgresql-query",
    "Ejecuta una query personalizada en PostgreSQL",
    {
        host: z.string().describe("Host del servidor PostgreSQL"),
        port: z.number().optional().describe("Puerto del servidor PostgreSQL (default: 5432)"),
        username: z.string().describe("Usuario de PostgreSQL"),
        password: z.string().describe("Contraseña de PostgreSQL"),
        database: z.string().describe("Nombre de la base de datos"),
        ssl: z.boolean().optional().describe("Usar SSL"),
        query: z.string().describe("Query SQL a ejecutar"),
    },
    async ({ host, port, username, password, database, ssl, query }) => {
        const result = await postgresHelpers.executePostgreSQLQuery({
            host, port, username, password, database, ssl
        }, query);
        return {
            content: [
                { type: "text", text: JSON.stringify(result, null, 2) },
            ],
        };
    }
);

server.tool(
    "postgresql-search",
    "Busca datos específicos en PostgreSQL usando texto libre",
    {
        host: z.string().describe("Host del servidor PostgreSQL"),
        port: z.number().optional().describe("Puerto del servidor PostgreSQL (default: 5432)"),
        username: z.string().describe("Usuario de PostgreSQL"),
        password: z.string().describe("Contraseña de PostgreSQL"),
        database: z.string().describe("Nombre de la base de datos"),
        ssl: z.boolean().optional().describe("Usar SSL"),
        searchTerm: z.string().describe("Término de búsqueda"),
        tables: z.array(z.string()).optional().describe("Tablas específicas donde buscar"),
    },
    async ({ host, port, username, password, database, ssl, searchTerm, tables }) => {
        const results = await postgresHelpers.searchPostgreSQLData({
            host, port, username, password, database, ssl
        }, searchTerm, tables);
        return {
            content: [
                { type: "text", text: JSON.stringify(results, null, 2) },
            ],
        };
    }
);

server.tool(
    "postgresql-embeddings",
    "Genera embeddings para datos de PostgreSQL",
    {
        host: z.string().describe("Host del servidor PostgreSQL"),
        port: z.number().optional().describe("Puerto del servidor PostgreSQL (default: 5432)"),
        username: z.string().describe("Usuario de PostgreSQL"),
        password: z.string().describe("Contraseña de PostgreSQL"),
        database: z.string().describe("Nombre de la base de datos"),
        ssl: z.boolean().optional().describe("Usar SSL"),
        tableName: z.string().describe("Nombre de la tabla"),
        textColumn: z.string().describe("Columna que contiene el texto"),
    },
    async ({ host, port, username, password, database, ssl, tableName, textColumn }) => {
        const embeddings = await postgresHelpers.generatePostgreSQLEmbeddings({
            host, port, username, password, database, ssl
        }, tableName, textColumn);
        return {
            content: [
                { type: "text", text: JSON.stringify(embeddings, null, 2) },
            ],
        };
    }
);

server.tool(
    "postgresql-similarity-search",
    "Busca datos usando similitud de embeddings en PostgreSQL",
    {
        host: z.string().describe("Host del servidor PostgreSQL"),
        port: z.number().optional().describe("Puerto del servidor PostgreSQL (default: 5432)"),
        username: z.string().describe("Usuario de PostgreSQL"),
        password: z.string().describe("Contraseña de PostgreSQL"),
        database: z.string().describe("Nombre de la base de datos"),
        ssl: z.boolean().optional().describe("Usar SSL"),
        tableName: z.string().describe("Nombre de la tabla"),
        embeddingColumn: z.string().describe("Columna que contiene los embeddings"),
        queryEmbedding: z.array(z.number()).describe("Embedding de consulta"),
        limit: z.number().optional().describe("Límite de resultados (default: 10)"),
    },
    async ({ host, port, username, password, database, ssl, tableName, embeddingColumn, queryEmbedding, limit }) => {
        const results = await postgresHelpers.searchPostgreSQLBySimilarity({
            host, port, username, password, database, ssl
        }, tableName, embeddingColumn, queryEmbedding, limit);
        return {
            content: [
                { type: "text", text: JSON.stringify(results, null, 2) },
            ],
        };
    }
);

// Generación de Reportes y Análisis de Datos
server.tool(
    "generate-data-report",
    "Genera reportes profesionales con gráficos y análisis de datos",
    {
        title: z.string().describe("Título del reporte"),
        subtitle: z.string().optional().describe("Subtítulo opcional"),
        author: z.string().optional().describe("Autor del reporte"),
        data: z.array(z.record(z.string(), z.any())).describe("Datos para analizar (array de objetos)"),
        sections: z.array(z.object({
            title: z.string(),
            type: z.enum(['text', 'table', 'chart', 'list']).describe("Tipo de sección"),
            content: z.string().optional().describe("Contenido para tipo text"),
            chartConfig: z.object({
                type: z.enum(['bar', 'line', 'pie', 'doughnut', 'scatter']),
                title: z.string(),
                dataColumn: z.string().describe("Columna para valores"),
                labelColumn: z.string().describe("Columna para etiquetas")
            }).optional().describe("Configuración del gráfico")
        })).describe("Secciones del reporte"),
        format: z.enum(['html', 'markdown']).default('html').describe("Formato de salida"),
        theme: z.enum(['light', 'dark']).default('light').describe("Tema visual"),
        outputPath: z.string().optional().describe("Ruta donde guardar el archivo (opcional)")
    },
    async ({ title, subtitle, author, data, sections, format = 'html', theme = 'light', outputPath }) => {
        try {
            // Procesar secciones y datos
            const processedSections = await Promise.all(sections.map(async (section: any) => {
                if (section.type === 'table' && data) {
                    return { ...section, data };
                }
                
                if (section.type === 'chart' && section.chartConfig && data) {
                    const { dataColumn, labelColumn, ...chartConfig } = section.chartConfig;
                    
                    const chartData = data.map((row: any) => ({
                        label: row[labelColumn] || 'Sin etiqueta',
                        value: Number(row[dataColumn]) || 0
                    }));
                    
                    return {
                        ...section,
                        chartConfig: {
                            ...chartConfig,
                            data: chartData
                        }
                    };
                }
                
                if (section.type === 'list' && data) {
                    const insights = reportsHelpers.generateDataInsights(data);
                    return { ...section, data: insights };
                }
                
                return section;
            }));

            const template: reportsHelpers.ReportTemplate = {
                title,
                subtitle,
                author,
                sections: processedSections
            };

            const options: reportsHelpers.ReportOptions = {
                format: format as 'html' | 'markdown',
                theme: theme as 'light' | 'dark',
                outputPath
            };

            const reportContent = await reportsHelpers.generateReport(template, options);
            
            return {
                content: [
                    {
                        type: 'text',
                        text: `✅ Reporte generado exitosamente\n\n` +
                               `📊 **${title}**\n` +
                               (subtitle ? `📝 ${subtitle}\n` : '') +
                               (author ? `👤 Autor: ${author}\n` : '') +
                               `📄 Formato: ${format.toUpperCase()}\n` +
                               `🎨 Tema: ${theme}\n` +
                               `📁 Secciones: ${sections.length}\n` +
                               (outputPath ? `💾 Guardado en: ${outputPath}\n` : '') +
                               `\n**Contenido del reporte:**\n\n${format === 'markdown' ? reportContent : 'Reporte HTML generado'}`
                    }
                ]
            };
        } catch (error) {
            return {
                content: [{ type: 'text', text: `❌ Error generando reporte: ${error}` }]
            };
        }
    }
);

server.tool(
    "transform-api-to-dataframe",
    "Transforma datos de API a DataFrame para análisis",
    {
        url: z.string().describe("URL de la API"),
        headers: z.record(z.string()).optional().describe("Headers HTTP (opcional)"),
        params: z.record(z.any()).optional().describe("Parámetros de consulta (opcional)"),
        showPreview: z.boolean().default(true).describe("Mostrar preview de los datos")
    },
    async ({ url, headers, params, showPreview = true }) => {
        try {
            // Cargar datos desde API usando la función existente
            let fullUrl = url;
            if (params) {
                const searchParams = new URLSearchParams(params);
                fullUrl += (url.includes('?') ? '&' : '?') + searchParams.toString();
            }

                         const data = await safeFetch(fullUrl, {
                headers: headers || {},
                expectJson: true,
            });

            // Procesar datos
            let arrayData: any[] = [];
            if (Array.isArray(data)) {
                arrayData = data;
            } else if (typeof data === 'object' && data !== null) {
                const commonArrayProps = ['data', 'results', 'items', 'records', 'rows'];
                let found = false;
                
                for (const prop of commonArrayProps) {
                    if (prop in data && Array.isArray((data as any)[prop])) {
                        arrayData = (data as any)[prop];
                        found = true;
                        break;
                    }
                }
                
                if (!found) {
                    arrayData = [data];
                }
            } else {
                throw new Error('La respuesta de la API no contiene datos válidos');
            }

            const rowCount = arrayData.length;
            const columns = arrayData.length > 0 ? Object.keys(arrayData[0]) : [];
            const preview = showPreview ? arrayData.slice(0, 5) : [];
            
            // Estadísticas básicas
            const numericColumns = columns.filter(col => 
                arrayData.some(row => typeof row[col] === 'number')
            );
            
            const stats: Record<string, any> = {};
            numericColumns.forEach(col => {
                const values = arrayData
                    .map(row => row[col])
                    .filter(v => typeof v === 'number' && !isNaN(v));
                
                if (values.length > 0) {
                    const sum = values.reduce((a, b) => a + b, 0);
                    const mean = sum / values.length;
                    stats[col] = {
                        count: values.length,
                        mean: mean.toFixed(2),
                        min: Math.min(...values),
                        max: Math.max(...values)
                    };
                }
            });
            
            return {
                content: [
                    {
                        type: 'text',
                        text: `✅ Datos cargados desde API\n\n` +
                               `🔗 **URL:** ${url}\n` +
                               `📊 **Filas:** ${rowCount}\n` +
                               `📋 **Columnas:** ${columns.length}\n` +
                               `📄 **Columnas:** ${columns.join(', ')}\n\n` +
                               (showPreview ? `**Vista previa (primeras 5 filas):**\n\`\`\`json\n${JSON.stringify(preview, null, 2)}\n\`\`\`\n\n` : '') +
                               `**Estadísticas de columnas numéricas:**\n\`\`\`json\n${JSON.stringify(stats, null, 2)}\n\`\`\``
                    }
                ]
            };
        } catch (error) {
            return {
                content: [{ type: 'text', text: `❌ Error transformando API a DataFrame: ${error}` }]
            };
        }
    }
);

server.tool(
    "analyze-dataframe",
    "Analiza un DataFrame y genera estadísticas descriptivas",
    {
        data: z.array(z.record(z.string(), z.any())).describe("Datos para analizar (array de objetos)"),
        includeInsights: z.boolean().default(true).describe("Incluir insights automáticos"),
        groupBy: z.string().optional().describe("Columna para agrupar datos (opcional)")
    },
    async ({ data, includeInsights = true, groupBy }) => {
        try {
            const rowCount = data.length;
            const columns = data.length > 0 ? Object.keys(data[0]) : [];
            
            // Tipos de datos
            const dtypes: Record<string, string> = {};
            columns.forEach(col => {
                const sample = data.find(row => row[col] != null)?.[col];
                if (typeof sample === 'number') dtypes[col] = 'number';
                else if (typeof sample === 'boolean') dtypes[col] = 'boolean';
                else if (sample instanceof Date) dtypes[col] = 'date';
                else if (typeof sample === 'object') dtypes[col] = 'object';
                else dtypes[col] = 'string';
            });
            
            // Estadísticas descriptivas
            const numericColumns = columns.filter(col => dtypes[col] === 'number');
            const stats: Record<string, any> = {};
            
            numericColumns.forEach(col => {
                const values = data
                    .map(row => row[col])
                    .filter(v => typeof v === 'number' && !isNaN(v));

                if (values.length > 0) {
                    const sorted = values.sort((a, b) => a - b);
                    const sum = values.reduce((a, b) => a + b, 0);
                    const mean = sum / values.length;

                    stats[col] = {
                        count: values.length,
                        mean: parseFloat(mean.toFixed(2)),
                        min: sorted[0],
                        max: sorted[sorted.length - 1],
                        '25%': sorted[Math.floor(sorted.length * 0.25)],
                        '50%': sorted[Math.floor(sorted.length * 0.5)],
                        '75%': sorted[Math.floor(sorted.length * 0.75)]
                    };
                }
            });
            
            // Agrupación simple si se especifica
            let groupResults = null;
            if (groupBy && columns.includes(groupBy)) {
                const groups = new Map();
                data.forEach(row => {
                    const key = row[groupBy];
                    if (!groups.has(key)) groups.set(key, 0);
                    groups.set(key, groups.get(key) + 1);
                });
                
                groupResults = Array.from(groups.entries()).map(([key, count]) => ({
                    [groupBy]: key,
                    count
                }));
            }
            
            // Insights automáticos
            const insights = includeInsights ? [
                `Se analizaron ${rowCount} registros`,
                `Encontradas ${columns.length} columnas`,
                `${numericColumns.length} columnas numéricas detectadas`,
                ...numericColumns.map(col => {
                    const stat = stats[col];
                    return `${col}: Promedio ${stat.mean}, Rango ${stat.min}-${stat.max}`;
                })
            ] : [];
            
            return {
                content: [
                    {
                        type: 'text',
                        text: `📊 **Análisis de DataFrame**\n\n` +
                               `📈 **Información general:**\n` +
                               `• Filas: ${rowCount}\n` +
                               `• Columnas: ${columns.length}\n\n` +
                               `**Tipos de datos:**\n${Object.entries(dtypes).map(([col, type]) => `• ${col}: ${type}`).join('\n')}\n\n` +
                               `**Estadísticas descriptivas:**\n\`\`\`json\n${JSON.stringify(stats, null, 2)}\n\`\`\`\n\n` +
                               (groupResults ? `**Agrupación por ${groupBy}:**\n\`\`\`json\n${JSON.stringify(groupResults, null, 2)}\n\`\`\`\n\n` : '') +
                               (insights.length > 0 ? `**Insights automáticos:**\n${insights.map(insight => `• ${insight}`).join('\n')}` : '')
                    }
                ]
            };
        } catch (error) {
            return {
                content: [{ type: 'text', text: `❌ Error analizando DataFrame: ${error}` }]
            };
        }
    }
);

server.tool(
    "upload-dataframe-to-database",
    "Sube un array de objetos a la base de datos seleccionada, con opción de generar embeddings",
    {
        target: z.enum(['mysql', 'postgresql', 'mongodb']).describe("Tipo de base de datos destino"),
        connection: z.any().describe("Configuración de conexión"),
        table: z.string().optional().describe("Nombre de tabla (MySQL/PostgreSQL)"),
        collection: z.string().optional().describe("Nombre de colección (MongoDB)"),
        data: z.array(z.record(z.string(), z.any())).describe("Datos a subir"),
        embed: z.boolean().optional().default(false).describe("Generar embeddings"),
        textField: z.string().optional().describe("Campo de texto para embeddings"),
        embeddingField: z.string().optional().describe("Campo donde guardar el embedding (default: embedding)")
    },
    async ({ target, connection, table, collection, data, embed = false, textField, embeddingField = 'embedding' }) => {
        try {
            if (embed) {
                if (!textField) throw new Error('Debe especificar textField para generar embeddings');
                for (const row of data) {
                    const text = row[textField];
                    if (typeof text === 'string' && text.trim() !== '') {
                        const resp: any = await safeFetch('http://localhost:11434/api/embeddings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            expectJson: true,
                            body: JSON.stringify({ model: 'nomic-embed-text', prompt: text })
                        });
                        if (resp && resp.embedding) {
                            (row as any)[embeddingField] = resp.embedding;
                        }
                    }
                }
            }

            switch (target) {
                case 'mysql': {
                    if (!table) throw new Error('Debe proporcionar el nombre de la tabla');
                    const conn = await mysqlHelpers.createMySQLConnection(connection);
                    try {
                        if (data.length === 0) break;
                        const columns = Object.keys(data[0]);
                        const placeholders = columns.map(() => '?').join(',');
                        const sql = `INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`;
                        for (const row of data) {
                            const values = columns.map(c => row[c]);
                            await conn.execute(sql, values);
                        }
                    } finally { await conn.end(); }
                    break; }
                case 'postgresql': {
                    if (!table) throw new Error('Debe proporcionar el nombre de la tabla');
                    const pool = postgresHelpers.createPostgreSQLPool(connection);
                    try {
                        if (data.length === 0) break;
                        const columns = Object.keys(data[0]);
                        for (const row of data) {
                            const placeholders = columns.map((_, i) => `$${i+1}`).join(',');
                            const sql = `INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`;
                            const values = columns.map(c => row[c]);
                            await pool.query(sql, values);
                        }
                    } finally { await pool.end(); }
                    break; }
                case 'mongodb': {
                    if (!collection) throw new Error('Debe proporcionar el nombre de la colección');
                    const { client, db } = await mongoHelpers.createMongoDBConnection(connection);
                    try {
                        const coll = db.collection(collection);
                        if (data.length > 0) await coll.insertMany(data);
                    } finally { await client.close(); }
                    break; }
            }

            return { content: [ { type: 'text', text: `✅ Se subieron ${data.length} registros a ${target}` } ] };
        } catch (error) {
            return { content: [ { type: 'text', text: `❌ Error subiendo datos: ${error}` } ] };
        }
    }
);

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // No usar console.log ya que interfiere con el protocolo MCP en stdout
}

main().catch((error) => {
    // Usar stderr para errores, no stdout
    process.stderr.write(`Error starting server: ${error}\n`);
    process.exit(1);
});