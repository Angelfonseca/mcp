import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetchHelpers from "./helpers/fetchs.js";
import * as mysqlHelpers from "./helpers/mysql.js";
import * as mongoHelpers from "./helpers/mongodb.js";
import * as postgresHelpers from "./helpers/postgresql.js";
import * as reportsHelpers from './helpers/reports.js';
import * as filesHelpers from './helpers/files.js';
import { safeFetch } from './helpers/fetchs.js';
import { getEmbedding } from './helpers/ollama.js';
import * as pythonHelpers from './helpers/python.js';
import { SQLGenerator } from './helpers/sql-generator.js';

export const USER_AGENT = "data-analysis-mcp/1.0.0";

async function generateEmbeddingsForData(data: any[], textField: string, embeddingField: string) {
  for (const row of data) {
    const text = (row as any)[textField];
    if (typeof text === 'string' && text.trim() !== '') {
      try {
        const embedding = await getEmbedding(text);
        if (embedding) {
          (row as any)[embeddingField] = embedding;
        }
      } catch (error) {
        console.error('Error generating embedding for row:', row, error);
        (row as any)[embeddingField] = null;
      }
    }
  }
}

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
            },
            analysisType: {
              type: 'string',
              enum: ['basic', 'correlation', 'anomalies', 'clustering'],
              default: 'basic',
              description: 'Tipo de análisis estadístico a realizar'
            },
            anomalyColumn: {
              type: 'string',
              description: 'Columna para detectar anomalías (requerido si analysisType es anomalies)'
            },
            clusterColumns: {
              type: 'array',
              items: { type: 'string' },
              description: 'Dos columnas para clustering [x, y] (requerido si analysisType es clustering)'
            },
            clusterCount: {
              type: 'number',
              default: 3,
              description: 'Número de clusters para k-means'
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
    "Crea reportes ejecutivos profesionales con análisis estadístico completo, visualizaciones, insights y recomendaciones. Exporta a PDF de alta calidad, DOCX para editar, o HTML interactivo. Incluye resumen ejecutivo, estadísticas descriptivas, correlaciones, outliers y conclusiones automáticas.",
    {
        title: z.string().describe("Título principal del reporte ejecutivo (ej: 'Análisis de Ventas Q4 2024', 'Estudio de Mercado - Productos Tech')"),
        subtitle: z.string().optional().describe("Subtítulo descriptivo opcional (ej: 'Informe mensual de KPIs', 'Análisis comparativo regional')"),
        author: z.string().optional().describe("Nombre del autor o equipo responsable (ej: 'Equipo de Data Science', 'Ana López - Business Intelligence')"),
        data: z.array(z.record(z.string(), z.any())).describe("Array de objetos con los datos a analizar en el reporte (serán la base para estadísticas y gráficos)"),
        sections: z.array(z.object({
            title: z.string(),
            type: z.enum(['text', 'table', 'chart', 'list']).describe("'text'=párrafos/resumen, 'table'=tabla de datos, 'chart'=gráfico visual, 'list'=insights/recomendaciones"),
            content: z.string().optional().describe("Contenido de texto libre para sección tipo 'text' (Markdown soportado)"),
            chartConfig: z.object({
                type: z.enum(['bar', 'line', 'pie', 'doughnut', 'scatter']),
                title: z.string(),
                dataColumn: z.string().describe("Nombre de la columna de los datos que contiene valores numéricos"),
                labelColumn: z.string().describe("Nombre de la columna que contiene las etiquetas/categorías")
            }).optional().describe("Configuración del gráfico para secciones tipo 'chart' - extrae datos automáticamente del dataset")
        })).describe("Estructura del reporte por secciones - define el flujo narrativo del documento"),
        format: z.enum(['html', 'markdown', 'pdf', 'docx']).default('html').describe("'pdf'=documento listo para imprimir/presentar, 'docx'=Word editable, 'html'=web con gráficos interactivos, 'markdown'=texto estructurado"),
        theme: z.enum(['light', 'dark']).default('light').describe("Tema visual del reporte - 'light'=fondo blanco profesional, 'dark'=fondo oscuro moderno"),
        outputPath: z.string().optional().describe("Ruta completa donde guardar el archivo (ej: '/Users/usuario/Documents/reporte_ventas.pdf') - si no se especifica, se usa directorio temporal")
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
                format: format as 'html' | 'markdown' | 'pdf' | 'docx',
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
    "analyze-dataframe",
    "Motor de análisis estadístico avanzado para datasets grandes: estadísticas descriptivas completas, matrices de correlación, detección de outliers automática, clustering K-means con PCA, y análisis de segmentación. Optimizado para datasets de millones de registros con muestreo inteligente y control de memoria.",
    {
        data: z.array(z.record(z.string(), z.any())).describe("Array de objetos con el dataset completo a analizar"),
        includeInsights: z.boolean().default(true).describe("Si generar insights automáticos con interpretación estadística y recomendaciones de acción"),
        groupBy: z.string().optional().describe("Nombre de columna categórica para segmentar análisis (ej: 'región', 'categoría', 'año')"),
        aggregation: z.enum(['count', 'sum', 'avg']).optional().describe("Función de agregación para groupBy: 'count'=conteo registros, 'sum'=suma valores, 'avg'=promedio"),
        targetColumn: z.string().optional().describe("Columna numérica objetivo para la agregación (requerida para 'sum' y 'avg')"),
        analysisType: z.enum(['basic', 'correlation', 'anomalies', 'clustering']).default('basic').describe("'basic'=estadísticas descriptivas, 'correlation'=matriz correlación, 'anomalies'=detección outliers IQR/Z-score, 'clustering'=K-means+PCA"),
        anomalyColumn: z.string().optional().describe("Columna numérica específica para detectar outliers (requerida para analysisType='anomalies')"),
        clusterColumns: z.array(z.string()).optional().describe("Exactamente 2 columnas numéricas para clustering 2D [columna_x, columna_y] (requeridas para analysisType='clustering')"),
        clusterCount: z.number().default(3).describe("Número de clusters K para algoritmo K-means (3-10 recomendado)"),
        sampleSize: z.number().optional().describe("Máximo número de registros a procesar (auto-sampling para datasets >500K registros)"),
        maxMemoryMB: z.number().default(512).describe("Límite de memoria RAM en MB - activa muestreo automático si se excede")
    },
    async ({ data, includeInsights, groupBy, aggregation, targetColumn, analysisType, anomalyColumn, clusterColumns, clusterCount, sampleSize, maxMemoryMB }) => {
        try {
            const startTime = Date.now();
            
            // Estimación de uso de memoria
            const estimatedMemoryMB = (JSON.stringify(data).length / 1024 / 1024);
            console.log(`📊 Dataset: ${data.length} filas, ~${estimatedMemoryMB.toFixed(1)}MB`);
            
            // Aplicar muestreo si el dataset es muy grande
            let analysisData = data;
            let usedSampling = false;
            
            if (estimatedMemoryMB > maxMemoryMB || (sampleSize && data.length > sampleSize)) {
                const targetSize = sampleSize || Math.min(data.length, Math.floor(maxMemoryMB * 1024 * 1024 / (JSON.stringify(data[0] || {}).length || 100)));
                
                console.log(`⚡ Aplicando muestreo: ${targetSize} filas de ${data.length} total`);
                analysisData = sampleData(data, targetSize);
                usedSampling = true;
            }

            let result: any = {
                metadata: {
                    originalRows: data.length,
                    analyzedRows: analysisData.length,
                    usedSampling,
                    columns: analysisData.length > 0 ? Object.keys(analysisData[0]) : [],
                    processingTimeMs: 0,
                    estimatedMemoryMB: estimatedMemoryMB.toFixed(1)
                },
                analysis: {}
            };

            // Análisis básico de estadísticas descriptivas con optimización
            if (analysisData.length > 0) {
                console.log(`🔢 Calculando estadísticas descriptivas...`);
                result.analysis.descriptiveStats = await calculateOptimizedStats(analysisData);
            }

            // Análisis avanzados según el tipo seleccionado
            switch (analysisType) {
                case 'correlation':
                    console.log(`🔗 Calculando matriz de correlación...`);
                    const correlationResult = reportsHelpers.calculateCorrelationMatrix(analysisData);
                    result.analysis.correlations = correlationResult.correlations;
                    result.insights = correlationResult.insights;
                    break;

                case 'anomalies':
                    if (!anomalyColumn) throw new Error('Se requiere anomalyColumn para análisis de anomalías');
                    console.log(`🚨 Detectando anomalías en columna: ${anomalyColumn}`);
                    const anomalyResult = reportsHelpers.detectAnomalies(analysisData, anomalyColumn);
                    result.analysis.anomalies = {
                        detected: anomalyResult.anomalies.length,
                        samples: anomalyResult.anomalies.slice(0, 10), // Solo primeras 10 para evitar sobrecarga
                        totalDataPoints: analysisData.length
                    };
                    result.insights = anomalyResult.insights;
                    break;

                case 'clustering':
                    if (!clusterColumns || clusterColumns.length !== 2) {
                        throw new Error('Se requieren exactamente 2 columnas para clustering');
                    }
                    console.log(`🎯 Ejecutando clustering k-means con k=${clusterCount}`);
                    
                    // Para clustering, usar muestra más pequeña si es necesario
                    const clusterData = analysisData.length > 10000 ? sampleData(analysisData, 10000) : analysisData;
                    const clusteringResult = reportsHelpers.performKMeansClustering(
                        clusterData, clusterColumns[0], clusterColumns[1], clusterCount
                    );
                    
                    result.analysis.clusters = {
                        k: clusterCount,
                        totalPoints: clusterData.length,
                        clusterSummary: clusteringResult.clusters.map(c => ({
                            id: c.id,
                            size: c.size,
                            centroid: c.centroid,
                            samplePoints: c.points.slice(0, 5) // Solo 5 puntos de muestra
                        }))
                    };
                    result.insights = clusteringResult.insights;
                    break;

                default: // 'basic'
                    if (includeInsights) {
                        result.insights = [
                            `Dataset ${usedSampling ? 'muestreado' : 'completo'}: ${analysisData.length} filas analizadas`,
                            `Columnas numéricas: ${Object.keys(result.analysis.descriptiveStats || {}).length}`,
                            `Memoria estimada: ${estimatedMemoryMB.toFixed(1)}MB`
                        ];
                    }
                    break;
            }

            // Análisis de agrupación optimizado
            if (groupBy && aggregation && targetColumn) {
                console.log(`📊 Ejecutando agrupación por: ${groupBy}`);
                result.analysis.groupedAnalysis = await calculateGroupedAnalysis(
                    analysisData, groupBy, aggregation, targetColumn
                );
            }

            result.metadata.processingTimeMs = Date.now() - startTime;
            console.log(`✅ Análisis completado en ${result.metadata.processingTimeMs}ms`);

            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
            };
        } catch (error) {
            const err = error as Error;
            return {
                content: [{ type: 'text', text: `❌ Error en análisis: ${err.message}` }]
            };
        }
    }
);

