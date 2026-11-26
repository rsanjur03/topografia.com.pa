/**
 * dxf.js — Generador DXF estándar (AutoCAD R12 / AC1009)
 * Compatible con AutoCAD, Civil 3D, QGIS, BricsCAD, LibreCAD y Global Mapper.
 * Incluye capas ordenadas, rumbos/distancias rotados, símbolos de vértices,
 * área en centroide, flecha norte, cuadrícula UTM y Cuadro de Datos de Campo vectorial.
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
      .replace(/°/g, '%%d')   // Código nativo de AutoCAD para símbolo de grados (°)
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

  /** Helper para construir pares código-valor DXF */
  class DxfBuilder {
    constructor() {
      this.lines = [];
    }

    pair(code, value) {
      this.lines.push(String(code), String(value));
    }

    addLine(layer, x1, y1, x2, y2, z1 = 0, z2 = 0, color = null) {
      this.pair(0, 'LINE');
      this.pair(8, layer);
      if (color !== null) this.pair(62, color);
      this.pair(10, num(x1));
      this.pair(20, num(y1));
      this.pair(30, num(z1));
      this.pair(11, num(x2));
      this.pair(21, num(y2));
      this.pair(31, num(z2));
    }

    addPoint(layer, x, y, z = 0) {
      this.pair(0, 'POINT');
      this.pair(8, layer);
      this.pair(10, num(x));
      this.pair(20, num(y));
      this.pair(30, num(z));
    }

    addCircle(layer, cx, cy, r, z = 0) {
      this.pair(0, 'CIRCLE');
      this.pair(8, layer);
      this.pair(10, num(cx));
      this.pair(20, num(cy));
      this.pair(30, num(z));
      this.pair(40, num(r));
    }

    addPolyline(layer, pts, closed = false) {
      if (!pts || pts.length < 2) return;
      this.pair(0, 'POLYLINE');
      this.pair(8, layer);
      this.pair(66, 1);
      this.pair(10, '0.0');
      this.pair(20, '0.0');
      this.pair(30, '0.0');
      this.pair(70, closed ? 1 : 0);
      for (const p of pts) {
        this.pair(0, 'VERTEX');
        this.pair(8, layer);
        this.pair(10, num(p.e));
        this.pair(20, num(p.n));
        this.pair(30, num(p.z || 0));
      }
      this.pair(0, 'SEQEND');
      this.pair(8, layer);
    }

    /**
     * hAlign: 0=Left, 1=Center, 2=Right
     * vAlign: 0=Baseline, 1=Bottom, 2=Middle, 3=Top
     */
    addText(layer, text, x, y, height, rotationDeg = 0, hAlign = 0, vAlign = 0) {
      this.pair(0, 'TEXT');
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

    addRect(layer, x1, y1, x2, y2) {
      this.addLine(layer, x1, y1, x2, y1);
      this.addLine(layer, x2, y1, x2, y2);
      this.addLine(layer, x2, y2, x1, y2);
      this.addLine(layer, x1, y2, x1, y1);
    }

    toString() {
      return this.lines.join('\r\n') + '\r\n';
    }
  }

  /**
   * Genera el contenido completo del archivo DXF.
   * @param {Object} state - Estado del proyecto { projectName, crsLabel, points, closed, curves, auxLines }
   * @param {Object} opts - Opciones de exportación
   */
  function generateDXF(state, opts = {}) {
    const options = {
      includePolygon: true,
      includePoints: true,
      includeBearings: true,
      includeAreaLabel: true,
      includeTable: true,
      includeNorthArrow: true,
      includeGrid: false,
      textScale: 1.0,
      ...opts
    };

    const points = state.points || [];
    if (points.length === 0) {
      throw new Error('No hay puntos para exportar al DXF.');
    }

    const closed = Boolean(state.closed) && points.length >= 3;
    const metrics = C.polygonMetrics(points, closed);

    // Calcular Bounding Box del levantamiento
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

    // Altura base de texto proporcional a la extensión del terreno
    const baseTextH = Math.max(0.25, maxSpan * 0.018) * (Number(options.textScale) || 1.0);
    const markerR = baseTextH * 0.45;

    // Extensión total considerando cuadro de datos a la derecha
    const tableMargin = maxSpan * 0.14 + baseTextH * 4;
    const tableWidth = baseTextH * 68;
    const extMinE = minE - maxSpan * 0.12;
    const extMinN = minN - maxSpan * 0.12;
    const extMaxE = options.includeTable ? (maxE + tableMargin + tableWidth + maxSpan * 0.08) : (maxE + maxSpan * 0.12);
    const extMaxN = maxN + maxSpan * 0.15;

    const dxf = new DxfBuilder();

    // ==================== HEADER ====================
    dxf.pair(0, 'SECTION');
    dxf.pair(2, 'HEADER');
    dxf.pair(9, '$ACADVER'); dxf.pair(1, 'AC1009'); // AutoCAD R12 universal
    dxf.pair(9, '$INSUNITS'); dxf.pair(70, 6);       // 6 = Metros
    dxf.pair(9, '$MEASUREMENT'); dxf.pair(70, 1);    // 1 = Métrico
    dxf.pair(9, '$EXTMIN');
    dxf.pair(10, num(extMinE)); dxf.pair(20, num(extMinN)); dxf.pair(30, '0.0');
    dxf.pair(9, '$EXTMAX');
    dxf.pair(10, num(extMaxE)); dxf.pair(20, num(extMaxN)); dxf.pair(30, '0.0');
    dxf.pair(9, '$PDMODE'); dxf.pair(70, 34);        // Símbolo de punto topográfico (círculo + cruz)
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

    // LAYER Table
    const layers = [
      { name: '0', color: 7, ltype: 'CONTINUOUS' },
      { name: 'TOPO_POLIGONAL', color: 3, ltype: 'CONTINUOUS' },     // Verde
      { name: 'TOPO_PUNTOS', color: 1, ltype: 'CONTINUOUS' },        // Rojo
      { name: 'TOPO_NUM_PUNTO', color: 7, ltype: 'CONTINUOUS' },     // Blanco/Negro
      { name: 'TOPO_RUMBOS_DIST', color: 4, ltype: 'CONTINUOUS' },   // Cian
      { name: 'TOPO_AREA_CENTRO', color: 2, ltype: 'CONTINUOUS' },   // Amarillo
      { name: 'TOPO_CURVAS', color: 6, ltype: 'CONTINUOUS' },        // Magenta
      { name: 'TOPO_LOTES', color: 5, ltype: 'DASHED' },             // Azul (Subdivision de lotes)
      { name: 'TOPO_COGO_AUX', color: 8, ltype: 'DASHED' },          // Gris
      { name: 'TOPO_CUADRO_DATOS', color: 7, ltype: 'CONTINUOUS' },  // Blanco/Negro
      { name: 'TOPO_CUADRO_TEXTO', color: 2, ltype: 'CONTINUOUS' },  // Amarillo
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

    // ==================== ENTITIES ====================
    dxf.pair(0, 'SECTION');
    dxf.pair(2, 'ENTITIES');

    // 1. Cuadrícula de coordenadas UTM opcional
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
          // Cruces de cuadrícula
          dxf.addLine('TOPO_CUADRICULA', gx - tick, gy, gx + tick, gy);
          dxf.addLine('TOPO_CUADRICULA', gx, gy - tick, gx, gy + tick);
        }
      }
      for (let gy = startN; gy <= endN + 1e-6; gy += niceStep) {
        dxf.addText('TOPO_CUADRICULA', `N ${gy.toFixed(0)}`, startE - baseTextH * 1.2, gy, baseTextH * 0.65, 0, 2, 2);
      }
    }

    // 2. Poligonal (Polyline + segmentos)
    if (options.includePolygon && points.length >= 2) {
      dxf.addPolyline('TOPO_POLIGONAL', points, closed);
    }

    // 3. Puntos, símbolos de vértice y etiquetas
    if (options.includePoints) {
      for (const p of points) {
        dxf.addPoint('TOPO_PUNTOS', p.e, p.n, p.z || 0);
        dxf.addCircle('TOPO_PUNTOS', p.e, p.n, markerR, p.z || 0);
        dxf.addText(
          'TOPO_NUM_PUNTO',
          p.id,
          p.e + markerR * 1.6,
          p.n + markerR * 1.4,
          baseTextH * 0.9,
          0, 0, 0
        );
        if (p.desc) {
          dxf.addText(
            'TOPO_NUM_PUNTO',
            p.desc,
            p.e + markerR * 1.6,
            p.n - markerR * 1.6,
            baseTextH * 0.55,
            0, 0, 3
          );
        }
      }
    }

    // 4. Rumbos y Distancias rotados a lo largo de cada lado
    if (options.includeBearings && metrics.legs.length > 0) {
      const legTextH = baseTextH * 0.72;
      for (const leg of metrics.legs) {
        if (leg.dist < 1e-4) continue;
        const midE = (leg.from.e + leg.to.e) / 2;
        const midN = (leg.from.n + leg.to.n) / 2;

        // Ángulo CAD (0° = Este, antihorario)
        let cadAngle = Math.atan2(leg.dN, leg.dE) * (180 / Math.PI);
        // Mantener texto legible de izquierda a derecha (no de cabeza)
        if (cadAngle > 90) cadAngle -= 180;
        if (cadAngle < -90) cadAngle += 180;

        const rad = cadAngle * (Math.PI / 180);
        // Vector perpendicular hacia "arriba" del texto
        const nx = -Math.sin(rad);
        const ny = Math.cos(rad);
        const off = legTextH * 0.85;

        dxf.addText(
          'TOPO_RUMBOS_DIST',
          leg.bearing,
          midE + nx * off,
          midN + ny * off,
          legTextH,
          cadAngle, 1, 2
        );
        dxf.addText(
          'TOPO_RUMBOS_DIST',
          `${leg.dist.toFixed(2)} m`,
          midE - nx * off,
          midN - ny * off,
          legTextH,
          cadAngle, 1, 2
        );
      }
    }

    // 5. Curvas horizontales y líneas auxiliares COGO
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

    // 5b. División en Lotes (líneas de corte + etiquetas de lote)
    if (state.lotDivision && state.lotDivision.ok) {
      for (const cl of state.lotDivision.cutLines || []) {
        if (cl.from && cl.to) {
          dxf.addLine('TOPO_LOTES', cl.from.e, cl.from.n, cl.to.e, cl.to.n);
          const mx = (cl.from.e + cl.to.e) / 2;
          const my = (cl.from.n + cl.to.n) / 2;
          dxf.addText('TOPO_LOTES', `${cl.bearing} (${cl.dist.toFixed(2)}m)`, mx, my, baseTextH * 0.65, 0, 1, 2);
        }
      }
      for (const lot of state.lotDivision.lots || []) {
        if (lot.centroid) {
          dxf.addText('TOPO_LOTES', `${lot.name.toUpperCase()}`, lot.centroid.e, lot.centroid.n + baseTextH * 0.55, baseTextH * 0.85, 0, 1, 2);
          dxf.addText('TOPO_LOTES', `${lot.areaM2.toFixed(2)} m2`, lot.centroid.e, lot.centroid.n - baseTextH * 0.55, baseTextH * 0.72, 0, 1, 2);
        }
      }
    }

    // 6. Etiqueta de Área y Perímetro en el centroide
    if (options.includeAreaLabel && closed && metrics.centroid && metrics.areaM2 > 0) {
      const c = metrics.centroid;
      dxf.addText('TOPO_AREA_CENTRO', `AREA: ${metrics.areaM2.toFixed(2)} m2`, c.e, c.n + baseTextH * 1.1, baseTextH * 1.0, 0, 1, 2);
      dxf.addText('TOPO_AREA_CENTRO', `(${metrics.areaHa.toFixed(4)} ha)`, c.e, c.n - baseTextH * 0.2, baseTextH * 0.85, 0, 1, 2);
      dxf.addText('TOPO_AREA_CENTRO', `PERIMETRO: ${metrics.perimeter.toFixed(2)} m`, c.e, c.n - baseTextH * 1.4, baseTextH * 0.72, 0, 1, 2);
    }

    // 7. Flecha Norte vectorial
    if (options.includeNorthArrow) {
      const nx = maxE + tableMargin * 0.42;
      const ny = maxN - baseTextH * 2;
      const r = baseTextH * 2.2;
      dxf.addCircle('TOPO_NORTE', nx, ny, r * 0.65);
      dxf.addLine('TOPO_NORTE', nx, ny - r, nx, ny + r * 1.3);
      dxf.addLine('TOPO_NORTE', nx - r * 0.85, ny, nx + r * 0.85, ny);
      dxf.addLine('TOPO_NORTE', nx, ny + r * 1.3, nx - r * 0.35, ny + r * 0.45);
      dxf.addLine('TOPO_NORTE', nx, ny + r * 1.3, nx + r * 0.35, ny + r * 0.45);
      dxf.addText('TOPO_NORTE', 'N', nx, ny + r * 1.75, baseTextH * 1.1, 0, 1, 2);
    }

    // 8. CUADRO DE DATOS DE CAMPO / CUADRO DE CONSTRUCCIÓN (Vectorial)
    if (options.includeTable) {
      drawFieldDataTable(dxf, {
        originX: maxE + tableMargin,
        originY: maxN,
        textH: baseTextH * 0.78,
        projectName: state.projectName || 'LEVANTAMIENTO TOPOGRAFICO',
        crsLabel: state.crsLabel || 'UTM WGS84 ZONA 17N (PANAMA)',
        points,
        metrics,
        closed,
        closureInfo: state.closureInfo || null
      });
    }

    dxf.pair(0, 'ENDSEC');
    dxf.pair(0, 'EOF');

    return dxf.toString();
  }

  /**
   * Dibuja el Cuadro de Datos de Campo completo con líneas y textos alineados en DXF
   */
  function drawFieldDataTable(dxf, cfg) {
    const th = cfg.textH;
    const rowH = th * 2.3;
    const titleH = th * 3.0;
    const subH = th * 2.2;

    // Definición de columnas (ancho proporcional a altura de texto)
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

    // Título principal
    dxf.addRect('TOPO_CUADRO_DATOS', x0, y - titleH, x0 + totalW, y);
    dxf.addText(
      'TOPO_CUADRO_TEXTO',
      `CUADRO DE DATOS DE CAMPO - ${cfg.projectName.toUpperCase()}`,
      x0 + totalW / 2,
      y - titleH / 2,
      th * 1.15,
      0, 1, 2
    );
    y -= titleH;

    // Subtítulo (Sistema de coordenadas + dominio)
    dxf.addRect('TOPO_CUADRO_DATOS', x0, y - subH, x0 + totalW, y);
    dxf.addText(
      'TOPO_CUADRO_TEXTO',
      `SISTEMA: ${cfg.crsLabel}   |   TOPOGRAFIA.COM.PA`,
      x0 + totalW / 2,
      y - subH / 2,
      th * 0.85,
      0, 1, 2
    );
    y -= subH;

    // Encabezado de columnas
    const headerTop = y;
    const headerBot = y - rowH;
    dxf.addRect('TOPO_CUADRO_DATOS', x0, headerBot, x0 + totalW, headerTop);

    let cx = x0;
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];
      if (i > 0) dxf.addLine('TOPO_CUADRO_DATOS', cx, headerTop, cx, headerBot);
      dxf.addText(
        'TOPO_CUADRO_TEXTO',
        col.header,
        cx + col.width / 2,
        headerTop - rowH / 2,
        th * 0.9,
        0, 1, 2
      );
      cx += col.width;
    }
    y = headerBot;

    // Filas de datos (si hay lados usamos legs; si solo hay 1 punto listamos el punto)
    const rows = [];
    if (cfg.metrics.legs.length > 0) {
      for (const leg of cfg.metrics.legs) {
        rows.push([
          leg.fromId,
          leg.toId,
          leg.bearing,
          leg.azimuthText,
          leg.dist.toFixed(3),
          leg.from.n.toFixed(3),
          leg.from.e.toFixed(3),
          (Number(leg.from.z) || 0).toFixed(2)
        ]);
      }
      // Si es poligonal abierta, añadir fila final con coordenadas del último punto
      if (!cfg.closed) {
        const last = cfg.points[cfg.points.length - 1];
        rows.push([
          last.id,
          '-',
          'FIN TRAZO',
          '-',
          '-',
          last.n.toFixed(3),
          last.e.toFixed(3),
          (Number(last.z) || 0).toFixed(2)
        ]);
      }
    } else {
      for (const p of cfg.points) {
        rows.push([
          p.id, '-', '-', '-', '-',
          p.n.toFixed(3), p.e.toFixed(3), (Number(p.z) || 0).toFixed(2)
        ]);
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

        dxf.addText(
          'TOPO_CUADRO_TEXTO',
          r[i],
          tx,
          y - rowH / 2,
          th * 0.85,
          0,
          col.align,
          2
        );
        rx += col.width;
      }
      y = rowBot;
    }

    // Líneas verticales del cuerpo de la tabla
    cx = x0;
    for (let i = 0; i <= cols.length; i++) {
      dxf.addLine('TOPO_CUADRO_DATOS', cx, bodyTop, cx, y);
      if (i < cols.length) cx += cols[i].width;
    }

    // Pie de resumen (Área, Perímetro y Precisión)
    const footH = rowH * 1.25;
    dxf.addRect('TOPO_CUADRO_DATOS', x0, y - footH, x0 + totalW, y);
    const summaryText = cfg.closed
      ? `AREA: ${cfg.metrics.areaM2.toFixed(2)} m2 (${cfg.metrics.areaHa.toFixed(4)} ha)   |   PERIMETRO: ${cfg.metrics.perimeter.toFixed(3)} m   |   VERTICES: ${cfg.points.length}`
      : `LONGITUD TOTAL: ${cfg.metrics.perimeter.toFixed(3)} m   |   PUNTOS: ${cfg.points.length} (POLIGONAL ABIERTA)`;

    dxf.addText(
      'TOPO_CUADRO_TEXTO',
      summaryText,
      x0 + totalW / 2,
      y - footH / 2,
      th * 0.9,
      0, 1, 2
    );
    y -= footH;

    if (cfg.closureInfo) {
      dxf.addRect('TOPO_CUADRO_DATOS', x0, y - rowH, x0 + totalW, y);
      dxf.addText(
        'TOPO_CUADRO_TEXTO',
        `CIERRE LINEAL: ${cfg.closureInfo.errLinear.toFixed(4)} m  (dE=${cfg.closureInfo.errE.toFixed(4)}, dN=${cfg.closureInfo.errN.toFixed(4)})  |  PRECISION: ${cfg.closureInfo.precisionText}`,
        x0 + totalW / 2,
        y - rowH / 2,
        th * 0.82,
        0, 1, 2
      );
    }
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

  global.TopoDXF = {
    generateDXF
  };
})(window);
