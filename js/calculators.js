/**
 * calculators.js — Controlador de la Suite de Calculadoras Geodésicas y GNSS
 *   1. UTM ↔ Geográficas (Lat/Lon)
 *   2. Geocéntricas ECEF (X, Y, Z) ↔ UTM
 *   3. Datum NAD27 ↔ WGS84 (Panamá / Zona del Canal / CONUS / Custom)
 *   4. Grados Decimales (DD) ↔ G° M' S"
 *   5. Calendario GPS / GNSS (DOY / GPS Week / SOW / JD / MJD / RINEX / SP3)
 */
(function (global) {
  'use strict';

  const Geo = global.TopoGeodesy;
  const $ = (id) => document.getElementById(id);

  let currentGpsState = null;
  let calViewYear = 2026;
  let calViewMonth = 11; // 1..12
  let activeCalcId = 'utm-geo';

  // Mini-mapa Leaflet dedicado para las calculadoras de coordenadas
  let calcMap = null;
  let calcMapLayers = {};
  let calcActiveTiles = [];
  let calcOverlayGroup = null;
  let lastCalcMapPoints = [];

  const MAP_ENABLED_CALCS = new Set(['utm-geo', 'ecef-utm', 'nad27-wgs84']);

  function initCalcMiniMap() {
    if (calcMap || typeof global.L === 'undefined' || !$('calcMiniMap')) return;
    const L = global.L;

    calcMap = L.map('calcMiniMap', {
      center: [8.43428, -82.43039],
      zoom: 16,
      maxZoom: 21,
      preferCanvas: true
    });

    L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(calcMap);

    calcMapLayers = {
      satellite: [
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
          attribution: 'Tiles &copy; Esri',
          maxNativeZoom: 19,
          maxZoom: 21
        })
      ],
      hybrid: [
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
          attribution: 'Tiles &copy; Esri',
          maxNativeZoom: 19,
          maxZoom: 21
        }),
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
          maxNativeZoom: 19,
          maxZoom: 21,
          opacity: 0.9
        }),
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', {
          maxNativeZoom: 19,
          maxZoom: 21,
          opacity: 0.8
        })
      ],
      street: [
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
          attribution: 'Tiles &copy; Esri — World Street Map',
          maxNativeZoom: 19,
          maxZoom: 21
        })
      ]
    };

    calcOverlayGroup = L.layerGroup().addTo(calcMap);
    setCalcMapBasemap('satellite');

    // Clic en el mapa: consulta coordenadas y rellena la calculadora activa automáticamente
    calcMap.on('click', (ev) => {
      const { lat, lng } = ev.latlng;
      const utm = Geo.latLonToUtm(lat, lng, null, 'WGS84');

      if (activeCalcId === 'utm-geo') {
        $('c1GeoLat').value = lat.toFixed(8);
        $('c1GeoLon').value = lng.toFixed(8);
        $('c1UtmE').value = utm.easting.toFixed(3);
        $('c1UtmN').value = utm.northing.toFixed(3);
        $('c1UtmZone').value = utm.zone;
        $('c1UtmHemi').value = utm.hemisphere;
        calcUtmToGeo();
        calcGeoToUtm();
      } else if (activeCalcId === 'ecef-utm') {
        const h = parseFloat($('c2UtmH').value) || 0;
        const ecef = Geo.geodeticToEcef(lat, lng, h, 'WGS84');
        $('c2UtmE').value = utm.easting.toFixed(3);
        $('c2UtmN').value = utm.northing.toFixed(3);
        $('c2UtmZone').value = utm.zone;
        $('c2UtmHemi').value = utm.hemisphere;
        $('c2EcefX').value = ecef.x.toFixed(3);
        $('c2EcefY').value = ecef.y.toFixed(3);
        $('c2EcefZ').value = ecef.z.toFixed(3);
        calcUtmToEcef();
        calcEcefToUtm();
      } else if (activeCalcId === 'nad27-wgs84') {
        $('c3Direction').value = 'wgs84_to_nad27';
        if ($('c3CoordType').value === 'utm') {
          $('c3UtmE').value = utm.easting.toFixed(3);
          $('c3UtmN').value = utm.northing.toFixed(3);
          $('c3UtmZone').value = utm.zone;
          $('c3UtmHemi').value = utm.hemisphere;
        } else {
          $('c3GeoLat').value = lat.toFixed(8);
          $('c3GeoLon').value = lng.toFixed(8);
        }
        calcDatumTransform();
      }
    });
  }

  function setCalcMapBasemap(name) {
    if (!calcMap) return;
    for (const tl of calcActiveTiles) calcMap.removeLayer(tl);
    calcActiveTiles = [];
    for (const tl of (calcMapLayers[name] || [])) {
      tl.addTo(calcMap);
      calcActiveTiles.push(tl);
    }
  }

  /**
   * Dibuja 1 o más marcadores sobre el mini-mapa de las calculadoras y encuadra la vista.
   * items: [{ lat, lon, label, color, popupHtml }]
   * connectLine: si true, traza línea punteada entre los 2 puntos (ideal para desplazamiento NAD27 ↔ WGS84)
   */
  function updateCalcMiniMap(items, subtitleText = '', connectLine = false) {
    lastCalcMapPoints = (items || []).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
    if (subtitleText && $('calcMapSubtitle')) {
      $('calcMapSubtitle').textContent = subtitleText;
    }
    if (!calcMap || !calcOverlayGroup) return;
    const L = global.L;
    calcOverlayGroup.clearLayers();
    if (lastCalcMapPoints.length === 0) return;

    const latLngs = lastCalcMapPoints.map(p => [p.lat, p.lon]);

    if (connectLine && latLngs.length >= 2) {
      L.polyline(latLngs, {
        color: '#fbbf24',
        weight: 2.5,
        dashArray: '6, 6'
      }).addTo(calcOverlayGroup);
    }

    lastCalcMapPoints.forEach((p) => {
      const m = L.circleMarker([p.lat, p.lon], {
        radius: 7.5,
        color: '#0f172a',
        weight: 2.2,
        fillColor: p.color || '#00e5a0',
        fillOpacity: 1
      }).addTo(calcOverlayGroup);

      if (p.popupHtml) m.bindPopup(p.popupHtml);

      if (p.label) {
        const tagIcon = L.divIcon({
          className: 'map-pt-label',
          html: `<span class="pt-tag" style="border-color:${p.color || '#00e5a0'};color:${p.color || '#00e5a0'};">${p.label}</span>`,
          iconSize: [0, 0],
          iconAnchor: [-11, 12]
        });
        L.marker([p.lat, p.lon], { icon: tagIcon, interactive: false }).addTo(calcOverlayGroup);
      }
    });

    fitCalcMiniMap();
  }

  function fitCalcMiniMap() {
    if (!calcMap || lastCalcMapPoints.length === 0) return;
    if (lastCalcMapPoints.length === 1) {
      calcMap.setView([lastCalcMapPoints[0].lat, lastCalcMapPoints[0].lon], 17);
    } else {
      const bounds = global.L.latLngBounds(lastCalcMapPoints.map(p => [p.lat, p.lon]));
      calcMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
    }
  }

  function syncCalcMapVisibility() {
    const card = $('calcMapCard');
    if (!card) return;
    const show = MAP_ENABLED_CALCS.has(activeCalcId);
    card.classList.toggle('hidden', !show);
    if (show) {
      initCalcMiniMap();
      setTimeout(() => {
        if (calcMap) {
          calcMap.invalidateSize();
          if (activeCalcId === 'utm-geo') calcUtmToGeo();
          else if (activeCalcId === 'ecef-utm') calcEcefToUtm();
          else if (activeCalcId === 'nad27-wgs84') calcDatumTransform();
        }
      }, 60);
    }
  }

  const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function kv(label, value) {
    return `<div class="result-kv"><span>${label}</span><code>${value}</code></div>`;
  }

  function formatLatDms(lat) {
    const p = Geo.ddToParts(Math.abs(lat));
    const hemi = lat >= 0 ? 'N' : 'S';
    return `${p.d}° ${String(p.m).padStart(2, '0')}' ${p.s.toFixed(4).padStart(7, '0')}" ${hemi}`;
  }

  function formatLonDms(lon) {
    const p = Geo.ddToParts(Math.abs(lon));
    const hemi = lon >= 0 ? 'E' : 'W';
    return `${p.d}° ${String(p.m).padStart(2, '0')}' ${p.s.toFixed(4).padStart(7, '0')}" ${hemi}`;
  }

  // ==================== CAMBIO DE VISTA PRINCIPAL (COGO <-> CALCULADORAS) ====================
  function setMainView(view) {
    const isCalcs = view === 'calcs';
    $('cogoWorkspace').classList.toggle('hidden', isCalcs);
    $('calculatorsView').classList.toggle('hidden', !isCalcs);
    document.querySelectorAll('.cogo-only').forEach(el => el.classList.toggle('hidden', isCalcs));
    $('mainViewSwitcher').querySelectorAll('.seg-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
    if (!isCalcs && global.TopoAppBridge && global.TopoAppBridge.onReturnToCogo) {
      global.TopoAppBridge.onReturnToCogo();
    } else if (isCalcs) {
      syncCalcMapVisibility();
    }
  }

  function plotOnCogoMap(e, n, z, zone, hemi, label) {
    setMainView('cogo');
    if (global.TopoAppBridge && global.TopoAppBridge.plotPointOnMap) {
      global.TopoAppBridge.plotPointOnMap(e, n, z, zone, hemi, label);
    }
  }

  // ==================== 1. UTM <-> GEOGRAFICAS ====================
  let lastC1UtmResult = null;
  let lastC1GeoResult = null;

  function calcUtmToGeo() {
    const e = parseFloat($('c1UtmE').value);
    const n = parseFloat($('c1UtmN').value);
    const zone = parseInt($('c1UtmZone').value, 10) || 17;
    const hemi = $('c1UtmHemi').value || 'N';
    const ell = $('c1UtmEll').value || 'WGS84';
    const box = $('resC1UtmToGeo');

    if (!Number.isFinite(e) || !Number.isFinite(n) || zone < 1 || zone > 60) {
      box.className = 'result-box error mt-sm';
      box.textContent = 'Ingresa Este, Norte y Zona UTM (1–60) válidos.';
      return;
    }

    const r = Geo.utmToLatLon(e, n, zone, hemi, ell);
    lastC1UtmResult = { e, n, zone, hemi, ...r };
    box.className = 'result-box mt-sm';
    box.innerHTML = [
      kv('Latitud (DD):', `${r.lat.toFixed(8)}°`),
      kv('Longitud (DD):', `${r.lon.toFixed(8)}°`),
      kv('Latitud (G°M\'S"):', formatLatDms(r.lat)),
      kv('Longitud (G°M\'S"):', formatLonDms(r.lon)),
      kv('Meridiano Central:', `${r.centralMeridian}°`),
      kv('Convergencia (γ):', `${r.convergenceDeg.toFixed(6)}° (${Geo.ddToParts(r.convergenceDeg).dmsText})`),
      kv('Factor de Escala (k):', r.scaleFactor.toFixed(8))
    ].join('');

    if (activeCalcId === 'utm-geo') {
      updateCalcMiniMap([{
        lat: r.lat,
        lon: r.lon,
        label: `UTM ${zone}${hemi}`,
        color: '#00e5a0',
        popupHtml: `<div class="map-popup"><div class="map-popup-title">UTM → Geográficas</div><div><b>E:</b> ${e.toFixed(3)} m</div><div><b>N:</b> ${n.toFixed(3)} m</div><div><b>Lat/Lon:</b> ${r.lat.toFixed(6)}°, ${r.lon.toFixed(6)}°</div></div>`
      }], `UTM ${zone}${hemi} (${ell}): E ${e.toFixed(3)}, N ${n.toFixed(3)} → Lat ${r.lat.toFixed(6)}°, Lon ${r.lon.toFixed(6)}°`);
    }
  }

  function calcGeoToUtm() {
    const lat = parseFloat($('c1GeoLat').value);
    const lon = parseFloat($('c1GeoLon').value);
    const zSel = $('c1GeoZone').value;
    const forcedZone = zSel === 'auto' ? null : parseInt(zSel, 10);
    const ell = $('c1GeoEll').value || 'WGS84';
    const box = $('resC1GeoToUtm');

    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -80 || lat > 84 || lon < -180 || lon > 180) {
      box.className = 'result-box error mt-sm';
      box.textContent = 'Ingresa Latitud (−80° a 84°) y Longitud (−180° a 180°) válidas.';
      return;
    }

    const r = Geo.latLonToUtm(lat, lon, forcedZone, ell);
    lastC1GeoResult = r;
    box.className = 'result-box mt-sm';
    box.innerHTML = [
      kv('Este (X):', `${r.easting.toFixed(3)} m`),
      kv('Norte (Y):', `${r.northing.toFixed(3)} m`),
      kv('Zona UTM:', `${r.zone}${r.hemisphere} (MC: ${r.centralMeridian}°)`),
      kv('Convergencia (γ):', `${r.convergenceDeg.toFixed(6)}° (${Geo.ddToParts(r.convergenceDeg).dmsText})`),
      kv('Factor de Escala (k):', r.scaleFactor.toFixed(8))
    ].join('');

    if (activeCalcId === 'utm-geo') {
      updateCalcMiniMap([{
        lat,
        lon,
        label: `GEO → ${r.zone}${r.hemisphere}`,
        color: '#38bdf8',
        popupHtml: `<div class="map-popup"><div class="map-popup-title">Geográficas → UTM</div><div><b>Lat/Lon:</b> ${lat.toFixed(6)}°, ${lon.toFixed(6)}°</div><div><b>E:</b> ${r.easting.toFixed(3)} m</div><div><b>N:</b> ${r.northing.toFixed(3)} m</div></div>`
      }], `Geográficas: ${lat.toFixed(6)}°, ${lon.toFixed(6)}° → UTM ${r.zone}${r.hemisphere} E ${r.easting.toFixed(3)}, N ${r.northing.toFixed(3)}`);
    }
  }

  // ==================== 2. GEOCENTRICAS ECEF <-> UTM ====================
  let lastC2EcefResult = null;

  function calcUtmToEcef() {
    const e = parseFloat($('c2UtmE').value);
    const n = parseFloat($('c2UtmN').value);
    const h = parseFloat($('c2UtmH').value) || 0;
    const zone = parseInt($('c2UtmZone').value, 10) || 17;
    const hemi = $('c2UtmHemi').value || 'N';
    const box = $('resC2UtmToEcef');

    if (!Number.isFinite(e) || !Number.isFinite(n)) {
      box.className = 'result-box error mt-sm';
      box.textContent = 'Ingresa coordenadas UTM válidas.';
      return;
    }
    const r = Geo.utmToEcef(e, n, h, zone, hemi, 'WGS84');
    // Sincronizar campos inversos como referencia rápida
    box.className = 'result-box mt-sm';
    box.innerHTML = [
      kv('X (ECEF WGS84):', `${r.x.toFixed(4)} m`),
      kv('Y (ECEF WGS84):', `${r.y.toFixed(4)} m`),
      kv('Z (ECEF WGS84):', `${r.z.toFixed(4)} m`),
      kv('Lat / Lon:', `${r.lat.toFixed(7)}°, ${r.lon.toFixed(7)}°`),
      kv('Altura Elipsoidal (h):', `${h.toFixed(3)} m`)
    ].join('');

    if (activeCalcId === 'ecef-utm') {
      updateCalcMiniMap([{
        lat: r.lat,
        lon: r.lon,
        label: 'UTM → ECEF',
        color: '#00e5a0',
        popupHtml: `<div class="map-popup"><div class="map-popup-title">UTM → ECEF WGS84</div><div><b>X:</b> ${r.x.toFixed(3)} m</div><div><b>Y:</b> ${r.y.toFixed(3)} m</div><div><b>Z:</b> ${r.z.toFixed(3)} m</div><div><b>h:</b> ${h.toFixed(3)} m</div></div>`
      }], `ECEF (X:${r.x.toFixed(2)}, Y:${r.y.toFixed(2)}, Z:${r.z.toFixed(2)}) · h=${h.toFixed(2)} m`);
    }
  }

  function calcEcefToUtm() {
    const x = parseFloat($('c2EcefX').value);
    const y = parseFloat($('c2EcefY').value);
    const z = parseFloat($('c2EcefZ').value);
    const zSel = $('c2EcefZone').value;
    const forcedZone = zSel === 'auto' ? null : parseInt(zSel, 10);
    const box = $('resC2EcefToUtm');

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      box.className = 'result-box error mt-sm';
      box.textContent = 'Ingresa X, Y, Z geocéntricas válidas.';
      return;
    }
    const r = Geo.ecefToUtm(x, y, z, forcedZone, 'WGS84');
    lastC2EcefResult = r;
    box.className = 'result-box mt-sm';
    box.innerHTML = [
      kv('Este (X UTM):', `${r.easting.toFixed(3)} m`),
      kv('Norte (Y UTM):', `${r.northing.toFixed(3)} m`),
      kv('Altura Elipsoidal (h):', `${r.h.toFixed(3)} m`),
      kv('Zona UTM:', `${r.zone}${r.hemisphere}`),
      kv('Latitud / Longitud:', `${r.lat.toFixed(7)}°, ${r.lon.toFixed(7)}°`),
      kv('DMS:', `${formatLatDms(r.lat)} · ${formatLonDms(r.lon)}`)
    ].join('');

    if (activeCalcId === 'ecef-utm') {
      updateCalcMiniMap([{
        lat: r.lat,
        lon: r.lon,
        label: `ECEF → ${r.zone}${r.hemisphere}`,
        color: '#38bdf8',
        popupHtml: `<div class="map-popup"><div class="map-popup-title">ECEF → UTM ${r.zone}${r.hemisphere}</div><div><b>E:</b> ${r.easting.toFixed(3)} m</div><div><b>N:</b> ${r.northing.toFixed(3)} m</div><div><b>h:</b> ${r.h.toFixed(3)} m</div></div>`
      }], `ECEF → UTM ${r.zone}${r.hemisphere}: E ${r.easting.toFixed(3)}, N ${r.northing.toFixed(3)}, h ${r.h.toFixed(2)} m`);
    }
  }

  // ==================== 3. DATUM NAD27 <-> WGS84 ====================
  let lastC3WgsPoint = null;

  function calcDatumTransform() {
    const dir = $('c3Direction').value;
    const coordType = $('c3CoordType').value;
    const preset = $('c3Preset').value;
    const box = $('resC3Datum');

    let shift;
    if (preset === 'custom') {
      shift = {
        label: 'Personalizado',
        dx: parseFloat($('c3Dx').value) || 0,
        dy: parseFloat($('c3Dy').value) || 0,
        dz: parseFloat($('c3Dz').value) || 0
      };
    } else {
      shift = Geo.DATUM_SHIFTS_NAD27_TO_WGS84[preset] || Geo.DATUM_SHIFTS_NAD27_TO_WGS84.panama;
    }

    const dstLabel = dir === 'nad27_to_wgs84' ? 'WGS84' : 'NAD27 (Clarke 1866)';

    if (coordType === 'utm') {
      const e = parseFloat($('c3UtmE').value);
      const n = parseFloat($('c3UtmN').value);
      const zone = parseInt($('c3UtmZone').value, 10) || 17;
      const hemi = $('c3UtmHemi').value || 'N';
      if (!Number.isFinite(e) || !Number.isFinite(n)) {
        box.className = 'result-box error mt-sm';
        box.textContent = 'Ingresa Este y Norte válidos.';
        return;
      }
      const r = Geo.transformDatumUtm(e, n, 0, zone, hemi, dir, shift);
      const dH = Math.hypot(r.dE, r.dN);

      if (dir === 'nad27_to_wgs84') {
        lastC3WgsPoint = { e: r.dstUtm.easting, n: r.dstUtm.northing, zone, hemi };
      } else {
        lastC3WgsPoint = { e, n, zone, hemi };
      }

      box.className = 'result-box mt-sm';
      box.innerHTML = [
        kv(`Resultado ${dstLabel} — Este (X):`, `${r.dstUtm.easting.toFixed(3)} m`),
        kv(`Resultado ${dstLabel} — Norte (Y):`, `${r.dstUtm.northing.toFixed(3)} m`),
        kv(`Zona UTM:`, `${r.dstUtm.zone}${r.dstUtm.hemisphere}`),
        kv(`Geográficas ${dstLabel}:`, `${r.dstGeo.lat.toFixed(7)}°, ${r.dstGeo.lon.toFixed(7)}°`),
        kv(`DMS ${dstLabel}:`, `${formatLatDms(r.dstGeo.lat)} · ${formatLonDms(r.dstGeo.lon)}`),
        kv('Desplazamiento ΔE / ΔN:', `${r.dE >= 0 ? '+' : ''}${r.dE.toFixed(3)} m / ${r.dN >= 0 ? '+' : ''}${r.dN.toFixed(3)} m (Total: ${dH.toFixed(3)} m)`),
        kv('Parámetros (ΔX, ΔY, ΔZ):', `${shift.dx}, ${shift.dy}, ${shift.dz} m`)
      ].join('');

      if (activeCalcId === 'nad27-wgs84') {
        // Mostrar posición real WGS84 (verde) vs coordenada NAD27 sin transformar sobre WGS84 (ámbar) para visualizar el desplazamiento de ~200m
        const wgsGeo = dir === 'nad27_to_wgs84' ? r.dstGeo : r.srcGeo;
        const nadUtm = dir === 'nad27_to_wgs84' ? { e, n } : { e: r.dstUtm.easting, n: r.dstUtm.northing };
        const nadAsWgs = Geo.utmToLatLon(nadUtm.e, nadUtm.n, zone, hemi, 'WGS84');
        updateCalcMiniMap([
          {
            lat: wgsGeo.lat,
            lon: wgsGeo.lon,
            label: 'WGS84 (Real)',
            color: '#00e5a0',
            popupHtml: `<div class="map-popup"><div class="map-popup-title">Posición WGS84</div><div><b>E:</b> ${lastC3WgsPoint.e.toFixed(3)} m</div><div><b>N:</b> ${lastC3WgsPoint.n.toFixed(3)} m</div></div>`
          },
          {
            lat: nadAsWgs.lat,
            lon: nadAsWgs.lon,
            label: `NAD27 (Δ ${dH.toFixed(1)} m)`,
            color: '#f59e0b',
            popupHtml: `<div class="map-popup"><div class="map-popup-title">NAD27 sin transformar</div><div><b>E:</b> ${nadUtm.e.toFixed(3)} m</div><div><b>N:</b> ${nadUtm.n.toFixed(3)} m</div><div><b>Desplazamiento:</b> ${dH.toFixed(2)} m</div></div>`
          }
        ], `Desplazamiento visual NAD27 ↔ WGS84: ΔE ${r.dE >= 0 ? '+' : ''}${r.dE.toFixed(2)} m, ΔN ${r.dN >= 0 ? '+' : ''}${r.dN.toFixed(2)} m (Total ${dH.toFixed(2)} m)`, true);
      }
    } else {
      const lat = parseFloat($('c3GeoLat').value);
      const lon = parseFloat($('c3GeoLon').value);
      const h = parseFloat($('c3GeoH').value) || 0;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        box.className = 'result-box error mt-sm';
        box.textContent = 'Ingresa Latitud y Longitud válidas.';
        return;
      }
      const dstGeo = Geo.transformDatumGeo(lat, lon, h, dir, shift);
      const dstEll = dir === 'nad27_to_wgs84' ? 'WGS84' : 'CLARKE1866';
      const dstUtm = Geo.latLonToUtm(dstGeo.lat, dstGeo.lon, null, dstEll);
      const wgsUtm = dir === 'nad27_to_wgs84' ? dstUtm : Geo.latLonToUtm(lat, lon, null, 'WGS84');
      lastC3WgsPoint = { e: wgsUtm.easting, n: wgsUtm.northing, zone: wgsUtm.zone, hemi: wgsUtm.hemisphere };

      box.className = 'result-box mt-sm';
      box.innerHTML = [
        kv(`Latitud ${dstLabel}:`, `${dstGeo.lat.toFixed(8)}° (${formatLatDms(dstGeo.lat)})`),
        kv(`Longitud ${dstLabel}:`, `${dstGeo.lon.toFixed(8)}° (${formatLonDms(dstGeo.lon)})`),
        kv(`Altura h ${dstLabel}:`, `${dstGeo.h.toFixed(3)} m`),
        kv(`UTM ${dstLabel} (${dstUtm.zone}${dstUtm.hemisphere}):`, `E ${dstUtm.easting.toFixed(3)} m, N ${dstUtm.northing.toFixed(3)} m`),
        kv('Parámetros (ΔX, ΔY, ΔZ):', `${shift.dx}, ${shift.dy}, ${shift.dz} m`)
      ].join('');

      if (activeCalcId === 'nad27-wgs84') {
        const wgsLat = dir === 'nad27_to_wgs84' ? dstGeo.lat : lat;
        const wgsLon = dir === 'nad27_to_wgs84' ? dstGeo.lon : lon;
        const nadLat = dir === 'nad27_to_wgs84' ? lat : dstGeo.lat;
        const nadLon = dir === 'nad27_to_wgs84' ? lon : dstGeo.lon;
        updateCalcMiniMap([
          { lat: wgsLat, lon: wgsLon, label: 'WGS84 (Real)', color: '#00e5a0' },
          { lat: nadLat, lon: nadLon, label: 'NAD27 (Sin transf.)', color: '#f59e0b' }
        ], `Comparación visual WGS84 vs NAD27 (${wgsLat.toFixed(6)}°, ${wgsLon.toFixed(6)}°)`, true);
      }
    }
  }

  // ==================== 4. GRADOS DECIMALES <-> G° M' S" ====================
  function calcDdToDms() {
    const v1 = parseFloat($('c4DdLat').value);
    const v2 = parseFloat($('c4DdLon').value);
    const box = $('resC4DdToDms');
    if (!Number.isFinite(v1)) {
      box.className = 'result-box error mt-sm';
      box.textContent = 'Ingresa al menos un valor en grados decimales.';
      return;
    }
    const p1 = Geo.ddToParts(v1);
    const rows = [
      kv('Ángulo 1 — G° M\' S":', `${p1.dmsText} (${formatLatDms(v1)})`),
      kv('Ángulo 1 — Grados y Min. Dec.:', p1.ddmText),
      kv('Ángulo 1 — Radianes / Gradianes:', `${p1.rad.toFixed(8)} rad · ${p1.gon.toFixed(6)} gon`)
    ];
    if (Number.isFinite(v2)) {
      const p2 = Geo.ddToParts(v2);
      rows.push(
        kv('Ángulo 2 — G° M\' S":', `${p2.dmsText} (${formatLonDms(v2)})`),
        kv('Ángulo 2 — Grados y Min. Dec.:', p2.ddmText),
        kv('Ángulo 2 — Radianes / Gradianes:', `${p2.rad.toFixed(8)} rad · ${p2.gon.toFixed(6)} gon`)
      );
    }
    box.className = 'result-box mt-sm';
    box.innerHTML = rows.join('');
  }

  function calcDmsToDd() {
    const latDd = Geo.dmsToDecimal($('c4LatD').value, $('c4LatM').value, $('c4LatS').value, $('c4LatHemi').value);
    const lonDd = Geo.dmsToDecimal($('c4LonD').value, $('c4LonM').value, $('c4LonS').value, $('c4LonHemi').value);
    const p1 = Geo.ddToParts(latDd);
    const p2 = Geo.ddToParts(lonDd);
    const box = $('resC4DmsToDd');
    box.className = 'result-box mt-sm';
    box.innerHTML = [
      kv('Latitud / Ángulo 1 (DD):', `${latDd.toFixed(8)}°`),
      kv('Ángulo 1 — DDM / Rad / Gon:', `${p1.ddmText} · ${p1.rad.toFixed(6)} rad · ${p1.gon.toFixed(5)} g`),
      kv('Longitud / Ángulo 2 (DD):', `${lonDd.toFixed(8)}°`),
      kv('Ángulo 2 — DDM / Rad / Gon:', `${p2.ddmText} · ${p2.rad.toFixed(6)} rad · ${p2.gon.toFixed(5)} g`)
    ].join('');
  }

  // ==================== 5. CALENDARIO GPS / GNSS (DOY / GPS WEEK) ====================
  function renderGpsResult(gps) {
    currentGpsState = gps;
    calViewYear = gps.year;
    calViewMonth = gps.month;

    // Sincronizar los 3 formularios
    $('c5Date').value = gps.isoDate;
    $('c5DoyYear').value = gps.year;
    $('c5DoyVal').value = gps.doy;
    $('c5WeekVal').value = gps.gpsWeek;
    $('c5DowVal').value = String(gps.dow);

    const isEn = global.TopoI18n && global.TopoI18n.getLang() === 'en';
    const dayName = isEn ? gps.dayNameEn : gps.dayNameEs;

    $('gpsKpiGrid').innerHTML = `
      <div class="gps-kpi-card">
        <span>${isEn ? 'GPS Week' : 'Semana GPS'}</span>
        <strong>${gps.gpsWeek}</strong>
        <small>Rollover (10-bit): ${gps.gpsWeekRollover}</small>
      </div>
      <div class="gps-kpi-card">
        <span>${isEn ? 'Day of Year (DOY)' : 'Día del Año (DOY)'}</span>
        <strong>${gps.doyStr}</strong>
        <small>${gps.doy} / ${gps.daysInYear} · ${gps.isoDate}</small>
      </div>
      <div class="gps-kpi-card">
        <span>${isEn ? 'Day / Seconds of Week' : 'Día / Segundos Semana'}</span>
        <strong>DOW ${gps.dow} (${dayName})</strong>
        <small>SOW: ${Math.round(gps.sow).toLocaleString('en-US')} s</small>
      </div>
      <div class="gps-kpi-card">
        <span>RINEX / IGS / Julian</span>
        <strong>${gps.igsSp3Name}</strong>
        <small>${gps.rinexObsName} · MJD ${gps.mjd.toFixed(2)}</small>
      </div>
    `;

    renderGpsMonthCalendar();
  }

  function renderGpsMonthCalendar() {
    const isEn = global.TopoI18n && global.TopoI18n.getLang() === 'en';
    const monthNames = isEn ? MONTHS_EN : MONTHS_ES;
    const dayHdrs = isEn
      ? ['GPS Wk', 'Sun (0)', 'Mon (1)', 'Tue (2)', 'Wed (3)', 'Thu (4)', 'Fri (5)', 'Sat (6)']
      : ['Sem GPS', 'Dom (0)', 'Lun (1)', 'Mar (2)', 'Mié (3)', 'Jue (4)', 'Vie (5)', 'Sáb (6)'];

    $('gpsCalMonthTitle').textContent = `${monthNames[calViewMonth - 1]} ${calViewYear} — GPS Week & DOY`;

    const grid = $('gpsMonthCalendar');
    grid.innerHTML = '';

    for (const h of dayHdrs) {
      const div = document.createElement('div');
      div.className = 'gps-cal-hdr';
      div.textContent = h;
      grid.appendChild(div);
    }

    const firstDay = new Date(Date.UTC(calViewYear, calViewMonth - 1, 1));
    const startDow = firstDay.getUTCDay(); // 0=Dom
    const daysInMonth = new Date(Date.UTC(calViewYear, calViewMonth, 0)).getUTCDate();
    const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;

    for (let cell = 0; cell < totalCells; cell++) {
      const dayOffset = cell - startDow + 1;
      const cellDate = new Date(Date.UTC(calViewYear, calViewMonth - 1, dayOffset));
      const y = cellDate.getUTCFullYear();
      const m = cellDate.getUTCMonth() + 1;
      const d = cellDate.getUTCDate();
      const gpsInfo = Geo.dateToGps(y, m, d);

      // Al inicio de cada fila (domingo), insertar etiqueta de Semana GPS
      if (cell % 7 === 0) {
        const wkDiv = document.createElement('div');
        wkDiv.className = 'gps-cal-wk';
        wkDiv.innerHTML = `<small>GPS WK</small>${gpsInfo.gpsWeek}`;
        grid.appendChild(wkDiv);
      }

      const dayBtn = document.createElement('button');
      dayBtn.type = 'button';
      const isOtherMonth = m !== calViewMonth;
      const isSelected = currentGpsState && currentGpsState.isoDate === gpsInfo.isoDate;
      dayBtn.className = `gps-cal-day${isOtherMonth ? ' muted' : ''}${isSelected ? ' selected' : ''}`;
      dayBtn.title = `${gpsInfo.isoDate} | GPS Week ${gpsInfo.gpsWeek} | DOW ${gpsInfo.dow} | DOY ${gpsInfo.doyStr}`;
      dayBtn.innerHTML = `<span class="day-num">${d}</span><span class="day-doy">DOY ${gpsInfo.doyStr}</span>`;
      dayBtn.addEventListener('click', () => {
        const parts = parseTimeInput($('c5Time').value);
        renderGpsResult(Geo.dateToGps(y, m, d, parts.h, parts.m, parts.s));
      });
      grid.appendChild(dayBtn);
    }
  }

  function parseTimeInput(str) {
    const m = String(str || '').trim().match(/^(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?$/);
    if (!m) return { h: 0, m: 0, s: 0 };
    return {
      h: Math.min(23, parseInt(m[1], 10) || 0),
      m: Math.min(59, parseInt(m[2], 10) || 0),
      s: Math.min(59, parseInt(m[3], 10) || 0)
    };
  }

  function calcGpsFromDate() {
    const val = $('c5Date').value;
    if (!val) return;
    const [y, m, d] = val.split('-').map(Number);
    const t = parseTimeInput($('c5Time').value);
    renderGpsResult(Geo.dateToGps(y, m, d, t.h, t.m, t.s));
  }

  // ==================== INICIALIZACIÓN ====================
  function initCalculators() {
    // 1. Switcher principal COGO <-> Calculadoras
    $('mainViewSwitcher').addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      setMainView(btn.dataset.view);
    });

    // 2. Menú lateral de las 5 calculadoras
    document.querySelectorAll('.calc-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.calc-nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.calc-section').forEach(s => s.classList.remove('active'));
        btn.classList.add('active');
        activeCalcId = btn.dataset.calc;
        $(`calc-${activeCalcId}`).classList.add('active');
        syncCalcMapVisibility();
      });
    });

    // Controles del mini-mapa de calculadoras
    $('calcMapBmToggle').addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      $('calcMapBmToggle').querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setCalcMapBasemap(btn.dataset.cbm);
    });
    $('btnCalcMapFit').addEventListener('click', fitCalcMiniMap);

    // Calc 1: UTM <-> Geo
    $('btnC1UtmToGeo').addEventListener('click', calcUtmToGeo);
    $('btnC1GeoToUtm').addEventListener('click', calcGeoToUtm);
    $('btnC1PlotUtm').addEventListener('click', () => {
      calcUtmToGeo();
      if (lastC1UtmResult) plotOnCogoMap(lastC1UtmResult.e, lastC1UtmResult.n, 0, lastC1UtmResult.zone, lastC1UtmResult.hemi, 'UTM_CALC');
    });
    $('btnC1PlotGeo').addEventListener('click', () => {
      calcGeoToUtm();
      if (lastC1GeoResult) plotOnCogoMap(lastC1GeoResult.easting, lastC1GeoResult.northing, 0, lastC1GeoResult.zone, lastC1GeoResult.hemisphere, 'GEO_CALC');
    });

    // Calc 2: ECEF <-> UTM
    $('btnC2UtmToEcef').addEventListener('click', calcUtmToEcef);
    $('btnC2EcefToUtm').addEventListener('click', calcEcefToUtm);
    $('btnC2PlotEcef').addEventListener('click', () => {
      calcEcefToUtm();
      if (lastC2EcefResult) plotOnCogoMap(lastC2EcefResult.easting, lastC2EcefResult.northing, lastC2EcefResult.h, lastC2EcefResult.zone, lastC2EcefResult.hemisphere, 'ECEF_CALC');
    });

    // Calc 3: NAD27 <-> WGS84
    $('c3Preset').addEventListener('change', (e) => {
      $('c3CustomShiftRow').classList.toggle('hidden', e.target.value !== 'custom');
      calcDatumTransform();
    });
    $('c3CoordType').addEventListener('change', (e) => {
      const isUtm = e.target.value === 'utm';
      $('c3UtmInputs').classList.toggle('hidden', !isUtm);
      $('c3GeoInputs').classList.toggle('hidden', isUtm);
      calcDatumTransform();
    });
    $('c3Direction').addEventListener('change', calcDatumTransform);
    $('btnC3Transform').addEventListener('click', calcDatumTransform);
    $('btnC3PlotWgs').addEventListener('click', () => {
      calcDatumTransform();
      if (lastC3WgsPoint) plotOnCogoMap(lastC3WgsPoint.e, lastC3WgsPoint.n, 0, lastC3WgsPoint.zone, lastC3WgsPoint.hemi, 'WGS84_DATUM');
    });

    // Calc 4: DD <-> DMS
    $('btnC4DdToDms').addEventListener('click', calcDdToDms);
    $('btnC4DmsToDd').addEventListener('click', calcDmsToDd);

    // Calc 5: Calendario GPS
    $('btnC5FromDate').addEventListener('click', calcGpsFromDate);
    $('c5Date').addEventListener('change', calcGpsFromDate);
    $('btnGpsToday').addEventListener('click', () => {
      const now = new Date();
      renderGpsResult(Geo.dateToGps(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds()));
    });
    $('btnC5FromDoy').addEventListener('click', () => {
      const y = parseInt($('c5DoyYear').value, 10) || 2026;
      const doy = parseInt($('c5DoyVal').value, 10) || 1;
      renderGpsResult(Geo.doyToDate(y, doy));
    });
    $('btnC5FromWeek').addEventListener('click', () => {
      const wk = parseInt($('c5WeekVal').value, 10) || 0;
      const dow = parseInt($('c5DowVal').value, 10) || 0;
      renderGpsResult(Geo.gpsWeekToDate(wk, dow));
    });
    $('btnGpsPrevMonth').addEventListener('click', () => {
      calViewMonth -= 1;
      if (calViewMonth < 1) { calViewMonth = 12; calViewYear -= 1; }
      renderGpsMonthCalendar();
    });
    $('btnGpsNextMonth').addEventListener('click', () => {
      calViewMonth += 1;
      if (calViewMonth > 12) { calViewMonth = 1; calViewYear += 1; }
      renderGpsMonthCalendar();
    });

    // Ejecutar cálculos iniciales de muestra para todas las calculadoras
    calcUtmToGeo();
    calcGeoToUtm();
    calcUtmToEcef();
    calcEcefToUtm();
    calcDatumTransform();
    calcDdToDms();
    calcDmsToDd();
    calcGpsFromDate();
  }

  global.TopoCalculators = {
    refreshGpsLanguage: () => { if (currentGpsState) renderGpsResult(currentGpsState); }
  };

  document.addEventListener('DOMContentLoaded', initCalculators);
})(window);