/**
 * Aplica muestreo aleatorio estratificado para datasets grandes
 */
function sampleData(data: any[], targetSize: number): any[] {
    if (data.length <= targetSize) return data;
    
    const step = data.length / targetSize;
    const sample: any[] = [];
    
    for (let i = 0; i < targetSize; i++) {
        const index = Math.floor(i * step + Math.random() * step);
        if (index < data.length) {
            sample.push(data[index]);
        }
    }
    
    return sample;
}

/**
 * Calcula estadísticas descriptivas de forma optimizada
 */
async function calculateOptimizedStats(data: any[]): Promise<any> {
    const result: any = {};
    
    if (data.length === 0) return result;
    
    const numericColumns = Object.keys(data[0]).filter(col => 
        data.some(row => typeof row[col] === 'number' && !isNaN(row[col]))
    );
    
    // Procesar columnas en lotes para evitar bloquear el event loop
    return filesHelpers.processBatch(numericColumns, async (columnBatch) => {
        const batchResults: any = {};
        
        columnBatch.forEach(col => {
            const values = data.map(row => row[col])
                .filter((v: any) => typeof v === 'number' && !isNaN(v));

                if (values.length > 0) {
                const sorted = values.sort((a: number, b: number) => a - b);
                const sum = values.reduce((a: number, b: number) => a + b, 0);
                    const mean = sum / values.length;

                batchResults[col] = {
                        count: values.length,
                    mean: parseFloat(mean.toFixed(4)),
                    median: sorted[Math.floor(sorted.length / 2)],
                        min: sorted[0],
                        max: sorted[sorted.length - 1],
                    std: parseFloat(Math.sqrt(
                        values.map((x: number) => Math.pow(x - mean, 2))
                            .reduce((a: number, b: number) => a + b, 0) / values.length
                    ).toFixed(4)),
                    q25: sorted[Math.floor(sorted.length * 0.25)],
                    q75: sorted[Math.floor(sorted.length * 0.75)]
                    };
                }
            });
            
        return [batchResults];
    }, 5).then(batches => {
        batches.forEach(batch => Object.assign(result, batch));
        return result;
    });
}

/**
 * Calcula análisis agrupado de forma eficiente
 */
async function calculateGroupedAnalysis(data: any[], groupBy: string, aggregation: string, targetColumn: string): Promise<any> {
    const grouped: { [key: string]: number[] } = {};
    
    // Agrupar datos
    data.forEach(row => {
        const key = String(row[groupBy] || 'null');
        if (!grouped[key]) grouped[key] = [];
        
        const value = row[targetColumn];
        if (typeof value === 'number' && !isNaN(value)) {
            grouped[key].push(value);
        }
    });
    
    // Calcular agregaciones
    const result: any = {};
    Object.keys(grouped).forEach(key => {
        const values = grouped[key];
        if (values.length > 0) {
            switch (aggregation) {
                case 'count':
                    result[key] = values.length;
                    break;
                case 'sum':
                    result[key] = values.reduce((a: number, b: number) => a + b, 0);
                    break;
                case 'avg':
                    result[key] = parseFloat((values.reduce((a: number, b: number) => a + b, 0) / values.length).toFixed(4));
                    break;
            }
        }
    });
    
    return result;
}

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
                await generateEmbeddingsForData(data, textField, embeddingField);
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
                    break;
                }
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
                    break;
                }
                case 'mongodb': {
                    if (!collection) throw new Error('Debe proporcionar el nombre de la colección');
                    const { client, db } = await mongoHelpers.createMongoDBConnection(connection);
                    try {
                        const coll = db.collection(collection);
                        if (data.length > 0) await coll.insertMany(data);
                    } finally { await client.close(); }
                    break;
                }
            }

            return { content: [ { type: 'text', text: `✅ Se subieron ${data.length} registros a ${target}` } ] };
        } catch (error) {
            return { content: [ { type: 'text', text: `❌ Error subiendo datos: ${error}` } ] };
        }
    }
);

