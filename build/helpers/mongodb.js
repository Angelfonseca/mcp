import { MongoClient } from 'mongodb';
import { getEmbedding } from './ollama.js';
/**
 * Crea una conexión a MongoDB
 */
async function createMongoDBConnection(config) {
    const uri = config.connectionString ||
        `mongodb://${config.username ? `${config.username}:${config.password}@` : ''}${config.host || 'localhost'}:${config.port || 27017}/${config.database}${config.authSource ? `?authSource=${config.authSource}` : ''}`;
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db(config.database);
    return { client, db };
}
/**
 * Analiza completamente una base de datos MongoDB
 */
async function analyzeMongoDBDatabase(config) {
    const { client, db } = await createMongoDBConnection(config);
    try {
        // Obtener información del servidor
        const buildInfo = await db.admin().command({ buildInfo: 1 });
        const serverStatus = await db.admin().command({ serverStatus: 1 });
        const version = buildInfo.version;
        // Obtener todas las colecciones
        const collections = await db.listCollections().toArray();
        const collectionInfos = [];
        for (const collection of collections) {
            const collectionName = collection.name;
            const coll = db.collection(collectionName);
            // Obtener estadísticas
            const stats = await db.command({ collStats: collectionName });
            // Obtener índices
            const indexes = await coll.listIndexes().toArray();
            const indexInfo = indexes.map(idx => ({
                name: idx.name,
                keys: idx.key,
                unique: idx.unique || false,
            }));
            // Obtener esquema de muestra
            const sampleDocs = await coll.find().limit(10).toArray();
            const sampleSchema = inferMongoSchema(sampleDocs);
            collectionInfos.push({
                name: collectionName,
                documentCount: stats.count || 0,
                size: `${Math.round(stats.size / 1024)} KB`,
                avgDocSize: `${Math.round(stats.avgObjSize || 0)} bytes`,
                indexes: indexInfo,
                sampleSchema,
            });
        }
        // Calcular tamaño total
        const totalSizeBytes = collectionInfos.reduce((sum, coll) => {
            const sizeKB = parseInt(coll.size.replace(' KB', ''));
            return sum + (sizeKB * 1024);
        }, 0);
        const totalSize = `${Math.round(totalSizeBytes / 1024 / 1024)} MB`;
        return {
            databaseName: config.database,
            version,
            collections: collectionInfos,
            totalCollections: collectionInfos.length,
            totalSize,
            serverStatus: {
                uptime: serverStatus.uptime,
                connections: serverStatus.connections,
                opcounters: serverStatus.opcounters,
            },
        };
    }
    finally {
        await client.close();
    }
}
/**
 * Ejecuta una query personalizada en MongoDB
 */
async function executeMongoDBQuery(config, collectionName, operation, query, options) {
    const { client, db } = await createMongoDBConnection(config);
    const startTime = Date.now();
    try {
        const collection = db.collection(collectionName);
        let documents = [];
        let count = 0;
        switch (operation) {
            case 'find':
                documents = await collection.find(query, options).limit(1000).toArray();
                count = documents.length;
                break;
            case 'aggregate':
                documents = await collection.aggregate(query, options).limit(1000).toArray();
                count = documents.length;
                break;
            case 'count':
                count = await collection.countDocuments(query);
                break;
        }
        const executionTime = Date.now() - startTime;
        return {
            documents,
            count,
            executionTime,
        };
    }
    finally {
        await client.close();
    }
}
/**
 * Busca datos específicos en MongoDB usando texto libre
 */
async function searchMongoDBData(config, searchTerm, collections) {
    const { client, db } = await createMongoDBConnection(config);
    try {
        const results = [];
        // Si no se especifican colecciones, buscar en todas
        if (!collections || collections.length === 0) {
            const allCollections = await db.listCollections().toArray();
            collections = allCollections.map(coll => coll.name);
        }
        for (const collectionName of collections) {
            const collection = db.collection(collectionName);
            // Crear query de búsqueda de texto
            const textQuery = { $text: { $search: searchTerm } };
            try {
                // Intentar búsqueda de texto completo
                const textResults = await collection.find(textQuery).limit(100).toArray();
                if (textResults.length > 0) {
                    results.push({
                        collection: collectionName,
                        searchType: 'text',
                        matches: textResults,
                    });
                }
            }
            catch (error) {
                // Si no hay índice de texto, buscar en campos string
                const regexQuery = createRegexQuery(searchTerm);
                const regexResults = await collection.find(regexQuery).limit(100).toArray();
                if (regexResults.length > 0) {
                    results.push({
                        collection: collectionName,
                        searchType: 'regex',
                        matches: regexResults,
                    });
                }
            }
        }
        return results;
    }
    finally {
        await client.close();
    }
}
/**
 * Genera embeddings para datos de MongoDB
 */
async function generateMongoDBEmbeddings(config, collectionName, textField, embeddingApiUrl = 'http://localhost:11434/api/embeddings') {
    const { client, db } = await createMongoDBConnection(config);
    try {
        const collection = db.collection(collectionName);
        const documents = await collection.find({ [textField]: { $exists: true, $ne: '' } }).limit(1000).toArray();
        const results = [];
        for (const doc of documents) {
            try {
                const embedding = await getEmbedding(doc[textField]);
                results.push({
                    id: doc._id,
                    text: doc[textField],
                    embedding: embedding,
                });
            }
            catch (error) {
                console.error(`Error generating embedding for document ${doc._id}:`, error);
            }
        }
        return results;
    }
    finally {
        await client.close();
    }
}
/**
 * Infiere el esquema de una colección basado en documentos de muestra
 */
function inferMongoSchema(documents) {
    if (documents.length === 0)
        return {};
    const schema = {};
    for (const doc of documents) {
        for (const [key, value] of Object.entries(doc)) {
            if (!schema[key]) {
                schema[key] = {
                    type: Array.isArray(value) ? 'array' : typeof value,
                    nullable: false,
                    examples: [],
                };
            }
            if (value === null || value === undefined) {
                schema[key].nullable = true;
            }
            if (schema[key].examples.length < 3 && value !== null && value !== undefined) {
                schema[key].examples.push(value);
            }
        }
    }
    return schema;
}
/**
 * Crea una query regex para búsqueda de texto
 */
function createRegexQuery(searchTerm) {
    const regex = new RegExp(searchTerm, 'i');
    // Buscar en campos comunes que suelen contener texto
    return {
        $or: [
            { name: regex },
            { title: regex },
            { description: regex },
            { content: regex },
            { message: regex },
        ],
    };
}
export { analyzeMongoDBDatabase, executeMongoDBQuery, searchMongoDBData, generateMongoDBEmbeddings, createMongoDBConnection, };
