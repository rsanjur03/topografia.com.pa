/**
 * geodesy.js — Conversión precisa WGS84 Lat/Lon ↔ UTM (Transverse Mercator)
 * Precisión submilimétrica para topografía (Panamá Zonas 17N y 18N y global).
 */
(function (global) {
  'use strict';

  const WGS84_A = 6378137.0;
  const WGS84_F = 1 / 298.257223563;
  const WGS84_E2 = 2 * WGS84_F - WGS84_F * WGS84_F;
  const WGS84_EP2 = WGS84_E2 / (1 - WGS84_E2);
  const K0 = 0.9996;
  const DEG2RAD = Math.PI / 180;
  const RAD2DEG = 180 / Math.PI;

  /**
   * Convierte Latitud/Longitud (grados decimales WGS84) a UTM (Este, Norte).
   * @param {number} lat - Latitud en grados decimales
   * @param {number} lon - Longitud en grados decimales
   * @param {number|null} forcedZone - Zona UTM forzada (ej. 17 o 18) o null para automática
   * @returns {{ easting: number, northing: number, zone: number, hemisphere: 'N'|'S' }}
   */
  function latLonToUtm(lat, lon, forcedZone = null) {
    const zone = forcedZone || (Math.floor((lon + 180) / 6) + 1);
    const lonOrigin = (zone - 1) * 6 - 180 + 3; // Meridiano central de la zona
    const phi = lat * DEG2RAD;
    const lam = lon * DEG2RAD;
    const lam0 = lonOrigin * DEG2RAD;

    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    const tanPhi = Math.tan(phi);

    const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinPhi * sinPhi);
    const T = tanPhi * tanPhi;
    const C = WGS84_EP2 * cosPhi * cosPhi;
    const A = cosPhi * (lam - lam0);

    const e2 = WGS84_E2;
    const e4 = e2 * e2;
    const e6 = e4 * e2;

    const M = WGS84_A * (
      (1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi
      - ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi)
      + ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi)
      - ((35 * e6) / 3072) * Math.sin(6 * phi)
    );

    const A2 = A * A;
    const A3 = A2 * A;
    const A4 = A3 * A;
    const A5 = A4 * A;
    const A6 = A5 * A;

    const easting = K0 * N * (
      A
      + ((1 - T + C) * A3) / 6
      + ((5 - 18 * T + T * T + 72 * C - 58 * WGS84_EP2) * A5) / 120
    ) + 500000.0;

    let northing = K0 * (
      M + N * tanPhi * (
        A2 / 2
        + ((5 - T + 9 * C + 4 * C * C) * A4) / 24
        + ((61 - 58 * T + T * T + 600 * C - 330 * WGS84_EP2) * A6) / 720
      )
    );

    const hemisphere = lat >= 0 ? 'N' : 'S';
    if (lat < 0) {
      northing += 10000000.0;
    }

    return { easting, northing, zone, hemisphere };
  }

  /**
   * Convierte UTM (Este, Norte) a Latitud/Longitud (grados decimales WGS84).
   * @param {number} easting - Coordenada Este (X) en metros
   * @param {number} northing - Coordenada Norte (Y) en metros
   * @param {number} zone - Zona UTM (1-60; Panamá usa 17 o 18)
   * @param {'N'|'S'} hemisphere - Hemisferio ('N' para Panamá)
   * @returns {{ lat: number, lon: number }}
   */
  function utmToLatLon(easting, northing, zone = 17, hemisphere = 'N') {
    const x = easting - 500000.0;
    const y = hemisphere === 'S' ? northing - 10000000.0 : northing;

    const e2 = WGS84_E2;
    const e4 = e2 * e2;
    const e6 = e4 * e2;
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

    const M = y / K0;
    const mu = M / (WGS84_A * (1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256));

    const e1_2 = e1 * e1;
    const e1_3 = e1_2 * e1;
    const e1_4 = e1_3 * e1;

    const phi1 = mu
      + ((3 * e1) / 2 - (27 * e1_3) / 32) * Math.sin(2 * mu)
      + ((21 * e1_2) / 16 - (55 * e1_4) / 32) * Math.sin(4 * mu)
      + ((151 * e1_3) / 96) * Math.sin(6 * mu)
      + ((1097 * e1_4) / 512) * Math.sin(8 * mu);

    const sinPhi1 = Math.sin(phi1);
    const cosPhi1 = Math.cos(phi1);
    const tanPhi1 = Math.tan(phi1);

    const N1 = WGS84_A / Math.sqrt(1 - e2 * sinPhi1 * sinPhi1);
    const T1 = tanPhi1 * tanPhi1;
    const C1 = WGS84_EP2 * cosPhi1 * cosPhi1;
    const R1 = (WGS84_A * (1 - e2)) / Math.pow(1 - e2 * sinPhi1 * sinPhi1, 1.5);
    const D = x / (N1 * K0);

    const D2 = D * D;
    const D3 = D2 * D;
    const D4 = D3 * D;
    const D5 = D4 * D;
    const D6 = D5 * D;

    const latRad = phi1 - ((N1 * tanPhi1) / R1) * (
      D2 / 2
      - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * WGS84_EP2) * D4) / 24
      + ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * WGS84_EP2 - 3 * C1 * C1) * D6) / 720
    );

    const lonOrigin = (zone - 1) * 6 - 180 + 3;
    const lonRad = (
      D
      - ((1 + 2 * T1 + C1) * D3) / 6
      + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * WGS84_EP2 + 24 * T1 * T1) * D5) / 120
    ) / cosPhi1;

    return {
      lat: latRad * RAD2DEG,
      lon: lonOrigin + lonRad * RAD2DEG
    };
  }

  /**
   * Valida si un par (E, N) parece ser una coordenada UTM válida.
   */
  function isPlausibleUtm(easting, northing) {
    return (
      Number.isFinite(easting) &&
      Number.isFinite(northing) &&
      easting >= 100000 && easting <= 900000 &&
      northing >= 0 && northing <= 10000000
    );
  }

  global.TopoGeodesy = {
    latLonToUtm,
    utmToLatLon,
    isPlausibleUtm
  };
})(window);