server.tool(
    "migrate-data-to-database",
    "Herramienta ETL completa para migrar millones de registros desde archivos (CSV/Excel/JSON) o APIs REST hacia MySQL/PostgreSQL/MongoDB. Incluye transformaciones de datos (rename/cast/filter), procesamiento en lotes optimizado, reintentos automáticos, control de memoria y validación de datos. Maneja archivos de GB con encoding automático.",
    {
        source: z.object({
            type: z.enum(['api', 'csv', 'excel', 'json']).describe("'csv'=archivos CSV con auto-detección encoding/delimitadores, 'excel'=archivos .xlsx/.xls, 'json'=archivos JSON planos, 'api'=endpoints REST"),
            url: z.string().optional().describe("URL completa del endpoint REST (requerida para type='api') ej: 'https://api.empresa.com/datos'"),
            filePath: z.string().optional().describe("Ruta completa del archivo local (requerida para csv/excel/json) ej: '/Users/usuario/datos.csv'"),
            headers: z.record(z.string()).optional().describe("Headers HTTP adicionales para APIs (ej: {'Authorization': 'Bearer token', 'Content-Type': 'application/json'})"),
            params: z.record(z.any()).optional().describe("Query parameters para APIs (ej: {'page': 1, 'limit': 1000}) - se añaden como ?page=1&limit=1000"),
            maxRows: z.number().optional().describe("Límite máximo de registros a procesar (útil para testing o datasets enormes) - 0 = sin límite"),
            batchSize: z.number().default(5000).describe("Registros procesados por lote en memoria (5000-50000 recomendado según tamaño dataset)")
        }),
        target: z.object({
            type: z.enum(['mysql', 'mongodb', 'postgresql']).describe("Motor de base de datos destino"),
            connection: z.any().describe("Objeto configuración conexión BD: {host, port, user, password, database} para SQL o {connectionString} para MongoDB"),
            table: z.string().optional().describe("Nombre tabla destino en MySQL/PostgreSQL (se crea automáticamente si no existe)"),
            collection: z.string().optional().describe("Nombre colección destino en MongoDB (se crea automáticamente si no existe)"),
            batchSize: z.number().default(1000).optional().describe("Registros insertados por transacción BD (1000-5000 óptimo para rendimiento)"),
            timeout: z.number().default(300000).describe("Timeout por operación BD en milisegundos (300000 = 5 minutos)")
        }),
        transformations: z.array(z.object({
            column: z.string().describe("Nombre exacto de la columna a transformar"),
            operation: z.enum(['rename', 'cast', 'filter']).describe("'rename'=cambiar nombre columna, 'cast'=convertir tipo dato, 'filter'=filtrar registros por condición"),
            params: z.record(z.any()).describe("Parámetros según operación: rename={newName:'nuevo_nombre'}, cast={type:'number'|'string'|'boolean'}, filter={operator:'equals'|'greater_than'|'contains', compareValue:valor}")
        })).optional().describe("Array transformaciones ETL aplicadas secuencialmente a los datos antes de insertar en BD"),
        retries: z.number().default(3).describe("Número reintentos automáticos en caso fallo red/BD (con backoff exponencial)")
    },
    async ({ source, target, transformations, retries }) => {
        let data: any[] = [];
        let attempt = 0;
        
        while (attempt < retries) {
            try {
                console.log(`🔄 Intento ${attempt + 1}/${retries} de migración de datos`);
                
                // Cargar datos con optimizaciones
                switch (source.type) {
                    case 'csv':
                        if (!source.filePath) throw new Error('Se requiere filePath para CSV');
                        data = await filesHelpers.readCSV(source.filePath, {
                            maxRows: source.maxRows,
                            batchSize: source.batchSize
                        });
                        break;
                        
                    case 'excel':
                        if (!source.filePath) throw new Error('Se requiere filePath para Excel');
                        data = filesHelpers.readExcel(source.filePath, {
                            maxRows: source.maxRows,
                            batchSize: source.batchSize
                        });
                        break;
                        
                    case 'api':
                        if (!source.url) throw new Error('Se requiere URL para API');
                        
                        let fullUrl = source.url;
                        if (source.params) {
                            const searchParams = new URLSearchParams(source.params);
                            fullUrl += (fullUrl.includes('?') ? '&' : '?') + searchParams.toString();
                        }

                        // Timeout para APIs
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), target.timeout);
                        
                        try {
                            data = await safeFetch(fullUrl, {
                                headers: source.headers,
                                expectJson: true,
                                signal: controller.signal
                            });
                        } finally {
                            clearTimeout(timeoutId);
                        }
                        break;
                        
                    default:
                        throw new Error(`Tipo de fuente no soportado: ${source.type}`);
                }

                console.log(`📊 Datos cargados: ${data.length} registros`);

                // Aplicar transformaciones si existen
                if (transformations && transformations.length > 0) {
                    console.log(`🔧 Aplicando ${transformations.length} transformaciones...`);
                    data = await applyTransformations(data, transformations);
                }

                // Insertar en base de datos usando procesamiento en lotes
                await insertDataInBatches(data, target);

                console.log(`✅ Migración completada exitosamente: ${data.length} registros`);
                return {
                    content: [{ 
                        type: 'text', 
                        text: `✅ Migración completada: ${data.length} registros migrados desde ${source.type} a ${target.type}.\nProcesado en lotes de ${target.batchSize} registros.` 
                    }]
                };
                
            } catch (error) {
                attempt++;
                const err = error as Error;
                console.error(`❌ Error en intento ${attempt}: ${err.message}`);
                
                if (attempt >= retries) {
                    return {
                        content: [{ 
                            type: 'text', 
                            text: `❌ Error después de ${retries} intentos: ${err.message}.\nSugerencias:\n- Reducir batchSize\n- Aumentar timeout\n- Verificar conexión a BD` 
                        }]
                    };
                }
                
                // Espera exponencial entre reintentos
                const delay = Math.pow(2, attempt - 1) * 1000;
                console.log(`⏳ Reintentando en ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        return {
            content: [{ type: 'text', text: `❌ Error: Se agotaron los ${retries} intentos` }]
        };
    }
);

/**
 * Aplica transformaciones a los datos
 */
async function applyTransformations(data: any[], transformations: any[]): Promise<any[]> {
    return filesHelpers.processBatch(data, async (batch) => {
        return batch.map(row => {
            let newRow = { ...row };
            
            transformations.forEach(transform => {
                const { column, operation, params } = transform;
                
                switch (operation) {
                    case 'rename':
                        if (params.newName && newRow[column] !== undefined) {
                            newRow[params.newName] = newRow[column];
                            delete newRow[column];
                        }
                        break;
                        
                    case 'cast':
                        if (newRow[column] !== undefined) {
                            switch (params.type) {
                                case 'number':
                                    newRow[column] = Number(newRow[column]) || 0;
                                    break;
                                case 'string':
                                    newRow[column] = String(newRow[column]);
                                    break;
                                case 'boolean':
                                    newRow[column] = Boolean(newRow[column]);
                                    break;
                            }
                        }
                        break;
                        
                    case 'filter':
                        // El filtrado se puede hacer a nivel de lote
                        break;
                }
            });
            
            return newRow;
        }).filter(row => {
            // Aplicar filtros
            return transformations.every(transform => {
                if (transform.operation === 'filter') {
                    const value = row[transform.column];
                    const { operator, compareValue } = transform.params;
                    
                    switch (operator) {
                        case 'equals': return value === compareValue;
                        case 'not_equals': return value !== compareValue;
                        case 'greater_than': return Number(value) > Number(compareValue);
                        case 'less_than': return Number(value) < Number(compareValue);
                        case 'contains': return String(value).includes(compareValue);
                        default: return true;
                    }
                }
                return true;
            });
        });
    }, 1000);
}

/**
 * Inserta datos en la base de datos usando procesamiento en lotes
 */
async function insertDataInBatches(data: any[], target: any): Promise<void> {
    const { type, connection, table, collection, batchSize = 1000, timeout } = target;
    
    await filesHelpers.processBatch(data, async (batch, batchIndex) => {
        const timeoutPromise = timeout ? 
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout de inserción')), timeout)) :
            null;
            
        const insertPromise = insertBatch(batch, type, connection, table, collection);
        
        if (timeoutPromise) {
            await Promise.race([insertPromise, timeoutPromise]);
        } else {
            await insertPromise;
        }
        
        return []; // Retorna array vacío para mantener la interfaz
    }, batchSize);
}

/**
 * Inserta un lote de datos en la base de datos especificada
 */
async function insertBatch(batch: any[], dbType: string, connection: any, table?: string, collection?: string): Promise<void> {
    if (batch.length === 0) return;
    
    switch (dbType) {
        case 'mysql': {
            if (!table) throw new Error('Tabla requerida para MySQL');
            const conn = await mysqlHelpers.createMySQLConnection(connection);
            
            try {
                const columns = Object.keys(batch[0]);
                const placeholders = columns.map(() => '?').join(',');
                const sql = `INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`;
                
                for (const row of batch) {
                    const values = columns.map(c => row[c]);
                    await conn.execute(sql, values);
                }
            } finally {
                await conn.end();
            }
            break;
        }
        
        case 'postgresql': {
            if (!table) throw new Error('Tabla requerida para PostgreSQL');
            const pool = postgresHelpers.createPostgreSQLPool(connection);
            
            try {
                const columns = Object.keys(batch[0]);
                
                for (const row of batch) {
                    const placeholders = columns.map((_, i) => `$${i+1}`).join(',');
                    const sql = `INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`;
                    const values = columns.map(c => row[c]);
                    await pool.query(sql, values);
                }
            } finally {
                await pool.end();
            }
            break;
        }
        
        case 'mongodb': {
            if (!collection) throw new Error('Colección requerida para MongoDB');
            const { client, db } = await mongoHelpers.createMongoDBConnection(connection);
            
            try {
                const coll = db.collection(collection);
                await coll.insertMany(batch, { ordered: false }); // Inserción no ordenada para mejor rendimiento
            } finally {
                await client.close();
            }
            break;
        }
        
        default:
            throw new Error(`Tipo de BD no soportado: ${dbType}`);
    }
}

server.tool(
    "monitor-performance",
    "Monitorea el rendimiento del sistema y proporciona recomendaciones para optimizar el procesamiento de grandes datasets",
    {
        operation: z.enum(['memory', 'benchmark', 'recommendations']).describe("Tipo de monitoreo a realizar"),
        dataSize: z.number().optional().describe("Tamaño del dataset en número de filas (para recomendaciones)"),
        availableMemoryMB: z.number().optional().describe("Memoria disponible en MB (para recomendaciones)")
    },
    async ({ operation, dataSize, availableMemoryMB }) => {
        try {
            const startTime = Date.now();
            let result: any = {
                timestamp: new Date().toISOString(),
                operation,
                metrics: {}
            };

            switch (operation) {
                case 'memory':
                    // Monitoreo de memoria
                    const memUsage = process.memoryUsage();
                    result.metrics = {
                        heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
                        heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
                        external: `${(memUsage.external / 1024 / 1024).toFixed(2)} MB`,
                        rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`,
                        arrayBuffers: `${(memUsage.arrayBuffers / 1024 / 1024).toFixed(2)} MB`
                    };
                    
                    result.status = memUsage.heapUsed / memUsage.heapTotal > 0.8 ? 
                        'warning' : 'normal';
                    
                    result.recommendations = [
                        memUsage.heapUsed / memUsage.heapTotal > 0.8 ? 
                            '⚠️ Alto uso de memoria heap. Considera usar muestreo o procesamiento en lotes.' : 
                            '✅ Uso de memoria normal.',
                        `💡 Para datasets grandes (>100MB), usa parámetros maxRows y batchSize en las herramientas.`
                    ];
                    break;

                case 'benchmark':
                    // Benchmark básico del sistema
                    console.log('🏃 Ejecutando benchmark de rendimiento...');
                    
                    // Test de CPU
                    const cpuStartTime = Date.now();
                    let sum = 0;
                    for (let i = 0; i < 1000000; i++) {
                        sum += Math.sqrt(i);
                    }
                    const cpuTime = Date.now() - cpuStartTime;
                    
                    // Test de memoria
                    const memStartTime = Date.now();
                    const testArray = new Array(100000).fill(0).map((_, i) => ({ id: i, value: Math.random() }));
                    const memTime = Date.now() - memStartTime;
                    
                    // Test de I/O (simulado)
                    const ioStartTime = Date.now();
                    await new Promise(resolve => setTimeout(resolve, 10));
                    const ioTime = Date.now() - ioStartTime;
                    
                    result.metrics = {
                        cpuPerformance: `${cpuTime}ms (cálculos matemáticos)`,
                        memoryPerformance: `${memTime}ms (array de 100k elementos)`,
                        ioLatency: `${ioTime}ms (latencia simulada)`,
                        systemScore: calculateSystemScore(cpuTime, memTime, ioTime)
                    };
                    
                    result.recommendations = [
                        cpuTime > 500 ? '🐌 CPU lento. Reduce batchSize y aumenta delays.' : '🚀 CPU rápido.',
                        memTime > 100 ? '📝 Memoria lenta. Usa muestreo para datasets grandes.' : '💾 Memoria rápida.',
                        '💡 Scores: Excelente (<50), Bueno (50-100), Regular (100-200), Lento (>200)'
                    ];
                    break;

                case 'recommendations':
                    // Recomendaciones basadas en tamaño
                    if (!dataSize) {
                        throw new Error('Se requiere dataSize para generar recomendaciones');
                    }
                    
                    const estimatedMemoryMB = (dataSize * 0.5) / 1000; // Estimación: ~0.5KB por fila promedio
                    const currentMemory = availableMemoryMB || 2048; // Default 2GB
                    
                    result.metrics = {
                        datasetSize: `${dataSize.toLocaleString()} filas`,
                        estimatedMemory: `${estimatedMemoryMB.toFixed(1)} MB`,
                        availableMemory: `${currentMemory} MB`,
                        memoryRatio: `${((estimatedMemoryMB / currentMemory) * 100).toFixed(1)}%`
                    };
                    
                    result.recommendations = generateDataProcessingRecommendations(dataSize, estimatedMemoryMB, currentMemory);
                    result.suggestedParameters = generateSuggestedParameters(dataSize, estimatedMemoryMB, currentMemory);
                    break;

                default:
                    throw new Error(`Operación no soportada: ${operation}`);
            }

            result.processingTime = `${Date.now() - startTime}ms`;

            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
            };
        } catch (error) {
            const err = error as Error;
            return {
                content: [{ type: 'text', text: `❌ Error en monitoreo: ${err.message}` }]
            };
        }
    }
);

