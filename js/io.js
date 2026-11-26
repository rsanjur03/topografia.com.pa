/**
 * io.js — Importador flexible CSV/TXT de puntos topográficos y Exportador CSV/Portapapeles
 */
(function (global) {
  'use strict';

  /**
   * Detecta delimitador probable en texto CSV/TXT (coma, punto y coma, tabulación o espacios)
   */
  function detectDelimiter(text) {
    const sampleLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 6);
    if (sampleLines.length === 0) return ',';
    const candidates = [',', ';', '\t'];
    let best = null;
    let bestScore = 0;

    for (const sep of candidates) {
      const counts = sampleLines.map(l => l.split(sep).length - 1);
      const minC = Math.min(...counts);
      const avgC = counts.reduce((a, b) => a + b, 0) / counts.length;
      if (minC >= 1 && avgC > bestScore) {
        bestScore = avgC;
        best = sep;
      }
    }
    return best || 'whitespace';
  }

  function splitLine(line, delimiter) {
    if (delimiter === 'whitespace') {
      return line.trim().split(/\s+/);
    }
    // Soporte básico de comillas CSV
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  /**
   * Parsea el texto crudo usando un formato predefinido:
   * - PNEZD: Punto, Norte, Este, Cota, Descripción
   * - PENZD: Punto, Este, Norte, Cota, Descripción
   * - NEZ:   Norte, Este, Cota
   * - ENZ:   Este, Norte, Cota
   * - NE:    Norte, Este
   * - EN:    Este, Norte
   */
  function parsePointsText(text, options = {}) {
    const format = options.format || 'PNEZD';
    const delimiter = options.delimiter === 'auto' || !options.delimiter
      ? detectDelimiter(text)
      : options.delimiter;

    const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    const parsed = [];
    const errors = [];
    let skippedHeader = false;

    const parseNum = (val) => {
      if (val === undefined || val === null || val === '') return NaN;
      return parseFloat(String(val).replace(/\s/g, '').replace(',', '.'));
    };

    rawLines.forEach((line, idx) => {
      const cols = splitLine(line, delimiter);

      let id = '', e = NaN, n = NaN, z = 0, desc = '';

      if (format === 'PNEZD') {
        id = cols[0] || `P${parsed.length + 1}`;
        n = parseNum(cols[1]);
        e = parseNum(cols[2]);
        z = cols[3] !== undefined && cols[3] !== '' ? parseNum(cols[3]) : 0;
        desc = cols.slice(4).join(' ');
      } else if (format === 'PENZD') {
        id = cols[0] || `P${parsed.length + 1}`;
        e = parseNum(cols[1]);
        n = parseNum(cols[2]);
        z = cols[3] !== undefined && cols[3] !== '' ? parseNum(cols[3]) : 0;
        desc = cols.slice(4).join(' ');
      } else if (format === 'NEZ') {
        id = `P${parsed.length + 1}`;
        n = parseNum(cols[0]);
        e = parseNum(cols[1]);
        z = cols[2] !== undefined && cols[2] !== '' ? parseNum(cols[2]) : 0;
        desc = cols.slice(3).join(' ');
      } else if (format === 'ENZ') {
        id = `P${parsed.length + 1}`;
        e = parseNum(cols[0]);
        n = parseNum(cols[1]);
        z = cols[2] !== undefined && cols[2] !== '' ? parseNum(cols[2]) : 0;
        desc = cols.slice(3).join(' ');
      } else if (format === 'NE') {
        id = `P${parsed.length + 1}`;
        n = parseNum(cols[0]);
        e = parseNum(cols[1]);
        z = 0;
      } else if (format === 'EN') {
        id = `P${parsed.length + 1}`;
        e = parseNum(cols[0]);
        n = parseNum(cols[1]);
        z = 0;
      }

      if (!Number.isFinite(e) || !Number.isFinite(n)) {
        // Si es la primera línea con texto, probablemente es encabezado
        if (idx === 0) {
          skippedHeader = true;
          return;
        }
        errors.push(`Línea ${idx + 1}: coordenadas inválidas ("${line.slice(0, 48)}")`);
        return;
      }

      parsed.push({
        id: String(id).trim() || `P${parsed.length + 1}`,
        e,
        n,
        z: Number.isFinite(z) ? z : 0,
        desc: String(desc || '').trim()
      });
    });

    return { points: parsed, errors, delimiter, skippedHeader };
  }

  /** Exporta lista de puntos en formato CSV (PNEZD) */
  function pointsToCSV(points, format = 'PNEZD') {
    const lines = [format === 'PENZD' ? 'Punto,Este,Norte,Cota,Descripcion' : 'Punto,Norte,Este,Cota,Descripcion'];
    for (const p of points) {
      const descSafe = `"${String(p.desc || '').replace(/"/g, '""')}"`;
      if (format === 'PENZD') {
        lines.push(`${p.id},${p.e.toFixed(4)},${p.n.toFixed(4)},${(Number(p.z) || 0).toFixed(3)},${descSafe}`);
      } else {
        lines.push(`${p.id},${p.n.toFixed(4)},${p.e.toFixed(4)},${(Number(p.z) || 0).toFixed(3)},${descSafe}`);
      }
    }
    return lines.join('\r\n');
  }

  /** Exporta Cuadro de Datos de Campo a TSV (para pegar en Excel / Word / Civil 3D) */
  function fieldTableToTSV(points, closed) {
    const metrics = global.TopoCOGO.polygonMetrics(points, closed);
    const lines = ['EST\tP.V.\tRUMBO\tAZIMUT\tDISTANCIA (m)\tNORTE (Y)\tESTE (X)\tCOTA (Z)'];
    for (const leg of metrics.legs) {
      lines.push([
        leg.fromId,
        leg.toId,
        leg.bearing,
        leg.azimuthText,
        leg.dist.toFixed(3),
        leg.from.n.toFixed(3),
        leg.from.e.toFixed(3),
        (Number(leg.from.z) || 0).toFixed(2)
      ].join('\t'));
    }
    if (!closed && points.length > 0) {
      const last = points[points.length - 1];
      lines.push([last.id, '-', '-', '-', '-', last.n.toFixed(3), last.e.toFixed(3), (Number(last.z) || 0).toFixed(2)].join('\t'));
    }
    if (closed) {
      lines.push('');
      lines.push(`AREA (m2)\t${metrics.areaM2.toFixed(2)}\tAREA (ha)\t${metrics.areaHa.toFixed(4)}\tPERIMETRO (m)\t${metrics.perimeter.toFixed(3)}`);
    }
    return lines.join('\r\n');
  }

  /** Descarga un texto como archivo en el navegador */
  function downloadFile(filename, content, mimeType = 'text/plain;charset=utf-8') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  global.TopoIO = {
    detectDelimiter,
    parsePointsText,
    pointsToCSV,
    fieldTableToTSV,
    downloadFile
  };
})(window);
