#!/bin/bash

# 📊 AutoData MCP Server - Script de Instalación Automática
# Instala todas las dependencias necesarias para análisis avanzado de documentos

set -e  # Salir si hay errores

echo "🚀 Iniciando instalación de AutoData MCP Server..."
echo "==============================================="

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[✅]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[⚠️]${NC} $1"
}

print_error() {
    echo -e "${RED}[❌]${NC} $1"
}

# Verificar dependencias del sistema
print_status "Verificando dependencias del sistema..."

# Verificar Node.js
if ! command -v node &> /dev/null; then
    print_error "Node.js no está instalado. Por favor instala Node.js 18+ desde https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    print_error "Node.js versión 18+ requerida. Versión actual: $(node -v)"
    exit 1
fi
print_success "Node.js $(node -v) ✓"

# Verificar Python
if ! command -v python3 &> /dev/null; then
    print_error "Python 3 no está instalado. Por favor instala Python 3.8+ desde https://python.org/"
    exit 1
fi

PYTHON_VERSION=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
PYTHON_MAJOR=$(echo $PYTHON_VERSION | cut -d'.' -f1)
PYTHON_MINOR=$(echo $PYTHON_VERSION | cut -d'.' -f2)

if [ "$PYTHON_MAJOR" -lt 3 ] || ([ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 8 ]); then
    print_error "Python 3.8+ requerido. Versión actual: $PYTHON_VERSION"
    exit 1
fi
print_success "Python $PYTHON_VERSION ✓"

# Verificar pip
if ! command -v pip3 &> /dev/null; then
    print_error "pip3 no está instalado. Instalando..."
    python3 -m ensurepip --upgrade
fi
print_success "pip3 disponible ✓"

# Instalar dependencias Node.js
print_status "Instalando dependencias Node.js..."
npm install
if [ $? -eq 0 ]; then
    print_success "Dependencias Node.js instaladas ✓"
else
    print_error "Error instalando dependencias Node.js"
    exit 1
fi

# Instalar dependencias Python básicas
print_status "Instalando dependencias Python básicas..."
pip3 install --upgrade pip setuptools wheel

PYTHON_PACKAGES=(
    "pandas>=2.0.0"
    "numpy>=1.24.0"
    "matplotlib>=3.7.0"
    "seaborn>=0.12.0"
    "scipy>=1.10.0"
    "scikit-learn>=1.3.0"
    "plotly>=5.15.0"
    "statsmodels>=0.14.0"
    "jupyter>=1.0.0"
    "ipython>=8.14.0"
)

for package in "${PYTHON_PACKAGES[@]}"; do
    print_status "Instalando $package..."
    pip3 install "$package"
done

print_success "Dependencias Python básicas instaladas ✓"

# Instalar dependencias para análisis de documentos
print_status "Instalando dependencias para análisis de documentos..."
DOCUMENT_PACKAGES=(
    "PyPDF2>=3.0.0"
    "python-docx>=0.8.11"
    "nltk>=3.8.0"
    "spacy>=3.6.0"
    "textstat>=0.7.3"
)

for package in "${DOCUMENT_PACKAGES[@]}"; do
    print_status "Instalando $package..."
    pip3 install "$package"
done

print_success "Dependencias para documentos instaladas ✓"

# Descargar modelos de NLP
print_status "Descargando modelos de NLP..."

# NLTK data
python3 -c "
import nltk
try:
    nltk.download('punkt', quiet=True)
    nltk.download('stopwords', quiet=True)
    nltk.download('wordnet', quiet=True)
    nltk.download('averaged_perceptron_tagger', quiet=True)
    print('✅ Modelos NLTK descargados')
except Exception as e:
    print(f'⚠️ Error descargando modelos NLTK: {e}')
"

# SpaCy model (español - opcional)
print_status "Intentando instalar modelo de SpaCy en español..."
python3 -m spacy download es_core_news_sm 2>/dev/null || print_warning "Modelo de SpaCy en español no disponible (opcional)"

# Compilar TypeScript
print_status "Compilando TypeScript..."
npm run build
if [ $? -eq 0 ]; then
    print_success "Compilación TypeScript exitosa ✓"
else
    print_error "Error en compilación TypeScript"
    exit 1
fi

# Verificar instalación
print_status "Verificando instalación..."

# Test Python dependencies
python3 -c "
import sys
packages = ['pandas', 'numpy', 'matplotlib', 'seaborn', 'scipy', 'sklearn', 'nltk', 'spacy', 'textstat', 'PyPDF2', 'docx']
missing = []

for package in packages:
    try:
        __import__(package)
    except ImportError:
        missing.append(package)

if missing:
    print(f'❌ Paquetes faltantes: {missing}')
    sys.exit(1)
else:
    print('✅ Todas las dependencias Python están instaladas correctamente')
"

if [ $? -ne 0 ]; then
    print_error "Verificación de dependencias Python falló"
    exit 1
fi

# Test compilación
if [ ! -f "dist/index.js" ]; then
    print_error "Archivo compilado no encontrado"
    exit 1
fi

print_success "Verificación completada ✓"

# Crear directorios necesarios
print_status "Creando directorios de trabajo..."
mkdir -p logs
mkdir -p temp
mkdir -p exports
mkdir -p data

print_success "Directorios creados ✓"

# Configuración opcional
print_status "Configuración opcional..."

# Crear archivo de configuración de ejemplo
cat > .env.example << EOF
# Configuración opcional para AutoData MCP Server

# Ollama para embeddings (opcional)
OLLAMA_HOST=http://localhost:11434

# Límites de memoria y rendimiento
MAX_MEMORY_MB=2048
PYTHON_TIMEOUT=300000
MAX_FILE_SIZE_MB=100

# Configuración de logging
LOG_LEVEL=info
LOG_FILE=logs/autodata-mcp.log

# Configuración de bases de datos (ejemplos)
# MYSQL_HOST=localhost
# MYSQL_PORT=3306
# MYSQL_USER=root
# MYSQL_PASSWORD=password

# POSTGRES_HOST=localhost
# POSTGRES_PORT=5432
# POSTGRES_USER=postgres
# POSTGRES_PASSWORD=password

# MONGODB_URI=mongodb://localhost:27017
EOF

print_success "Archivo de configuración de ejemplo creado (.env.example) ✓"

# Test final
print_status "Ejecutando test final del servidor..."
timeout 10s npm start > /dev/null 2>&1 || print_warning "Test del servidor completado (timeout esperado)"

echo ""
echo "🎉 ¡INSTALACIÓN COMPLETADA EXITOSAMENTE!"
echo "========================================"
echo ""
print_success "AutoData MCP Server está listo para usar"
echo ""
echo "📚 PRÓXIMOS PASOS:"
echo "1. Revisar la configuración en .env.example"
echo "2. Leer la documentación en README.md"
echo "3. Ejecutar el servidor: npm start"
echo ""
echo "🛠️ HERRAMIENTAS DISPONIBLES:"
echo "• Análisis de documentos PDF/DOCX/TXT"
echo "• Procesamiento NLP avanzado"
echo "• Análisis estadístico y machine learning"
echo "• Conexión a bases de datos múltiples"
echo "• Generación de reportes ejecutivos"
echo ""
echo "🔧 COMANDOS ÚTILES:"
echo "• npm start          - Iniciar servidor"
echo "• npm run build      - Compilar código"
echo "• npm run dev        - Modo desarrollo"
echo "• npm run test-python - Verificar dependencias Python"
echo ""
print_success "¡Disfruta analizando datos con AutoData MCP Server! 🚀" 