/**
 * Calcula un score de rendimiento del sistema
 */
function calculateSystemScore(cpuTime: number, memTime: number, ioTime: number): string {
    const score = (cpuTime * 0.4) + (memTime * 0.4) + (ioTime * 0.2);
    
    if (score < 50) return `${score.toFixed(0)} (Excelente)`;
    if (score < 100) return `${score.toFixed(0)} (Bueno)`;
    if (score < 200) return `${score.toFixed(0)} (Regular)`;
    return `${score.toFixed(0)} (Lento)`;
}

/**
 * Genera recomendaciones específicas para procesamiento de datos
 */
function generateDataProcessingRecommendations(dataSize: number, estimatedMemoryMB: number, availableMemoryMB: number): string[] {
    const recommendations: string[] = [];
    
    // Recomendaciones basadas en tamaño
    if (dataSize > 1000000) {
        recommendations.push('🔥 Dataset muy grande (>1M filas). Usa muestreo obligatorio.');
    } else if (dataSize > 100000) {
        recommendations.push('📊 Dataset grande (>100K filas). Considera muestreo para análisis exploratorio.');
    } else {
        recommendations.push('✅ Dataset manejable. Procesamiento completo recomendado.');
    }
    
    // Recomendaciones basadas en memoria
    const memoryRatio = estimatedMemoryMB / availableMemoryMB;
    if (memoryRatio > 0.8) {
        recommendations.push('⚠️ Alto uso de memoria estimado. Usar sampleSize y reducir batchSize.');
    } else if (memoryRatio > 0.5) {
        recommendations.push('💡 Uso moderado de memoria. Monitorear durante procesamiento.');
    } else {
        recommendations.push('💾 Memoria suficiente. Procesamiento optimizado disponible.');
    }
    
    // Recomendaciones específicas por herramienta
    if (dataSize > 50000) {
        recommendations.push('🔧 Para migrate-data-to-database: batchSize=2000, retries=5');
        recommendations.push('📈 Para analyze-dataframe: sampleSize=10000, maxMemoryMB=256');
    }
    
    return recommendations;
}

/**
 * Genera parámetros sugeridos basados en las características del dataset
 */
function generateSuggestedParameters(dataSize: number, estimatedMemoryMB: number, availableMemoryMB: number): any {
    const memoryRatio = estimatedMemoryMB / availableMemoryMB;
    
    // Parámetros conservadores para datasets grandes o memoria limitada
    if (memoryRatio > 0.6 || dataSize > 500000) {
        return {
            migrate: {
                batchSize: Math.min(1000, Math.floor(dataSize / 100)),
                maxRows: Math.min(dataSize, 50000),
                retries: 5,
                timeout: 600000 // 10 minutos
            },
            analyze: {
                sampleSize: Math.min(dataSize, 10000),
                maxMemoryMB: Math.floor(availableMemoryMB * 0.3),
                batchSize: 2000
            }
        };
    }
    
    // Parámetros optimizados para datasets medianos
    return {
        migrate: {
            batchSize: Math.min(5000, Math.floor(dataSize / 50)),
            maxRows: dataSize,
            retries: 3,
            timeout: 300000 // 5 minutos
        },
        analyze: {
            sampleSize: Math.min(dataSize, 50000),
            maxMemoryMB: Math.floor(availableMemoryMB * 0.5),
            batchSize: 5000
        }
    };
}

server.tool(
    "run-python-analysis",
    "Ejecuta código Python personalizado para análisis de datos científicos. Incluye automáticamente pandas, numpy, matplotlib, seaborn, scipy, scikit-learn, plotly. Los datos se cargan como DataFrame 'df'. Funciones predefinidas: describe_data(), correlation_analysis(), detect_outliers(), quick_ml_regression(), save_plot(). Genera gráficos en alta resolución.",
    {
        code: z.string().describe("Código Python a ejecutar. Los datos están disponibles como 'df' (pandas DataFrame). Usa funciones predefinidas como describe_data(), correlation_analysis(), save_plot('nombre'). No necesitas importar librerías básicas."),
        data: z.array(z.record(z.string(), z.any())).optional().describe("Array de objetos que se convierte automáticamente en pandas DataFrame 'df' disponible en el código"),
        includePlots: z.boolean().default(false).describe("Si True, habilita matplotlib y guarda gráficos como archivos PNG de alta calidad (300 DPI)"),
        timeout: z.number().default(60000).describe("Timeout en milisegundos - tiempo máximo de ejecución antes de cancelar (60000 = 1 minuto)"),
        requirements: z.array(z.string()).optional().describe("Paquetes Python adicionales a instalar antes de ejecutar (ej: ['requests', 'beautifulsoup4'])")
    },
    async ({ code, data, includePlots, timeout, requirements }) => {
        try {
            console.log(`🐍 Ejecutando código Python personalizado...`);
            
            const result = await pythonHelpers.executePython(code, data, {
                timeout,
                includePlots,
                requirements: requirements || []
            });
            
            let response = `🐍 **Análisis Python Completado**\n\n`;
            response += `⏱️ **Tiempo de ejecución:** ${result.executionTime}ms\n\n`;
            
            if (result.success) {
                response += `✅ **Estado:** Exitoso\n\n`;
                response += `📊 **Salida:**\n\`\`\`\n${result.output}\n\`\`\`\n\n`;
                
                if (result.plots && result.plots.length > 0) {
                    response += `📈 **Gráficos generados:** ${result.plots.length}\n`;
                    response += `📁 **Rutas:** ${result.plots.join(', ')}\n\n`;
                }
            } else {
                response += `❌ **Estado:** Error\n\n`;
                response += `🚨 **Error:**\n\`\`\`\n${result.error}\n\`\`\`\n\n`;
                if (result.output) {
                    response += `📝 **Salida parcial:**\n\`\`\`\n${result.output}\n\`\`\`\n\n`;
                }
            }
            
            return {
                content: [{ type: 'text', text: response }]
            };
            
        } catch (error) {
            const err = error as Error;
            return {
                content: [{ type: 'text', text: `❌ Error ejecutando Python: ${err.message}` }]
            };
        }
    }
);

