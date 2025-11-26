import * as fs from 'fs';
import * as path from 'path';
import * as chardet from 'chardet';
import * as xlsx from 'xlsx';
// Importaciones opcionales para análisis de documentos
let pdfParse;
let mammoth;
let natural;
let sentiment;
let compromise;
let keyword;
try {
    pdfParse = require('pdf-parse');
    mammoth = require('mammoth');
    natural = require('natural');
    sentiment = require('sentiment');
    compromise = require('compromise');
    keyword = require('keyword-extractor');
}
catch (error) {
    console.warn('Algunas dependencias de análisis de documentos no están instaladas. Ejecuta: npm install');
}
/**
 * Detecta automáticamente el delimitador de un archivo CSV
 */
export function detectDelimiter(sampleText) {
    const delimiters = [',', ';', '\t', '|'];
    const lines = sampleText.split('\n').slice(0, 5); // Solo primeras 5 líneas
    let bestDelimiter = ',';
    let maxColumns = 0;
    delimiters.forEach(delimiter => {
        const columnCounts = lines.map(line => line.split(delimiter).length);
        const avgColumns = columnCounts.reduce((a, b) => a + b, 0) / columnCounts.length;
        const consistency = columnCounts.every(count => count === columnCounts[0]);
        if (consistency && avgColumns > maxColumns) {
            maxColumns = avgColumns;
            bestDelimiter = delimiter;
        }
    });
    return bestDelimiter;
}
/**
 * Mapea encodings detectados por chardet a encodings válidos de Node.js
 */
function mapEncoding(detectedEncoding) {
    if (!detectedEncoding)
        return 'utf8';
    const encodingMap = {
        'ISO-8859-1': 'latin1',
        'ISO-8859-2': 'latin1',
        'ISO-8859-15': 'latin1',
        'windows-1252': 'latin1',
        'UTF-8': 'utf8',
        'UTF-16LE': 'utf16le',
        'UTF-16BE': 'utf16le',
        'ASCII': 'ascii'
    };
    // Normalizar el nombre del encoding
    const normalizedEncoding = detectedEncoding.toUpperCase();
    // Buscar en el mapa
    for (const [key, value] of Object.entries(encodingMap)) {
        if (normalizedEncoding.includes(key.toUpperCase())) {
            return value;
        }
    }
    // Por defecto usar latin1 para encodings europeos o utf8 para otros
    if (normalizedEncoding.includes('ISO') || normalizedEncoding.includes('WINDOWS')) {
        return 'latin1';
    }
    return 'utf8';
}
/**
 * Lee archivo CSV con detección automática de encoding y delimitador
 */
export async function readCSV(filePath, options = {}) {
    const { batchSize = 10000, maxRows, encoding, delimiter } = options;
    if (!fs.existsSync(filePath)) {
        throw new Error(`Archivo no encontrado: ${filePath}`);
    }
    // Detectar encoding si no se especifica
    let detectedEncoding;
    if (encoding) {
        detectedEncoding = encoding;
    }
    else {
        const rawDetection = chardet.detectFileSync(filePath);
        detectedEncoding = mapEncoding(rawDetection);
        console.log(`🔍 Encoding detectado: ${rawDetection} → mapeado a: ${detectedEncoding}`);
    }
    // Leer muestra para detectar delimitador  
    let sampleBuffer;
    try {
        sampleBuffer = fs.readFileSync(filePath, { encoding: detectedEncoding });
    }
    catch (error) {
        // Si falla con el encoding detectado, intentar con latin1 como fallback
        console.log(`⚠️ Error con encoding ${detectedEncoding}, intentando con latin1...`);
        detectedEncoding = 'latin1';
        sampleBuffer = fs.readFileSync(filePath, { encoding: detectedEncoding });
    }
    const sample = sampleBuffer.slice(0, Math.min(1000, sampleBuffer.length));
    const detectedDelimiter = delimiter || detectDelimiter(sample);
    console.log(`📄 Procesando CSV: encoding=${detectedEncoding}, delimiter='${detectedDelimiter}'`);
    return readCSVStream(filePath, detectedEncoding, detectedDelimiter, batchSize, maxRows);
}
/**
 * Lee CSV en streaming para manejar archivos grandes
 */
