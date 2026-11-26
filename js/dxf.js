/**
 * dxf.js — Generador DXF profesional para topografia.com.pa
 * Soporta:
 *   1) Modo Plano ANATI (Panamá): Model Space 1:1 en coordenadas reales UTM +
 *      Paper Space (Layout1, lámina 620 x 470 mm) con Marco, Cajetín ANATI,
 *      Cuadro DATOS DE CAMPO, Detalle de Áreas, Notas, Localización, Amarre y Firmas.
 *   2) Modo Simple (Model Space): Poligonal 1:1 + Cuadro de Datos de Campo al lado.
 * Compatible con AutoCAD, Civil 3D, BricsCAD, LibreCAD y QGIS (DXF R12 / AC1009).
 */
(function (global) {
  'use strict';

  const C = global.TopoCOGO;

  function num(v, dec = 4) {
    return Number.isFinite(v) ? v.toFixed(dec) : '0.0000';
  }

  /** Limpia caracteres problemáticos para compatibilidad ASCII / R12 en AutoCAD */
  function dxfTextSafe(str) {
    return String(str || '')
      .replace(/°/g, '%%d')
      .replace(/±/g, '%%p')
      .replace(/²/g, '2')
      .replace(/á/g, 'a').replace(/Á/g, 'A')
      .replace(/é/g, 'e').replace(/É/g, 'E')
      .replace(/í/g, 'i').replace(/Í/g, 'I')
      .replace(/ó/g, 'o').replace(/Ó/g, 'O')
      .replace(/ú/g, 'u').replace(/Ú/g, 'U')
      .replace(/ñ/g, 'n').replace(/Ñ/g, 'N')
      .replace(/[\r\n]+/g, ' ');
  }

  /** Formato oficial ANATI Panamá: "1 HAS + 9471.81 m2" o "0 HAS + 5744.55 m2" */
  function formatAnatiArea(areaM2) {
    const a = Math.max(0, Number(areaM2) || 0);
    const has = Math.floor(a / 10000);
    const rem = a - has * 10000;
    const remStr = rem.toFixed(2).padStart(7, '0');
    return `${has} HAS + ${remStr} m2`;
  }

  /** Selecciona una escala topográfica estándar (1:100 .. 1:10000) que encaje en la ventana W x H (mm) */
  function computeBestScale(spanE, spanN, winWmm = 230, winHmm = 290) {
    const standards = [100, 150, 200, 250, 300, 400, 500, 750, 1000, 1250, 1500, 2000, 2500, 3000, 5000, 7500, 10000, 15000, 20000, 25000, 50000];
    const reqScaleE = (spanE * 1000) / (winWmm * 0.78);
    const reqScaleN = (spanN * 1000) / (winHmm * 0.78);
    const req = Math.max(reqScaleE, reqScaleN, 100);
    for (const s of standards) {
      if (s >= req) return s;
    }
    return Math.ceil(req / 1000) * 1000;
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

  function wrapLines(text, maxChars) {
    const words = String(text || '').trim().split(/\s+/);
    const out = [];
    let cur = '';
    for (const w of words) {
      if (!cur) { cur = w; }
      else if (cur.length + 1 + w.length <= maxChars) { cur += ' ' + w; }
      else { out.push(cur); cur = w; }
    }
    if (cur) out.push(cur);
    return out;
  }

  /** Helper para construir pares código-valor DXF (soporta Model Space space=0 y Paper Space space=1) */
  class DxfBuilder {
    constructor() {
      this.lines = [];
    }

    pair(code, value) {
      this.lines.push(String(code), String(value));
    }

    _space(space) {
      if (space === 1) this.pair(67, 1);
    }

    addLine(layer, x1, y1, x2, y2, z1 = 0, z2 = 0, color = null, space = 0) {
      this.pair(0, 'LINE');
      this._space(space);
      this.pair(8, layer);
      if (color !== null) this.pair(62, color);
      this.pair(10, num(x1));
      this.pair(20, num(y1));
      this.pair(30, num(z1));
      this.pair(11, num(x2));
      this.pair(21, num(y2));
      this.pair(31, num(z2));
    }

    addPoint(layer, x, y, z = 0, space = 0) {
      this.pair(0, 'POINT');
      this._space(space);
      this.pair(8, layer);
      this.pair(10, num(x));
      this.pair(20, num(y));
      this.pair(30, num(z));
    }

    addCircle(layer, cx, cy, r, z = 0, space = 0) {
      this.pair(0, 'CIRCLE');
      this._space(space);
      this.pair(8, layer);
      this.pair(10, num(cx));
      this.pair(20, num(cy));
      this.pair(30, num(z));
      this.pair(40, num(r));
    }

    addPolyline(layer, pts, closed = false, space = 0) {
      if (!pts || pts.length < 2) return;
      this.pair(0, 'POLYLINE');
      this._space(space);
      this.pair(8, layer);
      this.pair(66, 1);
      this.pair(10, '0.0');
      this.pair(20, '0.0');
      this.pair(30, '0.0');
      this.pair(70, closed ? 1 : 0);
      for (const p of pts) {
        this.pair(0, 'VERTEX');
        this._space(space);
        this.pair(8, layer);
        this.pair(10, num(p.e));
        this.pair(20, num(p.n));
        this.pair(30, num(p.z || 0));
      }
      this.pair(0, 'SEQEND');
      this._space(space);
      this.pair(8, layer);
    }

    /**
     * hAlign: 0=Left, 1=Center, 2=Right
     * vAlign: 0=Baseline, 1=Bottom, 2=Middle, 3=Top
     */
    addText(layer, text, x, y, height, rotationDeg = 0, hAlign = 0, vAlign = 0, space = 0) {
      this.pair(0, 'TEXT');
      this._space(space);
      this.pair(8, layer);
      this.pair(7, 'STANDARD');
      this.pair(10, num(x));
      this.pair(20, num(y));
      this.pair(30, '0.0');
      this.pair(40, num(height));
      this.pair(1, dxfTextSafe(text));
      if (Math.abs(rotationDeg) > 1e-4) {
        this.pair(50, num(rotationDeg, 3));
      }
      if (hAlign !== 0 || vAlign !== 0) {
        this.pair(72, hAlign);
        this.pair(11, num(x));
        this.pair(21, num(y));
        this.pair(31, '0.0');
        this.pair(73, vAlign);
      }
    }

    addRect(layer, x1, y1, x2, y2, space = 0) {
      this.addLine(layer, x1, y1, x2, y1, 0, 0, null, space);
      this.addLine(layer, x2, y1, x2, y2, 0, 0, null, space);
      this.addLine(layer, x2, y2, x1, y2, 0, 0, null, space);
      this.addLine(layer, x1, y2, x1, y1, 0, 0, null, space);
    }

    toString() {
      return this.lines.join('\r\n') + '\r\n';
    }
  }

  /**
   * Genera el contenido completo del archivo DXF.
   * @param {Object} state - Estado del proyecto { projectName, crsLabel, points, closed, curves, auxLines, lotDivision }
   * @param {Object} opts - Opciones de exportación + anatiMeta (pie de plano ANATI)
   */
  function generateDXF(state, opts = {}) {
    const options = {
      layoutMode: 'anati', // 'anati' | 'simple'
      includePolygon: true,
      includePoints: true,
      includeBearings: true,
      includeAreaLabel: true,
      includeTable: true,
      includeNorthArrow: true,
      includeGrid: true,
      textScale: 1.0,
      anati: {},
      ...opts
    };

    const points = state.points || [];
    if (points.length === 0) {
      throw new Error('No hay puntos para exportar al DXF.');
    }

    const closed = Boolean(state.closed) && points.length >= 3;
    const metrics = C.polygonMetrics(points, closed);

    // Calcular Bounding Box del levantamiento (Model Space 1:1 en metros)
    let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
    for (const p of points) {
      if (p.e < minE) minE = p.e;
      if (p.e > maxE) maxE = p.e;
      if (p.n < minN) minN = p.n;
      if (p.n > maxN) maxN = p.n;
    }
    const spanE = Math.max(maxE - minE, 10);
    const spanN = Math.max(maxN - minN, 10);
    const maxSpan = Math.max(spanE, spanN);

    const baseTextH = Math.max(0.25, maxSpan * 0.018) * (Number(options.textScale) || 1.0);
    const markerR = baseTextH * 0.45;

    const isAnati = options.layoutMode === 'anati';
    const tableMargin = maxSpan * 0.14 + baseTextH * 4;
    const tableWidth = baseTextH * 68;
    const extraLotRows = (options.includeTable && state.lotDivision && state.lotDivision.ok)
      ? state.lotDivision.lots.reduce((sum, l) => sum + (l.legs ? l.legs.length : 4) + 6, 0)
      : 0;
    const extMinE = minE - maxSpan * 0.12;
    const extMinN = isAnati
      ? (minN - maxSpan * 0.12)
      : Math.min(minN - maxSpan * 0.12, maxN - (metrics.legs.length + 8 + extraLotRows) * baseTextH * 1.9);
    const extMaxE = (!isAnati && options.includeTable)
      ? (maxE + tableMargin + tableWidth + maxSpan * 0.08)
      : (maxE + maxSpan * 0.12);
    const extMaxN = maxN + maxSpan * 0.15;

    const dxf = new DxfBuilder();

    // ==================== HEADER ====================
    dxf.pair(0, 'SECTION');
    dxf.pair(2, 'HEADER');
    dxf.pair(9, '$ACADVER'); dxf.pair(1, 'AC1009'); // AutoCAD R12 universal (soporta Model + Paper Space)
    dxf.pair(9, '$INSUNITS'); dxf.pair(70, 6);       // Metros
    dxf.pair(9, '$MEASUREMENT'); dxf.pair(70, 1);    // Métrico
    dxf.pair(9, '$TILEMODE'); dxf.pair(70, isAnati ? 0 : 1); // 0 abre directo en Layout1 ANATI
    dxf.pair(9, '$EXTMIN');
    dxf.pair(10, num(extMinE)); dxf.pair(20, num(extMinN)); dxf.pair(30, '0.0');
    dxf.pair(9, '$EXTMAX');
    dxf.pair(10, num(extMaxE)); dxf.pair(20, num(extMaxN)); dxf.pair(30, '0.0');
    if (isAnati) {
      dxf.pair(9, '$PEXTMIN');
      dxf.pair(10, '0.0'); dxf.pair(20, '0.0'); dxf.pair(30, '0.0');
      dxf.pair(9, '$PEXTMAX');
      dxf.pair(10, '620.0'); dxf.pair(20, '470.0'); dxf.pair(30, '0.0');
      dxf.pair(9, '$PLIMMIN');
      dxf.pair(10, '0.0'); dxf.pair(20, '0.0');
      dxf.pair(9, '$PLIMMAX');
      dxf.pair(10, '620.0'); dxf.pair(20, '470.0');
    }
    dxf.pair(9, '$PDMODE'); dxf.pair(70, 34);
    dxf.pair(9, '$PDSIZE'); dxf.pair(40, num(markerR));
    dxf.pair(0, 'ENDSEC');

    // ==================== TABLES ====================
    dxf.pair(0, 'SECTION');
    dxf.pair(2, 'TABLES');

    // LTYPE Table
    dxf.pair(0, 'TABLE');
    dxf.pair(2, 'LTYPE');
    dxf.pair(70, 2);
    dxf.pair(0, 'LTYPE');
    dxf.pair(2, 'CONTINUOUS');
    dxf.pair(70, 0);
    dxf.pair(3, 'Solid line');
    dxf.pair(72, 65);
    dxf.pair(73, 0);
    dxf.pair(40, '0.0');

    dxf.pair(0, 'LTYPE');
    dxf.pair(2, 'DASHED');
    dxf.pair(70, 0);
    dxf.pair(3, 'Dashed __ __ __');
    dxf.pair(72, 65);
    dxf.pair(73, 2);
    dxf.pair(40, '1.5');
    dxf.pair(49, '1.0');
    dxf.pair(49, '-0.5');
    dxf.pair(0, 'ENDTAB');

    // LAYER Table (incluye capas estándar ANATI de ejemplo.dxf)
    const layers = [
      { name: '0', color: 7, ltype: 'CONTINUOUS' },
      { name: 'MARCO_Y_LEYENDAS', color: 7, ltype: 'CONTINUOUS' },
      { name: 'DATOS_DE_CAMPO', color: 7, ltype: 'CONTINUOUS' },
      { name: 'CUADROS', color: 7, ltype: 'CONTINUOUS' },
      { name: 'PLANO_ESCALA', color: 3, ltype: 'CONTINUOUS' },
      { name: 'TOPO_POLIGONAL', color: 3, ltype: 'CONTINUOUS' },
      { name: 'TOPO_PUNTOS', color: 1, ltype: 'CONTINUOUS' },
      { name: 'TOPO_NUM_PUNTO', color: 7, ltype: 'CONTINUOUS' },
      { name: 'TOPO_RUMBOS_DIST', color: 4, ltype: 'CONTINUOUS' },
      { name: 'TOPO_AREA_CENTRO', color: 2, ltype: 'CONTINUOUS' },
      { name: 'TOPO_CURVAS', color: 6, ltype: 'CONTINUOUS' },
      { name: 'TOPO_LOTES', color: 5, ltype: 'DASHED' },
      { name: 'TOPO_COGO_AUX', color: 8, ltype: 'DASHED' },
      { name: 'TOPO_CUADRO_DATOS', color: 7, ltype: 'CONTINUOUS' },
      { name: 'TOPO_CUADRO_TEXTO', color: 2, ltype: 'CONTINUOUS' },
      { name: 'TOPO_NORTE', color: 7, ltype: 'CONTINUOUS' },
      { name: 'TOPO_CUADRICULA', color: 8, ltype: 'CONTINUOUS' }
    ];

    dxf.pair(0, 'TABLE');
    dxf.pair(2, 'LAYER');
    dxf.pair(70, layers.length);
    for (const l of layers) {
      dxf.pair(0, 'LAYER');
      dxf.pair(2, l.name);
      dxf.pair(70, 0);
      dxf.pair(62, l.color);
      dxf.pair(6, l.ltype);
    }
    dxf.pair(0, 'ENDTAB');

    // STYLE Table
    dxf.pair(0, 'TABLE');
    dxf.pair(2, 'STYLE');
    dxf.pair(70, 1);
    dxf.pair(0, 'STYLE');
    dxf.pair(2, 'STANDARD');
    dxf.pair(70, 0);
    dxf.pair(40, '0.0');
    dxf.pair(41, '1.0');
    dxf.pair(50, '0.0');
    dxf.pair(71, 0);
    dxf.pair(42, num(baseTextH));
    dxf.pair(3, 'txt');
    dxf.pair(4, '');
    dxf.pair(0, 'ENDTAB');

    dxf.pair(0, 'ENDSEC');

    // ==================== BLOCKS (requeridos para Paper Space en R12) ====================
    dxf.pair(0, 'SECTION');
    dxf.pair(2, 'BLOCKS');
    for (const bName of ['*MODEL_SPACE', '*PAPER_SPACE']) {
      dxf.pair(0, 'BLOCK');
      dxf.pair(8, '0');
      dxf.pair(2, bName);
      dxf.pair(70, 0);
      dxf.pair(10, '0.0'); dxf.pair(20, '0.0'); dxf.pair(30, '0.0');
      dxf.pair(3, bName);
      dxf.pair(0, 'ENDBLK');
      dxf.pair(8, '0');
    }
    dxf.pair(0, 'ENDSEC');

    // ==================== ENTITIES ====================
    dxf.pair(0, 'SECTION');
    dxf.pair(2, 'ENTITIES');

    // ---------- A) MODEL SPACE (Space = 0): Levantamiento 1:1 en Coordenadas Reales UTM ----------
    drawModelSpaceSurvey(dxf, state, options, {
      points, closed, metrics, minE, maxE, minN, maxN, maxSpan, baseTextH, markerR, tableMargin, isAnati
    });

    // ---------- B) PAPER SPACE (Space = 1): Lámina Oficial ANATI Panamá (620 x 470 mm) ----------
    if (isAnati) {
      drawAnatiPaperSpace(dxf, state, options, {
        points, closed, metrics, minE, maxE, minN, maxN, spanE, spanN
      });
    }

    dxf.pair(0, 'ENDSEC');
    dxf.pair(0, 'EOF');

    return dxf.toString();
  }

  /** Dibuja el levantamiento topográfico 1:1 en Model Space (Space = 0) */
  function drawModelSpaceSurvey(dxf, state, options, ctx) {
    const { points, closed, metrics, minE, maxE, minN, maxN, maxSpan, baseTextH, markerR, tableMargin, isAnati } = ctx;

    // 1. Cuadrícula UTM
    if (options.includeGrid) {
      const niceStep = getNiceGridStep(maxSpan);
      const startE = Math.floor((minE - niceStep * 0.5) / niceStep) * niceStep;
      const endE = Math.ceil((maxE + niceStep * 0.5) / niceStep) * niceStep;
      const startN = Math.floor((minN - niceStep * 0.5) / niceStep) * niceStep;
      const endN = Math.ceil((maxN + niceStep * 0.5) / niceStep) * niceStep;
      const tick = baseTextH * 0.8;

      for (let gx = startE; gx <= endE + 1e-6; gx += niceStep) {
        dxf.addText('TOPO_CUADRICULA', `E ${gx.toFixed(0)}`, gx, startN - baseTextH * 1.4, baseTextH * 0.65, 0, 1, 2);
        for (let gy = startN; gy <= endN + 1e-6; gy += niceStep) {
          dxf.addLine('TOPO_CUADRICULA', gx - tick, gy, gx + tick, gy);
          dxf.addLine('TOPO_CUADRICULA', gx, gy - tick, gx, gy + tick);
        }
      }
      for (let gy = startN; gy <= endN + 1e-6; gy += niceStep) {
        dxf.addText('TOPO_CUADRICULA', `N ${gy.toFixed(0)}`, startE - baseTextH * 1.2, gy, baseTextH * 0.65, 0, 2, 2);
      }
    }

    // 2. Poligonal
    if (options.includePolygon && points.length >= 2) {
      dxf.addPolyline('TOPO_POLIGONAL', points, closed);
    }

    // 3. Puntos, símbolos de vértice y etiquetas
    if (options.includePoints) {
      for (const p of points) {
        dxf.addPoint('TOPO_PUNTOS', p.e, p.n, p.z || 0);
        dxf.addCircle('TOPO_PUNTOS', p.e, p.n, markerR, p.z || 0);
        dxf.addText('TOPO_NUM_PUNTO', p.id, p.e + markerR * 1.6, p.n + markerR * 1.4, baseTextH * 0.9, 0, 0, 0);
        if (p.desc) {
          dxf.addText('TOPO_NUM_PUNTO', p.desc, p.e + markerR * 1.6, p.n - markerR * 1.6, baseTextH * 0.55, 0, 0, 3);
        }
      }
    }

    // 4. Rumbos y Distancias rotados
    if (options.includeBearings && metrics.legs.length > 0) {
      const legTextH = baseTextH * 0.72;
      for (const leg of metrics.legs) {
        if (leg.dist < 1e-4) continue;
        const midE = (leg.from.e + leg.to.e) / 2;
        const midN = (leg.from.n + leg.to.n) / 2;
        let cadAngle = Math.atan2(leg.dN, leg.dE) * (180 / Math.PI);
        if (cadAngle > 90) cadAngle -= 180;
        if (cadAngle < -90) cadAngle += 180;
        const rad = cadAngle * (Math.PI / 180);
        const nx = -Math.sin(rad), ny = Math.cos(rad);
        const off = legTextH * 0.85;
        dxf.addText('TOPO_RUMBOS_DIST', leg.bearing, midE + nx * off, midN + ny * off, legTextH, cadAngle, 1, 2);
        dxf.addText('TOPO_RUMBOS_DIST', `${leg.dist.toFixed(2)} m`, midE - nx * off, midN - ny * off, legTextH, cadAngle, 1, 2);
      }
    }

    // 5. Curvas y auxiliares
    if (state.curves && state.curves.length > 0) {
      for (const curve of state.curves) {
        if (curve.arcPoints && curve.arcPoints.length >= 2) {
          dxf.addPolyline('TOPO_CURVAS', curve.arcPoints, false);
          dxf.addLine('TOPO_COGO_AUX', curve.pc.e, curve.pc.n, curve.pi.e, curve.pi.n);
          dxf.addLine('TOPO_COGO_AUX', curve.pi.e, curve.pi.n, curve.pt.e, curve.pt.n);
          dxf.addLine('TOPO_COGO_AUX', curve.center.e, curve.center.n, curve.pc.e, curve.pc.n);
          dxf.addLine('TOPO_COGO_AUX', curve.center.e, curve.center.n, curve.pt.e, curve.pt.n);
          dxf.addText('TOPO_CURVAS', `R=${curve.radius.toFixed(2)}m Lc=${curve.Lc.toFixed(2)}m`, curve.pi.e, curve.pi.n + baseTextH, baseTextH * 0.7, 0, 1, 2);
        }
      }
    }
    if (state.auxLines && state.auxLines.length > 0) {
      for (const line of state.auxLines) {
        dxf.addLine('TOPO_COGO_AUX', line.from.e, line.from.n, line.to.e, line.to.n);
      }
    }

    // 5b. División en Lotes
    if (state.lotDivision && state.lotDivision.ok) {
      for (const cp of state.lotDivision.cutPoints || []) {
        dxf.addPoint('TOPO_LOTES', cp.e, cp.n, cp.z || 0);
        dxf.addCircle('TOPO_LOTES', cp.e, cp.n, markerR * 0.85, cp.z || 0);
        dxf.addText('TOPO_LOTES', cp.id, cp.e + markerR * 1.4, cp.n + markerR * 1.2, baseTextH * 0.8, 0, 0, 0);
      }
      for (const cl of state.lotDivision.cutLines || []) {
        if (cl.from && cl.to) {
          dxf.addLine('TOPO_LOTES', cl.from.e, cl.from.n, cl.to.e, cl.to.n);
          const mx = (cl.from.e + cl.to.e) / 2;
          const my = (cl.from.n + cl.to.n) / 2;
          let cadAngle = Math.atan2(cl.to.n - cl.from.n, cl.to.e - cl.from.e) * (180 / Math.PI);
          if (cadAngle > 90) cadAngle -= 180;
          if (cadAngle < -90) cadAngle += 180;
          dxf.addText('TOPO_LOTES', `${cl.bearing} (${cl.dist.toFixed(2)}m)`, mx, my, baseTextH * 0.65, cadAngle, 1, 2);
        }
      }
      for (const lot of state.lotDivision.lots || []) {
        if (lot.centroid) {
          dxf.addText('TOPO_LOTES', `${lot.name.toUpperCase()}`, lot.centroid.e, lot.centroid.n + baseTextH * 0.55, baseTextH * 0.85, 0, 1, 2);
          dxf.addText('TOPO_LOTES', formatAnatiArea(lot.areaM2), lot.centroid.e, lot.centroid.n - baseTextH * 0.55, baseTextH * 0.72, 0, 1, 2);
        }
      }
    }

    // 6. Etiqueta de Área en centroide
    if (options.includeAreaLabel && closed && metrics.centroid && metrics.areaM2 > 0) {
      const c = metrics.centroid;
      dxf.addText('TOPO_AREA_CENTRO', `AREA = ${formatAnatiArea(metrics.areaM2)}`, c.e, c.n + baseTextH * 0.9, baseTextH * 0.95, 0, 1, 2);
      dxf.addText('TOPO_AREA_CENTRO', `PERIMETRO: ${metrics.perimeter.toFixed(2)} ml`, c.e, c.n - baseTextH * 0.6, baseTextH * 0.72, 0, 1, 2);
    }

    // 7. Flecha Norte en Model Space
    if (options.includeNorthArrow) {
      const nx = maxE + tableMargin * 0.35;
      const ny = maxN - baseTextH * 2;
      const r = baseTextH * 2.2;
      dxf.addCircle('TOPO_NORTE', nx, ny, r * 0.65);
      dxf.addLine('TOPO_NORTE', nx, ny - r, nx, ny + r * 1.3);
      dxf.addLine('TOPO_NORTE', nx - r * 0.85, ny, nx + r * 0.85, ny);
      dxf.addLine('TOPO_NORTE', nx, ny + r * 1.3, nx - r * 0.35, ny + r * 0.45);
      dxf.addLine('TOPO_NORTE', nx, ny + r * 1.3, nx + r * 0.35, ny + r * 0.45);
      dxf.addText('TOPO_NORTE', 'N', nx, ny + r * 1.75, baseTextH * 1.1, 0, 1, 2);
    }

    // 8. En modo Simple, dibujar los cuadros de datos al lado del polígono en Model Space
    if (!isAnati && options.includeTable) {
      const hasLots = Boolean(state.lotDivision && state.lotDivision.ok && state.lotDivision.lots && state.lotDivision.lots.length > 0);
      const baseTitle = hasLots
        ? `${state.projectName || 'LEVANTAMIENTO'} - POLIGONO COMPLETO`
        : (state.projectName || 'LEVANTAMIENTO TOPOGRAFICO');

      let cursorY = drawFieldDataTable(dxf, {
        originX: maxE + tableMargin,
        originY: maxN,
        textH: baseTextH * 0.78,
        projectName: baseTitle,
        crsLabel: state.crsLabel || 'UTM WGS84 ZONA 17N (PANAMA)',
        points,
        metrics,
        closed,
        closureInfo: state.closureInfo || null
      });

      if (hasLots) {
        const tableGap = baseTextH * 4.5;
        for (const lot of state.lotDivision.lots) {
          cursorY -= tableGap;
          const lotMetrics = C.polygonMetrics(lot.points, true);
          cursorY = drawFieldDataTable(dxf, {
            originX: maxE + tableMargin,
            originY: cursorY,
            textH: baseTextH * 0.78,
            projectName: `${state.projectName || 'FINCA'} - ${lot.name.toUpperCase()}`,
            crsLabel: state.crsLabel || 'UTM WGS84 ZONA 17N (PANAMA)',
            points: lot.points,
            metrics: lotMetrics,
            closed: true,
            closureInfo: null
          });
        }
      }
    }
  }

  /**
   * Dibuja la lámina oficial ANATI Panamá (620 x 470 mm) en Paper Space (Space = 1)
   * Replicando la distribución exacta de ejemplo.dxf:
   *  - Marco exterior 620x470 mm, marco interior 600x450 mm (10..610, 10..460)
   *  - Franja inferior y=10..110: Aprobación ANATI / Firma Propietario (10..370), Sello (370..460), Pie de Plano ANATI (460..610)
   *  - Columna derecha x=460..610, y=110..460: DATOS DE CAMPO + DETALLE DE AREAS + NOTAS
   *  - Izquierda x=10..195, y=110..460: LOCALIZACION REGIONAL (arriba) + DETALLE DE AMARRE (abajo) + Norte Cuadrícula
   *  - Ventana principal x=195..460, y=110..460: Dibujo del polígono a escala exacta 1:E + Cuadrícula UTM + Escala Gráfica
   */
  function drawAnatiPaperSpace(dxf, state, options, ctx) {
    const { points, closed, metrics, minE, maxE, minN, maxN, spanE, spanN } = ctx;
    const S = 1; // Paper Space (67 = 1)
    const a = options.anati || {};

    // Escala exacta del plano (ej. 500, 1000, 2000...)
    const autoScale = computeBestScale(spanE, spanN, 245, 315);
    const scaleDenom = (a.scale && Number(a.scale) > 0) ? Number(a.scale) : autoScale;
    const mmPerMeter = 1000 / scaleDenom; // 1 m en terreno = (1000 / E) mm en papel

    // 1. MARCOS DE LÁMINA (620 x 470 mm)
    dxf.addRect('MARCO_Y_LEYENDAS', 0, 0, 620, 470, S);
    dxf.addRect('MARCO_Y_LEYENDAS', 10, 10, 610, 460, S);

    // 2. DIVISIONES PRINCIPALES DEL FORMATO ANATI
    // Línea horizontal superior de la franja inferior (y = 110)
    dxf.addLine('CUADROS', 10, 110, 610, 110, 0, 0, null, S);
    // Separadores verticales de la franja inferior
    dxf.addLine('CUADROS', 370, 10, 370, 110, 0, 0, null, S);
    dxf.addLine('CUADROS', 460, 10, 460, 110, 0, 0, null, S);
    // Separador vertical de la columna derecha (datos de campo / notas)
    dxf.addLine('CUADROS', 460, 110, 460, 460, 0, 0, null, S);

    // 3. FRANJA INFERIOR IZQUIERDA (x=10..370, y=10..110): APROBACIÓN ANATI + FIRMA PROPIETARIO
    dxf.addText('MARCO_Y_LEYENDAS', 'ESPACIO RESERVADO PARA APROBACION ANATI', 135, 98, 2.6, 0, 1, 2, S);
    dxf.addRect('CUADROS', 18, 18, 250, 92, S);

    // Bloque de firma del propietario/adquiriente (x=258..365)
    dxf.addLine('MARCO_Y_LEYENDAS', 268, 40, 360, 40, 0, 0, null, S);
    const propFirma = (a.favorDe || a.propietario || 'PROPIETARIO / ADQUIRIENTE').toUpperCase();
    const cedFirma = a.cedFavorDe || a.cedPropietario || '';
    dxf.addText('MARCO_Y_LEYENDAS', propFirma, 314, 34, 2.3, 0, 1, 2, S);
    if (cedFirma) dxf.addText('MARCO_Y_LEYENDAS', `CED. ${cedFirma}`, 314, 29.5, 2.2, 0, 1, 2, S);
    dxf.addText('MARCO_Y_LEYENDAS', 'PROPIETARIO / ADQUIRIENTE', 314, 24.5, 2.1, 0, 1, 2, S);

    // Bloque central de sellos/revisión (x=370..460, y=10..110)
    dxf.addText('MARCO_Y_LEYENDAS', 'SELLO / REVISION', 415, 98, 2.2, 0, 1, 2, S);

    // 4. PIE DE PLANO / CAJETÍN OFICIAL ANATI (x=460..610, y=10..110)
    // Divisiones horizontales exactas según ejemplo.dxf
    dxf.addLine('MARCO_Y_LEYENDAS', 460, 94.5, 610, 94.5, 0, 0, null, S); // Bajo Provincia/Distrito
    dxf.addLine('MARCO_Y_LEYENDAS', 460, 55.2, 610, 55.2, 0, 0, null, S); // Arriba de AREA
    dxf.addLine('MARCO_Y_LEYENDAS', 460, 50.2, 610, 50.2, 0, 0, null, S); // Bajo AREA
    dxf.addLine('MARCO_Y_LEYENDAS', 536.3, 10, 536.3, 50.2, 0, 0, null, S); // División Profesional | Firma/Sello

    // 4a. Cabecera República de Panamá + Ubicación Política
    dxf.addText('MARCO_Y_LEYENDAS', 'REPUBLICA DE PANAMA', 535, 105.5, 3.8, 0, 1, 2, S);
    dxf.addText('MARCO_Y_LEYENDAS', `Provincia: ${(a.provincia || 'CHIRIQUI').toUpperCase()}`, 463, 100.3, 2.3, 0, 0, 2, S);
    dxf.addText('MARCO_Y_LEYENDAS', `Correg: ${(a.corregimiento || 'DAVID').toUpperCase()}`, 463, 96.3, 2.3, 0, 0, 2, S);
    dxf.addText('MARCO_Y_LEYENDAS', `Distrito: ${(a.distrito || 'DAVID').toUpperCase()}`, 540, 100.3, 2.3, 0, 0, 2, S);
    dxf.addText('MARCO_Y_LEYENDAS', `Lugar: ${(a.lugar || 'DAVID').toUpperCase()}`, 540, 96.3, 2.3, 0, 0, 2, S);

    // 4b. Cuerpo descriptivo (Tipo de plano, Folio Real, Código Ubicación, Propiedad de, A favor de)
    const tipoPlano = (a.tipoPlano || 'LEVANTAMIENTO TOPOGRAFICO').toUpperCase();
    const folioStr = a.folioReal ? ` DEL FOLIO REAL ${a.folioReal}` : '';
    const codUbStr = a.codUbicacion ? `, COD. DE UBICACION ${a.codUbicacion}` : '';
    const descLines = wrapLines(`${tipoPlano}${folioStr}${codUbStr}`, 44);
    let dy = 89.5;
    for (const ln of descLines.slice(0, 3)) {
      dxf.addText('MARCO_Y_LEYENDAS', ln, 535, dy, 2.5, 0, 1, 2, S);
      dy -= 4.2;
    }
    if (a.propietario) {
      const pLine = `PROPIEDAD DE: ${a.propietario.toUpperCase()}${a.cedPropietario ? `, CED. ${a.cedPropietario}` : ''}`;
      for (const ln of wrapLines(pLine, 46).slice(0, 2)) {
        dxf.addText('MARCO_Y_LEYENDAS', ln, 535, dy, 2.2, 0, 1, 2, S);
        dy -= 3.8;
      }
    }
    if (a.favorDe) {
      dxf.addText('MARCO_Y_LEYENDAS', 'A FAVOR DE:', 535, Math.min(dy - 1, 66.5), 2.3, 0, 1, 2, S);
      dxf.addText('MARCO_Y_LEYENDAS', a.favorDe.toUpperCase(), 535, Math.min(dy - 5, 62.5), 2.6, 0, 1, 2, S);
      if (a.cedFavorDe) {
        dxf.addText('MARCO_Y_LEYENDAS', `CED. ${a.cedFavorDe}`, 535, Math.min(dy - 9, 58.2), 2.2, 0, 1, 2, S);
      }
    }

    // 4c. Franja de AREA oficial ANATI
    dxf.addText('MARCO_Y_LEYENDAS', `AREA = ${formatAnatiArea(metrics.areaM2)}`, 535, 52.7, 3.0, 0, 1, 2, S);

    // 4d. Bloque Profesional Idóneo + Escala + Fecha (x=460..536.3)
    const profTitulo = (a.profTitulo || 'ING. CIVIL').toUpperCase();
    const profNombre = (a.profNombre || 'NOMBRE DEL PROFESIONAL').toUpperCase();
    dxf.addText('MARCO_Y_LEYENDAS', `${profTitulo}: ${profNombre}`, 463, 44.5, 2.2, 0, 0, 2, S);
    dxf.addText('MARCO_Y_LEYENDAS', `CEDULA: ${a.profCedula || '---'}`, 463, 37.5, 2.2, 0, 0, 2, S);
    dxf.addText('MARCO_Y_LEYENDAS', `LICENCIA: ${a.profLicencia || '---'}`, 463, 30.5, 2.2, 0, 0, 2, S);
    dxf.addText('MARCO_Y_LEYENDAS', `ESCALA:   1 : ${scaleDenom}`, 463, 23.5, 2.3, 0, 0, 2, S);
    dxf.addText('MARCO_Y_LEYENDAS', `FECHA: ${(a.fecha || 'NOVIEMBRE 2026').toUpperCase()}`, 463, 16.5, 2.3, 0, 0, 2, S);

    // 4e. Bloque Firma / Sello Profesional y REF (x=536.3..610)
    dxf.addLine('MARCO_Y_LEYENDAS', 546, 24, 600, 24, 0, 0, null, S);
    dxf.addText('MARCO_Y_LEYENDAS', 'FIRMA Y SELLO', 573, 20, 2.0, 0, 1, 2, S);
    if (a.ref) {
      dxf.addText('MARCO_Y_LEYENDAS', `REF: ${a.ref}`, 573, 13.5, 1.7, 0, 1, 2, S);
    }

    // 5. COLUMNA DERECHA SUPERIOR (x=460..610, y=110..460): DATOS DE CAMPO + DETALLE AREAS + NOTAS
    let rightY = 454;
    if (options.includeTable) {
      const hasLots = Boolean(state.lotDivision && state.lotDivision.ok && state.lotDivision.lots && state.lotDivision.lots.length > 0);
      rightY = drawAnatiFieldTablePaper(dxf, {
        x0: 465,
        yTop: rightY,
        width: 140,
        title: hasLots ? 'DATOS DE CAMPO - POLIGONO COMPLETO' : 'DATOS DE CAMPO',
        points,
        metrics,
        closed
      }, S);

      if (hasLots) {
        for (const lot of state.lotDivision.lots) {
          if (rightY < 195) break; // Reservar espacio para Notas
          rightY -= 4;
          const lm = C.polygonMetrics(lot.points, true);
          rightY = drawAnatiFieldTablePaper(dxf, {
            x0: 465,
            yTop: rightY,
            width: 140,
            title: `DATOS DE CAMPO - ${lot.name.toUpperCase()}`,
            points: lot.points,
            metrics: lm,
            closed: true
          }, S);
        }
      }
    }

    // 5b. DETALLE DE AREAS (si se ingresó Área Inscrita o si hay lotes)
    const inscritaM2 = parseFloat(a.areaInscrita);
    if (Number.isFinite(inscritaM2) && inscritaM2 > 0) {
      const detY = Math.min(rightY - 6, 248);
      dxf.addText('MARCO_Y_LEYENDAS', 'DETALLE DE AREAS:', 466, detY, 2.6, 0, 0, 2, S);
      dxf.addLine('MARCO_Y_LEYENDAS', 466, detY - 2, 512, detY - 2, 0, 0, null, S);
      const folioTag = a.folioReal ? ` FOLIO REAL ${a.folioReal}` : '';
      const restoM2 = Math.max(0, inscritaM2 - metrics.areaM2);
      dxf.addText('MARCO_Y_LEYENDAS', `AREA INSCRITA${folioTag}: ${formatAnatiArea(inscritaM2)}`, 466, detY - 7, 2.0, 0, 0, 2, S);
      dxf.addText('MARCO_Y_LEYENDAS', `AREA MEDIDA / SEGREGAR: ${formatAnatiArea(metrics.areaM2)}`, 466, detY - 12, 2.0, 0, 0, 2, S);
      dxf.addText('MARCO_Y_LEYENDAS', `RESTO LIBRE ESTIMADO: ${formatAnatiArea(restoM2)}`, 466, detY - 17, 2.1, 0, 0, 2, S);
    }

    // 5c. NOTAS TÉCNICAS ANATI (x=465..606, y=115..205)
    let ny = 198;
    dxf.addText('MARCO_Y_LEYENDAS', 'NOTAS:', 466, ny, 2.6, 0, 0, 2, S);
    dxf.addLine('MARCO_Y_LEYENDAS', 466, ny - 2, 483, ny - 2, 0, 0, null, S);
    ny -= 6.5;

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
      for (const ln of wrapLines(item, 56)) {
        if (ny < 114) break;
        dxf.addText('MARCO_Y_LEYENDAS', ln, 466, ny, 2.0, 0, 0, 2, S);
        ny -= 4.2;
      }
      ny -= 1.0;
    }

    // 6. CUADROS LATERALES IZQUIERDOS (x=15..190, y=115..455): LOCALIZACION REGIONAL + DETALLE DE AMARRE
    // 6a. Localización Regional (x=15..130, y=350..454)
    dxf.addRect('CUADROS', 15, 350, 130, 454, S);
    dxf.addText('MARCO_Y_LEYENDAS', `LOCALIZACION REGIONAL - HOJA ${(a.hojaIgn || 'IGN PANAMA').toUpperCase()}`, 72.5, 344, 2.5, 0, 1, 2, S);
    dxf.addText('MARCO_Y_LEYENDAS', 'ESCALA 1:40,000', 72.5, 339.5, 2.3, 0, 1, 2, S);
    // Cruces esquemáticas y punto GLOBO MEDIDO en Localización Regional
    const cE = (minE + maxE) / 2, cN = (minN + maxN) / 2;
    dxf.addLine('TOPO_CUADRICULA', 15, 402, 130, 402, 0, 0, null, S);
    dxf.addLine('TOPO_CUADRICULA', 72.5, 350, 72.5, 454, 0, 0, null, S);
    dxf.addCircle('TOPO_PUNTOS', 72.5, 402, 2.2, 0, S);
    dxf.addRect('MARCO_Y_LEYENDAS', 77, 407, 112, 416, S);
    dxf.addText('MARCO_Y_LEYENDAS', 'GLOBO MEDIDO', 94.5, 411.5, 2.1, 0, 1, 2, S);
    dxf.addLine('MARCO_Y_LEYENDAS', 72.5, 402, 77, 407, 0, 0, null, S);
    dxf.addText('TOPO_CUADRICULA', `E:${cE.toFixed(0)}`, 72.5, 353, 1.8, 0, 1, 2, S);
    dxf.addText('TOPO_CUADRICULA', `N:${cN.toFixed(0)}`, 128, 404.5, 1.8, 0, 2, 2, S);

    // 6b. Flecha Norte de Cuadrícula (x=156, y=385)
    drawNorthArrowPaper(dxf, 160, 395, 16, S);

    // 6c. Detalle de Amarre / Localización General (x=15..185, y=132..292)
    dxf.addRect('CUADROS', 15, 132, 185, 292, S);
    dxf.addText('MARCO_Y_LEYENDAS', 'DETALLE DE AMARRE', 100, 125, 2.6, 0, 1, 2, S);
    dxf.addText('MARCO_Y_LEYENDAS', 'ESCALA 1:15,000', 100, 120.5, 2.3, 0, 1, 2, S);
    dxf.addLine('TOPO_CUADRICULA', 15, 212, 185, 212, 0, 0, null, S);
    dxf.addLine('TOPO_CUADRICULA', 100, 132, 100, 292, 0, 0, null, S);
    dxf.addCircle('TOPO_PUNTOS', 100, 212, 2.5, 0, S);
    dxf.addText('MARCO_Y_LEYENDAS', 'GLOBO MEDIDO', 106, 219, 2.3, 0, 0, 2, S);
    dxf.addText('TOPO_CUADRICULA', `P1: E ${points[0].e.toFixed(2)}  N ${points[0].n.toFixed(2)}`, 100, 137, 2.0, 0, 1, 2, S);

    // 7. VENTANA PRINCIPAL DE DIBUJO A ESCALA EXACTA 1:E (x=195..454, y=118..452)
    const winX1 = 195, winY1 = 128, winX2 = 454, winY2 = 452;
    const winCx = (winX1 + winX2) / 2;
    const winCy = (winY1 + winY2) / 2;
    const midWorldE = (minE + maxE) / 2;
    const midWorldN = (minN + maxN) / 2;

    const toPaper = (e, n) => ({
      e: winCx + (e - midWorldE) * mmPerMeter,
      n: winCy + (n - midWorldN) * mmPerMeter,
      z: 0
    });

    // Cuadrícula UTM en la ventana principal
    if (options.includeGrid) {
      const niceStep = getNiceGridStep(Math.max(spanE, spanN));
      const halfWorldW = (winX2 - winX1) / (2 * mmPerMeter);
      const halfWorldH = (winY2 - winY1) / (2 * mmPerMeter);
      const gStartE = Math.ceil((midWorldE - halfWorldW + niceStep * 0.15) / niceStep) * niceStep;
      const gEndE = Math.floor((midWorldE + halfWorldW - niceStep * 0.15) / niceStep) * niceStep;
      const gStartN = Math.ceil((midWorldN - halfWorldH + niceStep * 0.15) / niceStep) * niceStep;
      const gEndN = Math.floor((midWorldN + halfWorldH - niceStep * 0.15) / niceStep) * niceStep;

      for (let gx = gStartE; gx <= gEndE + 1e-6; gx += niceStep) {
        const px = winCx + (gx - midWorldE) * mmPerMeter;
        dxf.addText('TOPO_CUADRICULA', `E ${gx.toFixed(0)}`, px, winY1 + 2.5, 1.8, 0, 1, 2, S);
        for (let gy = gStartN; gy <= gEndN + 1e-6; gy += niceStep) {
          const py = winCy + (gy - midWorldN) * mmPerMeter;
          dxf.addLine('TOPO_CUADRICULA', px - 2.2, py, px + 2.2, py, 0, 0, null, S);
          dxf.addLine('TOPO_CUADRICULA', px, py - 2.2, px, py + 2.2, 0, 0, null, S);
        }
      }
      for (let gy = gStartN; gy <= gEndN + 1e-6; gy += niceStep) {
        const py = winCy + (gy - midWorldN) * mmPerMeter;
        dxf.addText('TOPO_CUADRICULA', `N ${gy.toFixed(0)}`, winX1 + 2, py, 1.8, 0, 0, 2, S);
      }
    }

    // Polígono escalado exacto en Paper Space
    const paperPts = points.map(p => ({ ...p, ...toPaper(p.e, p.n) }));
    if (options.includePolygon && paperPts.length >= 2) {
      dxf.addPolyline('PLANO_ESCALA', paperPts, closed, S);
    }

    // Vértices e IDs en Paper Space
    if (options.includePoints) {
      for (const p of paperPts) {
        dxf.addCircle('TOPO_PUNTOS', p.e, p.n, 1.3, 0, S);
        dxf.addText('TOPO_NUM_PUNTO', p.id, p.e + 2.2, p.n + 2.0, 2.4, 0, 0, 0, S);
      }
    }

    // Rumbos y Distancias sobre cada lado en Paper Space
    if (options.includeBearings && metrics.legs.length > 0) {
      for (const leg of metrics.legs) {
        const pa = toPaper(leg.from.e, leg.from.n);
        const pb = toPaper(leg.to.e, leg.to.n);
        const mx = (pa.e + pb.e) / 2;
        const my = (pa.n + pb.n) / 2;
        let ang = Math.atan2(pb.n - pa.n, pb.e - pa.e) * (180 / Math.PI);
        if (ang > 90) ang -= 180;
        if (ang < -90) ang += 180;
        const rad = ang * (Math.PI / 180);
        const nx = -Math.sin(rad), ny = Math.cos(rad);
        dxf.addText('TOPO_RUMBOS_DIST', leg.bearing, mx + nx * 2.2, my + ny * 2.2, 1.9, ang, 1, 2, S);
        dxf.addText('TOPO_RUMBOS_DIST', `${leg.dist.toFixed(2)} m`, mx - nx * 2.2, my - ny * 2.2, 1.9, ang, 1, 2, S);
      }
    }

    // División de lotes en Paper Space
    if (state.lotDivision && state.lotDivision.ok) {
      for (const cp of state.lotDivision.cutPoints || []) {
        const pp = toPaper(cp.e, cp.n);
        dxf.addCircle('TOPO_LOTES', pp.e, pp.n, 1.1, 0, S);
        dxf.addText('TOPO_LOTES', cp.id, pp.e + 2.0, pp.n + 1.8, 2.0, 0, 0, 0, S);
      }
      for (const cl of state.lotDivision.cutLines || []) {
        const pa = toPaper(cl.from.e, cl.from.n);
        const pb = toPaper(cl.to.e, cl.to.n);
        dxf.addLine('TOPO_LOTES', pa.e, pa.n, pb.e, pb.n, 0, 0, null, S);
      }
      for (const lot of state.lotDivision.lots || []) {
        if (lot.centroid) {
          const pc = toPaper(lot.centroid.e, lot.centroid.n);
          dxf.addText('TOPO_LOTES', lot.name.toUpperCase(), pc.e, pc.n + 2.0, 2.3, 0, 1, 2, S);
          dxf.addText('TOPO_LOTES', formatAnatiArea(lot.areaM2), pc.e, pc.n - 2.0, 1.9, 0, 1, 2, S);
        }
      }
    } else if (options.includeAreaLabel && closed && metrics.centroid && metrics.areaM2 > 0) {
      const pc = toPaper(metrics.centroid.e, metrics.centroid.n);
      dxf.addText('TOPO_AREA_CENTRO', `AREA = ${formatAnatiArea(metrics.areaM2)}`, pc.e, pc.n + 2.2, 2.7, 0, 1, 2, S);
      dxf.addText('TOPO_AREA_CENTRO', `PERIMETRO: ${metrics.perimeter.toFixed(2)} ml`, pc.e, pc.n - 2.2, 2.1, 0, 1, 2, S);
    }

    // Escala Gráfica debajo del dibujo principal (y = 117)
    drawGraphicScalePaper(dxf, winCx - 35, 117, scaleDenom, S);
  }

  /** Tabla DATOS DE CAMPO con el formato exacto ANATI (VERTICE | ESTACION | DIST. | RUMBO | ESTE | NORTE) */
  function drawAnatiFieldTablePaper(dxf, cfg, space = 1) {
    const x0 = cfg.x0;
    const W = cfg.width; // 140 mm
    const th = 2.0;
    const rowH = 5.4;
    const cols = [
      { header: 'VERTICE', w: 16, align: 1 },
      { header: 'ESTACION', w: 20, align: 1 },
      { header: 'DIST.', w: 16, align: 2 },
      { header: 'RUMBO', w: 32, align: 1 },
      { header: 'ESTE', w: 28, align: 2 },
      { header: 'NORTE', w: 28, align: 2 }
    ];

    let y = cfg.yTop;
    // Título
    dxf.addRect('DATOS_DE_CAMPO', x0, y - 6, x0 + W, y, space);
    dxf.addText('DATOS_DE_CAMPO', cfg.title, x0 + W / 2, y - 3, 2.3, 0, 1, 2, space);
    y -= 6;

    // Encabezados
    dxf.addRect('DATOS_DE_CAMPO', x0, y - rowH, x0 + W, y, space);
    let cx = x0;
    for (let i = 0; i < cols.length; i++) {
      if (i > 0) dxf.addLine('DATOS_DE_CAMPO', cx, y, cx, y - rowH, 0, 0, null, space);
      dxf.addText('DATOS_DE_CAMPO', cols[i].header, cx + cols[i].w / 2, y - rowH / 2, th, 0, 1, 2, space);
      cx += cols[i].w;
    }
    y -= rowH;

    // Filas
    const bodyTop = y;
    const legs = cfg.metrics.legs || [];
    for (const leg of legs) {
      const r = [
        leg.fromId,
        `${leg.fromId} - ${leg.toId}`,
        leg.dist.toFixed(2),
        C.azimuthToBearing(leg.azimuth, 0).text,
        leg.from.e.toFixed(3),
        leg.from.n.toFixed(3)
      ];
      dxf.addLine('DATOS_DE_CAMPO', x0, y - rowH, x0 + W, y - rowH, 0, 0, null, space);
      let rx = x0;
      for (let i = 0; i < cols.length; i++) {
        const col = cols[i];
        const tx = col.align === 2 ? (rx + col.w - 1.5) : (rx + col.w / 2);
        dxf.addText('DATOS_DE_CAMPO', r[i], tx, y - rowH / 2, th, 0, col.align, 2, space);
        rx += col.w;
      }
      y -= rowH;
    }

    // Divisores verticales del cuerpo
    cx = x0;
    for (let i = 0; i <= cols.length; i++) {
      dxf.addLine('DATOS_DE_CAMPO', cx, bodyTop, cx, y, 0, 0, null, space);
      if (i < cols.length) cx += cols[i].w;
    }

    // Pie oficial ANATI: Area y Perimetro (ml)
    dxf.addRect('DATOS_DE_CAMPO', x0, y - rowH, x0 + W, y, space);
    dxf.addText('DATOS_DE_CAMPO', `Area: ${formatAnatiArea(cfg.metrics.areaM2)}`, x0 + W / 2, y - rowH / 2, 2.1, 0, 1, 2, space);
    y -= rowH;

    dxf.addRect('DATOS_DE_CAMPO', x0, y - rowH, x0 + W, y, space);
    dxf.addText('DATOS_DE_CAMPO', `Perimetro: ${cfg.metrics.perimeter.toFixed(2)} ml`, x0 + W / 2, y - rowH / 2, 2.1, 0, 1, 2, space);
    y -= rowH;

    return y;
  }

  function drawNorthArrowPaper(dxf, cx, cy, size, space = 1) {
    dxf.addCircle('TOPO_NORTE', cx, cy, size * 0.48, 0, space);
    dxf.addLine('TOPO_NORTE', cx, cy - size * 0.8, cx, cy + size, 0, 0, null, space);
    dxf.addLine('TOPO_NORTE', cx - size * 0.65, cy, cx + size * 0.65, cy, 0, 0, null, space);
    dxf.addLine('TOPO_NORTE', cx, cy + size, cx - size * 0.25, cy + size * 0.35, 0, 0, null, space);
    dxf.addLine('TOPO_NORTE', cx, cy + size, cx + size * 0.25, cy + size * 0.35, 0, 0, null, space);
    dxf.addText('TOPO_NORTE', 'N', cx, cy + size + 3.2, 3.2, 0, 1, 2, space);
    dxf.addText('TOPO_NORTE', 'CUADRICULA', cx, cy - size * 0.8 - 3.2, 1.7, 0, 1, 2, space);
  }

  function drawGraphicScalePaper(dxf, x0, y0, scaleDenom, space = 1) {
    // Barra de 60 mm dividida en 4 segmentos de 15 mm
    const segW = 15;
    const h = 2.2;
    const metersPerSeg = (segW * scaleDenom) / 1000;
    dxf.addRect('MARCO_Y_LEYENDAS', x0, y0, x0 + segW * 4, y0 + h, space);
    for (let i = 0; i <= 4; i++) {
      const gx = x0 + i * segW;
      if (i > 0 && i < 4) dxf.addLine('MARCO_Y_LEYENDAS', gx, y0, gx, y0 + h, 0, 0, null, space);
      const val = i * metersPerSeg;
      const lbl = Number.isInteger(val) ? String(val) : val.toFixed(1);
      dxf.addText('MARCO_Y_LEYENDAS', i === 4 ? `${lbl} m` : lbl, gx, y0 + h + 2.2, 1.8, 0, 1, 2, space);
    }
    dxf.addText('MARCO_Y_LEYENDAS', `ESCALA GRAFICA 1:${scaleDenom}`, x0 + segW * 2, y0 - 2.6, 1.9, 0, 1, 2, space);
  }

  /**
   * Cuadro de Datos de Campo genérico en Model Space (para modo Simple)
   */
  function drawFieldDataTable(dxf, cfg) {
    const th = cfg.textH;
    const rowH = th * 2.3;
    const titleH = th * 3.0;
    const subH = th * 2.2;

    const cols = [
      { header: 'EST', width: th * 5.5, align: 1 },
      { header: 'P.V.', width: th * 5.5, align: 1 },
      { header: 'RUMBO', width: th * 15.5, align: 1 },
      { header: 'AZIMUT', width: th * 11.5, align: 1 },
      { header: 'DIST (m)', width: th * 9.5, align: 2 },
      { header: 'NORTE (Y)', width: th * 12.5, align: 2 },
      { header: 'ESTE (X)', width: th * 12.5, align: 2 },
      { header: 'COTA (Z)', width: th * 8.5, align: 2 }
    ];

    const totalW = cols.reduce((s, c) => s + c.width, 0);
    const x0 = cfg.originX;
    let y = cfg.originY;

    dxf.addRect('TOPO_CUADRO_DATOS', x0, y - titleH, x0 + totalW, y);
    dxf.addText('TOPO_CUADRO_TEXTO', `CUADRO DE DATOS DE CAMPO - ${cfg.projectName.toUpperCase()}`, x0 + totalW / 2, y - titleH / 2, th * 1.15, 0, 1, 2);
    y -= titleH;

    dxf.addRect('TOPO_CUADRO_DATOS', x0, y - subH, x0 + totalW, y);
    dxf.addText('TOPO_CUADRO_TEXTO', `SISTEMA: ${cfg.crsLabel}   |   TOPOGRAFIA.COM.PA`, x0 + totalW / 2, y - subH / 2, th * 0.85, 0, 1, 2);
    y -= subH;

    const headerTop = y;
    const headerBot = y - rowH;
    dxf.addRect('TOPO_CUADRO_DATOS', x0, headerBot, x0 + totalW, headerTop);

    let cx = x0;
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];
      if (i > 0) dxf.addLine('TOPO_CUADRO_DATOS', cx, headerTop, cx, headerBot);
      dxf.addText('TOPO_CUADRO_TEXTO', col.header, cx + col.width / 2, headerTop - rowH / 2, th * 0.9, 0, 1, 2);
      cx += col.width;
    }
    y = headerBot;

    const rows = [];
    if (cfg.metrics.legs.length > 0) {
      for (const leg of cfg.metrics.legs) {
        rows.push([
          leg.fromId, leg.toId, leg.bearing, leg.azimuthText,
          leg.dist.toFixed(3), leg.from.n.toFixed(3), leg.from.e.toFixed(3), (Number(leg.from.z) || 0).toFixed(2)
        ]);
      }
      if (!cfg.closed) {
        const last = cfg.points[cfg.points.length - 1];
        rows.push([last.id, '-', 'FIN TRAZO', '-', '-', last.n.toFixed(3), last.e.toFixed(3), (Number(last.z) || 0).toFixed(2)]);
      }
    } else {
      for (const p of cfg.points) {
        rows.push([p.id, '-', '-', '-', '-', p.n.toFixed(3), p.e.toFixed(3), (Number(p.z) || 0).toFixed(2)]);
      }
    }

    const bodyTop = y;
    for (const r of rows) {
      const rowBot = y - rowH;
      dxf.addLine('TOPO_CUADRO_DATOS', x0, rowBot, x0 + totalW, rowBot);
      let rx = x0;
      for (let i = 0; i < cols.length; i++) {
        const col = cols[i];
        let tx = rx + col.width / 2;
        if (col.align === 2) tx = rx + col.width - th * 0.7;
        else if (col.align === 0) tx = rx + th * 0.7;
        dxf.addText('TOPO_CUADRO_TEXTO', r[i], tx, y - rowH / 2, th * 0.85, 0, col.align, 2);
        rx += col.width;
      }
      y = rowBot;
    }

    cx = x0;
    for (let i = 0; i <= cols.length; i++) {
      dxf.addLine('TOPO_CUADRO_DATOS', cx, bodyTop, cx, y);
      if (i < cols.length) cx += cols[i].width;
    }

    const footH = rowH * 1.25;
    dxf.addRect('TOPO_CUADRO_DATOS', x0, y - footH, x0 + totalW, y);
    const summaryText = cfg.closed
      ? `AREA: ${formatAnatiArea(cfg.metrics.areaM2)}   |   PERIMETRO: ${cfg.metrics.perimeter.toFixed(3)} m   |   VERTICES: ${cfg.points.length}`
      : `LONGITUD TOTAL: ${cfg.metrics.perimeter.toFixed(3)} m   |   PUNTOS: ${cfg.points.length} (POLIGONAL ABIERTA)`;
    dxf.addText('TOPO_CUADRO_TEXTO', summaryText, x0 + totalW / 2, y - footH / 2, th * 0.9, 0, 1, 2);
    y -= footH;

    if (cfg.closureInfo) {
      dxf.addRect('TOPO_CUADRO_DATOS', x0, y - rowH, x0 + totalW, y);
      dxf.addText('TOPO_CUADRO_TEXTO', `CIERRE LINEAL: ${cfg.closureInfo.errLinear.toFixed(4)} m  (dE=${cfg.closureInfo.errE.toFixed(4)}, dN=${cfg.closureInfo.errN.toFixed(4)})  |  PRECISION: ${cfg.closureInfo.precisionText}`, x0 + totalW / 2, y - rowH / 2, th * 0.82, 0, 1, 2);
      y -= rowH;
    }

    return y;
  }

  global.TopoDXF = {
    generateDXF,
    formatAnatiArea,
    computeBestScale
  };
})(window);