server.tool(
    "run-analysis-template",
    "Ejecuta análisis especializados preconfigurados con las mejores prácticas de ciencia de datos: exploración de datos completa, análisis de regresión ML, clustering K-means, series de tiempo, y pruebas estadísticas. Cada template incluye código Python optimizado, visualizaciones automáticas y recomendaciones de experto.",
    {
        templateName: z.enum(['data_exploration', 'regression_analysis', 'clustering_analysis', 'time_series_analysis', 'statistical_testing']).describe("'data_exploration'=estadísticas descriptivas+correlaciones+outliers+distribuciones, 'regression_analysis'=modelos RandomForest+importancia características+validación, 'clustering_analysis'=K-means+PCA+método codo, 'time_series_analysis'=tendencias+estacionalidad+autocorrelación, 'statistical_testing'=pruebas normalidad+t-test+ANOVA"),
        data: z.array(z.record(z.string(), z.any())).describe("Array de objetos con los datos a analizar (se convierte en pandas DataFrame)"),
        parameters: z.record(z.any()).optional().describe("Parámetros específicos por template: target_column (regresión), n_clusters (clustering), date_column (series tiempo), group_column (testing)"),
        includePlots: z.boolean().default(true).describe("Si generar visualizaciones automáticas: histogramas, scatter plots, heatmaps, gráficos PCA, etc."),
        timeout: z.number().default(120000).describe("Timeout en milisegundos - 120000 = 2 minutos (análisis complejos necesitan más tiempo)")
    },
    async ({ templateName, data, parameters = {}, includePlots, timeout }) => {
        try {
            console.log(`📊 Ejecutando template: ${templateName}`);
            
            // Obtener información del template
            const template = pythonHelpers.ANALYSIS_TEMPLATES[templateName];
            if (!template) {
                throw new Error(`Template '${templateName}' no encontrado`);
            }
            
            // Aplicar template con parámetros
            const code = pythonHelpers.applyAnalysisTemplate(templateName, parameters);
            
            // Ejecutar análisis
            const result = await pythonHelpers.executePython(code, data, {
                timeout,
                includePlots
            });
            
            let response = `📊 **${template.name}**\n\n`;
            response += `📝 **Descripción:** ${template.description}\n`;
            response += `🏷️ **Categoría:** ${template.category}\n`;
            response += `⏱️ **Tiempo de ejecución:** ${result.executionTime}ms\n\n`;
            
            if (result.success) {
                response += `✅ **Estado:** Exitoso\n\n`;
                response += `📈 **Resultados:**\n\`\`\`\n${result.output}\n\`\`\`\n\n`;
                
                if (result.plots && result.plots.length > 0) {
                    response += `📊 **Visualizaciones generadas:** ${result.plots.length}\n`;
                    response += `📁 **Archivos:** ${result.plots.join(', ')}\n\n`;
                }
                
                // Agregar recomendaciones según el template
                response += `💡 **Recomendaciones:**\n`;
                switch (templateName) {
                    case 'data_exploration':
                        response += `• Revisa las distribuciones para detectar sesgos\n`;
                        response += `• Examina correlaciones >0.7 para multicolinealidad\n`;
                        response += `• Trata outliers antes de modelar\n`;
                        break;
                    case 'regression_analysis':
                        response += `• Verifica supuestos de linealidad y homocedasticidad\n`;
                        response += `• Usa regularización si hay muchas características\n`;
                        response += `• Valida con datos externos si es posible\n`;
                        break;
                    case 'clustering_analysis':
                        response += `• Usa el método del codo para k óptimo\n`;
                        response += `• Considera escalamiento de variables\n`;
                        response += `• Interpreta clusters en contexto del negocio\n`;
                        break;
                    case 'time_series_analysis':
                        response += `• Verifica estacionariedad antes de modelar\n`;
                        response += `• Considera componentes estacionales\n`;
                        response += `• Evalúa autocorrelación para orden ARIMA\n`;
                        break;
                    case 'statistical_testing':
                        response += `• Corrige por múltiples comparaciones\n`;
                        response += `• Verifica supuestos de las pruebas\n`;
                        response += `• Interpreta significancia práctica, no solo estadística\n`;
                        break;
                }
                
            } else {
                response += `❌ **Estado:** Error\n\n`;
                response += `🚨 **Error:**\n\`\`\`\n${result.error}\n\`\`\`\n\n`;
                if (result.output) {
                    response += `📝 **Salida parcial:**\n\`\`\`\n${result.output}\n\`\`\`\n\n`;
                }
            }
            
            return {
                content: [{ type: 'text', text: response }]
            };
            
        } catch (error) {
            const err = error as Error;
            return {
                content: [{ type: 'text', text: `❌ Error ejecutando template: ${err.message}` }]
            };
        }
    }
);

server.tool(
    "list-analysis-templates",
    "Muestra catálogo completo de templates de análisis Python disponibles: exploración de datos, machine learning, clustering, series de tiempo y estadísticas. Incluye descripción detallada, parámetros requeridos, columnas necesarias y ejemplos de uso para cada template.",
    {},
    async () => {
        try {
            const templates = pythonHelpers.getAvailableTemplates();
            
            let response = `📊 **Templates de Análisis Disponibles**\n\n`;
            
            const categories = [...new Set(templates.map(t => t.category))];
            
            for (const category of categories) {
                const categoryTemplates = templates.filter(t => t.category === category);
                response += `## 🏷️ ${category.toUpperCase()}\n\n`;
                
                for (const template of categoryTemplates) {
                    response += `### 📈 **${template.name}**\n`;
                    response += `**Descripción:** ${template.description}\n`;
                    response += `**Salida:** ${template.outputType}\n`;
                    
                    if (Object.keys(template.parameters).length > 0) {
                        response += `**Parámetros:**\n`;
                        for (const [param, type] of Object.entries(template.parameters)) {
                            response += `• \`${param}\`: ${type}\n`;
                        }
                    }
                    
                    if (template.requiredColumns) {
                        response += `**Columnas requeridas:** ${template.requiredColumns.join(', ')}\n`;
                    }
                    
                    response += `\n`;
                }
            }
            
            response += `## 💡 **Ejemplo de uso:**\n`;
            response += `\`\`\`\n`;
            response += `run-analysis-template({\n`;
            response += `  templateName: "data_exploration",\n`;
            response += `  data: tu_dataset,\n`;
            response += `  includePlots: true\n`;
            response += `})\n`;
            response += `\`\`\`\n\n`;
            
            response += `## 🔧 **Templates con parámetros:**\n`;
            response += `• **regression_analysis**: \`{target_column: "nombre_columna"}\`\n`;
            response += `• **clustering_analysis**: \`{n_clusters: 3}\`\n`;
            response += `• **time_series_analysis**: \`{date_column: "fecha", value_column: "valor"}\`\n`;
            
            return {
                content: [{ type: 'text', text: response }]
            };
            
        } catch (error) {
            const err = error as Error;
            return {
                content: [{ type: 'text', text: `❌ Error listando templates: ${err.message}` }]
            };
        }
    }
);

server.tool(
    "python-quick-stats",
    "Genera estadísticas rápidas y visualizaciones usando Python para un dataset",
    {
        data: z.array(z.record(z.string(), z.any())).describe("Datos para analizar"),
        analysisDepth: z.enum(['basic', 'detailed', 'advanced']).default('basic').describe("Profundidad del análisis"),
        focusColumns: z.array(z.string()).optional().describe("Columnas específicas para enfocar el análisis")
    },
    async ({ data, analysisDepth, focusColumns }) => {
        try {
            console.log(`⚡ Generando estadísticas rápidas (nivel: ${analysisDepth})`);
            
            let pythonCode = `
# Análisis rápido automático
print("🔍 ANÁLISIS RÁPIDO DE DATOS")
print("=" * 50)

describe_data()
`;
            
            if (analysisDepth === 'detailed' || analysisDepth === 'advanced') {
                pythonCode += `
correlation_analysis()

# Análisis de distribuciones
numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
${focusColumns ? `
focus_cols = ${JSON.stringify(focusColumns)}
numeric_cols = [col for col in focus_cols if col in numeric_cols]
` : ``}

print(f"\\n📊 ANALIZANDO {len(numeric_cols)} COLUMNAS NUMÉRICAS")
for col in numeric_cols[:6]:  # Máximo 6 columnas
    print(f"\\n--- {col} ---")
    print(f"Media: {df[col].mean():.4f}")
    print(f"Mediana: {df[col].median():.4f}")
    print(f"Desv. Estándar: {df[col].std():.4f}")
    print(f"Asimetría: {df[col].skew():.4f}")
    print(f"Curtosis: {df[col].kurtosis():.4f}")
    
    # Detectar outliers
    outliers = detect_outliers(col)
`;
            }
            
            if (analysisDepth === 'advanced') {
                pythonCode += `
# Análisis automático de patrones
print("\\n🤖 ANÁLISIS AUTOMÁTICO DE PATRONES")

# Auto-clustering si hay suficientes datos numéricos
if len(numeric_cols) >= 2 and len(df) > 10:
    print("\\n--- Clustering Automático ---")
    quick_clustering(n_clusters=min(5, len(df)//10))

# Auto-regresión para la primera variable con mayor varianza
if len(numeric_cols) > 1:
    variances = df[numeric_cols].var().sort_values(ascending=False)
    target = variances.index[0]
    print(f"\\n--- Regresión Automática (Target: {target}) ---")
    quick_ml_regression(target)

# Correlaciones más fuertes
if len(numeric_cols) > 1:
    print("\\n--- Top Correlaciones ---")
    corr_matrix = df[numeric_cols].corr()
    
    # Encontrar correlaciones más fuertes (excluyendo diagonal)
    corr_pairs = []
    for i in range(len(corr_matrix.columns)):
        for j in range(i+1, len(corr_matrix.columns)):
            col1, col2 = corr_matrix.columns[i], corr_matrix.columns[j]
            corr_val = corr_matrix.iloc[i, j]
            if abs(corr_val) > 0.3:  # Solo correlaciones moderadas o fuertes
                corr_pairs.append((col1, col2, corr_val))
    
    corr_pairs.sort(key=lambda x: abs(x[2]), reverse=True)
    for col1, col2, corr_val in corr_pairs[:5]:  # Top 5
        print(f"{col1} ↔ {col2}: {corr_val:.4f}")
`;
            }
            
            const result = await pythonHelpers.executePython(pythonCode, data, {
                timeout: 90000,
                includePlots: analysisDepth !== 'basic'
            });
            
            let response = `⚡ **Estadísticas Rápidas (${analysisDepth})**\n\n`;
            response += `📊 **Dataset:** ${data.length} filas\n`;
            response += `⏱️ **Tiempo:** ${result.executionTime}ms\n\n`;
            
            if (result.success) {
                response += `📈 **Resultados:**\n\`\`\`\n${result.output}\n\`\`\`\n\n`;
                
                if (result.plots && result.plots.length > 0) {
                    response += `📊 **Gráficos:** ${result.plots.length} archivos generados\n\n`;
                }
                
                response += `💡 **Próximos pasos sugeridos:**\n`;
                if (analysisDepth === 'basic') {
                    response += `• Ejecuta análisis 'detailed' para correlaciones\n`;
                    response += `• Usa 'data_exploration' template para análisis completo\n`;
                } else if (analysisDepth === 'detailed') {
                    response += `• Ejecuta análisis 'advanced' para ML automático\n`;
                    response += `• Usa templates específicos (regression, clustering)\n`;
                } else {
                    response += `• Refina modelos con parámetros específicos\n`;
                    response += `• Considera análisis de series temporales si aplica\n`;
                }
                
            } else {
                response += `❌ **Error:**\n\`\`\`\n${result.error}\n\`\`\`\n`;
            }
            
            return {
                content: [{ type: 'text', text: response }]
            };
            
        } catch (error) {
            const err = error as Error;
            return {
                content: [{ type: 'text', text: `❌ Error en estadísticas rápidas: ${err.message}` }]
            };
        }
    }
);

