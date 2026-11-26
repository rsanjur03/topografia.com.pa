/**
 * cogo.js — Motor matemático COGO (Coordinate Geometry) para Topografía
 * Convención topográfica: Azimut 0° = Norte (+Y), horario hacia el Este (+X).
 */
(function (global) {
  'use strict';

  const DEG2RAD = Math.PI / 180;
  const RAD2DEG = 180 / Math.PI;
  const EPS = 1e-9;

  /** Normaliza un ángulo en grados al rango [0, 360) */
  function normAzimuth(deg) {
    let a = deg % 360;
    if (a < 0) a += 360;
    if (Math.abs(a - 360) < 1e-10 || Math.abs(a) < 1e-10) a = 0;
    return a;
  }

  /** Convierte grados, minutos, segundos a grados decimales */
  function dmsToDeg(d, m = 0, s = 0) {
    const sign = d < 0 ? -1 : 1;
    const ad = Math.abs(Number(d) || 0);
    const am = Math.abs(Number(m) || 0);
    const as = Math.abs(Number(s) || 0);
    return sign * (ad + am / 60 + as / 3600);
  }

  /** Convierte grados decimales a { d, m, s } evitando rollover de 60" o 60' */
  function degToDms(deg, secDecimals = 1) {
    const sign = deg < 0 ? -1 : 1;
    const abs = Math.abs(deg);
    const factor = Math.pow(10, secDecimals);
    const totalSec = Math.round(abs * 3600 * factor) / factor;
    let d = Math.floor(totalSec / 3600);
    const rem = totalSec - d * 3600;
    let m = Math.floor(rem / 60);
    let s = Math.round((rem - m * 60) * factor) / factor;
    if (s >= 60) {
      s = 0;
      m += 1;
    }
    if (m >= 60) {
      m = 0;
      d += 1;
    }
    return { sign, d, m, s };
  }

  /** Formatea ángulo decimal como G°MM'SS.S" */
  function formatDms(deg, secDecimals = 1) {
    const { sign, d, m, s } = degToDms(deg, secDecimals);
    const mm = String(m).padStart(2, '0');
    const ss = secDecimals > 0
      ? s.toFixed(secDecimals).padStart(3 + secDecimals, '0')
      : String(Math.round(s)).padStart(2, '0');
    return `${sign < 0 ? '-' : ''}${d}°${mm}'${ss}"`;
  }

  /**
   * Convierte Azimut [0, 360) a Rumbo (Cuadrante + ángulo DMS)
   * @returns {{ ns: 'N'|'S', ew: 'E'|'W', angle: number, text: string, dms: {d,m,s} }}
   */
  function azimuthToBearing(azDeg, secDecimals = 1) {
    const az = normAzimuth(azDeg);
    let ns, ew, angle;
    if (az <= 90) {
      ns = 'N'; ew = 'E'; angle = az;
    } else if (az <= 180) {
      ns = 'S'; ew = 'E'; angle = 180 - az;
    } else if (az <= 270) {
      ns = 'S'; ew = 'W'; angle = az - 180;
    } else {
      ns = 'N'; ew = 'W'; angle = 360 - az;
    }
    const dms = degToDms(angle, secDecimals);
    const text = `${ns} ${formatDms(angle, secDecimals)} ${ew}`;
    return { ns, ew, angle, text, dms };
  }

  /** Convierte Rumbo (cuadrante N/S, E/W + grados decimales 0..90) a Azimut */
  function bearingToAzimuth(ns, ew, angleDeg) {
    const a = Math.abs(angleDeg);
    const NS = String(ns || 'N').toUpperCase();
    const EW = String(ew || 'E').toUpperCase();
    if (NS === 'N' && EW === 'E') return normAzimuth(a);
    if (NS === 'S' && EW === 'E') return normAzimuth(180 - a);
    if (NS === 'S' && EW === 'W') return normAzimuth(180 + a);
    if (NS === 'N' && EW === 'W') return normAzimuth(360 - a);
    throw new Error('Cuadrante de rumbo inválido');
  }

  /**
   * Parsea una cadena de ángulo flexible:
   * - Rumbo: "N 45°30'15\" E", "N45-30-15W", "S 12 05 30 O", "NE 45.5"
   * - Azimut: "135°20'10\"", "135-20-10", "135.3361", "135 20 10"
   * @returns {{ azimuth: number, isBearing: boolean, bearingText: string } | null}
   */
  function parseDirectionString(input) {
    if (!input || typeof input !== 'string') return null;
    const raw = input.trim().toUpperCase().replace(/O/g, 'W'); // Español O -> W
    if (!raw) return null;

    // Formato Rumbo: N/S ... E/W
    const bearingMatch = raw.match(/^([NS])\s*([0-9]+(?:[.,][0-9]+)?)(?:[\s°d\-:]+([0-9]+(?:[.,][0-9]+)?))?(?:[\s'm\-:]+([0-9]+(?:[.,][0-9]+)?))?["'s\s]*([EW])$/);
    if (bearingMatch) {
      const ns = bearingMatch[1];
      const d = parseFloat(bearingMatch[2].replace(',', '.'));
      const m = bearingMatch[3] ? parseFloat(bearingMatch[3].replace(',', '.')) : 0;
      const s = bearingMatch[4] ? parseFloat(bearingMatch[4].replace(',', '.')) : 0;
      const ew = bearingMatch[5];
      const angle = dmsToDeg(d, m, s);
      if (angle < 0 || angle > 90 + 1e-6) return null;
      const azimuth = bearingToAzimuth(ns, ew, angle);
      return { azimuth, isBearing: true, bearingText: azimuthToBearing(azimuth).text };
    }

    // Formato Azimut DMS o decimal
    const azMatch = raw.match(/^(-?[0-9]+(?:[.,][0-9]+)?)(?:[\s°d\-:]+([0-9]+(?:[.,][0-9]+)?))?(?:[\s'm\-:]+([0-9]+(?:[.,][0-9]+)?))?["'s\s]*$/);
    if (azMatch) {
      const d = parseFloat(azMatch[1].replace(',', '.'));
      const m = azMatch[2] ? parseFloat(azMatch[2].replace(',', '.')) : 0;
      const s = azMatch[3] ? parseFloat(azMatch[3].replace(',', '.')) : 0;
      const azimuth = normAzimuth(dmsToDeg(d, m, s));
      return { azimuth, isBearing: false, bearingText: azimuthToBearing(azimuth).text };
    }

    return null;
  }

  /**
   * 1. CÁLCULO DIRECTO (Radiación / Poligonal)
   * Desde (e, n, z) con azimut (grados), distancia horizontal (m) y opcional deltaZ
   */
  function direct(fromPt, azDeg, dist, deltaZ = 0) {
    const azRad = normAzimuth(azDeg) * DEG2RAD;
    const dE = dist * Math.sin(azRad);
    const dN = dist * Math.cos(azRad);
    return {
      e: fromPt.e + dE,
      n: fromPt.n + dN,
      z: (Number(fromPt.z) || 0) + (Number(deltaZ) || 0),
      dE,
      dN,
      azimuth: normAzimuth(azDeg),
      bearing: azimuthToBearing(azDeg).text,
      dist
    };
  }

  /**
   * 2. CÁLCULO INVERSO entre dos puntos A -> B
   */
  function inverse(ptA, ptB) {
    const dE = ptB.e - ptA.e;
    const dN = ptB.n - ptA.n;
    const dZ = (Number(ptB.z) || 0) - (Number(ptA.z) || 0);
    const distH = Math.hypot(dE, dN);
    const distS = Math.hypot(distH, dZ);
    const azRad = Math.atan2(dE, dN);
    const azimuth = normAzimuth(azRad * RAD2DEG);
    const bearing = azimuthToBearing(azimuth);
    const slopePct = distH > EPS ? (dZ / distH) * 100 : 0;
    const vertAngleDeg = distH > EPS ? Math.atan2(dZ, distH) * RAD2DEG : 0;

    return {
      dE,
      dN,
      dZ,
      dist: distH,
      slopeDist: distS,
      azimuth,
      azimuthText: formatDms(azimuth),
      bearing: bearing.text,
      bearingObj: bearing,
      slopePct,
      vertAngleDeg
    };
  }

  /**
   * 3. INTERSECCIÓN RUMBO–RUMBO (Dirección - Dirección)
   * Recta 1 desde pt1 con az1, Recta 2 desde pt2 con az2.
   */
  function intersectBearingBearing(pt1, az1Deg, pt2, az2Deg) {
    const a1 = normAzimuth(az1Deg) * DEG2RAD;
    const a2 = normAzimuth(az2Deg) * DEG2RAD;
    const dx1 = Math.sin(a1), dy1 = Math.cos(a1);
    const dx2 = Math.sin(a2), dy2 = Math.cos(a2);

    const det = dx1 * (-dy2) - dy1 * (-dx2); // dx2*dy1 - dx1*dy2
    if (Math.abs(det) < 1e-10) {
      return { ok: false, error: 'Las dos direcciones son paralelas o colineales.' };
    }

    const rx = pt2.e - pt1.e;
    const ry = pt2.n - pt1.n;
    const t1 = (rx * (-dy2) - ry * (-dx2)) / det;
    const t2 = (dx1 * ry - dy1 * rx) / det;

    const e = pt1.e + t1 * dx1;
    const n = pt1.n + t1 * dy1;
    const z = ((Number(pt1.z) || 0) + (Number(pt2.z) || 0)) / 2;

    return {
      ok: true,
      point: { e, n, z },
      distFrom1: t1,
      distFrom2: t2,
      warning: (t1 < 0 || t2 < 0)
        ? 'La intersección ocurre en la prolongación inversa (atrás) de al menos una dirección.'
        : null
    };
  }

  /**
   * 4. INTERSECCIÓN DISTANCIA–DISTANCIA (Trilateración)
   * Círculo 1 (pt1, r1) y Círculo 2 (pt2, r2). Devuelve 1 o 2 soluciones.
   */
  function intersectDistDist(pt1, r1, pt2, r2) {
    if (r1 <= 0 || r2 <= 0) {
      return { ok: false, error: 'Las distancias (radios) deben ser mayores que cero.' };
    }
    const dx = pt2.e - pt1.e;
    const dy = pt2.n - pt1.n;
    const d = Math.hypot(dx, dy);

    if (d < EPS) {
      return { ok: false, error: 'Los puntos base coinciden.' };
    }
    if (d > r1 + r2 + 1e-6) {
      return { ok: false, error: `No hay intersección: la distancia entre bases (${d.toFixed(3)} m) supera la suma de radios (${(r1 + r2).toFixed(3)} m).` };
    }
    if (d < Math.abs(r1 - r2) - 1e-6) {
      return { ok: false, error: 'No hay intersección: un círculo está contenido dentro del otro.' };
    }

    const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
    const h2 = Math.max(0, r1 * r1 - a * a);
    const h = Math.sqrt(h2);

    const xm = pt1.e + (a * dx) / d;
    const ym = pt1.n + (a * dy) / d;
    const z = ((Number(pt1.z) || 0) + (Number(pt2.z) || 0)) / 2;

    // Izquierda y Derecha mirando de pt1 -> pt2
    const left = { e: xm - (h * dy) / d, n: ym + (h * dx) / d, z, label: 'Izquierda (respecto a P1→P2)' };
    const right = { e: xm + (h * dy) / d, n: ym - (h * dx) / d, z, label: 'Derecha (respecto a P1→P2)' };

    const solutions = h < 1e-6 ? [left] : [left, right];
    return { ok: true, solutions, baseDist: d };
  }

  /**
   * 5. INTERSECCIÓN RUMBO–DISTANCIA
   * Línea desde pt1 con az1Deg, círculo en pt2 con radio r2.
   */
  function intersectBearingDist(pt1, az1Deg, pt2, r2) {
    if (r2 <= 0) return { ok: false, error: 'El radio debe ser mayor que cero.' };
    const a1 = normAzimuth(az1Deg) * DEG2RAD;
    const ux = Math.sin(a1), uy = Math.cos(a1);
    const fx = pt1.e - pt2.e;
    const fy = pt1.n - pt2.n;

    const B = 2 * (fx * ux + fy * uy);
    const C = fx * fx + fy * fy - r2 * r2;
    const disc = B * B - 4 * C;

    if (disc < -1e-6) {
      return { ok: false, error: 'La dirección no intersecta el círculo de distancia indicada.' };
    }

    const sqrtD = Math.sqrt(Math.max(0, disc));
    const ts = disc < 1e-6 ? [-B / 2] : [(-B - sqrtD) / 2, (-B + sqrtD) / 2];
    const z = ((Number(pt1.z) || 0) + (Number(pt2.z) || 0)) / 2;

    const solutions = ts.map((t, idx) => ({
      e: pt1.e + t * ux,
      n: pt1.n + t * uy,
      z,
      distFrom1: t,
      label: `Solución ${idx + 1} (${t >= 0 ? 'adelante' : 'atrás'} ${Math.abs(t).toFixed(3)} m)`
    }));

    return { ok: true, solutions };
  }

  /**
   * 6. ESTACIÓN Y OFFSET (Punto sobre línea A->B + desplazamiento perpendicular)
   * Offset positivo = Derecha mirando de A hacia B; negativo = Izquierda.
   */
  function stationOffsetPoint(ptA, ptB, station, offset = 0) {
    const inv = inverse(ptA, ptB);
    if (inv.dist < EPS) return { ok: false, error: 'Los puntos A y B coinciden.' };
    const azRad = inv.azimuth * DEG2RAD;
    const ux = Math.sin(azRad), uy = Math.cos(azRad); // Vector unitario A->B
    const rx = uy, ry = -ux; // Vector perpendicular derecha

    const e = ptA.e + station * ux + offset * rx;
    const n = ptA.n + station * uy + offset * ry;
    const ratio = station / inv.dist;
    const z = (Number(ptA.z) || 0) + ratio * ((Number(ptB.z) || 0) - (Number(ptA.z) || 0));

    return { ok: true, point: { e, n, z }, lineDist: inv.dist, azimuth: inv.azimuth };
  }

  /**
   * Proyección inversa de un punto P sobre la línea A->B (obtiene Estación y Offset)
   */
  function projectPointToLine(ptA, ptB, ptP) {
    const inv = inverse(ptA, ptB);
    if (inv.dist < EPS) return { ok: false, error: 'Los puntos A y B coinciden.' };
    const azRad = inv.azimuth * DEG2RAD;
    const ux = Math.sin(azRad), uy = Math.cos(azRad);
    const rx = uy, ry = -ux;

    const vx = ptP.e - ptA.e;
    const vy = ptP.n - ptA.n;
    const station = vx * ux + vy * uy;
    const offset = vx * rx + vy * ry;
    const foot = {
      e: ptA.e + station * ux,
      n: ptA.n + station * uy,
      z: Number(ptP.z) || 0
    };
    return { ok: true, station, offset, foot, lineDist: inv.dist };
  }

  /**
   * 7. SUBDIVISIÓN DE LÍNEA en N tramos iguales
   */
  function subdivideLine(ptA, ptB, segments) {
    const nSeg = Math.max(2, Math.floor(segments));
    const pts = [];
    for (let i = 1; i < nSeg; i++) {
      const t = i / nSeg;
      pts.push({
        e: ptA.e + t * (ptB.e - ptA.e),
        n: ptA.n + t * (ptB.n - ptA.n),
        z: (Number(ptA.z) || 0) + t * ((Number(ptB.z) || 0) - (Number(ptA.z) || 0))
      });
    }
    return pts;
  }

  /**
   * 8. CURVA HORIZONTAL SIMPLE (Replanteo Vial)
   * Dado PI, Azimut entrada (hacia PI), Azimut salida (desde PI) y Radio R.
   */
  function simpleHorizontalCurve(ptPI, azInDeg, azOutDeg, radius, stepDist = 10) {
    if (radius <= 0) return { ok: false, error: 'El radio debe ser mayor que cero.' };
    const azIn = normAzimuth(azInDeg);
    const azOut = normAzimuth(azOutDeg);

    // Deflexión Δ en (-180, 180] (+ derecha, - izquierda)
    let deltaSigned = ((azOut - azIn + 540) % 360) - 180;
    const absDelta = Math.abs(deltaSigned);
    if (absDelta < 1e-4 || absDelta > 179.9) {
      return { ok: false, error: 'El ángulo de deflexión Δ debe estar entre 0° y 180°.' };
    }

    const dir = deltaSigned > 0 ? 1 : -1; // +1 derecha, -1 izquierda
    const deltaRad = absDelta * DEG2RAD;

    const T = radius * Math.tan(deltaRad / 2); // Tangente
    const Lc = radius * deltaRad; // Longitud de curva
    const C = 2 * radius * Math.sin(deltaRad / 2); // Cuerda larga
    const E = radius * (1 / Math.cos(deltaRad / 2) - 1); // Externa
    const M = radius * (1 - Math.cos(deltaRad / 2)); // Ordenada media
    const Gc = (2 * Math.asin(Math.min(1, 10 / (2 * radius)))) * RAD2DEG; // Grado curvatura cuerda 10m

    // PC está atrás desde PI en dirección azIn + 180°
    const pc = direct(ptPI, normAzimuth(azIn + 180), T);
    // PT está adelante desde PI en dirección azOut
    const pt = direct(ptPI, azOut, T);
    // Centro O está perpendicular a la tangente de entrada desde PC (azIn + 90*dir)
    const azToCenter = normAzimuth(azIn + dir * 90);
    const center = direct(pc, azToCenter, radius);

    // Puntos de replanteo a lo largo del arco
    const azCenterToPC = normAzimuth(azToCenter + 180);
    const step = Math.max(0.5, Number(stepDist) || 10);
    const arcPoints = [];
    const numSteps = Math.max(2, Math.ceil(Lc / step));
    for (let i = 0; i <= numSteps; i++) {
      const s = Math.min(Lc, i === numSteps ? Lc : i * step);
      const thetaDeg = (s / radius) * RAD2DEG;
      const azFromCenter = normAzimuth(azCenterToPC + dir * thetaDeg);
      const p = direct(center, azFromCenter, radius);
      arcPoints.push({
        e: p.e,
        n: p.n,
        z: Number(ptPI.z) || 0,
        arcDist: s,
        label: i === 0 ? 'PC' : (i === numSteps ? 'PT' : `C+${s.toFixed(1)}`)
      });
    }

    return {
      ok: true,
      deltaSigned,
      absDelta,
      direction: dir > 0 ? 'Derecha (D)' : 'Izquierda (I)',
      radius,
      T, Lc, C, E, M, Gc,
      pc: { e: pc.e, n: pc.n, z: Number(ptPI.z) || 0 },
      pt: { e: pt.e, n: pt.n, z: Number(ptPI.z) || 0 },
      center: { e: center.e, n: center.n, z: Number(ptPI.z) || 0 },
      pi: { e: ptPI.e, n: ptPI.n, z: Number(ptPI.z) || 0 },
      arcPoints
    };
  }

  /**
   * 9. ÁREA, PERÍMETRO Y CENTROIDE (Fórmula de Gauss / Shoelace con desplazamiento de origen)
   * Evita pérdida de precisión con coordenadas UTM grandes.
   */
  function polygonMetrics(points, closed = true) {
    if (!points || points.length < 2) {
      return {
        areaM2: 0,
        areaHa: 0,
        areaKm2: 0,
        areaVaras2: 0,
        perimeter: 0,
        centroid: points && points[0] ? { e: points[0].e, n: points[0].n } : null,
        legs: []
      };
    }

    // Construir tramos (legs)
    const legs = [];
    let perimeter = 0;
    const count = closed && points.length >= 3 ? points.length : points.length - 1;
    for (let i = 0; i < count; i++) {
      const from = points[i];
      const to = points[(i + 1) % points.length];
      const inv = inverse(from, to);
      perimeter += inv.dist;
      legs.push({
        index: i + 1,
        fromId: from.id,
        toId: to.id,
        from,
        to,
        ...inv
      });
    }

    if (!closed || points.length < 3) {
      const avgE = points.reduce((s, p) => s + p.e, 0) / points.length;
      const avgN = points.reduce((s, p) => s + p.n, 0) / points.length;
      return {
        areaM2: 0,
        areaHa: 0,
        areaKm2: 0,
        areaVaras2: 0,
        perimeter,
        centroid: { e: avgE, n: avgN },
        legs
      };
    }

    // Traslación al primer punto para estabilidad numérica
    const e0 = points[0].e;
    const n0 = points[0].n;
    let sum2A = 0;
    let cx = 0;
    let cy = 0;

    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      const x1 = p1.e - e0, y1 = p1.n - n0;
      const x2 = p2.e - e0, y2 = p2.n - n0;
      const cross = x1 * y2 - x2 * y1;
      sum2A += cross;
      cx += (x1 + x2) * cross;
      cy += (y1 + y2) * cross;
    }

    const areaM2 = Math.abs(sum2A) / 2;
    let centroid;
    if (Math.abs(sum2A) > 1e-6) {
      centroid = {
        e: e0 + cx / (3 * sum2A),
        n: n0 + cy / (3 * sum2A)
      };
    } else {
      centroid = {
        e: points.reduce((s, p) => s + p.e, 0) / points.length,
        n: points.reduce((s, p) => s + p.n, 0) / points.length
      };
    }

    return {
      areaM2,
      areaHa: areaM2 / 10000,
      areaKm2: areaM2 / 1000000,
      areaVaras2: areaM2 / 0.698737, // 1 vara² centroamericana ≈ 0.698737 m²
      perimeter,
      centroid,
      legs
    };
  }

  /**
   * 10. CIERRE Y AJUSTE DE POLIGONAL POR REGLA DE LA BRÚJULA (BOWDITCH)
   * Cuando el usuario introduce una poligonal cerrada donde el último punto calculado
   * debería coincidir con el punto inicial (o punto de cierre conocido).
   */
  function bowditchAdjust(points, targetEnd = null) {
    if (!points || points.length < 3) {
      return { ok: false, error: 'Se necesitan al menos 3 puntos para ajustar una poligonal.' };
    }
    const start = points[0];
    const endTarget = targetEnd || start;
    const last = points[points.length - 1];

    // Error de cierre lineal
    const errE = last.e - endTarget.e;
    const errN = last.n - endTarget.n;
    const errLinear = Math.hypot(errE, errN);

    // Distancias acumuladas
    const cumDists = [0];
    let totalDist = 0;
    for (let i = 1; i < points.length; i++) {
      const d = Math.hypot(points[i].e - points[i - 1].e, points[i].n - points[i - 1].n);
      totalDist += d;
      cumDists.push(totalDist);
    }

    if (totalDist < EPS) {
      return { ok: false, error: 'La longitud total de la poligonal es cero.' };
    }

    const precisionDenom = errLinear > EPS ? Math.round(totalDist / errLinear) : Infinity;

    // Puntos ajustados (eliminamos el punto final duplicado si cerramos sobre start)
    const adjusted = points.map((p, i) => {
      const ratio = cumDists[i] / totalDist;
      return {
        ...p,
        e: p.e - errE * ratio,
        n: p.n - errN * ratio
      };
    });

    return {
      ok: true,
      errE,
      errN,
      errLinear,
      totalDist,
      precisionDenom,
      precisionText: Number.isFinite(precisionDenom) ? `1 : ${precisionDenom.toLocaleString('en-US')}` : 'Exacto',
      adjusted
    };
  }

  global.TopoCOGO = {
    normAzimuth,
    dmsToDeg,
    degToDms,
    formatDms,
    azimuthToBearing,
    bearingToAzimuth,
    parseDirectionString,
    direct,
    inverse,
    intersectBearingBearing,
    intersectDistDist,
    intersectBearingDist,
    stationOffsetPoint,
    projectPointToLine,
    subdivideLine,
    simpleHorizontalCurve,
    polygonMetrics,
    bowditchAdjust
  };
})(window);
