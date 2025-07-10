import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
/**
 * Ejecuta código Python directamente con timeout y manejo de errores
 */
export async function executePython(code, data, options = {}) {
    const startTime = Date.now();
    const { timeout = 30000, includePlots = false, workingDir = '/tmp', requirements = [] } = options;
    try {
        // Crear directorio temporal único
        const tempDir = path.join(workingDir, `python_analysis_${Date.now()}`);
        await fs.mkdir(tempDir, { recursive: true });
        // Preparar archivo Python
        const pythonFile = path.join(tempDir, 'analysis.py');
        const dataFile = path.join(tempDir, 'data.json');
        // Preparar código Python con imports estándar
        const fullCode = generatePythonCode(code, data ? dataFile : null, includePlots, tempDir);
        await fs.writeFile(pythonFile, fullCode);
        // Escribir datos si se proporcionan
        if (data) {
            await fs.writeFile(dataFile, JSON.stringify(data, null, 2));
        }
        // Instalar requirements si es necesario
        if (requirements.length > 0) {
            await installPythonPackages(requirements);
        }
        // Ejecutar Python
        const result = await runPythonScript(pythonFile, timeout);
        // Buscar archivos de plots generados
        const plots = [];
        if (includePlots) {
            const files = await fs.readdir(tempDir);
            for (const file of files) {
                if (file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.svg')) {
                    plots.push(path.join(tempDir, file));
                }
            }
        }
        return {
            success: result.success,
            output: result.output,
            error: result.error,
            executionTime: Date.now() - startTime,
            plots
        };
    }
    catch (error) {
        return {
            success: false,
            output: '',
            error: `Error ejecutando Python: ${error}`,
            executionTime: Date.now() - startTime
        };
    }
}
/**
 * Genera código Python completo con imports y configuración
 */