server.tool(
    "load-data-source", 
    "Carga y convierte archivos de datos a formato tabular: CSV (auto-detecta encoding/delimitadores), Excel (.xlsx/.xls), JSON y URLs de APIs REST. Maneja archivos locales, URLs file:// y APIs HTTP. Detecta automáticamente tipos de datos y convierte a array de objetos JavaScript listos para análisis.",
    {
        sourceType: z.enum(['api', 'csv', 'excel', 'json']).describe("'csv'=archivos CSV con auto-detección, 'excel'=archivos .xlsx/.xls, 'json'=archivos JSON o arrays, 'api'=endpoints REST HTTP"),
        path: z.string().describe("Ruta completa del archivo local (ej: '/Users/usuario/datos.csv') o URL completa de API (ej: 'https://api.ejemplo.com/datos'). Acepta URLs file:// para archivos"),
        headers: z.record(z.string()).optional().describe("Headers HTTP adicionales solo para sourceType='api' (ej: {'Authorization': 'Bearer token', 'Content-Type': 'application/json'})"),
        params: z.record(z.any()).optional().describe("Parámetros de query string solo para sourceType='api' (ej: {'limit': 100, 'offset': 0}) - se añaden como ?limit=100&offset=0"),
        showPreview: z.boolean().default(true).describe("Si mostrar las primeras 5 filas de los datos cargados para verificación")
    },
    async ({ sourceType, path, headers, params, showPreview }) => {
        try {
            let data: any[] = [];
            let sourceDescription = "";

            console.log(`🔄 Cargando datos desde ${sourceType}: ${path}`);

            if (sourceType === 'api') {
                let fullUrl = path;
                if (params) {
                    const searchParams = new URLSearchParams(params);
                    fullUrl += (path.includes('?') ? '&' : '?') + searchParams.toString();
                }
                const apiData = await safeFetch(fullUrl, { headers: headers || {}, expectJson: true });
                data = Array.isArray(apiData) ? apiData : [apiData]; // Simplificado
                sourceDescription = `API: ${path}`;
            } else {
                // Manejar rutas de archivo locales, incluyendo file://
                const filePath = path.startsWith('file://') ? new URL(path).pathname : path;
                sourceDescription = `Archivo: ${filePath}`;

                switch (sourceType) {
                    case 'csv':
                        data = await filesHelpers.readCSV(filePath);
                        break;
                    case 'excel':
                        data = filesHelpers.readExcel(filePath);
                        break;
                    case 'json':
                        const fileContent = await import('fs/promises').then(fs => fs.readFile(filePath, 'utf-8'));
                        data = JSON.parse(fileContent);
                        if (!Array.isArray(data)) data = [data];
                        break;
                }
            }

            if (data.length === 0) {
                return { content: [{ type: 'text', text: '❌ No se encontraron datos en la fuente especificada.' }] };
            }

            // Procesar y mostrar resultados
            const rowCount = data.length;
            const columns = Object.keys(data[0] || {});
            const preview = showPreview ? data.slice(0, 5) : [];
            
            return {
                content: [{
                    type: 'text',
                    text: `✅ Datos cargados exitosamente desde ${sourceDescription}\n\n` +
                          `📊 **Filas:** ${rowCount}\n` +
                          `📋 **Columnas:** ${columns.length} (${columns.join(', ')})\n\n` +
                          (showPreview ? `**Vista previa (5 primeras filas):**\n\`\`\`json\n${JSON.stringify(preview, null, 2)}\n\`\`\`` : '')
                }]
            };

        } catch (error) {
            const err = error as Error;
            // Proporcionar un mensaje de error más útil
            let errorMessage = `❌ Error cargando datos desde '${path}': ${err.message}`;
            if (err.message.includes('ENOENT')) {
                errorMessage += `\n\n**Sugerencia:** El archivo no existe en la ruta especificada. Verifica que la ruta sea correcta y accesible.`;
            } else if (err.message.includes('fetch failed')) {
                errorMessage += `\n\n**Sugerencia:** Si es un archivo local, asegúrate de que la ruta sea correcta. Si es una URL, verifica la conexión a internet y que la URL sea válida.`;
            }
            return { content: [{ type: 'text', text: errorMessage }] };
        }
    }
);

server.tool(
    "create-database-from-data",
    "Analiza datos tabulares (CSV/JSON) y genera automáticamente: esquemas SQL completos, diagramas entidad-relación, documentación técnica y archivos .sql listos para ejecutar en MySQL/PostgreSQL/SQLite. Detecta tipos de datos, claves primarias y relaciones automáticamente.",
    {
        data: z.array(z.record(z.string(), z.any())).describe("Array de objetos con los datos a convertir en base de datos (ej: datos de CSV cargado)"),
        tableName: z.string().describe("Nombre que tendrá la tabla principal en la base de datos (ej: 'ventas', 'usuarios', 'productos')"),
        databaseName: z.string().describe("Nombre que tendrá la base de datos completa (ej: 'empresa_db', 'analytics_db')"),
        dbType: z.enum(['mysql', 'postgresql', 'sqlite']).describe("Motor de base de datos objetivo - determina la sintaxis SQL generada"),
        generateQueries: z.boolean().default(true).describe("Si generar consultas SQL de ejemplo para análisis (SELECT, GROUP BY, estadísticas, etc.)"),
        generateERDiagram: z.boolean().default(true).describe("Si crear diagrama entidad-relación visual en formato Mermaid (.md)"),
        generateDocumentation: z.boolean().default(true).describe("Si generar documentación técnica completa de la base de datos (.md)"),
        includeDropStatements: z.boolean().default(false).describe("Si incluir comandos DROP TABLE al inicio del SQL (para recrear BD)"),
        customSchema: z.object({
            tables: z.array(z.object({
                name: z.string(),
                columns: z.array(z.object({
                    name: z.string(),
                    type: z.string(),
                    nullable: z.boolean().optional(),
                    primaryKey: z.boolean().optional(),
                    foreignKey: z.object({
                        table: z.string(),
                        column: z.string()
                    }).optional(),
                    unique: z.boolean().optional(),
                    comment: z.string().optional()
                })),
                comment: z.string().optional()
            })),
            relationships: z.array(z.object({
                from: z.object({ table: z.string(), column: z.string() }),
                to: z.object({ table: z.string(), column: z.string() }),
                type: z.enum(['one-to-one', 'one-to-many', 'many-to-many'])
            })).optional()
        }).optional().describe("OPCIONAL: Esquema de BD personalizado con múltiples tablas y relaciones. Si no se proporciona, se genera automáticamente analizando los datos. Usar solo para esquemas complejos con varias tablas relacionadas.")
    },
    async ({ data, tableName, databaseName, dbType, generateQueries, generateERDiagram, generateDocumentation, includeDropStatements, customSchema }) => {
        try {
            const sqlGenerator = new SQLGenerator();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const baseFilename = `${databaseName}_${timestamp}`;
            
            let schema;
            let files: string[] = [];
            let response = `🗄️ **Generación SQL Completada**\n\n`;

            // Generar o usar esquema
            if (customSchema) {
                schema = {
                    name: databaseName,
                    tables: customSchema.tables,
                    relationships: customSchema.relationships
                };
                response += `📋 **Esquema:** Personalizado (${schema.tables.length} tablas)\n`;
            } else {
                // Generar esquema automáticamente a partir de los datos
                const tableDefinition = sqlGenerator.analyzeDataAndGenerateSchema(data, tableName);
                schema = {
                    name: databaseName,
                    tables: [tableDefinition]
                };
                response += `📋 **Esquema:** Generado automáticamente\n`;
            }

            // Generar SQL del esquema
            const schemaSQL = sqlGenerator.generateSchema(schema, {
                dbType,
                includeDropStatements,
                includeComments: true
            });
            const schemaFile = sqlGenerator.saveSQL(schemaSQL, `${baseFilename}_schema`);
            files.push(schemaFile);
            response += `📄 **Esquema SQL:** ${schemaFile}\n`;

            // Generar consultas SQL
            if (generateQueries && data.length > 0) {
                const queriesSQL = sqlGenerator.generateQueries(data, tableName, { dbType });
                const queriesFile = sqlGenerator.saveSQL(queriesSQL, `${baseFilename}_queries`);
                files.push(queriesFile);
                response += `🔍 **Consultas SQL:** ${queriesFile}\n`;
            }

            // Generar diagrama ER
            if (generateERDiagram) {
                const erDiagram = sqlGenerator.generateERDiagram(schema);
                const diagramFile = sqlGenerator.saveMermaidDiagram(erDiagram, baseFilename);
                files.push(diagramFile);
                response += `📊 **Diagrama ER:** ${diagramFile}\n`;
            }

            // Generar documentación
            if (generateDocumentation) {
                const documentation = sqlGenerator.generateDocumentation(schema);
                const docFile = sqlGenerator.saveDocumentation(documentation, baseFilename);
                files.push(docFile);
                response += `📚 **Documentación:** ${docFile}\n`;
            }

            response += `\n**Resumen:**\n`;
            response += `- **Base de datos:** ${databaseName} (${dbType})\n`;
            response += `- **Tablas:** ${schema.tables.length}\n`;
            response += `- **Registros analizados:** ${data.length}\n`;
            response += `- **Archivos generados:** ${files.length}\n`;
            response += `- **Ubicación:** ~/Documents/db-exports/\n\n`;

            // Mostrar vista previa del esquema
            response += `**Vista previa del esquema principal:**\n\`\`\`sql\n`;
            response += schemaSQL.split('\n').slice(0, 15).join('\n');
            response += '\n...\n```\n\n';

            response += `💡 **Próximos pasos:**\n`;
            response += `• Revisar los archivos SQL generados\n`;
            response += `• Ejecutar el esquema en tu servidor de BD\n`;
            response += `• Usar las consultas de ejemplo para análisis\n`;
            response += `• Visualizar el diagrama ER en un editor Markdown`;

            return {
                content: [{ type: 'text', text: response }]
            };

        } catch (error) {
            const err = error as Error;
            return {
                content: [{ type: 'text', text: `❌ Error generando SQL: ${err.message}` }]
            };
        }
    }
);