async function readCSVStream(filePath, encoding, delimiter, batchSize, maxRows) {
    return new Promise((resolve, reject) => {
        const results = [];
        const stream = fs.createReadStream(filePath, { encoding });
        let buffer = '';
        let headers = [];
        let lineCount = 0;
        let headersParsed = false;
        stream.on('data', (chunk) => {
            const chunkStr = chunk.toString();
            buffer += chunkStr;
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Mantener línea incompleta
            for (const line of lines) {
                if (!line.trim())
                    continue;
                if (!headersParsed) {
                    headers = line.split(delimiter).map(h => h.trim().replace(/['"]/g, ''));
                    headersParsed = true;
                    continue;
                }
                if (maxRows && lineCount >= maxRows) {
                    stream.destroy();
                    break;
                }
                const values = line.split(delimiter).map(v => v.trim().replace(/['"]/g, ''));
                const row = {};
                headers.forEach((header, index) => {
                    let value = values[index] || '';
                    // Convertir tipos automáticamente
                    if (value === '')
                        value = null;
                    else if (!isNaN(Number(value)) && value !== '')
                        value = Number(value);
                    else if (value.toLowerCase() === 'true')
                        value = true;
                    else if (value.toLowerCase() === 'false')
                        value = false;
                    row[header] = value;
                });
                results.push(row);
                lineCount++;
                // Reporte de progreso cada lote
                if (lineCount % batchSize === 0) {
                    console.log(`📊 Procesadas ${lineCount} filas...`);
                }
            }
        });
        stream.on('end', () => {
            // Procesar última línea si existe
            if (buffer.trim() && headersParsed) {
                const values = buffer.split(delimiter).map(v => v.trim().replace(/['"]/g, ''));
                const row = {};
                headers.forEach((header, index) => {
                    let value = values[index] || '';
                    if (value === '')
                        value = null;
                    else if (!isNaN(Number(value)) && value !== '')
                        value = Number(value);
                    else if (value.toLowerCase() === 'true')
                        value = true;
                    else if (value.toLowerCase() === 'false')
                        value = false;
                    row[header] = value;
                });
                results.push(row);
                lineCount++;
            }
            console.log(`✅ CSV procesado: ${lineCount} filas totales`);
            resolve(results);
        });
        stream.on('error', reject);
    });
}
/**
 * Lee archivos Excel con optimizaciones para archivos grandes
 */
export function readExcel(filePath, options = {}) {
    const { sheetName, maxRows = 100000, batchSize = 5000 } = options;
    if (!fs.existsSync(filePath)) {
        throw new Error(`Archivo no encontrado: ${filePath}`);
    }
    console.log(`📊 Procesando Excel: ${filePath}`);
    try {
        const workbook = xlsx.readFile(filePath, {
            cellDates: true,
            cellNF: false,
            cellText: false,
            sheetRows: maxRows // Limitar filas por rendimiento
        });
        const sheet = sheetName ? workbook.Sheets[sheetName] : workbook.Sheets[workbook.SheetNames[0]];
        if (!sheet) {
            throw new Error(`Hoja no encontrada: ${sheetName || workbook.SheetNames[0]}`);
        }
        // Convertir a JSON con límite de filas
        const jsonData = xlsx.utils.sheet_to_json(sheet, {
            defval: null,
            raw: false,
            header: 1
        });
        if (jsonData.length === 0)
            return [];
        // Convertir primera fila en headers
        const headers = jsonData[0];
        const data = jsonData.slice(1, maxRows + 1).map((row, index) => {
            if (index % batchSize === 0) {
                console.log(`📊 Procesadas ${index} filas Excel...`);
            }
            const obj = {};
            headers.forEach((header, colIndex) => {
                let value = row[colIndex];
                // Conversión de tipos
                if (value === undefined || value === '')
                    value = null;
                else if (typeof value === 'string') {
                    if (!isNaN(Number(value)) && value.trim() !== '')
                        value = Number(value);
                    else if (value.toLowerCase() === 'true')
                        value = true;
                    else if (value.toLowerCase() === 'false')
                        value = false;
                }
                obj[header] = value;
            });
            return obj;
        });
        console.log(`✅ Excel procesado: ${data.length} filas`);
        return data;
    }
    catch (error) {
        throw new Error(`Error procesando Excel: ${error}`);
    }
}
/**
 * Lee archivos PDF y extrae texto con metadatos
 */
export async function readPDF(filePath, options = {}) {
    const { extractMetadata = true, maxPages, includeImages = false } = options;
    if (!fs.existsSync(filePath)) {
        throw new Error(`Archivo PDF no encontrado: ${filePath}`);
    }
    console.log(`📄 Procesando PDF: ${filePath}`);
    try {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(dataBuffer, {
            max: maxPages || 0
        });
        // Limpiar y estructurar el texto
        const cleanText = data.text
            .replace(/\s+/g, ' ')
            .replace(/\n\s*\n/g, '\n')
            .trim();
        const wordCount = cleanText.split(/\s+/).filter((word) => word.length > 0).length;
        // Detectar idioma básico
        const language = detectLanguage(cleanText);
        const result = {
            text: cleanText,
            pages: data.numpages,
            wordCount,
            extractedDate: new Date().toISOString(),
            language
        };
        if (extractMetadata && data.info) {
            result.metadata = {
                title: data.info.Title,
                author: data.info.Author,
                subject: data.info.Subject,
                creator: data.info.Creator,
                producer: data.info.Producer,
                creationDate: data.info.CreationDate,
                modificationDate: data.info.ModDate
            };
        }
        console.log(`✅ PDF procesado: ${data.numpages} páginas, ${wordCount} palabras`);
        return result;
    }
    catch (error) {
        throw new Error(`Error procesando PDF: ${error}`);
    }
}
/**
 * Lee archivos DOCX y extrae texto con formato
 */
export async function readDOCX(filePath, options = {}) {
    const { extractMetadata = true, preserveFormatting = false, includeImages = false } = options;
    if (!fs.existsSync(filePath)) {
        throw new Error(`Archivo DOCX no encontrado: ${filePath}`);
    }
    console.log(`📄 Procesando DOCX: ${filePath}`);
    try {
        const dataBuffer = fs.readFileSync(filePath);
        // Extraer texto simple
        const textResult = await mammoth.extractRawText({ buffer: dataBuffer });
        const cleanText = textResult.value.trim();
        const wordCount = cleanText.split(/\s+/).filter((word) => word.length > 0).length;
        const language = detectLanguage(cleanText);
        const result = {
            text: cleanText,
            wordCount,
            extractedDate: new Date().toISOString(),
            language
        };
        // Extraer HTML si se preserva formato
        if (preserveFormatting) {
            const htmlResult = await mammoth.convertToHtml({ buffer: dataBuffer });
            result.html = htmlResult.value;
        }
        // Metadatos básicos del archivo
        if (extractMetadata) {
            const stats = fs.statSync(filePath);
            result.metadata = {
                filename: path.basename(filePath),
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime
            };
        }
        console.log(`✅ DOCX procesado: ${wordCount} palabras`);
        return result;
    }
    catch (error) {
        throw new Error(`Error procesando DOCX: ${error}`);
    }
}
/**
 * Detecta idioma básico del texto (español/inglés)
 */
function detectLanguage(text) {
    const sample = text.slice(0, 1000).toLowerCase();
    const spanishWords = ['el', 'la', 'en', 'de', 'que', 'y', 'es', 'por', 'con', 'para', 'una', 'los'];
    const englishWords = ['the', 'and', 'to', 'of', 'a', 'in', 'is', 'it', 'you', 'that', 'for', 'on'];
    let spanishCount = 0;
    let englishCount = 0;
    spanishWords.forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'g');
        spanishCount += (sample.match(regex) || []).length;
    });
    englishWords.forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'g');
        englishCount += (sample.match(regex) || []).length;
    });
    if (spanishCount > englishCount * 1.2)
        return 'Spanish';
    if (englishCount > spanishCount * 1.2)
        return 'English';
    return 'Unknown';
}
/**
 * Analiza texto completo con NLP: sentimientos, palabras clave, entidades, legibilidad
 */
export function analyzeText(text, options = {}) {
    const { includeSentiment = true, includeKeywords = true, includeEntities = true, includeReadability = true, keywordCount = 20 } = options;
    console.log(`🔍 Analizando texto (${text.length} caracteres)...`);
    const result = {};
    // Estadísticas básicas
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    result.statistics = {
        characters: text.length,
        words: words.length,
        sentences: sentences.length,
        paragraphs: paragraphs.length,
        averageWordsPerSentence: words.length / sentences.length || 0,
        averageSentencesPerParagraph: sentences.length / paragraphs.length || 0
    };
    // Análisis de sentimientos
    if (includeSentiment) {
        try {
            const sentimentAnalyzer = new sentiment();
            const sentimentResult = sentimentAnalyzer.analyze(text);
            result.sentiment = {
                score: sentimentResult.score,
                comparative: sentimentResult.comparative,
                positive: sentimentResult.positive,
                negative: sentimentResult.negative,
                polarity: sentimentResult.score > 2 ? 'positive' :
                    sentimentResult.score < -2 ? 'negative' : 'neutral'
            };
        }
        catch (error) {
            console.warn('Error en análisis de sentimientos:', error);
        }
    }
    // Extracción de palabras clave
    if (includeKeywords) {
        try {
            const keywords = keyword.extract(text, {
                language: 'spanish',
                remove_digits: true,
                return_changed_case: true,
                remove_duplicates: true
            });
            result.keywords = keywords.slice(0, keywordCount);
        }
        catch (error) {
            console.warn('Error extrayendo palabras clave:', error);
        }
    }
    // Extracción de entidades con Compromise
    if (includeEntities) {
        try {
            const doc = compromise(text);
            result.entities = {
                people: doc.people().out('array'),
                places: doc.places().out('array'),
                organizations: doc.organizations().out('array'),
                dates: doc.dates().out('array'),
                numbers: doc.values().out('array')
            };
        }
        catch (error) {
            console.warn('Error extrayendo entidades:', error);
        }
    }
    // Análisis de legibilidad
    if (includeReadability) {
        try {
            result.readability = calculateReadability(text, sentences, words);
        }
        catch (error) {
            console.warn('Error calculando legibilidad:', error);
        }
    }
    console.log(`✅ Análisis de texto completado`);
    return result;
}
/**
 * Calcula métricas de legibilidad
 */
function calculateReadability(text, sentences, words) {
    const avgWordsPerSentence = words.length / sentences.length || 0;
    const avgSyllablesPerWord = words.reduce((sum, word) => sum + countSyllables(word), 0) / words.length || 0;
    // Índice de legibilidad de Flesch (adaptado para español)
    const fleschScore = 206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllablesPerWord);
    let readingLevel = 'Muy difícil';
    if (fleschScore >= 90)
        readingLevel = 'Muy fácil';
    else if (fleschScore >= 80)
        readingLevel = 'Fácil';
    else if (fleschScore >= 70)
        readingLevel = 'Bastante fácil';
    else if (fleschScore >= 60)
        readingLevel = 'Normal';
    else if (fleschScore >= 50)
        readingLevel = 'Bastante difícil';
    else if (fleschScore >= 30)
        readingLevel = 'Difícil';
    return {
        fleschScore: Math.round(fleschScore),
        readingLevel,
        avgWordsPerSentence: Math.round(avgWordsPerSentence * 100) / 100,
        avgSyllablesPerWord: Math.round(avgSyllablesPerWord * 100) / 100,
        estimatedReadingTimeMinutes: Math.round(words.length / 200) // 200 palabras por minuto
    };
}
/**
 * Cuenta sílabas en una palabra (aproximación)
 */
function countSyllables(word) {
    word = word.toLowerCase();
    if (word.length <= 3)
        return 1;
    const vowels = 'aeiouáéíóúü';
    let syllables = 0;
    let prevWasVowel = false;
    for (let i = 0; i < word.length; i++) {
        const isVowel = vowels.includes(word[i]);
        if (isVowel && !prevWasVowel) {
            syllables++;
        }
        prevWasVowel = isVowel;
    }
    // Ajustes para español
    if (word.endsWith('e') && syllables > 1)
        syllables--;
    if (syllables === 0)
        syllables = 1;
    return syllables;
}
/**
 * Extrae datos tabulares de texto usando patrones comunes
 */
export function extractTabularData(text, options = {}) {
    const { detectTables = true, detectLists = true, detectKeyValuePairs = true } = options;
    const result = {
        tables: [],
        lists: [],
        keyValuePairs: {}
    };
    // Detectar tablas (líneas con múltiples delimitadores)
    if (detectTables) {
        const lines = text.split('\n');
        let currentTable = [];
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) {
                if (currentTable.length > 1) {
                    result.tables.push(currentTable);
                    currentTable = [];
                }
                continue;
            }
            // Detectar si es una línea tabular
            const delimiters = ['\t', '|', ','];
            for (const delimiter of delimiters) {
                const columns = trimmed.split(delimiter);
                if (columns.length >= 2 && columns.every(col => col.trim().length > 0)) {
                    currentTable.push(columns.map(col => col.trim()));
                    break;
                }
            }
        }
        if (currentTable.length > 1) {
            result.tables.push(currentTable);
        }
    }
    // Detectar listas numeradas o con viñetas
    if (detectLists) {
        const listRegex = /^[\s]*(?:\d+\.|\*|-|•)\s+(.+)$/gm;
        let match;
        let currentList = [];
        while ((match = listRegex.exec(text)) !== null) {
            currentList.push(match[1].trim());
        }
        if (currentList.length > 0) {
            result.lists.push(currentList);
        }
    }
    // Detectar pares clave-valor
    if (detectKeyValuePairs) {
        const kvRegex = /^[\s]*([^:\n]+):\s*([^:\n]+)$/gm;
        let match;
        while ((match = kvRegex.exec(text)) !== null) {
            const key = match[1].trim();
            const value = match[2].trim();
            if (key.length > 0 && value.length > 0) {
                result.keyValuePairs[key] = value;
            }
        }
    }
    return result;
}
/**
 * Convierte texto a diferentes formatos estructurados
 */
