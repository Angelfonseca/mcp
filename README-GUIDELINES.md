# 📋 AutoData MCP - Reglas y Buenas Prácticas de Desarrollo

## 🎯 Principios Fundamentales

### 🏗️ Arquitectura Limpia
- **Separación de responsabilidades**: Cada módulo tiene una única responsabilidad
- **Inversión de dependencias**: Depender de abstracciones, no de implementaciones concretas
- **Principio abierto/cerrado**: Abierto para extensión, cerrado para modificación
- **DRY (Don't Repeat Yourself)**: Evitar duplicación de código

### 🔒 Seguridad por Diseño
- **Validación de entrada**: Todos los datos deben ser validados antes del procesamiento
- **Sanitización**: Limpiar datos para prevenir inyecciones
- **Principio de menor privilegio**: Acceso mínimo necesario
- **Cifrado de datos sensibles**: Credenciales y PII siempre cifrados

## 📝 Estándares de Código

### 🎨 Formato y Estilo

#### ESLint Configuración
```json
{
  "extends": [
    "@typescript-eslint/recommended",
    "@typescript-eslint/recommended-requiring-type-checking",
    "prettier"
  ],
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": 2022,
    "sourceType": "module",
    "project": "./tsconfig.json"
  },
  "rules": {
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/explicit-function-return-type": "warn",
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/prefer-const": "error",
    "@typescript-eslint/no-var-requires": "error",
    "prefer-const": "error",
    "no-var": "error",
    "no-console": "warn",
    "no-debugger": "error",
    "max-len": ["error", { "code": 100, "ignoreComments": true }],
    "complexity": ["warn", 10],
    "max-depth": ["warn", 4],
    "max-params": ["warn", 5]
  }
}
```

#### Prettier Configuración
```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "endOfLine": "lf",
  "arrowParens": "avoid"
}
```

### 🏷️ Convenciones de Nomenclatura

#### Variables y Funciones
```typescript
// ✅ Correcto - camelCase
const userName = 'john_doe';
const calculateTotalPrice = (items: Item[]) => { ... };
const isDataValid = true;

// ❌ Incorrecto
const user_name = 'john_doe';
const IsDataValid = true;
const Calculate_Total_Price = () => { ... };
```

#### Clases y Interfaces
```typescript
// ✅ Correcto - PascalCase
class DatabaseService { ... }
interface UserData { ... }
type ReportConfig = { ... };

// ❌ Incorrecto
class databaseService { ... }
interface userData { ... }
```

#### Constantes
```typescript
// ✅ Correcto - SCREAMING_SNAKE_CASE
const MAX_RETRY_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 5000;
const DATABASE_TYPES = ['mysql', 'mongodb', 'postgresql'] as const;

// ❌ Incorrecto
const maxRetryAttempts = 3;
const default_timeout_ms = 5000;
```

#### Archivos y Directorios
```
// ✅ Correcto - kebab-case para archivos, camelCase para directorios
src/
├── services/
│   ├── database-service.ts
│   ├── report-service.ts
│   └── embedding-service.ts
├── helpers/
│   ├── data-validation.ts
│   └── file-processor.ts

// ❌ Incorrecto
src/
├── Services/
│   ├── DatabaseService.ts
│   └── report_service.ts
```

## 📚 Documentación y Comentarios

### 🔍 JSDoc para Funciones Públicas
```typescript
/**
 * Analiza un DataFrame y genera estadísticas descriptivas
 * @param data - Array de objetos que representa el DataFrame
 * @param options - Opciones de configuración para el análisis
 * @returns Promesa que resuelve con el resultado del análisis
 * @throws {ValidationError} Cuando los datos no son válidos
 * @example
 * ```typescript
 * const result = await analyzeDataFrame(
 *   [{ name: 'John', age: 30 }, { name: 'Jane', age: 25 }],
 *   { includeInsights: true }
 * );
 * console.log(result.statistics);
 * ```
 */
async function analyzeDataFrame(
  data: Record<string, any>[],
  options: AnalysisOptions = {}
): Promise<AnalysisResult> {
  // Implementación...
}
```

### 💬 Comentarios Explicativos
```typescript
// ✅ Correcto - Explica el "por qué", no el "qué"
// Usamos un timeout más largo para consultas complejas que involucran JOINs
const COMPLEX_QUERY_TIMEOUT = 30000;

// Validamos antes de la inserción para evitar corrupción de datos
if (!isValidDataStructure(data)) {
  throw new ValidationError('Invalid data structure');
}

// ❌ Incorrecto - Explica lo obvio
// Incrementa el contador en 1
counter++;

// Asigna el valor de name a userName
const userName = user.name;
```

### 📋 TODO y FIXME
```typescript
// TODO: Implementar cache para mejorar performance
// FIXME: Memory leak en conexiones de MongoDB
// HACK: Workaround temporal hasta que se arregle el bug en la librería
// NOTE: Esta función será deprecada en la próxima versión
```

## 🔍 Manejo de Errores

### 🎯 Tipos de Error Personalizados
```typescript
// Base para todos los errores personalizados
abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly isOperational: boolean;

  constructor(message: string, public readonly context?: Record<string, any>) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Errores específicos del dominio
class ValidationError extends AppError {
  readonly statusCode = 400;
  readonly isOperational = true;
}

class DatabaseConnectionError extends AppError {
  readonly statusCode = 503;
  readonly isOperational = true;
}

class DataProcessingError extends AppError {
  readonly statusCode = 500;
  readonly isOperational = true;
}
```

### 🛡️ Manejo Defensivo
```typescript
// ✅ Correcto - Validación exhaustiva
async function processUserData(userData: unknown): Promise<ProcessedData> {
  // Validación de tipo
  if (!userData || typeof userData !== 'object') {
    throw new ValidationError('User data must be a valid object');
  }

  // Validación de esquema con Zod
  const validatedData = userDataSchema.parse(userData);

  try {
    // Procesamiento con manejo de errores
    const result = await processData(validatedData);
    return result;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error; // Re-lanzar errores conocidos
    }
    
    // Envolver errores desconocidos
    throw new DataProcessingError(
      'Failed to process user data',
      { originalError: error.message, userData: validatedData }
    );
  }
}

// ❌ Incorrecto - Sin validación
async function processUserData(userData: any) {
  return await processData(userData.name, userData.email);
}
```

## 🧪 Testing

### 📝 Estructura de Pruebas
```typescript
describe('DatabaseService', () => {
  let service: DatabaseService;
  let mockConnection: jest.Mocked<DatabaseConnection>;

  beforeEach(() => {
    mockConnection = createMockConnection();
    service = new DatabaseService(mockConnection);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('analyze', () => {
    it('should return analysis results for valid data', async () => {
      // Arrange
      const testData = [{ id: 1, name: 'test' }];
      const expectedResult = { rowCount: 1, columns: ['id', 'name'] };
      mockConnection.query.mockResolvedValue(testData);

      // Act
      const result = await service.analyze('test_table');

      // Assert
      expect(result).toEqual(expectedResult);
      expect(mockConnection.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT')
      );
    });

    it('should throw ValidationError for invalid table name', async () => {
      // Arrange
      const invalidTableName = 'invalid-table-name!';

      // Act & Assert
      await expect(service.analyze(invalidTableName))
        .rejects.toThrow(ValidationError);
    });
  });
});
```

### 📊 Cobertura de Código
- **Mínimo**: 80% cobertura total
- **Funciones críticas**: 95% cobertura
- **Nuevas características**: 100% cobertura

### 🎭 Tipos de Pruebas
```typescript
// Pruebas unitarias - Funciones individuales
describe('calculateStatistics', () => {
  it('should calculate mean correctly', () => {
    const result = calculateStatistics([1, 2, 3, 4, 5]);
    expect(result.mean).toBe(3);
  });
});

// Pruebas de integración - Módulos interactuando
describe('DatabaseService Integration', () => {
  it('should connect and query real database', async () => {
    const service = new DatabaseService(realConnection);
    const result = await service.query('SELECT 1 as test');
    expect(result).toBeDefined();
  });
});

// Pruebas end-to-end - Flujo completo
describe('Report Generation E2E', () => {
  it('should generate PDF report from database data', async () => {
    const data = await fetchDataFromDB();
    const report = await generatePDFReport(data);
    expect(report).toBeInstanceOf(Buffer);
  });
});
```

## 🔒 Seguridad

### 🛡️ Validación de Entrada
```typescript
// ✅ Correcto - Validación con Zod
const QuerySchema = z.object({
  table: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Invalid table name'),
  limit: z.number().min(1).max(10000).optional(),
  offset: z.number().min(0).optional(),
  filters: z.record(z.any()).optional()
});

async function executeQuery(params: unknown) {
  const validParams = QuerySchema.parse(params);
  // Procesar con datos validados...
}

// ❌ Incorrecto - Sin validación
async function executeQuery(params: any) {
  const query = `SELECT * FROM ${params.table}`;
  // Vulnerable a SQL injection
}
```

### 🔐 Manejo de Credenciales
```typescript
// ✅ Correcto - Variables de entorno
const config = {
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD, // Nunca hardcodeado
  }
};

// ❌ Incorrecto - Credenciales hardcodeadas
const config = {
  database: {
    host: 'localhost',
    username: 'admin',
    password: 'password123' // ¡NUNCA hacer esto!
  }
};
```

### 🧹 Sanitización de Datos
```typescript
import DOMPurify from 'isomorphic-dompurify';

// Sanitizar contenido HTML
function sanitizeHTML(input: string): string {
  return DOMPurify.sanitize(input);
}

// Escapar caracteres especiales para SQL
function escapeSQL(input: string): string {
  return input.replace(/'/g, "''").replace(/\\/g, '\\\\');
}

// Validar y limpiar nombres de archivos
function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9.-]/g, '_');
}
```

## 🚀 Performance

### ⚡ Optimizaciones Generales
```typescript
// ✅ Correcto - Operaciones asíncronas paralelas
async function fetchMultipleDataSources() {
  const [apiData, dbData, fileData] = await Promise.all([
    fetchFromAPI(),
    queryDatabase(),
    readFromFile()
  ]);
  
  return combineData(apiData, dbData, fileData);
}

// ❌ Incorrecto - Operaciones secuenciales innecesarias
async function fetchMultipleDataSources() {
  const apiData = await fetchFromAPI();
  const dbData = await queryDatabase();
  const fileData = await readFromFile();
  
  return combineData(apiData, dbData, fileData);
}
```

### 🗄️ Gestión de Memoria
```typescript
// ✅ Correcto - Procesamiento por lotes para datasets grandes
async function processLargeDataset(data: any[]): Promise<ProcessedData[]> {
  const batchSize = 1000;
  const results: ProcessedData[] = [];
  
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    const processed = await processBatch(batch);
    results.push(...processed);
    
    // Permitir que el event loop respire
    if (i % (batchSize * 10) === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }
  
  return results;
}

// ❌ Incorrecto - Procesar todo en memoria
async function processLargeDataset(data: any[]): Promise<ProcessedData[]> {
  return data.map(item => processItem(item)); // Puede causar out of memory
}
```

### 📊 Monitoreo de Performance
```typescript
// Decorator para medir tiempo de ejecución
function measureTime(target: any, propertyName: string, descriptor: PropertyDescriptor) {
  const method = descriptor.value;
  
  descriptor.value = async function (...args: any[]) {
    const start = performance.now();
    try {
      const result = await method.apply(this, args);
      const duration = performance.now() - start;
      
      if (duration > 1000) { // Log operaciones lentas
        console.warn(`Slow operation: ${propertyName} took ${duration}ms`);
      }
      
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      console.error(`Failed operation: ${propertyName} failed after ${duration}ms`);
      throw error;
    }
  };
}

class DatabaseService {
  @measureTime
  async complexQuery(sql: string): Promise<any[]> {
    // Implementación...
  }
}
```

## 📋 Checklist de Calidad

### ✅ Antes de Commit
- [ ] Código pasa todas las pruebas (`npm test`)
- [ ] No hay errores de ESLint (`npm run lint`)
- [ ] Código está formateado (`npm run format`)
- [ ] Tipos de TypeScript son correctos (`npm run type-check`)
- [ ] Documentación JSDoc actualizada
- [ ] Variables de entorno documentadas
- [ ] No hay `console.log` en código de producción
- [ ] Errores manejados apropiadamente

### 📊 Antes de Pull Request
- [ ] Cobertura de pruebas > 80%
- [ ] Performance testada con datos grandes
- [ ] Documentación actualizada
- [ ] Cambios breaking documentados
- [ ] Migraciones de BD incluidas si es necesario
- [ ] Security review completado

### 🚀 Antes de Release
- [ ] Todas las pruebas E2E pasan
- [ ] Performance benchmarks ejecutados
- [ ] Logs de error monitoreados
- [ ] Rollback plan preparado
- [ ] Documentation de usuario actualizada

## 🔄 Versionado Semántico

### 📈 Incremento de Versiones
- **MAJOR** (X.0.0): Cambios incompatibles con versiones anteriores
- **MINOR** (0.X.0): Nueva funcionalidad compatible hacia atrás
- **PATCH** (0.0.X): Corrección de bugs compatibles

### 📝 Changelog Format
```markdown
## [1.2.0] - 2024-07-07

### Added
- Nueva funcionalidad de exportación a PDF
- Soporte para base de datos ClickHouse

### Changed
- Mejorada performance de análisis de DataFrames (50% más rápido)
- Actualizada interfaz de DatabaseService

### Deprecated
- Método `legacyAnalyze` será removido en v2.0.0

### Removed
- Soporte para Node.js < 18

### Fixed
- Corregido memory leak en conexiones MongoDB
- Solucionado bug en validación de CSV con encoding UTF-8

### Security
- Actualizada dependencia vulnerable (axios@0.21.1 → 1.4.0)
```

## 🎯 Métricas de Calidad

### 📊 Objetivos de Calidad
- **Cobertura de código**: > 85%
- **Complejidad ciclomática**: < 10 por función
- **Deuda técnica**: < 5% del código total
- **Tiempo de build**: < 2 minutos
- **Vulnerabilidades**: 0 críticas, < 5 medias

### 🔍 Herramientas de Monitoreo
```json
{
  "scripts": {
    "quality:check": "npm run lint && npm run type-check && npm run test:coverage",
    "security:audit": "npm audit --audit-level moderate",
    "complexity:check": "npx complexity-report src/",
    "size:check": "npx bundlesize"
  }
}
```

## 🚀 Conclusión

Estas reglas y prácticas aseguran que el código sea:
- **Mantenible**: Fácil de entender y modificar
- **Confiable**: Funciona correctamente bajo diferentes condiciones
- **Seguro**: Protegido contra vulnerabilidades comunes
- **Eficiente**: Optimizado para performance
- **Escalable**: Capaz de crecer con los requerimientos

El cumplimiento de estas reglas no es opcional, sino fundamental para el éxito del proyecto AutoData MCP.