server.tool(
    "generate-advanced-sql-queries",
    "Genera consultas SQL especializadas para análisis de datos: estadísticas (MIN/MAX/AVG), agrupaciones (GROUP BY), análisis temporal por fechas, rankings, detección de outliers, consultas analíticas y reportes ejecutivos. Optimizado para MySQL/PostgreSQL/SQLite.",
    {
        data: z.array(z.record(z.string(), z.any())).describe("Array de objetos con datos de la tabla para analizar (debe coincidir con la estructura de la tabla)"),
        tableName: z.string().describe("Nombre exacto de la tabla existente en la base de datos (ej: 'ventas', 'clientes')"),
        dbType: z.enum(['mysql', 'postgresql', 'sqlite']).describe("Motor de base de datos - afecta sintaxis específica (YEAR(), EXTRACT(), strftime())"),
        queryTypes: z.array(z.enum([
            'basic',
            'statistics', 
            'grouping',
            'temporal',
            'advanced',
            'analytics',
            'reporting'
        ])).default(['basic', 'statistics']).describe("Tipos específicos de consultas: 'basic'=SELECT/COUNT/LIMIT, 'statistics'=MIN/MAX/AVG/STDDEV, 'grouping'=GROUP BY/agregaciones, 'temporal'=análisis por fechas/años/meses, 'advanced'=ranking/percentiles, 'analytics'=correlaciones/outliers, 'reporting'=dashboards/métricas"),
        customRequirements: z.string().optional().describe("Requisitos específicos en lenguaje natural para generar consultas personalizadas adicionales (ej: 'mostrar ventas por región en los últimos 6 meses')")
    },
    async ({ data, tableName, dbType, queryTypes, customRequirements }) => {
        try {
            const sqlGenerator = new SQLGenerator();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            
            let sqlContent = `-- Consultas SQL para ${tableName}\n`;
            sqlContent += `-- Base de datos: ${dbType.toUpperCase()}\n`;
            sqlContent += `-- Generado el: ${new Date().toLocaleString()}\n`;
            sqlContent += `-- Registros analizados: ${data.length}\n\n`;

            if (data.length === 0) {
                return {
                    content: [{ type: 'text', text: '❌ No se pueden generar consultas sin datos' }]
                };
            }

            const columns = Object.keys(data[0]);
            const numericColumns = sqlGenerator['getNumericColumns'](data);
            const dateColumns = sqlGenerator['getDateColumns'](data);

            // Generar consultas según los tipos solicitados
            for (const queryType of queryTypes) {
                switch (queryType) {
                    case 'basic':
                        sqlContent += generateBasicQueries(tableName, columns);
                        break;
                    case 'statistics':
                        sqlContent += generateStatisticalQueries(tableName, numericColumns, dbType);
                        break;
                    case 'grouping':
                        sqlContent += generateGroupingQueries(tableName, columns, numericColumns);
                        break;
                    case 'temporal':
                        if (dateColumns.length > 0) {
                            sqlContent += generateTemporalQueries(tableName, dateColumns, numericColumns, dbType);
                        }
                        break;
                    case 'advanced':
                        sqlContent += generateAdvancedQueries(tableName, columns, numericColumns, dbType);
                        break;
                    case 'analytics':
                        sqlContent += generateAnalyticsQueries(tableName, numericColumns, dbType);
                        break;
                    case 'reporting':
                        sqlContent += generateReportingQueries(tableName, columns, numericColumns, dateColumns, dbType);
                        break;
                }
            }

            // Agregar consultas personalizadas si se especifican
            if (customRequirements) {
                sqlContent += generateCustomQueries(tableName, customRequirements, columns, dbType);
            }

            // Guardar archivo
            const filename = `${tableName}_queries_${timestamp}`;
            const filepath = sqlGenerator.saveSQL(sqlContent, filename);

            const response = `🔍 **Consultas SQL Generadas**\n\n` +
                           `📄 **Archivo:** ${filepath}\n` +
                           `🗄️ **Tabla:** ${tableName}\n` +
                           `💾 **Base de datos:** ${dbType.toUpperCase()}\n` +
                           `📊 **Registros:** ${data.length}\n` +
                           `🔢 **Columnas:** ${columns.length} (${numericColumns.length} numéricas, ${dateColumns.length} fechas)\n` +
                           `📋 **Tipos generados:** ${queryTypes.join(', ')}\n\n` +
                           `**Vista previa:**\n\`\`\`sql\n${sqlContent.split('\n').slice(0, 20).join('\n')}\n...\n\`\`\`\n\n` +
                           `💡 **El archivo contiene consultas para:**\n` +
                           `• Selecciones y filtros básicos\n` +
                           `• Análisis estadísticos y agregaciones\n` +
                           `• Agrupaciones y resúmenes\n` +
                           `• Análisis temporal (si aplica)\n` +
                           `• Consultas avanzadas y analíticas`;

            return {
                content: [{ type: 'text', text: response }]
            };

        } catch (error) {
            const err = error as Error;
            return {
                content: [{ type: 'text', text: `❌ Error generando consultas SQL: ${err.message}` }]
            };
        }
    }
);

// Funciones auxiliares para generar diferentes tipos de consultas
function generateBasicQueries(tableName: string, columns: string[]): string {
    let sql = "-- ===== CONSULTAS BÁSICAS =====\n\n";
    
    sql += `-- Seleccionar todos los registros\n`;
    sql += `SELECT * FROM ${tableName};\n\n`;
    
    sql += `-- Contar total de registros\n`;
    sql += `SELECT COUNT(*) as total_registros FROM ${tableName};\n\n`;
    
    sql += `-- Seleccionar columnas específicas\n`;
    sql += `SELECT ${columns.slice(0, 5).join(', ')} FROM ${tableName};\n\n`;
    
    sql += `-- Primeros 10 registros\n`;
    sql += `SELECT * FROM ${tableName} LIMIT 10;\n\n`;
    
    sql += `-- Registros únicos de una columna\n`;
    sql += `SELECT DISTINCT ${columns[0]} FROM ${tableName};\n\n`;
    
    return sql;
}

function generateStatisticalQueries(tableName: string, numericColumns: string[], dbType: string): string {
    let sql = "-- ===== CONSULTAS ESTADÍSTICAS =====\n\n";
    
    if (numericColumns.length === 0) {
        sql += "-- No hay columnas numéricas para análisis estadístico\n\n";
        return sql;
    }
    
    for (const col of numericColumns.slice(0, 4)) {
        sql += `-- Estadísticas completas de ${col}\n`;
        sql += `SELECT \n`;
        sql += `  COUNT(${col}) as count_${col},\n`;
        sql += `  MIN(${col}) as min_${col},\n`;
        sql += `  MAX(${col}) as max_${col},\n`;
        sql += `  AVG(${col}) as avg_${col},\n`;
        
        if (dbType === 'mysql') {
            sql += `  STDDEV(${col}) as stddev_${col}\n`;
        } else if (dbType === 'postgresql') {
            sql += `  STDDEV(${col}) as stddev_${col},\n`;
            sql += `  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${col}) as median_${col}\n`;
        } else {
            sql += `  -- STDDEV no disponible en SQLite\n`;
        }
        
        sql += `FROM ${tableName};\n\n`;
    }
    
    return sql;
}

function generateGroupingQueries(tableName: string, columns: string[], numericColumns: string[]): string {
    let sql = "-- ===== CONSULTAS DE AGRUPACIÓN =====\n\n";
    
    const categoricalColumns = columns.filter(col => !numericColumns.includes(col));
    
    for (const catCol of categoricalColumns.slice(0, 3)) {
        sql += `-- Distribución por ${catCol}\n`;
        sql += `SELECT ${catCol}, COUNT(*) as frecuencia\n`;
        sql += `FROM ${tableName}\n`;
        sql += `GROUP BY ${catCol}\n`;
        sql += `ORDER BY frecuencia DESC;\n\n`;
        
        if (numericColumns.length > 0) {
            const numCol = numericColumns[0];
            sql += `-- Promedio de ${numCol} por ${catCol}\n`;
            sql += `SELECT ${catCol}, AVG(${numCol}) as promedio_${numCol}\n`;
            sql += `FROM ${tableName}\n`;
            sql += `GROUP BY ${catCol}\n`;
            sql += `ORDER BY promedio_${numCol} DESC;\n\n`;
        }
    }
    
    return sql;
}