function generatePythonCode(userCode, dataFile, includePlots, outputDir) {
    return `
import sys
import json
import pandas as pd
import numpy as np
import matplotlib
${includePlots ? "matplotlib.use('Agg')  # Backend sin GUI" : ""}
import matplotlib.pyplot as plt
import seaborn as sns
from scipy import stats
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.cluster import KMeans
from sklearn.metrics import mean_squared_error, accuracy_score, classification_report
import warnings
warnings.filterwarnings('ignore')

# Configuración de plots
plots_enabled = ${includePlots ? 'True' : 'False'}
if plots_enabled:
    plt.style.use('seaborn-v0_8')
    sns.set_palette("husl")
    plot_counter = 0
else:
    plt = None

def save_plot(name="plot"):
    global plot_counter
    if plots_enabled:
        filename = f"${outputDir}/plot_{plot_counter}_{name}.png"
        plt.savefig(filename, dpi=300, bbox_inches='tight')
        plot_counter += 1
        plt.close()
        print(f"PLOT_SAVED: {filename}")

# Cargar datos si están disponibles
df = None
${dataFile ? `
try:
    with open('${dataFile}', 'r') as f:
        data = json.load(f)
    df = pd.DataFrame(data)
    print(f"📊 Datos cargados: {len(df)} filas, {len(df.columns)} columnas")
    print(f"Columnas: {list(df.columns)}")
except Exception as e:
    print(f"Error cargando datos: {e}")
` : "print('No se proporcionaron datos')"}

# Funciones utilitarias
def describe_data():
    if df is not None:
        print("\\n=== DESCRIPCIÓN DE DATOS ===")
        print(df.info())
        print("\\n=== ESTADÍSTICAS DESCRIPTIVAS ===")
        print(df.describe())
        print("\\n=== VALORES NULOS ===")
        print(df.isnull().sum())
    
def correlation_analysis():
    if df is not None:
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        if len(numeric_cols) > 1:
            corr = df[numeric_cols].corr()
            print("\\n=== MATRIZ DE CORRELACIÓN ===")
            print(corr)
            
            if plots_enabled:
                plt.figure(figsize=(10, 8))
                sns.heatmap(corr, annot=True, cmap='coolwarm', center=0)
                plt.title('Matriz de Correlación')
                save_plot('correlation_matrix')

def detect_outliers(column):
    if df is not None and column in df.columns:
        Q1 = df[column].quantile(0.25)
        Q3 = df[column].quantile(0.75)
        IQR = Q3 - Q1
        lower = Q1 - 1.5 * IQR
        upper = Q3 + 1.5 * IQR
        outliers = df[(df[column] < lower) | (df[column] > upper)]
        print(f"\\n=== OUTLIERS EN {column} ===")
        print(f"Rango normal: {lower:.2f} - {upper:.2f}")
        print(f"Outliers detectados: {len(outliers)}")
        return outliers

def quick_ml_regression(target_col, feature_cols=None):
    if df is not None and target_col in df.columns:
        if feature_cols is None:
            feature_cols = df.select_dtypes(include=[np.number]).columns.tolist()
            feature_cols.remove(target_col)
        
        X = df[feature_cols].fillna(df[feature_cols].mean())
        y = df[target_col].fillna(df[target_col].mean())
        
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        
        # Modelo simple
        model = RandomForestRegressor(n_estimators=100, random_state=42)
        model.fit(X_train, y_train)
        
        y_pred = model.predict(X_test)
        mse = mean_squared_error(y_test, y_pred)
        
        print(f"\\n=== REGRESIÓN RÁPIDA PARA {target_col} ===")
        print(f"MSE: {mse:.4f}")
        print(f"R²: {model.score(X_test, y_test):.4f}")
        
        # Feature importance
        importance = pd.DataFrame({
            'feature': feature_cols,
            'importance': model.feature_importances_
        }).sort_values('importance', ascending=False)
        print("\\nImportancia de características:")
        print(importance)
        
        if plots_enabled:
            plt.figure(figsize=(10, 6))
            plt.scatter(y_test, y_pred, alpha=0.6)
            plt.plot([y_test.min(), y_test.max()], [y_test.min(), y_test.max()], 'r--', lw=2)
            plt.xlabel('Valores Reales')
            plt.ylabel('Predicciones')
            plt.title(f'Predicciones vs Reales - {target_col}')
            save_plot(f'regression_{target_col}')

def quick_clustering(n_clusters=3, features=None):
    if df is not None:
        if features is None:
            features = df.select_dtypes(include=[np.number]).columns.tolist()[:2]
        
        if len(features) >= 2:
            X = df[features].fillna(df[features].mean())
            scaler = StandardScaler()
            X_scaled = scaler.fit_transform(X)
            
            kmeans = KMeans(n_clusters=n_clusters, random_state=42)
            clusters = kmeans.fit_predict(X_scaled)
            
            print(f"\\n=== CLUSTERING K-MEANS (k={n_clusters}) ===")
            print(f"Características usadas: {features}")
            print(f"Distribución de clusters: {np.bincount(clusters)}")
            
            if plots_enabled and len(features) >= 2:
                plt.figure(figsize=(10, 6))
                scatter = plt.scatter(X[features[0]], X[features[1]], c=clusters, cmap='viridis', alpha=0.6)
                plt.colorbar(scatter)
                plt.xlabel(features[0])
                plt.ylabel(features[1])
                plt.title(f'Clustering K-Means (k={n_clusters})')
                save_plot('clustering')

# CÓDIGO DEL USUARIO
try:
${userCode.split('\n').map(line => '    ' + line).join('\n')}
except Exception as e:
    print(f"❌ Error en código de usuario: {e}")
    import traceback
    traceback.print_exc()
`;
}
/**
 * Ejecuta un script Python y captura la salida
 */
function runPythonScript(scriptPath, timeout) {
    return new Promise((resolve) => {
        let output = '';
        let error = '';
        const python = spawn('python3', [scriptPath], {
            cwd: path.dirname(scriptPath),
            stdio: ['pipe', 'pipe', 'pipe']
        });
        python.stdout.on('data', (data) => {
            output += data.toString();
        });
        python.stderr.on('data', (data) => {
            error += data.toString();
        });
        const timeoutId = setTimeout(() => {
            python.kill('SIGTERM');
            resolve({
                success: false,
                output,
                error: `Timeout después de ${timeout}ms`
            });
        }, timeout);
        python.on('close', (code) => {
            clearTimeout(timeoutId);
            resolve({
                success: code === 0,
                output,
                error: code !== 0 ? error : undefined
            });
        });
        python.on('error', (err) => {
            clearTimeout(timeoutId);
            resolve({
                success: false,
                output,
                error: `Error ejecutando Python: ${err.message}`
            });
        });
    });
}
/**
 * Instala paquetes Python si es necesario
 */