export function convertTextToFormat(text, targetFormat, options = {}) {
    const { extractStructure = true, includeMetadata = false } = options;
    let result = '';
    const metadata = {
        convertedAt: new Date().toISOString(),
        originalLength: text.length,
        wordCount: text.split(/\s+/).length
    };
    switch (targetFormat) {
        case 'json':
            const jsonData = { content: text };
            if (extractStructure) {
                const extracted = extractTabularData(text);
                if (extracted.tables.length > 0)
                    jsonData.tables = extracted.tables;
                if (extracted.lists.length > 0)
                    jsonData.lists = extracted.lists;
                if (Object.keys(extracted.keyValuePairs).length > 0)
                    jsonData.keyValuePairs = extracted.keyValuePairs;
            }
            if (includeMetadata)
                jsonData.metadata = metadata;
            result = JSON.stringify(jsonData, null, 2);
            break;
        case 'csv':
            // Convertir a CSV simple (línea por párrafo)
            const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
            result = 'paragraph_number,content\n';
            paragraphs.forEach((paragraph, index) => {
                const cleanParagraph = paragraph.replace(/"/g, '""').replace(/\n/g, ' ');
                result += `${index + 1},"${cleanParagraph}"\n`;
            });
            break;
        case 'markdown':
            result = text
                .split('\n\n')
                .map(paragraph => paragraph.trim())
                .filter(p => p.length > 0)
                .map(paragraph => {
                // Detectar y convertir títulos
                if (paragraph.length < 100 && !paragraph.includes('.') && paragraph.split(' ').length <= 8) {
                    return `## ${paragraph}`;
                }
                return paragraph;
            })
                .join('\n\n');
            if (includeMetadata) {
                result = `---\nconvertedAt: ${metadata.convertedAt}\nwordCount: ${metadata.wordCount}\n---\n\n${result}`;
            }
            break;
        case 'html':
            const htmlParagraphs = text
                .split('\n\n')
                .map(paragraph => paragraph.trim())
                .filter(p => p.length > 0)
                .map(paragraph => {
                if (paragraph.length < 100 && !paragraph.includes('.') && paragraph.split(' ').length <= 8) {
                    return `<h2>${paragraph}</h2>`;
                }
                return `<p>${paragraph}</p>`;
            })
                .join('\n');
            result = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Documento Convertido</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
        h2 { color: #333; border-bottom: 2px solid #ddd; padding-bottom: 10px; }
        p { margin-bottom: 15px; text-align: justify; }
    </style>
</head>
<body>
${htmlParagraphs}
${includeMetadata ? `<footer><small>Convertido el ${metadata.convertedAt} | ${metadata.wordCount} palabras</small></footer>` : ''}
</body>
</html>`;
            break;
    }
    return result;
}
/**
 * Procesa datos en lotes para evitar sobrecarga de memoria
 */
export async function processBatch(data, processor, batchSize = 1000) {
    const results = [];
    const totalBatches = Math.ceil(data.length / batchSize);
    console.log(`🔄 Procesando ${data.length} elementos en ${totalBatches} lotes de ${batchSize}`);
    for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);
        const batchIndex = Math.floor(i / batchSize) + 1;
        console.log(`📦 Procesando lote ${batchIndex}/${totalBatches}...`);
        try {
            const batchResults = await processor(batch, batchIndex);
            results.push(...batchResults);
            // Pequeña pausa para evitar sobrecarga
            if (batchIndex < totalBatches) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }
        catch (error) {
            console.error(`❌ Error en lote ${batchIndex}: ${error}`);
            throw error;
        }
    }
    console.log(`✅ Procesamiento completado: ${results.length} resultados`);
    return results;
}
/**
 * Interfaz unificada para leer cualquier tipo de documento
 */
export async function readDocument(filePath, options = {}) {
    const { extractText = true, extractMetadata = true, analyzeText: shouldAnalyzeText = false, extractStructure = false, maxPages } = options;
    const ext = path.extname(filePath).toLowerCase();
    const result = {
        type: ext,
        success: false
    };
    try {
        console.log(`📄 Procesando documento: ${filePath} (${ext})`);
        switch (ext) {
            case '.pdf':
                const pdfData = await readPDF(filePath, { extractMetadata, maxPages });
                result.content = pdfData.text;
                result.metadata = pdfData.metadata;
                result.metadata.pages = pdfData.pages;
                result.metadata.wordCount = pdfData.wordCount;
                result.metadata.language = pdfData.language;
                break;
            case '.docx':
                const docxData = await readDOCX(filePath, { extractMetadata });
                result.content = docxData.text;
                result.metadata = docxData.metadata;
                result.metadata.wordCount = docxData.wordCount;
                result.metadata.language = docxData.language;
                break;
            case '.txt':
                const txtContent = fs.readFileSync(filePath, 'utf8');
                result.content = txtContent;
                if (extractMetadata) {
                    const stats = fs.statSync(filePath);
                    result.metadata = {
                        filename: path.basename(filePath),
                        size: stats.size,
                        created: stats.birthtime,
                        modified: stats.mtime,
                        wordCount: txtContent.split(/\s+/).length,
                        language: detectLanguage(txtContent)
                    };
                }
                break;
            default:
                throw new Error(`Tipo de archivo no soportado: ${ext}`);
        }
        // Análisis de texto si se solicita
        if (shouldAnalyzeText && result.content) {
            result.analysis = analyzeText(result.content);
        }
        // Extracción de estructura si se solicita
        if (extractStructure && result.content) {
            result.structure = extractTabularData(result.content);
        }
        result.success = true;
        console.log(`✅ Documento procesado exitosamente: ${result.content?.length || 0} caracteres`);
    }
    catch (error) {
        result.error = error.message;
        console.error(`❌ Error procesando documento: ${result.error}`);
    }
    return result;
}