function generateTemporalQueries(tableName: string, dateColumns: string[], numericColumns: string[], dbType: string): string {
    let sql = "-- ===== CONSULTAS TEMPORALES =====\n\n";
    
    for (const dateCol of dateColumns.slice(0, 2)) {
        sql += `-- Registros por año en ${dateCol}\n`;
        if (dbType === 'mysql') {
            sql += `SELECT YEAR(${dateCol}) as año, COUNT(*) as registros\n`;
        } else if (dbType === 'postgresql') {
            sql += `SELECT EXTRACT(YEAR FROM ${dateCol}) as año, COUNT(*) as registros\n`;
        } else {
            sql += `SELECT strftime('%Y', ${dateCol}) as año, COUNT(*) as registros\n`;
        }
        sql += `FROM ${tableName}\n`;
        sql += `GROUP BY año\n`;
        sql += `ORDER BY año;\n\n`;
        
        sql += `-- Registros por mes en ${dateCol}\n`;
        if (dbType === 'mysql') {
            sql += `SELECT YEAR(${dateCol}) as año, MONTH(${dateCol}) as mes, COUNT(*) as registros\n`;
        } else if (dbType === 'postgresql') {
            sql += `SELECT EXTRACT(YEAR FROM ${dateCol}) as año, EXTRACT(MONTH FROM ${dateCol}) as mes, COUNT(*) as registros\n`;
        } else {
            sql += `SELECT strftime('%Y', ${dateCol}) as año, strftime('%m', ${dateCol}) as mes, COUNT(*) as registros\n`;
        }
        sql += `FROM ${tableName}\n`;
        sql += `GROUP BY año, mes\n`;
        sql += `ORDER BY año, mes;\n\n`;
        
        if (numericColumns.length > 0) {
            const numCol = numericColumns[0];
            sql += `-- Tendencia temporal de ${numCol}\n`;
            if (dbType === 'mysql') {
                sql += `SELECT DATE(${dateCol}) as fecha, AVG(${numCol}) as promedio_${numCol}\n`;
            } else if (dbType === 'postgresql') {
                sql += `SELECT ${dateCol}::date as fecha, AVG(${numCol}) as promedio_${numCol}\n`;
            } else {
                sql += `SELECT date(${dateCol}) as fecha, AVG(${numCol}) as promedio_${numCol}\n`;
            }
            sql += `FROM ${tableName}\n`;
            sql += `GROUP BY fecha\n`;
            sql += `ORDER BY fecha;\n\n`;
        }
    }
    
    return sql;
}

function generateAdvancedQueries(tableName: string, columns: string[], numericColumns: string[], dbType: string): string {
    let sql = "-- ===== CONSULTAS AVANZADAS =====\n\n";
    
    if (numericColumns.length >= 2) {
        sql += `-- Ranking por ${numericColumns[0]}\n`;
        if (dbType === 'postgresql' || dbType === 'mysql') {
            sql += `SELECT *, \n`;
            sql += `  ROW_NUMBER() OVER (ORDER BY ${numericColumns[0]} DESC) as ranking\n`;
            sql += `FROM ${tableName}\n`;
            sql += `ORDER BY ${numericColumns[0]} DESC;\n\n`;
        } else {
            sql += `-- Ranking manual para SQLite\n`;
            sql += `SELECT *,\n`;
            sql += `  (SELECT COUNT(*) FROM ${tableName} t2 WHERE t2.${numericColumns[0]} > t1.${numericColumns[0]}) + 1 as ranking\n`;
            sql += `FROM ${tableName} t1\n`;
            sql += `ORDER BY ${numericColumns[0]} DESC;\n\n`;
        }
    }
    
    if (numericColumns.length > 0) {
        sql += `-- Percentiles de ${numericColumns[0]}\n`;
        if (dbType === 'postgresql') {
            sql += `SELECT \n`;
            sql += `  PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY ${numericColumns[0]}) as percentil_25,\n`;
            sql += `  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${numericColumns[0]}) as percentil_50,\n`;
            sql += `  PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ${numericColumns[0]}) as percentil_75\n`;
            sql += `FROM ${tableName};\n\n`;
        } else {
            sql += `-- Percentiles aproximados\n`;
            sql += `SELECT \n`;
            sql += `  MIN(${numericColumns[0]}) as min_value,\n`;
            sql += `  MAX(${numericColumns[0]}) as max_value\n`;
            sql += `FROM ${tableName};\n\n`;
        }
    }
    
    return sql;
}

function generateAnalyticsQueries(tableName: string, numericColumns: string[], dbType: string): string {
    let sql = "-- ===== CONSULTAS ANALÍTICAS =====\n\n";
    
    if (numericColumns.length >= 2) {
        sql += `-- Análisis de correlación visual entre ${numericColumns[0]} y ${numericColumns[1]}\n`;
        sql += `SELECT \n`;
        sql += `  ${numericColumns[0]},\n`;
        sql += `  ${numericColumns[1]},\n`;
        sql += `  CASE \n`;
        sql += `    WHEN ${numericColumns[0]} > (SELECT AVG(${numericColumns[0]}) FROM ${tableName}) AND \n`;
        sql += `         ${numericColumns[1]} > (SELECT AVG(${numericColumns[1]}) FROM ${tableName}) THEN 'Alto-Alto'\n`;
        sql += `    WHEN ${numericColumns[0]} < (SELECT AVG(${numericColumns[0]}) FROM ${tableName}) AND \n`;
        sql += `         ${numericColumns[1]} < (SELECT AVG(${numericColumns[1]}) FROM ${tableName}) THEN 'Bajo-Bajo'\n`;
        sql += `    ELSE 'Mixto'\n`;
        sql += `  END as cuadrante\n`;
        sql += `FROM ${tableName};\n\n`;
    }
    
    if (numericColumns.length > 0) {
        sql += `-- Análisis de outliers para ${numericColumns[0]}\n`;
        sql += `WITH stats AS (\n`;
        sql += `  SELECT \n`;
        sql += `    AVG(${numericColumns[0]}) as media,\n`;
        sql += `    STDDEV(${numericColumns[0]}) as desviacion\n`;
        sql += `  FROM ${tableName}\n`;
        sql += `)\n`;
        sql += `SELECT *,\n`;
        sql += `  CASE \n`;
        sql += `    WHEN ABS(${numericColumns[0]} - stats.media) > 2 * stats.desviacion THEN 'Outlier'\n`;
        sql += `    ELSE 'Normal'\n`;
        sql += `  END as tipo\n`;
        sql += `FROM ${tableName}, stats\n`;
        sql += `WHERE ABS(${numericColumns[0]} - stats.media) > 2 * stats.desviacion;\n\n`;
    }
    
    return sql;
}

function generateReportingQueries(tableName: string, columns: string[], numericColumns: string[], dateColumns: string[], dbType: string): string {
    let sql = "-- ===== CONSULTAS PARA REPORTES =====\n\n";
    
    sql += `-- Resumen ejecutivo\n`;
    sql += `SELECT \n`;
    sql += `  'Total de registros' as metrica,\n`;
    sql += `  COUNT(*) as valor\n`;
    sql += `FROM ${tableName}\n`;
    sql += `UNION ALL\n`;
    
    if (numericColumns.length > 0) {
        sql += `SELECT \n`;
        sql += `  'Promedio ${numericColumns[0]}' as metrica,\n`;
        sql += `  ROUND(AVG(${numericColumns[0]}), 2) as valor\n`;
        sql += `FROM ${tableName}\n`;
        sql += `UNION ALL\n`;
    }
    
    sql += `SELECT \n`;
    sql += `  'Columnas disponibles' as metrica,\n`;
    sql += `  ${columns.length} as valor;\n\n`;
    
    // Dashboard query
    if (numericColumns.length > 0 && dateColumns.length > 0) {
        sql += `-- Query para dashboard temporal\n`;
        sql += `SELECT \n`;
        if (dbType === 'mysql') {
            sql += `  DATE(${dateColumns[0]}) as fecha,\n`;
        } else if (dbType === 'postgresql') {
            sql += `  ${dateColumns[0]}::date as fecha,\n`;
        } else {
            sql += `  date(${dateColumns[0]}) as fecha,\n`;
        }
        sql += `  COUNT(*) as total_registros,\n`;
        sql += `  AVG(${numericColumns[0]}) as promedio_${numericColumns[0]},\n`;
        sql += `  MIN(${numericColumns[0]}) as min_${numericColumns[0]},\n`;
        sql += `  MAX(${numericColumns[0]}) as max_${numericColumns[0]}\n`;
        sql += `FROM ${tableName}\n`;
        sql += `GROUP BY fecha\n`;
        sql += `ORDER BY fecha;\n\n`;
    }
    
    return sql;
}

function generateCustomQueries(tableName: string, requirements: string, columns: string[], dbType: string): string {
    let sql = "-- ===== CONSULTAS PERSONALIZADAS =====\n\n";
    sql += `-- Requisitos: ${requirements}\n`;
    sql += `-- Nota: Estas consultas son plantillas que pueden necesitar ajustes\n\n`;
    
    // Aquí podrías agregar lógica más sofisticada para interpretar los requisitos
    sql += `-- Consulta base personalizada\n`;
    sql += `SELECT * FROM ${tableName}\n`;
    sql += `-- WHERE [condiciones basadas en: ${requirements}]\n`;
    sql += `-- ORDER BY [columna relevante]\n`;
    sql += `-- LIMIT [número apropiado];\n\n`;
    
    return sql;
}

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