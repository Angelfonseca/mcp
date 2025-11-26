# 📊 AutoData MCP Server - Análisis Avanzado de Datos

Servidor MCP (Model Context Protocol) especializado en análisis avanzado de datos con soporte completo para documentos PDF/DOCX, bases de datos múltiples, Machine Learning con Python, y análisis de texto con NLP. Optimizado para ser usado perfectamente por LLMs.

## 🚀 Características Principales

### 📄 **Análisis de Documentos Avanzado**
- **Lectura Universal**: PDFs, DOCX, TXT con detección automática de encoding
- **Extracción Inteligente**: Texto, metadatos, tablas, listas, pares clave-valor
- **Análisis NLP**: Sentimientos, emociones, entidades, legibilidad, palabras clave
- **Conversión de Formatos**: PDF→TXT, DOCX→MD, TXT→HTML, JSON, CSV
- **Comparación de Documentos**: Similitudes, diferencias, detección de plagio

### 🗄️ **Bases de Datos Múltiples**
- **MySQL**: Análisis completo, queries, búsquedas, embeddings
- **PostgreSQL**: Soporte completo incluyendo búsqueda por similitud
- **MongoDB**: Operaciones NoSQL, agregaciones, análisis de colecciones
- **Migración ETL**: Transferencia automática entre diferentes BDs

### 🧠 **Machine Learning y Python**
- **Análisis Estadístico**: Descriptivas, correlaciones, outliers, clustering K-means
- **Templates Predefinidos**: Exploración, regresión, clustering, series temporales
- **Código Python Personalizado**: Ejecución con pandas, numpy, scikit-learn
- **Visualizaciones**: Gráficos automáticos en alta resolución

### 📈 **Reportes Ejecutivos**
- **Formatos Múltiples**: HTML interactivo, PDF profesional, DOCX editable
- **Visualizaciones**: Gráficos SVG integrados, tablas responsivas
- **Análisis Automático**: Insights generados por IA, recomendaciones

## 🛠️ Herramientas Disponibles

### 📄 **Análisis de Documentos**

#### `read-document-content`
Lee y analiza documentos PDF, DOCX o TXT con análisis NLP completo.

```typescript
{
  filePath: "/ruta/al/documento.pdf",
  analyzeText: true,
  extractStructure: true,
  maxPages: 50,
  keywordCount: 20
}
```

#### `extract-document-data`
Extrae datos estructurados (tablas, listas, formularios) a JSON/CSV.

```typescript
{
  filePath: "/ruta/al/documento.pdf",
  outputFormat: "both",
  detectTables: true,
  detectLists: true,
  saveTo: "/ruta/salida"
}
```

#### `convert-document-format`
Convierte documentos entre formatos con preservación de estructura.

```typescript
{
  inputPath: "/documento.pdf",
  outputFormat: "markdown",
  preserveFormatting: true,
  chunkSize: 2000
}
```

#### `analyze-text-semantics`
Análisis semántico avanzado: sentimientos, emociones, temas, resumen.

```typescript
{
  text: "Texto a analizar...",
  analysisDepth: "comprehensive",
  includeSummary: true,
  detectTopics: true,
  keywordCount: 15
}
```

#### `compare-documents`
Compara documentos para similitudes, diferencias y detección de plagio.

```typescript
{
  document1Path: "/doc1.pdf",
  document2Path: "/doc2.pdf",
  comparisonType: "plagiarism",
  similarityThreshold: 0.7
}
```

### 🗄️ **Bases de Datos**

#### MySQL
- `mysql-analyze`: Análisis completo de base de datos
- `mysql-query`: Ejecutar queries personalizadas
- `mysql-search`: Búsqueda con texto libre
- `mysql-embeddings`: Generar embeddings vectoriales

#### PostgreSQL
- `postgresql-analyze`: Análisis completo con estadísticas
- `postgresql-query`: Queries SQL avanzadas
- `postgresql-similarity-search`: Búsqueda por similitud semántica
- `postgresql-embeddings`: Vectores para ML

#### MongoDB
- `mongodb-analyze`: Análisis de colecciones NoSQL
- `mongodb-query`: Agregaciones y consultas complejas
- `mongodb-search`: Búsqueda full-text
- `mongodb-embeddings`: Análisis semántico de documentos

### 📊 **Análisis y Machine Learning**

#### `analyze-dataframe`
Motor de análisis estadístico avanzado para datasets grandes.

```typescript
{
  data: [...], // Array de objetos
  analysisType: "correlation",
  includeInsights: true,
  sampleSize: 50000
}
```

#### `run-analysis-template`
Templates especializados de análisis científico.

```typescript
{
  templateName: "data_exploration",
  data: [...],
  parameters: { target_column: "ventas" },
  includePlots: true
}
```

#### `run-python-analysis`
Ejecuta código Python personalizado con librerías científicas.

```typescript
{
  code: `
    describe_data()
    correlation_analysis()
    quick_ml_regression('target_column')
  `,
  data: [...],
  includePlots: true
}
```

### 📈 **Reportes y Visualización**

#### `generate-data-report`
Crea reportes ejecutivos con análisis automático.

```typescript
{
  title: "Análisis de Ventas Q4 2024",
  data: [...],
  format: "pdf",
  sections: [
    { title: "Resumen", type: "text", content: "..." },
    { title: "Gráfico Ventas", type: "chart", chartConfig: {...} }
  ]
}
```

