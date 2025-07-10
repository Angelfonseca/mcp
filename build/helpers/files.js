import * as fs from 'fs';
import * as chardet from 'chardet';
import * as xlsx from 'xlsx';
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
