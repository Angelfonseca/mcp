import Handlebars from 'handlebars';
import { safeFetch } from './fetchs.js';
import fs from 'fs/promises';
import path from 'path';
import puppeteer from 'puppeteer';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, ISectionOptions, AlignmentType } from 'docx';

interface DataPoint {
  label: string;
  value: number;
  category?: string;
}

interface ChartConfig {
  type: 'bar' | 'line' | 'pie' | 'doughnut' | 'scatter';
  title: string;
  data: DataPoint[];
  width?: number;
  height?: number;
  backgroundColor?: string[];
  borderColor?: string[];
}

interface ReportSection {
  title: string;
  content: string;
  type: 'text' | 'table' | 'chart' | 'list';
  data?: any;
  chartConfig?: ChartConfig;
}

interface ReportTemplate {
  title: string;
  subtitle?: string;
  author?: string;
  date?: string;
  sections: ReportSection[];
  style?: 'modern' | 'classic' | 'minimal';
}

interface ReportOptions {
  format: 'html' | 'markdown' | 'pdf' | 'docx';
  outputPath?: string;
  includeCharts?: boolean;
  theme?: 'light' | 'dark';
}

/**
 * Genera gráfico simple en HTML/SVG (sin Chart.js)
 */
function generateSimpleChart(config: ChartConfig): string {
  const { type, title, data, width = 800, height = 400 } = config;
  
  if (data.length === 0) return '<p>No hay datos para el gráfico</p>';
  
  const maxValue = Math.max(...data.map(d => d.value));
  const colors = ['#3498db', '#e74c3c', '#f39c12', '#2ecc71', '#9b59b6', '#1abc9c'];
  
  if (type === 'bar') {
    const barWidth = Math.floor((width - 100) / data.length);
    const chartHeight = height - 100;
    
    let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
    svg += `<text x="${width/2}" y="30" text-anchor="middle" font-size="16" font-weight="bold">${title}</text>`;
    
    data.forEach((point, index) => {
      const barHeight = (point.value / maxValue) * chartHeight;
      const x = 50 + index * barWidth;
      const y = height - 50 - barHeight;
      const color = colors[index % colors.length];
      
      svg += `<rect x="${x}" y="${y}" width="${barWidth - 10}" height="${barHeight}" fill="${color}"/>`;
      svg += `<text x="${x + barWidth/2}" y="${height - 30}" text-anchor="middle" font-size="12">${point.label}</text>`;
      svg += `<text x="${x + barWidth/2}" y="${y - 5}" text-anchor="middle" font-size="10">${point.value}</text>`;
    });
    
    svg += '</svg>';
    return svg;
  }
  
  if (type === 'pie') {
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 3;
    const total = data.reduce((sum, d) => sum + d.value, 0);
    
    let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
    svg += `<text x="${centerX}" y="30" text-anchor="middle" font-size="16" font-weight="bold">${title}</text>`;
    
    let currentAngle = 0;
    data.forEach((point, index) => {
      const angle = (point.value / total) * 2 * Math.PI;
      const x1 = centerX + radius * Math.cos(currentAngle);
      const y1 = centerY + radius * Math.sin(currentAngle);
      const x2 = centerX + radius * Math.cos(currentAngle + angle);
      const y2 = centerY + radius * Math.sin(currentAngle + angle);
      const largeArc = angle > Math.PI ? 1 : 0;
      const color = colors[index % colors.length];
      
      const pathData = [
        `M ${centerX} ${centerY}`,
        `L ${x1} ${y1}`,
        `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
        'Z'
      ].join(' ');
      
      svg += `<path d="${pathData}" fill="${color}"/>`;
      
      // Etiqueta
      const labelAngle = currentAngle + angle / 2;
      const labelX = centerX + (radius + 20) * Math.cos(labelAngle);
      const labelY = centerY + (radius + 20) * Math.sin(labelAngle);
      svg += `<text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="10">${point.label}: ${point.value}</text>`;
      
      currentAngle += angle;
    });
    
    svg += '</svg>';
    return svg;
  }
  
  // Para otros tipos, mostrar tabla simple
  return generateTable(data.map(d => ({ Etiqueta: d.label, Valor: d.value })));
}

/**
 * Exporta contenido HTML a un archivo PDF
 */
export async function exportToPDF(htmlContent: string, outputPath: string): Promise<void> {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
  
  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '20mm',
      right: '20mm',
      bottom: '20mm',
      left: '20mm'
    }
  });
  
  await browser.close();
}

/**
 * Exporta un reporte a un archivo DOCX
 */
export async function exportToDOCX(report: ReportTemplate, outputPath: string): Promise<void> {
  const sectionChildren: (Paragraph | Table)[] = [
    new Paragraph({
      children: [new TextRun({ text: report.title, bold: true, size: 48 })],
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    }),
  ];

  if (report.subtitle) {
    sectionChildren.push(new Paragraph({
      children: [new TextRun({ text: report.subtitle, size: 28 })],
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
    }));
  }

  for (const section of report.sections) {
    sectionChildren.push(new Paragraph({
      children: [new TextRun({ text: section.title, bold: true, size: 32 })],
      heading: HeadingLevel.HEADING_2,
    }));

    switch (section.type) {
      case 'text':
        sectionChildren.push(new Paragraph(section.content));
        break;
      case 'table':
        if (section.data && section.data.length > 0) {
          const headers = Object.keys(section.data[0]).map(header => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: header, bold: true })] })] }));
          const headerRow = new TableRow({ children: headers });

          const rows = section.data.map((row: any) => {
            const cells = Object.values(row).map(cell => new TableCell({ children: [new Paragraph(String(cell))] }));
            return new TableRow({ children: cells });
          });

          const table = new Table({
            rows: [headerRow, ...rows],
            width: { size: 100, type: 'pct' },
          });
          sectionChildren.push(table);
        }
        break;
      case 'chart':
        sectionChildren.push(new Paragraph("Los gráficos no se pueden exportar a DOCX en esta versión."));
        break;
      case 'list':
          if (section.data && Array.isArray(section.data)) {
              section.data.forEach(item => {
                  sectionChildren.push(new Paragraph({
                      text: String(item),
                      bullet: {
                          level: 0
                      }
                  }));
              });
          }
          break;
    }
  }

  const doc = new Document({
    creator: report.author || 'AutoData MCP',
    title: report.title,
    description: report.subtitle,
    sections: [{ children: sectionChildren }],
  });

  const buffer = await Packer.toBuffer(doc);
  await fs.writeFile(outputPath, buffer);
}

/**
 * Calcula la matriz de correlación entre columnas numéricas
 */
export function calculateCorrelationMatrix(data: any[]): { correlations: any, insights: string[] } {
  if (data.length === 0) return { correlations: {}, insights: [] };
  
  const numericColumns = Object.keys(data[0]).filter(col => 
    data.some(row => typeof row[col] === 'number' && !isNaN(row[col]))
  );
  
  const correlations: any = {};
  const insights: string[] = [];
  
  numericColumns.forEach(col1 => {
    correlations[col1] = {};
    numericColumns.forEach(col2 => {
      const values1 = data.map(row => row[col1]).filter(v => typeof v === 'number' && !isNaN(v));
      const values2 = data.map(row => row[col2]).filter(v => typeof v === 'number' && !isNaN(v));
      
      if (values1.length > 1 && values2.length > 1) {
        const correlation = pearsonCorrelation(values1, values2);
        correlations[col1][col2] = parseFloat(correlation.toFixed(3));
        
        if (col1 !== col2 && Math.abs(correlation) > 0.7) {
          insights.push(`${col1} y ${col2} tienen una correlación ${correlation > 0 ? 'positiva' : 'negativa'} fuerte (${correlation.toFixed(3)})`);
        }
      } else {
        correlations[col1][col2] = 0;
      }
    });
  });
  
  return { correlations, insights };
}

/**
 * Calcula el coeficiente de correlación de Pearson
 */
function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n === 0) return 0;
  
  const sumX = x.slice(0, n).reduce((a, b) => a + b, 0);
  const sumY = y.slice(0, n).reduce((a, b) => a + b, 0);
  const sumXY = x.slice(0, n).reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.slice(0, n).reduce((sum, xi) => sum + xi * xi, 0);
  const sumY2 = y.slice(0, n).reduce((sum, yi) => sum + yi * yi, 0);
  
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  
  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Detecta anomalías usando el método IQR (Interquartile Range)
 */
export function detectAnomalies(data: any[], column: string): { anomalies: any[], insights: string[] } {
  const values = data
    .map(row => row[column])
    .filter(v => typeof v === 'number' && !isNaN(v))
    .sort((a, b) => a - b);
  
  if (values.length < 4) return { anomalies: [], insights: [] };
  
  const q1Index = Math.floor(values.length * 0.25);
  const q3Index = Math.floor(values.length * 0.75);
  const q1 = values[q1Index];
  const q3 = values[q3Index];
  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;
  
  const anomalies = data.filter(row => {
    const value = row[column];
    return typeof value === 'number' && (value < lowerBound || value > upperBound);
  });
  
  const insights = [
    `Se detectaron ${anomalies.length} anomalías en ${column}`,
    `Rango normal: ${lowerBound.toFixed(2)} - ${upperBound.toFixed(2)}`,
    `Valores anómalos: ${anomalies.map(row => row[column]).join(', ')}`
  ];
  
  return { anomalies, insights };
}

/**
 * Realiza clustering k-means simple en 2D
 */
export function performKMeansClustering(data: any[], xColumn: string, yColumn: string, k: number = 3): { clusters: any[], insights: string[] } {
  const points = data
    .filter(row => typeof row[xColumn] === 'number' && typeof row[yColumn] === 'number')
    .map(row => ({ x: row[xColumn], y: row[yColumn], original: row }));
  
  if (points.length < k) return { clusters: [], insights: [] };
  
  // Inicializar centroides aleatoriamente
  const centroids = Array.from({ length: k }, () => ({
    x: Math.random() * (Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x))) + Math.min(...points.map(p => p.x)),
    y: Math.random() * (Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y))) + Math.min(...points.map(p => p.y))
  }));
  
  // Algoritmo k-means simplificado (pocas iteraciones)
  for (let iter = 0; iter < 10; iter++) {
    // Asignar puntos a clusters
    points.forEach(point => {
      let minDistance = Infinity;
      let assignedCluster = 0;
      
      centroids.forEach((centroid, index) => {
        const distance = Math.sqrt(Math.pow(point.x - centroid.x, 2) + Math.pow(point.y - centroid.y, 2));
        if (distance < minDistance) {
          minDistance = distance;
          assignedCluster = index;
        }
      });
      
      (point as any).cluster = assignedCluster;
    });
    
    // Actualizar centroides
    centroids.forEach((centroid, index) => {
      const clusterPoints = points.filter((point: any) => point.cluster === index);
      if (clusterPoints.length > 0) {
        centroid.x = clusterPoints.reduce((sum, p) => sum + p.x, 0) / clusterPoints.length;
        centroid.y = clusterPoints.reduce((sum, p) => sum + p.y, 0) / clusterPoints.length;
      }
    });
  }
  
  const clusters = centroids.map((centroid, index) => ({
    id: index,
    centroid,
    points: points.filter((point: any) => point.cluster === index).map(p => p.original),
    size: points.filter((point: any) => point.cluster === index).length
  }));
  
  const insights = [
    `Se crearon ${k} clusters usando ${xColumn} y ${yColumn}`,
    ...clusters.map(cluster => `Cluster ${cluster.id}: ${cluster.size} puntos, centro en (${cluster.centroid.x.toFixed(2)}, ${cluster.centroid.y.toFixed(2)})`)
  ];
  
  return { clusters, insights };
}

/**
 * Genera tabla HTML a partir de datos
 */
function generateTable(data: any[], headers?: string[]): string {
  if (!data || data.length === 0) return '<p>No hay datos disponibles</p>';
  
  const keys = headers || Object.keys(data[0]);
  
  let html = '<table class="data-table">\n';
  html += '  <thead>\n    <tr>\n';
  
  keys.forEach(key => {
    html += `      <th>${key}</th>\n`;
  });
  
  html += '    </tr>\n  </thead>\n  <tbody>\n';
  
  data.forEach(row => {
    html += '    <tr>\n';
    keys.forEach(key => {
      const value = row[key] ?? '';
      html += `      <td>${value}</td>\n`;
    });
    html += '    </tr>\n';
  });
  
  html += '  </tbody>\n</table>';
  
  return html;
}

/**
 * Plantilla HTML base para reportes
 */
const htmlTemplate = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{title}}</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background-color: {{#if (eq theme 'dark')}}#1a1a1a{{else}}#f8f9fa{{/if}};
        }
        
        {{#if (eq theme 'dark')}}
        body { color: #e9ecef; }
        .section { background: #2d3748; }
        .data-table th { background: #4a5568; }
        {{else}}
        .section { background: white; }
        .data-table th { background: #f8f9fa; }
        {{/if}}
        
        .header {
            text-align: center;
            margin-bottom: 40px;
            padding: 30px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-radius: 10px;
        }
        
        .header h1 {
            margin: 0;
            font-size: 2.5em;
            font-weight: 300;
        }
        
        .header .subtitle {
            font-size: 1.2em;
            opacity: 0.9;
            margin-top: 10px;
        }
        
        .header .meta {
            margin-top: 20px;
            font-size: 0.9em;
            opacity: 0.8;
        }
        
        .section {
            margin: 30px 0;
            padding: 25px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        
        .section h2 {
            color: #667eea;
            border-bottom: 2px solid #667eea;
            padding-bottom: 10px;
            margin-bottom: 20px;
        }
        
        .data-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
            font-size: 14px;
        }
        
        .data-table th,
        .data-table td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        
        .data-table th {
            font-weight: 600;
            text-transform: uppercase;
            font-size: 12px;
            letter-spacing: 0.5px;
        }
        
        .data-table tr:hover {
            background-color: rgba(102, 126, 234, 0.1);
        }
        
        .chart-container {
            text-align: center;
            margin: 20px 0;
        }
        
        .chart-container svg {
            max-width: 100%;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            background: white;
            padding: 10px;
        }
        
        .list {
            padding-left: 0;
        }
        
        .list li {
            list-style: none;
            padding: 8px 0;
            border-bottom: 1px solid #eee;
        }
        
        .list li:before {
            content: "▶";
            color: #667eea;
            margin-right: 10px;
        }
        
        .footer {
            text-align: center;
            margin-top: 50px;
            padding: 20px;
            color: #666;
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>{{title}}</h1>
        {{#if subtitle}}<div class="subtitle">{{subtitle}}</div>{{/if}}
        <div class="meta">
            {{#if author}}Autor: {{author}} | {{/if}}
            {{#if date}}Fecha: {{date}}{{else}}Fecha: {{currentDate}}{{/if}}
        </div>
    </div>
    
    {{#each sections}}
    <div class="section">
        <h2>{{title}}</h2>
        
        {{#if (eq type 'text')}}
            <div>{{{content}}}</div>
        {{/if}}
        
        {{#if (eq type 'table')}}
            {{{tableHtml}}}
        {{/if}}
        
        {{#if (eq type 'chart')}}
            <div class="chart-container">
                {{{chartHtml}}}
            </div>
        {{/if}}
        
        {{#if (eq type 'list')}}
            <ul class="list">
                {{#each data}}
                <li>{{this}}</li>
                {{/each}}
            </ul>
        {{/if}}
    </div>
    {{/each}}
    
    <div class="footer">
        Reporte generado automáticamente por MCP Data Analysis Tools
    </div>
</body>
</html>
`;

/**
 * Genera un reporte completo
 */
async function generateReport(template: ReportTemplate, options: ReportOptions): Promise<string> {
  const { format, outputPath, includeCharts = true, theme = 'light' } = options;
  
  // Preparar datos para las secciones
  const processedSections = await Promise.all(
    template.sections.map(async (section) => {
      const processedSection = { ...section };
      
      if (section.type === 'table' && section.data) {
        (processedSection as any).tableHtml = generateTable(section.data);
      }
      
      if (section.type === 'chart' && section.chartConfig && includeCharts) {
        (processedSection as any).chartHtml = generateSimpleChart(section.chartConfig);
      }
      
      return processedSection;
    })
  );
  
  // Registrar helpers de Handlebars
  Handlebars.registerHelper('eq', (a: any, b: any) => a === b);
  Handlebars.registerHelper('currentDate', () => new Date().toLocaleDateString('es-ES'));
  
  // Compilar plantilla
  const compiledTemplate = Handlebars.compile(htmlTemplate);
  
  const htmlContent = compiledTemplate({
    ...template,
    sections: processedSections,
    theme
  });
  
  if (options.format === 'pdf') {
    if (!options.outputPath) {
      throw new Error('Se requiere un outputPath para el formato PDF.');
    }
    await exportToPDF(htmlContent, options.outputPath);
    return `Reporte PDF generado en: ${options.outputPath}`;
  }

  if (options.format === 'docx') {
    if (!options.outputPath) {
      throw new Error('Se requiere un outputPath para el formato DOCX.');
    }
    // Para DOCX, pasamos el objeto de template completo
    await exportToDOCX(template, options.outputPath);
    return `Reporte DOCX generado en: ${options.outputPath}`;
  }

  if (options.format === 'html') {
    if (options.outputPath) {
      await fs.writeFile(options.outputPath, htmlContent, 'utf-8');
    }
    return htmlContent;
  }
  
  if (options.format === 'markdown') {
    // Convertir HTML a Markdown (simplificado)
    let markdown = `# ${template.title}\n\n`;
    if (template.subtitle) markdown += `## ${template.subtitle}\n\n`;
    if (template.author) markdown += `**Autor:** ${template.author}\n\n`;
    if (template.date) markdown += `**Fecha:** ${template.date}\n\n`;
    
    for (const section of template.sections) {
      markdown += `## ${section.title}\n\n`;
      if (section.type === 'text') {
        markdown += `${section.content}\n\n`;
      } else if (section.type === 'list' && section.data) {
        section.data.forEach((item: string) => {
          markdown += `- ${item}\n`;
        });
        markdown += '\n';
      }
    }
    
    if (outputPath) {
      await fs.writeFile(outputPath, markdown, 'utf-8');
    }
    return markdown;
  }
  
  return htmlContent;
}

/**
 * Analiza datos y genera insights automáticos
 */
function generateDataInsights(data: any[]): string[] {
  if (!data || data.length === 0) return ['No hay datos para analizar'];
  
  const insights: string[] = [];
  const numericFields = Object.keys(data[0]).filter(key => 
    typeof data[0][key] === 'number'
  );
  
  insights.push(`Se analizaron ${data.length} registros`);
  
  numericFields.forEach(field => {
    const values = data.map(row => row[field]).filter(v => v != null);
    if (values.length > 0) {
      const sum = values.reduce((a, b) => a + b, 0);
      const avg = sum / values.length;
      const max = Math.max(...values);
      const min = Math.min(...values);
      
      insights.push(`${field}: Promedio ${avg.toFixed(2)}, Máximo ${max}, Mínimo ${min}`);
    }
  });
  
  return insights;
}

export {
  generateReport,
  generateSimpleChart,
  generateTable,
  generateDataInsights,
  type ReportTemplate,
  type ReportSection,
  type ReportOptions,
  type ChartConfig,
  type DataPoint,
}; 