async function installPythonPackages(packages) {
    // Por simplicidad, asumimos que los paquetes ya están instalados
    // En un entorno real, podrías usar pip install aquí
    console.log(`📦 Verificando paquetes: ${packages.join(', ')}`);
}
/**
 * Templates predefinidos para análisis comunes
 */
export const ANALYSIS_TEMPLATES = {
    'data_exploration': {
        name: 'Exploración de Datos',
        description: 'Análisis exploratorio completo con estadísticas descriptivas y visualizaciones',
        category: 'exploratorio',
        parameters: {},
        code: `
describe_data()
correlation_analysis()

# Distribuciones de variables numéricas
numeric_cols = df.select_dtypes(include=[np.number]).columns
for col in numeric_cols[:4]:  # Primeras 4 columnas numéricas
    if plt:
        plt.figure(figsize=(12, 4))
        
        plt.subplot(1, 2, 1)
        df[col].hist(bins=30, alpha=0.7)
        plt.title(f'Distribución de {col}')
        plt.xlabel(col)
        plt.ylabel('Frecuencia')
        
        plt.subplot(1, 2, 2)
        df.boxplot(column=col)
        plt.title(f'Boxplot de {col}')
        
        save_plot(f'distribution_{col}')
        
    # Detectar outliers
    outliers = detect_outliers(col)
`,
        outputType: 'both'
    },
    'regression_analysis': {
        name: 'Análisis de Regresión',
        description: 'Análisis de regresión con múltiples modelos y evaluación',
        category: 'machine_learning',
        parameters: { target_column: 'string' },
        code: `
target_col = "{target_column}"

if target_col in df.columns:
    # Análisis de regresión rápido
    quick_ml_regression(target_col)
    
    # Análisis más detallado
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    if target_col in numeric_cols:
        numeric_cols.remove(target_col)
    
    # Correlación con target
    correlations = df[numeric_cols + [target_col]].corr()[target_col].sort_values(ascending=False)
    print(f"\\n=== CORRELACIONES CON {target_col} ===")
    print(correlations)
    
    # Scatter plots con las variables más correlacionadas
    top_features = correlations.abs().sort_values(ascending=False)[1:4]  # Top 3
    
    if plt:
        for i, feature in enumerate(top_features.index):
            plt.figure(figsize=(8, 6))
            plt.scatter(df[feature], df[target_col], alpha=0.6)
            plt.xlabel(feature)
            plt.ylabel(target_col)
            plt.title(f'{feature} vs {target_col} (corr: {correlations[feature]:.3f})')
            
            # Línea de tendencia
            z = np.polyfit(df[feature].fillna(df[feature].mean()), 
                          df[target_col].fillna(df[target_col].mean()), 1)
            p = np.poly1d(z)
            plt.plot(df[feature], p(df[feature]), "r--", alpha=0.8)
            
            save_plot(f'scatter_{feature}_{target_col}')
else:
    print(f"❌ Columna {target_col} no encontrada")
`,
        outputType: 'both'
    },
    'clustering_analysis': {
        name: 'Análisis de Clustering',
        description: 'Análisis de clustering con múltiples algoritmos y evaluación',
        category: 'machine_learning',
        parameters: { n_clusters: 3 },
        code: `
n_clusters = {n_clusters}

# Clustering rápido
quick_clustering(n_clusters)

# Análisis más detallado
numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
if len(numeric_cols) >= 2:
    X = df[numeric_cols].fillna(df[numeric_cols].mean())
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    
    # Método del codo para encontrar k óptimo
    inertias = []
    k_range = range(1, min(10, len(df)//10))
    
    for k in k_range:
        kmeans = KMeans(n_clusters=k, random_state=42)
        kmeans.fit(X_scaled)
        inertias.append(kmeans.inertia_)
    
    print("\\n=== MÉTODO DEL CODO ===")
    for k, inertia in zip(k_range, inertias):
        print(f"k={k}: inertia={inertia:.2f}")
    
    if plt:
        plt.figure(figsize=(10, 6))
        plt.plot(k_range, inertias, 'bo-')
        plt.xlabel('Número de Clusters (k)')
        plt.ylabel('Inercia')
        plt.title('Método del Codo para Determinar k Óptimo')
        plt.grid(True)
        save_plot('elbow_method')
        
        # PCA para visualización en 2D
        if len(numeric_cols) > 2:
            from sklearn.decomposition import PCA
            pca = PCA(n_components=2)
            X_pca = pca.fit_transform(X_scaled)
            
            kmeans = KMeans(n_clusters=n_clusters, random_state=42)
            clusters = kmeans.fit_predict(X_scaled)
            
            plt.figure(figsize=(10, 6))
            scatter = plt.scatter(X_pca[:, 0], X_pca[:, 1], c=clusters, cmap='viridis', alpha=0.6)
            plt.colorbar(scatter)
            plt.xlabel(f'PC1 ({pca.explained_variance_ratio_[0]:.1%} varianza)')
            plt.ylabel(f'PC2 ({pca.explained_variance_ratio_[1]:.1%} varianza)')
            plt.title('Clustering en Espacio PCA')
            save_plot('clustering_pca')
`,
        outputType: 'both'
    },
    'time_series_analysis': {
        name: 'Análisis de Series Temporales',
        description: 'Análisis de tendencias, estacionalidad y predicción básica',
        category: 'tiempo',
        parameters: { date_column: 'string', value_column: 'string' },
        code: `
date_col = "{date_column}"
value_col = "{value_column}"

if date_col in df.columns and value_col in df.columns:
    # Convertir fecha
    df[date_col] = pd.to_datetime(df[date_col])
    df_ts = df.sort_values(date_col).copy()
    
    print(f"\\n=== ANÁLISIS DE SERIE TEMPORAL ===")
    print(f"Período: {df_ts[date_col].min()} a {df_ts[date_col].max()}")
    print(f"Número de observaciones: {len(df_ts)}")
    
    # Estadísticas básicas
    print(f"\\n=== ESTADÍSTICAS DE {value_col} ===")
    print(df_ts[value_col].describe())
    
    if plt:
        # Gráfico de serie temporal
        plt.figure(figsize=(12, 8))
        
        plt.subplot(2, 2, 1)
        plt.plot(df_ts[date_col], df_ts[value_col])
        plt.title(f'Serie Temporal - {value_col}')
        plt.xlabel('Fecha')
        plt.ylabel(value_col)
        plt.xticks(rotation=45)
        
        # Distribución
        plt.subplot(2, 2, 2)
        df_ts[value_col].hist(bins=30, alpha=0.7)
        plt.title(f'Distribución de {value_col}')
        plt.xlabel(value_col)
        plt.ylabel('Frecuencia')
        
        # Tendencia (media móvil)
        if len(df_ts) > 7:
            window = min(30, len(df_ts)//4)
            df_ts['moving_avg'] = df_ts[value_col].rolling(window=window).mean()
            
            plt.subplot(2, 2, 3)
            plt.plot(df_ts[date_col], df_ts[value_col], alpha=0.5, label='Original')
            plt.plot(df_ts[date_col], df_ts['moving_avg'], color='red', label=f'Media Móvil ({window}d)')
            plt.title('Tendencia')
            plt.xlabel('Fecha')
            plt.ylabel(value_col)
            plt.legend()
            plt.xticks(rotation=45)
        
        # Autocorrelación simple
        plt.subplot(2, 2, 4)
        if len(df_ts) > 10:
            autocorr = [df_ts[value_col].autocorr(lag=i) for i in range(1, min(20, len(df_ts)//2))]
            plt.bar(range(1, len(autocorr)+1), autocorr)
            plt.title('Autocorrelación')
            plt.xlabel('Lag')
            plt.ylabel('Autocorrelación')
        
        plt.tight_layout()
        save_plot('time_series_analysis')
        
    # Detección de tendencia
    if len(df_ts) > 2:
        from scipy.stats import linregress
        x = range(len(df_ts))
        slope, intercept, r_value, p_value, std_err = linregress(x, df_ts[value_col])
        print(f"\\n=== ANÁLISIS DE TENDENCIA ===")
        print(f"Pendiente: {slope:.6f}")
        print(f"R²: {r_value**2:.4f}")
        print(f"P-valor: {p_value:.6f}")
        
        if p_value < 0.05:
            trend = "creciente" if slope > 0 else "decreciente"
            print(f"✅ Tendencia {trend} significativa")
        else:
            print("❌ No hay tendencia significativa")
else:
    print(f"❌ Columnas {date_col} o {value_col} no encontradas")
`,
        outputType: 'both'
    },
    'statistical_testing': {
        name: 'Pruebas Estadísticas',
        description: 'Pruebas de normalidad, correlación y comparación de grupos',
        category: 'estadistica',
        parameters: {},
        code: `
print("\\n=== PRUEBAS ESTADÍSTICAS ===")

numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()

# Pruebas de normalidad
print("\\n--- PRUEBAS DE NORMALIDAD (Shapiro-Wilk) ---")
for col in numeric_cols[:5]:  # Primeras 5 columnas
    data = df[col].dropna()
    if len(data) > 3:
        try:
            stat, p_value = stats.shapiro(data[:5000])  # Máximo 5000 muestras
            print(f"{col}: W={stat:.4f}, p={p_value:.6f} {'(Normal)' if p_value > 0.05 else '(No normal)'}")
        except:
            print(f"{col}: Error en prueba de normalidad")

# Correlaciones significativas
if len(numeric_cols) > 1:
    print("\\n--- CORRELACIONES SIGNIFICATIVAS ---")
    from itertools import combinations
    
    for col1, col2 in combinations(numeric_cols[:8], 2):  # Máximo 8 columnas
        data1 = df[col1].dropna()
        data2 = df[col2].dropna()
        common_idx = df[[col1, col2]].dropna().index
        
        if len(common_idx) > 10:
            corr, p_value = stats.pearsonr(df.loc[common_idx, col1], df.loc[common_idx, col2])
            if abs(corr) > 0.3 and p_value < 0.05:
                print(f"{col1} vs {col2}: r={corr:.4f}, p={p_value:.6f} {'***' if p_value < 0.001 else '**' if p_value < 0.01 else '*'}")

# Comparación de grupos (si hay variables categóricas)
categorical_cols = df.select_dtypes(include=['object', 'category']).columns.tolist()
if len(categorical_cols) > 0 and len(numeric_cols) > 0:
    print("\\n--- COMPARACIÓN DE GRUPOS (ANOVA) ---")
    
    for cat_col in categorical_cols[:3]:  # Primeras 3 categóricas
        unique_vals = df[cat_col].nunique()
        if 2 <= unique_vals <= 10:  # Entre 2 y 10 grupos
            for num_col in numeric_cols[:3]:  # Primeras 3 numéricas
                groups = [df[df[cat_col] == val][num_col].dropna() for val in df[cat_col].unique()]
                groups = [g for g in groups if len(g) > 0]
                
                if len(groups) >= 2:
                    try:
                        f_stat, p_value = stats.f_oneway(*groups)
                        print(f"{num_col} por {cat_col}: F={f_stat:.4f}, p={p_value:.6f} {'(Diferencias significativas)' if p_value < 0.05 else '(Sin diferencias)'}")
                    except:
                        print(f"{num_col} por {cat_col}: Error en ANOVA")
`,
        outputType: 'text'
    }
};
/**
 * Aplica un template de análisis con parámetros
 */
export function applyAnalysisTemplate(templateName, parameters = {}) {
    const template = ANALYSIS_TEMPLATES[templateName];
    if (!template) {
        throw new Error(`Template '${templateName}' no encontrado`);
    }
    let code = template.code;
    // Reemplazar parámetros en el código
    for (const [key, value] of Object.entries(parameters)) {
        const placeholder = `{${key}}`;
        code = code.replace(new RegExp(placeholder, 'g'), String(value));
    }
    return code;
}
/**
 * Obtiene la lista de templates disponibles
 */
export function getAvailableTemplates() {
    return Object.values(ANALYSIS_TEMPLATES);
}
