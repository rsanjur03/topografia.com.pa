/**
 * geodesy.js — Motor geodésico de precisión para topografia.com.pa
 * Incluye:
 *  - WGS84 y Clarke 1866 (NAD27) Lat/Lon ↔ UTM (con escala puntual k y convergencia γ)
 *  - Geocéntricas ECEF (X, Y, Z) ↔ Geográficas (Lat, Lon, h) ↔ UTM (E, N, h)
 *  - Transformación 3D de Datum NAD27 (Panamá / Zona del Canal / Custom) ↔ WGS84
 *  - Conversión de ángulos: DD ↔ DMS ↔ DDM ↔ Radianes ↔ Gradianes (gon)
 *  - Calendario GPS / GNSS: Fecha ↔ GPS Week, DOW, SOW, DOY, JD, MJD, RINEX/SP3
 */
(function (global) {
  'use strict';

  const DEG2RAD = Math.PI / 180;
  const RAD2DEG = 180 / Math.PI;

  const ELLIPSOIDS = {
    WGS84: {
      name: 'WGS84',
      a: 6378137.0,
      f: 1 / 298.257223563
    },
    CLARKE1866: {
      name: 'Clarke 1866 (NAD27)',
      a: 6378206.4,
      f: 1 / 294.9786982138
    }
  };

  // Parámetros oficiales NIMA/DMA TR8350.2 (NAD27 -> WGS84 en metros)
  const DATUM_SHIFTS_NAD27_TO_WGS84 = {
    panama: { label: 'NAD27 Centroamérica / Panamá (EPSG:1171)', dx: 0.0, dy: 125.0, dz: 194.0 },
    canal: { label: 'NAD27 Zona del Canal de Panamá (EPSG:1170)', dx: 0.0, dy: 125.0, dz: 201.0 },
    conus: { label: 'NAD27 Estados Unidos (CONUS)', dx: -8.0, dy: 160.0, dz: 176.0 }
  };

  function getEllipsoidParams(ellKey = 'WGS84') {
    const el = ELLIPSOIDS[ellKey] || ELLIPSOIDS.WGS84;
    const a = el.a;
    const f = el.f;
    const b = a * (1 - f);
    const e2 = 2 * f - f * f;
    const ep2 = e2 / (1 - e2);
    return { a, b, f, e2, ep2, name: el.name };
  }

  // ==================== 1. LAT/LON ↔ UTM (SOPORTA WGS84 Y CLARKE 1866) ====================
  function latLonToUtm(lat, lon, forcedZone = null, ellipsoidKey = 'WGS84') {
    const { a, e2, ep2 } = getEllipsoidParams(ellipsoidKey);
    const K0 = 0.9996;
    const zone = forcedZone || (Math.floor((lon + 180) / 6) + 1);
    const lonOrigin = (zone - 1) * 6 - 180 + 3;

    const phi = lat * DEG2RAD;
    const lam = lon * DEG2RAD;
    const lam0 = lonOrigin * DEG2RAD;

    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    const tanPhi = Math.tan(phi);

    const N = a / Math.sqrt(1 - e2 * sinPhi * sinPhi);
    const T = tanPhi * tanPhi;
    const C = ep2 * cosPhi * cosPhi;
    const A = cosPhi * (lam - lam0);

    const e4 = e2 * e2;
    const e6 = e4 * e2;

    const M = a * (
      (1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi
      - ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi)
      + ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi)
      - ((35 * e6) / 3072) * Math.sin(6 * phi)
    );

    const A2 = A * A, A3 = A2 * A, A4 = A3 * A, A5 = A4 * A, A6 = A5 * A;

    const easting = K0 * N * (
      A
      + ((1 - T + C) * A3) / 6
      + ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A5) / 120
    ) + 500000.0;

    let northing = K0 * (
      M + N * tanPhi * (
        A2 / 2
        + ((5 - T + 9 * C + 4 * C * C) * A4) / 24
        + ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * A6) / 720
      )
    );

    const hemisphere = lat >= 0 ? 'N' : 'S';
    if (lat < 0) northing += 10000000.0;

    // Convergencia de meridianos (grados) y factor de escala puntual k
    const dLam = lam - lam0;
    const convergenceRad = Math.atan(Math.tan(dLam) * sinPhi);
    const k = K0 * (
      1
      + ((1 + C) * A2) / 2
      + ((5 - 4 * T + 42 * C + 13 * C * C - 28 * ep2) * A4) / 24
      + ((61 - 148 * T + 16 * T * T) * A6) / 720
    );

    return {
      easting,
      northing,
      zone,
      hemisphere,
      centralMeridian: lonOrigin,
      convergenceDeg: convergenceRad * RAD2DEG,
      scaleFactor: k
    };
  }

  function utmToLatLon(easting, northing, zone = 17, hemisphere = 'N', ellipsoidKey = 'WGS84') {
    const { a, e2, ep2 } = getEllipsoidParams(ellipsoidKey);
    const K0 = 0.9996;
    const x = easting - 500000.0;
    const y = hemisphere === 'S' ? northing - 10000000.0 : northing;

    const e4 = e2 * e2;
    const e6 = e4 * e2;
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

    const M = y / K0;
    const mu = M / (a * (1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256));

    const e1_2 = e1 * e1, e1_3 = e1_2 * e1, e1_4 = e1_3 * e1;

    const phi1 = mu
      + ((3 * e1) / 2 - (27 * e1_3) / 32) * Math.sin(2 * mu)
      + ((21 * e1_2) / 16 - (55 * e1_4) / 32) * Math.sin(4 * mu)
      + ((151 * e1_3) / 96) * Math.sin(6 * mu)
      + ((1097 * e1_4) / 512) * Math.sin(8 * mu);

    const sinPhi1 = Math.sin(phi1);
    const cosPhi1 = Math.cos(phi1);
    const tanPhi1 = Math.tan(phi1);

    const N1 = a / Math.sqrt(1 - e2 * sinPhi1 * sinPhi1);
    const T1 = tanPhi1 * tanPhi1;
    const C1 = ep2 * cosPhi1 * cosPhi1;
    const R1 = (a * (1 - e2)) / Math.pow(1 - e2 * sinPhi1 * sinPhi1, 1.5);
    const D = x / (N1 * K0);

    const D2 = D * D, D3 = D2 * D, D4 = D3 * D, D5 = D4 * D, D6 = D5 * D;

    const latRad = phi1 - ((N1 * tanPhi1) / R1) * (
      D2 / 2
      - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D4) / 24
      + ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D6) / 720
    );

    const lonOrigin = (zone - 1) * 6 - 180 + 3;
    const lonRad = (
      D
      - ((1 + 2 * T1 + C1) * D3) / 6
      + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D5) / 120
    ) / cosPhi1;

    const lat = latRad * RAD2DEG;
    const lon = lonOrigin + lonRad * RAD2DEG;
    const forwardCheck = latLonToUtm(lat, lon, zone, ellipsoidKey);

    return {
      lat,
      lon,
      centralMeridian: lonOrigin,
      convergenceDeg: forwardCheck.convergenceDeg,
      scaleFactor: forwardCheck.scaleFactor
    };
  }

  // ==================== 2. GEOCÉNTRICAS ECEF (X, Y, Z) ↔ GEOGRÁFICAS ↔ UTM ====================
  function geodeticToEcef(lat, lon, h = 0, ellipsoidKey = 'WGS84') {
    const { a, e2 } = getEllipsoidParams(ellipsoidKey);
    const phi = lat * DEG2RAD;
    const lam = lon * DEG2RAD;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    const N = a / Math.sqrt(1 - e2 * sinPhi * sinPhi);

    return {
      x: (N + h) * cosPhi * Math.cos(lam),
      y: (N + h) * cosPhi * Math.sin(lam),
      z: (N * (1 - e2) + h) * sinPhi
    };
  }

  function ecefToGeodetic(x, y, z, ellipsoidKey = 'WGS84') {
    const { a, b, e2, ep2 } = getEllipsoidParams(ellipsoidKey);
    const p = Math.hypot(x, y);
    const lon = Math.atan2(y, x) * RAD2DEG;

    if (p < 1e-10) {
      const lat = z >= 0 ? 90 : -90;
      return { lat, lon: 0, h: Math.abs(z) - b };
    }

    // Método exacto de Bowring + refinamiento iterativo (precisión < 1e-10 m)
    const theta = Math.atan2(z * a, p * b);
    let phi = Math.atan2(
      z + ep2 * b * Math.pow(Math.sin(theta), 3),
      p - e2 * a * Math.pow(Math.cos(theta), 3)
    );

    let N = a;
    for (let i = 0; i < 6; i++) {
      const sinPhi = Math.sin(phi);
      N = a / Math.sqrt(1 - e2 * sinPhi * sinPhi);
      const nextPhi = Math.atan2(z + e2 * N * sinPhi, p);
      if (Math.abs(nextPhi - phi) < 1e-13) { phi = nextPhi; break; }
      phi = nextPhi;
    }

    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    N = a / Math.sqrt(1 - e2 * sinPhi * sinPhi);
    const h = Math.abs(cosPhi) > 1e-8 ? (p / cosPhi - N) : (Math.abs(z) / Math.abs(sinPhi) - N * (1 - e2));

    return { lat: phi * RAD2DEG, lon, h };
  }

  function utmToEcef(easting, northing, h = 0, zone = 17, hemisphere = 'N', ellipsoidKey = 'WGS84') {
    const geo = utmToLatLon(easting, northing, zone, hemisphere, ellipsoidKey);
    const ecef = geodeticToEcef(geo.lat, geo.lon, h, ellipsoidKey);
    return { ...ecef, lat: geo.lat, lon: geo.lon, h };
  }

  function ecefToUtm(x, y, z, forcedZone = null, ellipsoidKey = 'WGS84') {
    const geo = ecefToGeodetic(x, y, z, ellipsoidKey);
    const utm = latLonToUtm(geo.lat, geo.lon, forcedZone, ellipsoidKey);
    return { ...utm, lat: geo.lat, lon: geo.lon, h: geo.h };
  }

  // ==================== 3. TRANSFORMACIÓN DE DATUM NAD27 ↔ WGS84 ====================
  /**
   * Transformación geocéntrica 3D (Helmert 3 parámetros) entre NAD27 (Clarke 1866) y WGS84.
   * direction: 'nad27_to_wgs84' | 'wgs84_to_nad27'
   */
  function transformDatumGeo(lat, lon, h = 0, direction = 'nad27_to_wgs84', shift = null) {
    const s = shift || DATUM_SHIFTS_NAD27_TO_WGS84.panama;
    const dx = Number(s.dx) || 0;
    const dy = Number(s.dy) || 0;
    const dz = Number(s.dz) || 0;

    if (direction === 'nad27_to_wgs84') {
      const ecef1 = geodeticToEcef(lat, lon, h, 'CLARKE1866');
      const ecef2 = { x: ecef1.x + dx, y: ecef1.y + dy, z: ecef1.z + dz };
      return ecefToGeodetic(ecef2.x, ecef2.y, ecef2.z, 'WGS84');
    } else {
      const ecef1 = geodeticToEcef(lat, lon, h, 'WGS84');
      const ecef2 = { x: ecef1.x - dx, y: ecef1.y - dy, z: ecef1.z - dz };
      return ecefToGeodetic(ecef2.x, ecef2.y, ecef2.z, 'CLARKE1866');
    }
  }

  function transformDatumUtm(easting, northing, h = 0, zone = 17, hemisphere = 'N', direction = 'nad27_to_wgs84', shift = null) {
    const srcEll = direction === 'nad27_to_wgs84' ? 'CLARKE1866' : 'WGS84';
    const dstEll = direction === 'nad27_to_wgs84' ? 'WGS84' : 'CLARKE1866';
    const srcGeo = utmToLatLon(easting, northing, zone, hemisphere, srcEll);
    const dstGeo = transformDatumGeo(srcGeo.lat, srcGeo.lon, h, direction, shift);
    const dstUtm = latLonToUtm(dstGeo.lat, dstGeo.lon, zone, dstEll);
    return {
      srcGeo,
      dstGeo,
      dstUtm,
      dE: dstUtm.easting - easting,
      dN: dstUtm.northing - northing,
      dh: dstGeo.h - h
    };
  }

  // ==================== 4. CONVERSOR DE ÁNGULOS (DD ↔ DMS ↔ DDM ↔ RAD ↔ GON) ====================
  function ddToParts(dd) {
    const sign = dd < 0 ? -1 : 1;
    const abs = Math.abs(dd);
    let d = Math.floor(abs);
    const minFloat = (abs - d) * 60;
    let m = Math.floor(minFloat);
    let s = (minFloat - m) * 60;
    if (s >= 59.99995) { s = 0; m += 1; }
    if (m >= 60) { m = 0; d += 1; }
    return {
      sign,
      d,
      m,
      s,
      minDecimal: (abs - Math.floor(abs)) * 60,
      rad: dd * DEG2RAD,
      gon: dd * (10 / 9),
      dmsText: `${sign < 0 ? '-' : ''}${d}° ${String(m).padStart(2, '0')}' ${s.toFixed(4).padStart(7, '0')}"`,
      ddmText: `${sign < 0 ? '-' : ''}${Math.floor(abs)}° ${((abs - Math.floor(abs)) * 60).toFixed(5)}'`
    };
  }

  function dmsToDecimal(d, m = 0, s = 0, hemi = null) {
    let sign = 1;
    if (hemi) {
      const H = String(hemi).toUpperCase();
      if (H === 'S' || H === 'W' || H === 'O' || H === '-') sign = -1;
    } else if (Number(d) < 0 || String(d).trim().startsWith('-')) {
      sign = -1;
    }
    const ad = Math.abs(Number(d) || 0);
    const am = Math.abs(Number(m) || 0);
    const as = Math.abs(Number(s) || 0);
    return sign * (ad + am / 60 + as / 3600);
  }

  // ==================== 5. CALENDARIO GPS / GNSS (DOY / GPS WEEK) ====================
  const GPS_EPOCH_MS = Date.UTC(1980, 0, 6, 0, 0, 0); // 6 Enero 1980 00:00:00 UTC
  const MS_PER_DAY = 86400000;

  function isLeapYear(y) {
    return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
  }

  /** Convierte fecha calendario UTC (y, m 1..12, d 1..31, h, min, sec) a métricas GPS/GNSS */
  function dateToGps(year, month, day, hour = 0, minute = 0, second = 0) {
    const utcMs = Date.UTC(year, month - 1, day, hour, minute, second);
    const dt = new Date(utcMs);
    const y = dt.getUTCFullYear();
    const m = dt.getUTCMonth() + 1;
    const d = dt.getUTCDate();

    const startOfYearMs = Date.UTC(y, 0, 1, 0, 0, 0);
    const doy = Math.floor((Date.UTC(y, m - 1, d) - startOfYearMs) / MS_PER_DAY) + 1;
    const daysInYear = isLeapYear(y) ? 366 : 365;

    const diffSec = (utcMs - GPS_EPOCH_MS) / 1000;
    const totalDaysFromEpoch = Math.floor(diffSec / 86400);
    const gpsWeek = Math.floor(totalDaysFromEpoch / 7);
    const gpsWeekRollover = ((gpsWeek % 1024) + 1024) % 1024;
    const dow = ((totalDaysFromEpoch % 7) + 7) % 7; // 0 = Domingo .. 6 = Sábado
    const secOfDay = hour * 3600 + minute * 60 + second;
    const sow = dow * 86400 + secOfDay;

    // Julian Date (JD) y Modified Julian Date (MJD)
    const jd = utcMs / MS_PER_DAY + 2440587.5;
    const mjd = jd - 2400000.5;

    const doyStr = String(doy).padStart(3, '0');
    const yyStr = String(y).slice(-2);
    const isoDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayNamesEs = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const dayNamesEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    return {
      year: y,
      month: m,
      day: d,
      isoDate,
      dayNameEs: dayNamesEs[dow],
      dayNameEn: dayNamesEn[dow],
      doy,
      doyStr,
      daysInYear,
      gpsWeek,
      gpsWeekRollover,
      dow,
      sow,
      jd,
      mjd,
      rinexObsName: `XXXX${doyStr}0.${yyStr}o`,
      igsSp3Name: `igs${gpsWeek}${dow}.sp3`
    };
  }

  /** Convierte Año + DOY (1..366) a objeto completo GPS */
  function doyToDate(year, doy) {
    const ms = Date.UTC(year, 0, 1) + (Math.max(1, Math.floor(doy)) - 1) * MS_PER_DAY;
    const dt = new Date(ms);
    return dateToGps(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }

  /** Convierte Semana GPS + Día de la semana (0..6) a objeto completo GPS */
  function gpsWeekToDate(gpsWeek, dow = 0) {
    const ms = GPS_EPOCH_MS + (Math.floor(gpsWeek) * 7 + Math.floor(dow)) * MS_PER_DAY;
    const dt = new Date(ms);
    return dateToGps(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }

  function isPlausibleUtm(easting, northing) {
    return (
      Number.isFinite(easting) &&
      Number.isFinite(northing) &&
      easting >= 100000 && easting <= 900000 &&
      northing >= 0 && northing <= 10000000
    );
  }

  global.TopoGeodesy = {
    ELLIPSOIDS,
    DATUM_SHIFTS_NAD27_TO_WGS84,
    latLonToUtm,
    utmToLatLon,
    geodeticToEcef,
    ecefToGeodetic,
    utmToEcef,
    ecefToUtm,
    transformDatumGeo,
    transformDatumUtm,
    ddToParts,
    dmsToDecimal,
    dateToGps,
    doyToDate,
    gpsWeekToDate,
    isPlausibleUtm
  };
})(window);
