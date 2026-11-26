/**
 * pdf.js — Generador PDF Vectorial puro (PDF 1.4) para Plano Oficial ANATI Panamá
 * Cero dependencias externas, precisión vectorial exacta en milímetros (1 mm = 2.83464567 pt).
 * Soporta acentos españoles y símbolos ° ² vía WinAnsiEncoding con escapes octales (xref 100% exacto).
 */
(function (global) {
  'use strict';

  const C = global.TopoCOGO;
  const MM2PT = 72 / 25.4;

  function f(v, dec = 2) {
    return Number.isFinite(v) ? v.toFixed(dec) : '0';
  }

  /** Convierte texto Unicode a cadena PDF segura con WinAnsiEncoding (escapes octales 7-bit ASCII) */
  function pdfStr(text) {
    const s = String(text || '');
    let out = '(';
    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i);
      if (code === 40) out += '\\(';
      else if (code === 41) out += '\\)';
      else if (code === 92) out += '\\\\';
      else if (code >= 32 && code <= 126) out += s[i];
      else if (code >= 160 && code <= 255) {
        out += '\\' + code.toString(8).padStart(3, '0');
      } else if (code === 8211 || code === 8212) {
        out += '-';
      } else {
        out += ' ';
      }
    }
    return out + ')';
  }

  function wrapLines(text, maxChars) {
    const words = String(text || '').trim().split(/\s+/);
    const out = [];
    let cur = '';
    for (const w of words) {
      if (!cur) cur = w;
      else if (cur.length + 1 + w.length <= maxChars) cur += ' ' + w;
      else { out.push(cur); cur = w; }
    }
    if (cur) out.push(cur);
    return out;
  }

  function getNiceGridStep(span) {
    const raw = span / 5;
    const pow = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
    const norm = raw / pow;
    if (norm <= 1.5) return 1 * pow;
    if (norm <= 3.5) return 2 * pow;
    if (norm <= 7.5) return 5 * pow;
    return 10 * pow;
  }

  /** Lienzo vectorial en milímetros (origen abajo-izquierda, igual que CAD/PDF) */
  class PdfVectorCanvas {
    constructor(widthMm, heightMm, pageScale = 1.0, offsetXmm = 0, offsetYmm = 0) {
      this.widthMm = widthMm;
      this.heightMm = heightMm;
      this.scale = pageScale;
      this.ox = offsetXmm;
      this.oy = offsetYmm;
      this.ops = [];
    }

    _x(mm) { return (this.ox + mm * this.scale) * MM2PT; }
    _y(mm) { return (this.oy + mm * this.scale) * MM2PT; }
    _s(mm) { return mm * this.scale * MM2PT; }

    setStroke(r, g, b, lwMm = 0.25, dashMm = null) {
      this.ops.push(`${f(r, 3)} ${f(g, 3)} ${f(b, 3)} RG`);
      this.ops.push(`${f(this._s(lwMm), 3)} w`);
      if (dashMm && dashMm.length) {
        const d = dashMm.map(v => f(this._s(v), 2)).join(' ');
        this.ops.push(`[${d}] 0 d`);
      } else {
        this.ops.push('[] 0 d');
      }
    }

    setFill(r, g, b) {
      this.ops.push(`${f(r, 3)} ${f(g, 3)} ${f(b, 3)} rg`);
    }

    line(x1, y1, x2, y2) {
      this.ops.push(`${f(this._x(x1))} ${f(this._y(y1))} m ${f(this._x(x2))} ${f(this._y(y2))} l S`);
    }

    rect(x, y, w, h, mode = 'S') {
      this.ops.push(`${f(this._x(x))} ${f(this._y(y))} ${f(this._s(w))} ${f(this._s(h))} re ${mode}`);
    }

    polyline(pts, closed = false, mode = 'S') {
      if (!pts || pts.length < 2) return;
      const segs = pts.map((p, i) => `${f(this._x(p.x))} ${f(this._y(p.y))} ${i === 0 ? 'm' : 'l'}`);
      if (closed) segs.push('h');
      segs.push(mode);
      this.ops.push(segs.join(' '));
    }

    circle(cx, cy, rMm, mode = 'S') {
      const k = 0.55228475;
      const x = this._x(cx), y = this._y(cy), r = this._s(rMm), kr = k * r;
      this.ops.push(
        `${f(x + r)} ${f(y)} m ` +
        `${f(x + r)} ${f(y + kr)} ${f(x + kr)} ${f(y + r)} ${f(x)} ${f(y + r)} c ` +
        `${f(x - kr)} ${f(y + r)} ${f(x - r)} ${f(y + kr)} ${f(x - r)} ${f(y)} c ` +
        `${f(x - r)} ${f(y - kr)} ${f(x - kr)} ${f(y - r)} ${f(x)} ${f(y - r)} c ` +
        `${f(x + kr)} ${f(y - r)} ${f(x + r)} ${f(y - kr)} ${f(x + r)} ${f(y)} c ${mode}`
      );
    }

    /**
     * Dibuja texto vectorial.
     * font: 'F1' (Helvetica), 'F2' (Helvetica-Bold), 'F3' (Courier)
     * align: 'left' | 'center' | 'right'
     */
    text(str, xMm, yMm, sizeMm, { font = 'F1', align = 'left', rotDeg = 0, color = [0, 0, 0] } = {}) {
      const s = String(str || '');
      if (!s) return;
      const sizePt = this._s(sizeMm);
      // Estimación precisa de ancho de texto para centrado/derecha en Helvetica/Courier
      const widthFactor = font === 'F3' ? 0.60 : (font === 'F2' ? 0.55 : 0.51);
      const estW = s.length * sizePt * widthFactor;
      let dx = 0;
      if (align === 'center') dx = -estW / 2;
      else if (align === 'right') dx = -estW;

      const px = this._x(xMm);
      const py = this._y(yMm) - sizePt * 0.34; // Centrado vertical aproximado

      this.ops.push(`${f(color[0], 3)} ${f(color[1], 3)} ${f(color[2], 3)} rg`);
      if (Math.abs(rotDeg) > 0.05) {
        const rad = rotDeg * (Math.PI / 180);
        const ca = Math.cos(rad), sa = Math.sin(rad);
        const tx = px + dx * ca;
        const ty = py + dx * sa;
        this.ops.push(`BT /${font} ${f(sizePt)} Tf ${f(ca, 4)} ${f(sa, 4)} ${f(-sa, 4)} ${f(ca, 4)} ${f(tx)} ${f(ty)} Tm ${pdfStr(s)} Tj ET`);
      } else {
        this.ops.push(`BT /${font} ${f(sizePt)} Tf 1 0 0 1 ${f(px + dx)} ${f(py)} Tm ${pdfStr(s)} Tj ET`);
      }
    }

    buildStream() {
      return this.ops.join('\n') + '\n';
    }
  }

  /** Empaqueta un stream vectorial en un archivo PDF 1.4 válido con tabla xref exacta */
  function buildPdfDocument(pageWidthPt, pageHeightPt, streamContent) {
    const objs = [];
    objs.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    objs.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
    objs.push(
      `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(pageWidthPt)} ${f(pageHeightPt)}] ` +
      `/Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >> >> /Contents 7 0 R >>\nendobj\n`
    );
    objs.push('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n');
    objs.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n');
    objs.push('6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>\nendobj\n');
    objs.push(`7 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}endstream\nendobj\n`);

    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    for (const obj of objs) {
      offsets.push(pdf.length);
      pdf += obj;
    }

    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objs.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let i = 1; i < offsets.length; i++) {
      pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    }
    pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    return pdf;
  }

  /**
   * Genera el Plano Oficial ANATI en PDF Vectorial listo para plotear o revisar.
   * @param {Object} state - Estado del proyecto
   * @param {Object} opts - { paperSize: 'anati'|'archd'|'tabloid', anati: {...}, includeGrid, includeBearings, ... }
   */
  function generateAnatiPDF(state, opts = {}) {
    const points = state.points || [];
    if (points.length === 0) throw new Error('No hay puntos para generar el PDF.');

    const closed = Boolean(state.closed) && points.length >= 3;
    const metrics = C.polygonMetrics(points, closed);
    const formatArea = global.TopoDXF.formatAnatiArea;
    const a = opts.anati || {};

    // Bounding Box
    let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
    for (const p of points) {
      if (p.e < minE) minE = p.e;
      if (p.e > maxE) maxE = p.e;
      if (p.n < minN) minN = p.n;
      if (p.n > maxN) maxN = p.n;
    }
    const spanE = Math.max(maxE - minE, 10);
    const spanN = Math.max(maxN - minN, 10);

    const autoScale = global.TopoDXF.computeBestScale(spanE, spanN, 245, 315);
    const scaleDenom = (a.scale && Number(a.scale) > 0) ? Number(a.scale) : autoScale;
    const mmPerMeter = 1000 / scaleDenom;

    // Tamaño de hoja física
    const paper = opts.paperSize || 'anati';
    let pageWmm = 620, pageHmm = 470, pageScale = 1.0, ox = 0, oy = 0;
    if (paper === 'archd') {
      // ARCH D: 36" x 24" = 914.4 x 609.6 mm (mismo formato del ejemplo.dxf!)
      pageWmm = 914.4; pageHmm = 609.6;
      pageScale = Math.min((pageWmm - 20) / 620, (pageHmm - 20) / 470);
      ox = (pageWmm - 620 * pageScale) / 2;
      oy = (pageHmm - 470 * pageScale) / 2;
    } else if (paper === 'tabloid') {
      // Tabloide 17" x 11" = 431.8 x 279.4 mm
      pageWmm = 431.8; pageHmm = 279.4;
      pageScale = Math.min((pageWmm - 10) / 620, (pageHmm - 10) / 470);
      ox = (pageWmm - 620 * pageScale) / 2;
      oy = (pageHmm - 470 * pageScale) / 2;
    }

    const cv = new PdfVectorCanvas(pageWmm, pageHmm, pageScale, ox, oy);

    // Fondo blanco limpio
    cv.setFill(1, 1, 1);
    cv.rect(0, 0, 620, 470, 'f');

    // 1. MARCOS DE LÁMINA (620 x 470 mm exterior, 600 x 450 mm interior)
    cv.setStroke(0.08, 0.1, 0.14, 0.7);
    cv.rect(0, 0, 620, 470, 'S');
    cv.setStroke(0.08, 0.1, 0.14, 0.45);
    cv.rect(10, 10, 600, 450, 'S');

    // 2. DIVISIONES PRINCIPALES
    cv.setStroke(0.1, 0.12, 0.16, 0.35);
    cv.line(10, 110, 610, 110);
    cv.line(370, 10, 370, 110);
    cv.line(460, 10, 460, 460);

    // 3. FRANJA INFERIOR IZQUIERDA (APROBACIÓN ANATI + FIRMA PROPIETARIO)
    cv.setStroke(0.55, 0.6, 0.68, 0.2, [2, 1.5]);
    cv.rect(18, 18, 232, 74, 'S');
    cv.text('ESPACIO RESERVADO PARA APROBACION ANATI', 134, 98, 2.8, { font: 'F2', align: 'center', color: [0.25, 0.3, 0.38] });

    // Firma propietario
    cv.setStroke(0.1, 0.12, 0.16, 0.3);
    cv.line(268, 42, 360, 42);
    const propFirma = (a.favorDe || a.propietario || 'PROPIETARIO / ADQUIRIENTE').toUpperCase();
    const cedFirma = a.cedFavorDe || a.cedPropietario || '';
    cv.text(propFirma, 314, 36, 2.5, { font: 'F2', align: 'center' });
    if (cedFirma) cv.text(`CED. ${cedFirma}`, 314, 31, 2.3, { font: 'F1', align: 'center' });
    cv.text('PROPIETARIO / ADQUIRIENTE', 314, 25.5, 2.2, { font: 'F1', align: 'center', color: [0.3, 0.35, 0.42] });

    // Sello / Revisión
    cv.text('SELLO / REVISION', 415, 98, 2.4, { font: 'F2', align: 'center', color: [0.25, 0.3, 0.38] });

    // 4. PIE DE PLANO / CAJETÍN OFICIAL ANATI (x=460..610, y=10..110)
    // Sombreado sutil en cabecera y franja de área
    cv.setFill(0.94, 0.96, 0.98);
    cv.rect(460, 94.5, 150, 15.5, 'f');
    cv.setFill(0.92, 0.97, 0.95);
    cv.rect(460, 50.2, 150, 5.0, 'f');

    cv.setStroke(0.08, 0.1, 0.14, 0.35);
    cv.rect(460, 10, 150, 100, 'S');
    cv.line(460, 94.5, 610, 94.5);
    cv.line(460, 55.2, 610, 55.2);
    cv.line(460, 50.2, 610, 50.2);
    cv.line(536.3, 10, 536.3, 50.2);

    // 4a. República de Panamá + Provincia/Distrito/Corregimiento/Lugar
    cv.text('REPUBLICA DE PANAMA', 535, 105.8, 4.1, { font: 'F2', align: 'center', color: [0.05, 0.15, 0.3] });
    cv.text(`Provincia: ${(a.provincia || 'CHIRIQUI').toUpperCase()}`, 463, 100.5, 2.4, { font: 'F2' });
    cv.text(`Correg: ${(a.corregimiento || 'DAVID').toUpperCase()}`, 463, 96.6, 2.4, { font: 'F1' });
    cv.text(`Distrito: ${(a.distrito || 'DAVID').toUpperCase()}`, 540, 100.5, 2.4, { font: 'F2' });
    cv.text(`Lugar: ${(a.lugar || 'DAVID').toUpperCase()}`, 540, 96.6, 2.4, { font: 'F1' });

    // 4b. Descripción del globo de terreno
    const tipoPlano = (a.tipoPlano || 'LEVANTAMIENTO TOPOGRAFICO').toUpperCase();
    const folioStr = a.folioReal ? ` DEL FOLIO REAL ${a.folioReal}` : '';
    const codUbStr = a.codUbicacion ? `, COD. DE UBICACION ${a.codUbicacion}` : '';
    let dy = 89.5;
    for (const ln of wrapLines(`${tipoPlano}${folioStr}${codUbStr}`, 44).slice(0, 3)) {
      cv.text(ln, 535, dy, 2.6, { font: 'F2', align: 'center' });
      dy -= 4.2;
    }
    if (a.propietario) {
      const pLine = `PROPIEDAD DE: ${a.propietario.toUpperCase()}${a.cedPropietario ? `, CED. ${a.cedPropietario}` : ''}`;
      for (const ln of wrapLines(pLine, 46).slice(0, 2)) {
        cv.text(ln, 535, dy, 2.3, { font: 'F1', align: 'center' });
        dy -= 3.8;
      }
    }
    if (a.favorDe) {
      cv.text('A FAVOR DE:', 535, Math.min(dy - 1, 66.5), 2.4, { font: 'F2', align: 'center' });
      cv.text(a.favorDe.toUpperCase(), 535, Math.min(dy - 5, 62.5), 2.7, { font: 'F2', align: 'center' });
      if (a.cedFavorDe) {
        cv.text(`CED. ${a.cedFavorDe}`, 535, Math.min(dy - 9, 58.2), 2.3, { font: 'F1', align: 'center' });
      }
    }

    // 4c. Franja de AREA oficial ANATI
    cv.text(`AREA = ${formatArea(metrics.areaM2).replace('m2', 'm\u00b2')}`, 535, 52.8, 3.2, { font: 'F2', align: 'center', color: [0.02, 0.35, 0.22] });

    // 4d. Bloque Profesional + Escala + Fecha
    const profTitulo = (a.profTitulo || 'ING. CIVIL').toUpperCase();
    const profNombre = (a.profNombre || 'NOMBRE DEL PROFESIONAL').toUpperCase();
    cv.text(`${profTitulo}: ${profNombre}`, 463, 44.5, 2.3, { font: 'F2' });
    cv.text(`CEDULA: ${a.profCedula || '---'}`, 463, 37.5, 2.3, { font: 'F1' });
    cv.text(`LICENCIA: ${a.profLicencia || '---'}`, 463, 30.5, 2.3, { font: 'F1' });
    cv.text(`ESCALA:   1 : ${scaleDenom}`, 463, 23.5, 2.4, { font: 'F2' });
    cv.text(`FECHA: ${(a.fecha || 'NOVIEMBRE 2026').toUpperCase()}`, 463, 16.5, 2.4, { font: 'F1' });

    // 4e. Firma y Sello + REF
    cv.setStroke(0.2, 0.2, 0.2, 0.25);
    cv.line(546, 24, 600, 24);
    cv.text('FIRMA Y SELLO', 573, 20, 2.1, { font: 'F1', align: 'center', color: [0.3, 0.35, 0.42] });
    if (a.ref) {
      cv.text(`REF: ${a.ref}`, 573, 13.5, 1.8, { font: 'F3', align: 'center', color: [0.35, 0.4, 0.48] });
    }

    // 5. COLUMNA DERECHA: DATOS DE CAMPO + DETALLE DE AREAS + NOTAS
    let rightY = 454;
    if (opts.includeTable !== false) {
      const hasLots = Boolean(state.lotDivision && state.lotDivision.ok && state.lotDivision.lots && state.lotDivision.lots.length > 0);
      rightY = drawAnatiTablePdf(cv, {
        x0: 465,
        yTop: rightY,
        width: 140,
        title: hasLots ? 'DATOS DE CAMPO - POLIGONO COMPLETO' : 'DATOS DE CAMPO',
        metrics,
        formatArea
      });

      if (hasLots) {
        for (const lot of state.lotDivision.lots) {
          if (rightY < 195) break;
          rightY -= 4;
          const lm = C.polygonMetrics(lot.points, true);
          rightY = drawAnatiTablePdf(cv, {
            x0: 465,
            yTop: rightY,
            width: 140,
            title: `DATOS DE CAMPO - ${lot.name.toUpperCase()}`,
            metrics: lm,
            formatArea
          });
        }
      }
    }

    // 5b. Detalle de áreas (si hay área inscrita)
    const inscritaM2 = parseFloat(a.areaInscrita);
    if (Number.isFinite(inscritaM2) && inscritaM2 > 0) {
      const detY = Math.min(rightY - 6, 248);
      cv.text('DETALLE DE AREAS:', 466, detY, 2.7, { font: 'F2', color: [0.05, 0.15, 0.3] });
      cv.setStroke(0.05, 0.15, 0.3, 0.25);
      cv.line(466, detY - 1.8, 504, detY - 1.8);
      const folioTag = a.folioReal ? ` FOLIO REAL ${a.folioReal}` : '';
      const restoM2 = Math.max(0, inscritaM2 - metrics.areaM2);
      cv.text(`AREA INSCRITA${folioTag}: ${formatArea(inscritaM2).replace('m2', 'm\u00b2')}`, 466, detY - 6.8, 2.1, { font: 'F1' });
      cv.text(`AREA MEDIDA / SEGREGAR: ${formatArea(metrics.areaM2).replace('m2', 'm\u00b2')}`, 466, detY - 11.5, 2.1, { font: 'F1' });
      cv.text(`RESTO LIBRE ESTIMADO: ${formatArea(restoM2).replace('m2', 'm\u00b2')}`, 466, detY - 16.2, 2.2, { font: 'F2' });
    }

    // 5c. Notas técnicas ANATI
    let ny = 198;
    cv.text('NOTAS:', 466, ny, 2.7, { font: 'F2', color: [0.05, 0.15, 0.3] });
    cv.setStroke(0.05, 0.15, 0.3, 0.25);
    cv.line(466, ny - 1.8, 483, ny - 1.8);
    ny -= 6.2;

    const noteItems = [
      '- SE UTILIZO EL NORTE DE CUADRICULA.',
      `- LAS COORDENADAS ESTAN BASADAS EN EL SIST. DE PROYECCION ${state.crsLabel || 'UTM, DATUM WGS-84 ZONA 17N'}.`,
      '- LAS DISTANCIAS ESTAN DADAS EN METROS.',
      a.equipo ? `- EQUIPO UTILIZADO: ${a.equipo.toUpperCase()}.` : '- LEVANTAMIENTO REALIZADO CON EQUIPO TOPOGRAFICO DE PRECISION.',
      a.monumentacion ? `- MONUMENTACION: ${a.monumentacion.toUpperCase()}.` : '- TODOS LOS VERTICES DEBIDAMENTE MONUMENTADOS.',
      a.planoRef ? `- PLANO DE REFERENCIA: ${a.planoRef.toUpperCase()}.` : '',
      a.notaExtra ? `- ${a.notaExtra.toUpperCase()}` : ''
    ].filter(Boolean);

    for (const item of noteItems) {
      for (const ln of wrapLines(item, 58)) {
        if (ny < 114) break;
        cv.text(ln, 466, ny, 2.1, { font: 'F1' });
        ny -= 4.0;
      }
      ny -= 1.0;
    }

    // 6. CUADROS LATERALES IZQUIERDOS: LOCALIZACION REGIONAL + NORTE + DETALLE DE AMARRE
    // 6a. Localización Regional
    cv.setFill(0.97, 0.98, 0.99);
    cv.rect(15, 350, 115, 104, 'f');
    cv.setStroke(0.12, 0.15, 0.2, 0.35);
    cv.rect(15, 350, 115, 104, 'S');
    cv.setStroke(0.7, 0.75, 0.82, 0.15);
    cv.line(15, 402, 130, 402);
    cv.line(72.5, 350, 72.5, 454);
    cv.setFill(0.85, 0.15, 0.15);
    cv.circle(72.5, 402, 2.2, 'f');
    cv.setStroke(0.1, 0.1, 0.1, 0.25);
    cv.line(72.5, 402, 79, 410);
    cv.setFill(1, 1, 1);
    cv.rect(79, 409, 34, 8, 'f');
    cv.rect(79, 409, 34, 8, 'S');
    cv.text('GLOBO MEDIDO', 96, 413, 2.1, { font: 'F2', align: 'center' });

    const cE = (minE + maxE) / 2, cN = (minN + maxN) / 2;
    cv.text(`E: ${cE.toFixed(0)}`, 72.5, 354, 2.0, { font: 'F3', align: 'center', color: [0.3, 0.35, 0.42] });
    cv.text(`N: ${cN.toFixed(0)}`, 128, 405, 2.0, { font: 'F3', align: 'right', color: [0.3, 0.35, 0.42] });
    cv.text(`LOCALIZACION REGIONAL - HOJA ${(a.hojaIgn || 'IGN PANAMA').toUpperCase()}`, 72.5, 344, 2.6, { font: 'F2', align: 'center' });
    cv.text('ESCALA 1:40,000', 72.5, 339.5, 2.3, { font: 'F1', align: 'center' });

    // 6b. Flecha Norte de Cuadrícula
    drawNorthArrowPdf(cv, 160, 395, 16);

    // 6c. Detalle de Amarre
    cv.setFill(0.97, 0.98, 0.99);
    cv.rect(15, 132, 170, 160, 'f');
    cv.setStroke(0.12, 0.15, 0.2, 0.35);
    cv.rect(15, 132, 170, 160, 'S');
    cv.setStroke(0.7, 0.75, 0.82, 0.15);
    cv.line(15, 212, 185, 212);
    cv.line(100, 132, 100, 292);
    cv.setFill(0.02, 0.48, 0.32);
    cv.circle(100, 212, 2.4, 'f');
    cv.text('GLOBO MEDIDO', 105, 219, 2.4, { font: 'F2' });
    cv.text(`P1: E ${points[0].e.toFixed(2)}  N ${points[0].n.toFixed(2)}`, 100, 137, 2.1, { font: 'F3', align: 'center', color: [0.3, 0.35, 0.42] });
    cv.text('DETALLE DE AMARRE', 100, 125.5, 2.7, { font: 'F2', align: 'center' });
    cv.text('ESCALA 1:15,000', 100, 121, 2.3, { font: 'F1', align: 'center' });

    // 7. VENTANA PRINCIPAL DE DIBUJO A ESCALA EXACTA 1:E (x=195..454, y=128..452)
    const winX1 = 195, winY1 = 128, winX2 = 454, winY2 = 452;
    const winCx = (winX1 + winX2) / 2;
    const winCy = (winY1 + winY2) / 2;
    const midWorldE = (minE + maxE) / 2;
    const midWorldN = (minN + maxN) / 2;

    const toPaper = (e, n) => ({
      x: winCx + (e - midWorldE) * mmPerMeter,
      y: winCy + (n - midWorldN) * mmPerMeter
    });

    // Cuadrícula UTM
    if (opts.includeGrid !== false) {
      const niceStep = getNiceGridStep(Math.max(spanE, spanN));
      const halfWorldW = (winX2 - winX1) / (2 * mmPerMeter);
      const halfWorldH = (winY2 - winY1) / (2 * mmPerMeter);
      const gStartE = Math.ceil((midWorldE - halfWorldW + niceStep * 0.15) / niceStep) * niceStep;
      const gEndE = Math.floor((midWorldE + halfWorldW - niceStep * 0.15) / niceStep) * niceStep;
      const gStartN = Math.ceil((midWorldN - halfWorldH + niceStep * 0.15) / niceStep) * niceStep;
      const gEndN = Math.floor((midWorldN + halfWorldH - niceStep * 0.15) / niceStep) * niceStep;

      cv.setStroke(0.65, 0.7, 0.78, 0.15);
      for (let gx = gStartE; gx <= gEndE + 1e-6; gx += niceStep) {
        const px = winCx + (gx - midWorldE) * mmPerMeter;
        cv.text(`E ${gx.toFixed(0)}`, px, winY1 + 2.5, 1.9, { font: 'F3', align: 'center', color: [0.45, 0.5, 0.58] });
        for (let gy = gStartN; gy <= gEndN + 1e-6; gy += niceStep) {
          const py = winCy + (gy - midWorldN) * mmPerMeter;
          cv.line(px - 2.2, py, px + 2.2, py);
          cv.line(px, py - 2.2, px, py + 2.2);
        }
      }
      for (let gy = gStartN; gy <= gEndN + 1e-6; gy += niceStep) {
        const py = winCy + (gy - midWorldN) * mmPerMeter;
        cv.text(`N ${gy.toFixed(0)}`, winX1 + 2, py, 1.9, { font: 'F3', color: [0.45, 0.5, 0.58] });
      }
    }

    // Polígono escalado
    const paperPts = points.map(p => ({ ...p, ...toPaper(p.e, p.n) }));
    if (paperPts.length >= 2) {
      if (closed) {
        cv.setFill(0.91, 0.98, 0.95);
        cv.polyline(paperPts, true, 'f');
      }
      cv.setStroke(0.02, 0.42, 0.28, 0.55);
      cv.polyline(paperPts, closed, 'S');
    }

    // División de lotes en el dibujo
    if (state.lotDivision && state.lotDivision.ok) {
      cv.setStroke(0.1, 0.35, 0.75, 0.4, [3, 2]);
      for (const cl of state.lotDivision.cutLines || []) {
        const pa = toPaper(cl.from.e, cl.from.n);
        const pb = toPaper(cl.to.e, cl.to.n);
        cv.line(pa.x, pa.y, pb.x, pb.y);
      }
      for (const cp of state.lotDivision.cutPoints || []) {
        const pp = toPaper(cp.e, cp.n);
        cv.setFill(0.85, 0.48, 0.02);
        cv.circle(pp.x, pp.y, 1.2, 'f');
        cv.text(cp.id, pp.x + 2.2, pp.y + 1.8, 2.2, { font: 'F2', color: [0.65, 0.32, 0.0] });
      }
      for (const lot of state.lotDivision.lots || []) {
        if (lot.centroid) {
          const pc = toPaper(lot.centroid.e, lot.centroid.n);
          cv.text(lot.name.toUpperCase(), pc.x, pc.y + 2.2, 2.6, { font: 'F2', align: 'center', color: [0.06, 0.24, 0.55] });
          cv.text(formatArea(lot.areaM2).replace('m2', 'm\u00b2'), pc.x, pc.y - 2.0, 2.1, { font: 'F1', align: 'center', color: [0.06, 0.24, 0.55] });
        }
      }
    } else if (closed && metrics.centroid && metrics.areaM2 > 0) {
      const pc = toPaper(metrics.centroid.e, metrics.centroid.n);
      cv.text(`AREA = ${formatArea(metrics.areaM2).replace('m2', 'm\u00b2')}`, pc.x, pc.y + 2.4, 3.0, { font: 'F2', align: 'center', color: [0.02, 0.35, 0.22] });
      cv.text(`PERIMETRO: ${metrics.perimeter.toFixed(2)} ml`, pc.x, pc.y - 2.2, 2.3, { font: 'F1', align: 'center', color: [0.15, 0.2, 0.28] });
    }

    // Rumbos y Distancias rotados sobre cada lado
    if (opts.includeBearings !== false && metrics.legs.length > 0) {
      for (const leg of metrics.legs) {
        const pa = toPaper(leg.from.e, leg.from.n);
        const pb = toPaper(leg.to.e, leg.to.n);
        const mx = (pa.x + pb.x) / 2;
        const my = (pa.y + pb.y) / 2;
        let ang = Math.atan2(pb.y - pa.y, pb.x - pa.x) * (180 / Math.PI);
        if (ang > 90) ang -= 180;
        if (ang < -90) ang += 180;
        const rad = ang * (Math.PI / 180);
        const nx = -Math.sin(rad), ny = Math.cos(rad);
        cv.text(leg.bearing, mx + nx * 2.5, my + ny * 2.5, 2.1, { font: 'F2', align: 'center', rotDeg: ang, color: [0.08, 0.12, 0.2] });
        cv.text(`${leg.dist.toFixed(2)} m`, mx - nx * 2.5, my - ny * 2.5, 2.0, { font: 'F1', align: 'center', rotDeg: ang, color: [0.02, 0.4, 0.55] });
      }
    }

    // Vértices e IDs
    for (let i = 0; i < paperPts.length; i++) {
      const p = paperPts[i];
      cv.setFill(i === 0 ? 0.85 : 0.05, i === 0 ? 0.45 : 0.38, i === 0 ? 0.05 : 0.65);
      cv.circle(p.x, p.y, 1.4, 'f');
      cv.setStroke(1, 1, 1, 0.25);
      cv.circle(p.x, p.y, 1.4, 'S');
      cv.text(p.id, p.x + 2.4, p.y + 2.0, 2.5, { font: 'F2', color: [0.08, 0.1, 0.15] });
    }

    // Escala Gráfica
    drawGraphicScalePdf(cv, winCx - 30, 117, scaleDenom);

    // Pie de página discreto
    cv.text('Generado con topografia.com.pa', 12, 6, 1.8, { font: 'F1', color: [0.45, 0.5, 0.58] });

    const stream = cv.buildStream();
    return buildPdfDocument(pageWmm * MM2PT, pageHmm * MM2PT, stream);
  }

  function drawAnatiTablePdf(cv, cfg) {
    const x0 = cfg.x0, W = cfg.width, rowH = 5.4;
    const cols = [
      { header: 'VERTICE', w: 16, align: 'center' },
      { header: 'ESTACION', w: 20, align: 'center' },
      { header: 'DIST.', w: 16, align: 'right' },
      { header: 'RUMBO', w: 32, align: 'center' },
      { header: 'ESTE', w: 28, align: 'right' },
      { header: 'NORTE', w: 28, align: 'right' }
    ];

    let y = cfg.yTop;
    // Título con relleno suave
    cv.setFill(0.1, 0.18, 0.28);
    cv.rect(x0, y - 6, W, 6, 'f');
    cv.setStroke(0.1, 0.18, 0.28, 0.3);
    cv.rect(x0, y - 6, W, 6, 'S');
    cv.text(cfg.title, x0 + W / 2, y - 3, 2.4, { font: 'F2', align: 'center', color: [1, 1, 1] });
    y -= 6;

    // Encabezados
    cv.setFill(0.92, 0.94, 0.97);
    cv.rect(x0, y - rowH, W, rowH, 'f');
    cv.setStroke(0.2, 0.25, 0.32, 0.22);
    cv.rect(x0, y - rowH, W, rowH, 'S');
    let cx = x0;
    for (let i = 0; i < cols.length; i++) {
      if (i > 0) cv.line(cx, y, cx, y - rowH);
      cv.text(cols[i].header, cx + cols[i].w / 2, y - rowH / 2, 2.0, { font: 'F2', align: 'center' });
      cx += cols[i].w;
    }
    y -= rowH;

    // Filas
    const bodyTop = y;
    for (const leg of (cfg.metrics.legs || [])) {
      const r = [
        leg.fromId,
        `${leg.fromId} - ${leg.toId}`,
        leg.dist.toFixed(2),
        C.azimuthToBearing(leg.azimuth, 0).text,
        leg.from.e.toFixed(3),
        leg.from.n.toFixed(3)
      ];
      cv.setStroke(0.75, 0.78, 0.84, 0.15);
      cv.line(x0, y - rowH, x0 + W, y - rowH);
      let rx = x0;
      for (let i = 0; i < cols.length; i++) {
        const col = cols[i];
        const tx = col.align === 'right' ? (rx + col.w - 1.4) : (rx + col.w / 2);
        cv.text(r[i], tx, y - rowH / 2, 2.0, { font: i >= 2 ? 'F3' : 'F1', align: col.align });
        rx += col.w;
      }
      y -= rowH;
    }

    // Bordes verticales del cuerpo
    cv.setStroke(0.2, 0.25, 0.32, 0.2);
    cx = x0;
    for (let i = 0; i <= cols.length; i++) {
      cv.line(cx, bodyTop, cx, y);
      if (i < cols.length) cx += cols[i].w;
    }
    cv.line(x0, y, x0 + W, y);

    // Pie Área y Perímetro
    cv.setFill(0.95, 0.98, 0.96);
    cv.rect(x0, y - rowH * 2, W, rowH * 2, 'f');
    cv.setStroke(0.2, 0.25, 0.32, 0.22);
    cv.rect(x0, y - rowH, W, rowH, 'S');
    cv.text(`Area: ${cfg.formatArea(cfg.metrics.areaM2).replace('m2', 'm\u00b2')}`, x0 + W / 2, y - rowH / 2, 2.2, { font: 'F2', align: 'center', color: [0.02, 0.35, 0.22] });
    y -= rowH;

    cv.rect(x0, y - rowH, W, rowH, 'S');
    cv.text(`Perimetro: ${cfg.metrics.perimeter.toFixed(2)} ml`, x0 + W / 2, y - rowH / 2, 2.2, { font: 'F2', align: 'center' });
    y -= rowH;

    return y;
  }

  function drawNorthArrowPdf(cv, cx, cy, size) {
    cv.setStroke(0.1, 0.14, 0.2, 0.35);
    cv.circle(cx, cy, size * 0.48, 'S');
    cv.line(cx, cy - size * 0.8, cx, cy + size);
    cv.line(cx - size * 0.65, cy, cx + size * 0.65, cy);
    // Punta rellena negra
    cv.setFill(0.1, 0.14, 0.2);
    cv.polyline([
      { x: cx, y: cy + size },
      { x: cx - size * 0.24, y: cy + size * 0.32 },
      { x: cx, y: cy + size * 0.45 },
      { x: cx + size * 0.24, y: cy + size * 0.32 }
    ], true, 'f');
    cv.text('N', cx, cy + size + 3.4, 3.6, { font: 'F2', align: 'center' });
    cv.text('CUADRICULA', cx, cy - size * 0.8 - 3.2, 1.9, { font: 'F1', align: 'center' });
  }

  function drawGraphicScalePdf(cv, x0, y0, scaleDenom) {
    const segW = 15, h = 2.4;
    const metersPerSeg = (segW * scaleDenom) / 1000;
    for (let i = 0; i < 4; i++) {
      cv.setFill(i % 2 === 0 ? 0.1 : 1, i % 2 === 0 ? 0.14 : 1, i % 2 === 0 ? 0.2 : 1);
      cv.rect(x0 + i * segW, y0, segW, h, 'f');
      cv.setStroke(0.1, 0.14, 0.2, 0.25);
      cv.rect(x0 + i * segW, y0, segW, h, 'S');
    }
    for (let i = 0; i <= 4; i++) {
      const val = i * metersPerSeg;
      const lbl = Number.isInteger(val) ? String(val) : val.toFixed(1);
      cv.text(i === 4 ? `${lbl} m` : lbl, x0 + i * segW, y0 + h + 2.3, 2.0, { font: 'F3', align: 'center' });
    }
    cv.text(`ESCALA GRAFICA 1:${scaleDenom}`, x0 + segW * 2, y0 - 2.6, 2.1, { font: 'F2', align: 'center' });
  }

  global.TopoPDF = {
    generateAnatiPDF
  };
})(window);
