# 🐍 Configuración de Python para AutoData MCP

## ⚡ Instalación Rápida

```bash
# Instalar dependencias Python automáticamente
npm run install-python-deps

# Verificar instalación
npm run test-python
```

## 📦 Dependencias Python Requeridas

### 🔢 **Librerías Numéricas Core**
- **pandas** - Manipulación y análisis de datos
- **numpy** - Computación numérica de alto rendimiento
- **scipy** - Algoritmos científicos y estadísticos

### 📊 **Visualización**
- **matplotlib** - Gráficos estáticos de alta calidad
- **seaborn** - Visualizaciones estadísticas elegantes
- **plotly** - Gráficos interactivos y dashboards

### 🤖 **Machine Learning**
- **scikit-learn** - Algoritmos de ML y preprocessing
- **statsmodels** - Modelos estadísticos avanzados

### 🔧 **Herramientas de Desarrollo**
- **jupyter** - Notebooks interactivos
- **ipython** - Shell interactivo mejorado

## 🛠️ Instalación Manual

Si necesitas instalar manualmente:

```bash
# Librerías core
pip3 install pandas numpy scipy

# Visualización
pip3 install matplotlib seaborn plotly

# Machine Learning
pip3 install scikit-learn statsmodels

# Herramientas adicionales
pip3 install jupyter ipython

# O todo de una vez
pip3 install pandas numpy matplotlib seaborn scipy scikit-learn plotly statsmodels jupyter ipython
```

## 🍎 macOS

```bash
# Si tienes problemas con matplotlib en macOS
brew install python-tk

# Para gráficos de alta calidad
pip3 install pillow
```

## 🐧 Linux (Ubuntu/Debian)

```bash
# Dependencias del sistema
sudo apt update
sudo apt install python3-pip python3-dev python3-tk

# Librerías de desarrollo para compilación
sudo apt install build-essential libssl-dev libffi-dev

# Instalar dependencias Python
pip3 install pandas numpy matplotlib seaborn scipy scikit-learn plotly statsmodels jupyter ipython
```

## 🪟 Windows

```bash
# Usar Anaconda (recomendado)
conda install pandas numpy matplotlib seaborn scipy scikit-learn plotly statsmodels jupyter ipython

# O con pip
pip install pandas numpy matplotlib seaborn scipy scikit-learn plotly statsmodels jupyter ipython
```

## ✅ Verificación de Instalación

```python
# Ejecuta este código Python para verificar todo esté bien
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
import scipy.stats as stats
from sklearn.ensemble import RandomForestRegressor
import plotly.graph_objects as go
import statsmodels.api as sm

print("✅ Todas las librerías están instaladas correctamente!")

# Test rápido
df = pd.DataFrame({'x': np.random.randn(100), 'y': np.random.randn(100)})
print(f"📊 DataFrame de prueba creado: {len(df)} filas")
print("🎉 Python está listo para análisis de datos!")
```

## 🚀 Templates Disponibles

Una vez configurado Python, podrás usar estos templates:

### 📊 **Análisis Exploratorio**
```javascript
run-analysis-template({
  templateName: "data_exploration",
  data: tu_dataset,
  includePlots: true
})
```

### 🤖 **Machine Learning - Regresión**
```javascript
run-analysis-template({
  templateName: "regression_analysis", 
  data: tu_dataset,
  parameters: { target_column: "precio" }
})
```

### 🎯 **Clustering**
```javascript
run-analysis-template({
  templateName: "clustering_analysis",
  data: tu_dataset,
  parameters: { n_clusters: 3 }
})
```

### 📈 **Series Temporales**
```javascript
run-analysis-template({
  templateName: "time_series_analysis",
  data: tu_dataset,
  parameters: { 
    date_column: "fecha", 
    value_column: "ventas" 
  }
})
```

### 📉 **Pruebas Estadísticas**
```javascript
run-analysis-template({
  templateName: "statistical_testing",
  data: tu_dataset
})
```

## 🔥 Código Python Personalizado

```javascript
run-python-analysis({
  code: `
# Tu código Python aquí
correlation_analysis()
quick_ml_regression('target_column')

# Crear gráfico personalizado
plt.figure(figsize=(10, 6))
df['column'].hist(bins=30)
plt.title('Mi Análisis')
save_plot('mi_grafico')
`,
  data: tu_dataset,
  includePlots: true
})
```

## 💡 Funciones Predefinidas Disponibles

En todo código Python tienes acceso a:

- `df` - Tu dataset como DataFrame de pandas
- `describe_data()` - Estadísticas descriptivas completas
- `correlation_analysis()` - Matriz de correlación con heatmap
- `detect_outliers(column)` - Detección de valores atípicos
- `quick_ml_regression(target)` - Regresión automática
- `quick_clustering(k)` - Clustering K-means
- `save_plot(name)` - Guardar gráficos

## 🎨 Estilo de Gráficos

Los gráficos usan automáticamente:
- Estilo `seaborn-v0_8` elegante
- Paleta de colores `husl` vibrante  
- Resolución 300 DPI para calidad profesional
- Formato PNG optimizado

## 🔧 Resolución de Problemas

### Error: "No module named 'pandas'"
```bash
pip3 install pandas
```

### Error: "backend errors" con matplotlib
```bash
# macOS
brew install python-tk

# Linux
sudo apt install python3-tk

# Windows - reinstalar matplotlib
pip uninstall matplotlib
pip install matplotlib
```

### Gráficos no se generan
Verifica que `includePlots: true` en las herramientas.

### Lentitud en datasets grandes
Usa `sampleSize` en `analyze-dataframe` o `maxRows` en `migrate-data-to-database`.

¡Ahora tienes el poder completo de Python para análisis de datos! 🚀 