### 🔧 **Utilidades**

#### `load-data-source`
Carga datos desde CSV, Excel, JSON o APIs REST.

#### `migrate-data-to-database`
ETL completo para migrar millones de registros.

#### `monitor-performance`
Monitorea rendimiento y optimiza procesamiento.

## 📦 Instalación

### 1. Dependencias del Sistema

```bash
# Node.js 18+ y Python 3.8+
node --version  # >= 18.0.0
python3 --version  # >= 3.8.0
```

### 2. Instalación del Proyecto

```bash
# Clonar e instalar
git clone <repository>
cd mcp
npm install

# Instalar dependencias Python
npm run install-python-deps

# Verificar instalación
npm run test-python

# Compilar TypeScript
npm run build
```

### 3. Dependencias Adicionales

```bash
# Para PDFs y análisis avanzado
pip3 install PyPDF2 python-docx nltk spacy textstat

# Para análisis de ML avanzado
pip3 install pandas numpy matplotlib seaborn scipy scikit-learn plotly

# Descargar modelos de NLP (opcional)
python3 -c "import nltk; nltk.download('punkt')"
```

## 🚀 Uso Rápido

### Análisis Básico de Documento

```bash
# Analizar un PDF
{
  "tool": "read-document-content",
  "params": {
    "filePath": "/ruta/al/documento.pdf",
    "analyzeText": true,
    "extractStructure": true
  }
}
```

### Análisis de Dataset

```bash
# Análisis estadístico completo
{
  "tool": "analyze-dataframe",
  "params": {
    "data": [{"ventas": 100, "region": "Norte"}, ...],
    "analysisType": "comprehensive",
    "includeInsights": true
  }
}
```

### Generar Reporte Ejecutivo

```bash
{
  "tool": "generate-data-report",
  "params": {
    "title": "Reporte de Ventas",
    "data": [...],
    "format": "pdf",
    "sections": [
      {
        "title": "Análisis de Tendencias",
        "type": "chart",
        "chartConfig": {
          "type": "bar",
          "dataColumn": "ventas",
          "labelColumn": "mes"
        }
      }
    ]
  }
}
```

## 🔧 Configuración Avanzada

### Variables de Entorno

```bash
# Configuración opcional
export OLLAMA_HOST="http://localhost:11434"  # Para embeddings
export MAX_MEMORY_MB=2048                    # Límite de memoria
export PYTHON_TIMEOUT=300000                # Timeout Python
```

### Optimización para Datasets Grandes

```javascript
// Para datasets >1M registros
{
  "sampleSize": 100000,
  "batchSize": 5000,
  "maxMemoryMB": 1024,
  "useStreaming": true
}
```

## 📊 Templates de Análisis Disponibles

### `data_exploration`
- Estadísticas descriptivas completas
- Matriz de correlaciones
- Detección de outliers
- Distribuciones de variables

### `regression_analysis`
- Random Forest y Linear Regression
- Importancia de características
- Validación cruzada
- Métricas de performance

### `clustering_analysis`
- K-means con método del codo
- PCA para reducción dimensional
- Visualización de clusters
- Análisis de segmentación

### `time_series_analysis`
- Análisis de tendencias
- Detección de estacionalidad
- Autocorrelación y ACF/PACF
- Predicción ARIMA básica

### `statistical_testing`
- Pruebas de normalidad
- T-tests y ANOVA
- Pruebas de independencia
- Corrección por múltiples comparaciones

## 🐛 Solución de Problemas

### Error: Dependencias Python no encontradas
```bash
# Reinstalar dependencias
npm run install-python-deps
python3 -m pip install --upgrade pip
```

### Error: Memoria insuficiente
```bash
# Reducir parámetros
{
  "sampleSize": 10000,
  "batchSize": 1000,
  "maxMemoryMB": 512
}
```

### Error: Timeout en análisis
```bash
# Aumentar timeout
{
  "timeout": 600000  // 10 minutos
}
```

## 📈 Casos de Uso

### 1. **Análisis de Documentos Legales**
- Extraer cláusulas y términos clave
- Comparar contratos para inconsistencias
- Análisis de riesgo y compliance

### 2. **Investigación Académica**
- Procesar papers y literatura científica
- Análisis de citaciones y referencias
- Detección de plagio académico

### 3. **Business Intelligence**
- Reportes automáticos de KPIs
- Análisis predictivo de ventas
- Segmentación de clientes

### 4. **Data Science**
- Exploración automatizada de datasets
- Feature engineering automático
- Validación de modelos ML

## 🤝 Contribuir

### Reportar Bugs
- Usar GitHub Issues con template
- Incluir logs y configuración
- Especificar versiones de dependencias

### Nuevas Características
- Fork del repositorio
- Crear rama feature/nueva-caracteristica
- Pull request con tests

## 📄 Licencia

MIT License - Ver archivo `LICENSE` para detalles.

## 🆘 Soporte

- **Documentación**: [Wiki del proyecto]
- **Issues**: [GitHub Issues]
- **Discusiones**: [GitHub Discussions]
- **Email**: soporte@autodata-mcp.com

---

**AutoData MCP Server** - Análisis de datos avanzado optimizado para LLMs 🚀 