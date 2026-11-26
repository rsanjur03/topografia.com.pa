/**
 * ign.js — Gestor de Mosaicos y Hojas Cartográficas IGN Tommy Guardia (ANATI Panamá)
 * - Incluye precargada la Hoja 3741 III NW (DAVID 1:25,000 WGS84)
 * - Catálogo de cuadrantes IGN 1:25,000 de Chiriquí (esquinas exactas 7.5' x 5')
 * - Subida de nuevas hojas en PDF (auto-render + auto-recorte con pdf.js) o JPG/PNG
 * - Persistencia en IndexedDB (soporta decenas de hojas en alta resolución)
 * - Recorte automático georreferenciado para el cuadro LOCALIZACION REGIONAL del PDF ANATI
 */
(function (global) {
  'use strict';

  const DB_NAME = 'topografia_pa_ign_v1';
  const STORE_NAME = 'sheets';

  // Proporciones exactas del marco cartográfico interior en hojas PDF oficiales IGN 1:25,000 (Serie E862)
  const IGN_25K_CROP_RATIO = {
    x: 786 / 4500,
    y: 244 / 3179,
    w: 2932 / 4500,
    h: 1982 / 3179
  };

  // 20 hojas oficiales IGN Tommy Guardia 1:25,000 de Chiriquí precargadas y georreferenciadas (WGS84)
  const BUILTIN_SHEETS = [
    { id: 'builtin_3741_III_NW', code: '3741 III NW', name: 'David', scale: '1:25,000', url: 'assets/ign/3741_III_NW_DAVID.jpg', bounds: { south: 8.416667, north: 8.500000, west: -82.500000, east: -82.375000 }, builtin: true, enabled: false },
    { id: 'builtin_3741_III_NE', code: '3741 III NE', name: 'Las Lomas / Chiriquí', scale: '1:25,000', url: 'assets/ign/3741_III_NE.jpg', bounds: { south: 8.416667, north: 8.500000, west: -82.375000, east: -82.250000 }, builtin: true, enabled: false },
    { id: 'builtin_3741_IV_SW', code: '3741 IV SW', name: 'Dolega / Los Algarrobos', scale: '1:25,000', url: 'assets/ign/3741_IV_SW.jpg', bounds: { south: 8.500000, north: 8.583333, west: -82.500000, east: -82.375000 }, builtin: true, enabled: false },
    { id: 'builtin_3741_IV_SE', code: '3741 IV SE', name: 'Gualaca Sur / Tinajas', scale: '1:25,000', url: 'assets/ign/3741_IV_SE.jpg', bounds: { south: 8.500000, north: 8.583333, west: -82.375000, east: -82.250000 }, builtin: true, enabled: false },
    { id: 'builtin_3741_IV_NW', code: '3741 IV NW', name: 'Potrerillos / Boquete Sur', scale: '1:25,000', url: 'assets/ign/3741_IV_NW.jpg', bounds: { south: 8.583333, north: 8.666667, west: -82.500000, east: -82.375000 }, builtin: true, enabled: false },
    { id: 'builtin_3742_III_SW', code: '3742 III SW', name: 'Bajo Boquete / Alto Boquete', scale: '1:25,000', url: 'assets/ign/3742_III_SW.jpg', bounds: { south: 8.666667, north: 8.750000, west: -82.500000, east: -82.375000 }, builtin: true, enabled: false },
    { id: 'builtin_3742_III_NW', code: '3742 III NW', name: 'Boquete Norte / Alto Quiel', scale: '1:25,000', url: 'assets/ign/3742_III_NW.jpg', bounds: { south: 8.750000, north: 8.833333, west: -82.500000, east: -82.375000 }, builtin: true, enabled: false },
    { id: 'builtin_3641_II_NE', code: '3641 II NE', name: 'San Pablo / Alanje Norte', scale: '1:25,000', url: 'assets/ign/3641_II_NE.jpg', bounds: { south: 8.416667, north: 8.500000, west: -82.625000, east: -82.500000 }, builtin: true, enabled: false },
    { id: 'builtin_3641_II_SE', code: '3641 II SE', name: 'Alanje / Guarumal', scale: '1:25,000', url: 'assets/ign/3641_II_SE.jpg', bounds: { south: 8.333333, north: 8.416667, west: -82.625000, east: -82.500000 }, builtin: true, enabled: false },
    { id: 'builtin_3641_II_SW', code: '3641 II SW', name: 'Divalá / Santo Tomás', scale: '1:25,000', url: 'assets/ign/3641_II_SW.jpg', bounds: { south: 8.333333, north: 8.416667, west: -82.750000, east: -82.625000 }, builtin: true, enabled: false },
    { id: 'builtin_3641_I_SE', code: '3641 I SE', name: 'Boquerón / Bugaba Este', scale: '1:25,000', url: 'assets/ign/3641_I_SE.jpg', bounds: { south: 8.500000, north: 8.583333, west: -82.625000, east: -82.500000 }, builtin: true, enabled: false },
    { id: 'builtin_3641_I_SW', code: '3641 I SW', name: 'Santa Marta / La Concepción', scale: '1:25,000', url: 'assets/ign/3641_I_SW.jpg', bounds: { south: 8.500000, north: 8.583333, west: -82.750000, east: -82.625000 }, builtin: true, enabled: false },
    { id: 'builtin_3641_I_NW', code: '3641 I NW', name: 'Gómez Norte / Aserrío', scale: '1:25,000', url: 'assets/ign/3641_I_NW.jpg', bounds: { south: 8.583333, north: 8.666667, west: -82.750000, east: -82.625000 }, builtin: true, enabled: false },
    { id: 'builtin_3641_IV_SE', code: '3641 IV SE', name: 'Paso Canoas / Progreso', scale: '1:25,000', url: 'assets/ign/3641_IV_SE.jpg', bounds: { south: 8.500000, north: 8.583333, west: -82.875000, east: -82.750000 }, builtin: true, enabled: false },
    { id: 'builtin_3641_IV_NE', code: '3641 IV NE', name: 'San Andrés / Progreso Norte', scale: '1:25,000', url: 'assets/ign/3641_IV_NE.jpg', bounds: { south: 8.583333, north: 8.666667, west: -82.875000, east: -82.750000 }, builtin: true, enabled: false },
    { id: 'builtin_3642_II_SW', code: '3642 II SW', name: 'Cuesta de Piedra / Santa Cruz', scale: '1:25,000', url: 'assets/ign/3642_II_SW.jpg', bounds: { south: 8.666667, north: 8.750000, west: -82.750000, east: -82.625000 }, builtin: true, enabled: false },
    { id: 'builtin_3642_II_NW', code: '3642 II NW', name: 'Volcán Oeste / Dominical', scale: '1:25,000', url: 'assets/ign/3642_II_NW.jpg', bounds: { south: 8.750000, north: 8.833333, west: -82.750000, east: -82.625000 }, builtin: true, enabled: false },
    { id: 'builtin_3642_I_SW', code: '3642 I SW', name: 'Parque La Amistad / Jurutungo', scale: '1:25,000', url: 'assets/ign/3642_I_SW.jpg', bounds: { south: 8.833333, north: 8.916667, west: -82.750000, east: -82.625000 }, builtin: true, enabled: false },
    { id: 'builtin_3642_III_SE', code: '3642 III SE', name: 'Plaza Caisán / Renacimiento Sur', scale: '1:25,000', url: 'assets/ign/3642_III_SE.jpg', bounds: { south: 8.666667, north: 8.750000, west: -82.875000, east: -82.750000 }, builtin: true, enabled: false },
    { id: 'builtin_3642_III_NE', code: '3642 III NE', name: 'Río Sereno / Monte Lirio', scale: '1:25,000', url: 'assets/ign/3642_III_NE.jpg', bounds: { south: 8.750000, north: 8.833333, west: -82.875000, east: -82.750000 }, builtin: true, enabled: false }
  ];

  // Catálogo oficial de cuadrantes IGN 1:25,000 en Chiriquí (7.5' lon x 5' lat) para subir nuevas hojas
  const CHIRIQUI_QUADRANTS = [
    { code: '3741 III SW', name: 'Pedregal / David Sur', south: 8.333333, north: 8.416667, west: -82.500000, east: -82.375000 },
    { code: '3741 III SE', name: 'Chiriquí Sur / Chorcha', south: 8.333333, north: 8.416667, west: -82.375000, east: -82.250000 },
    { code: '3741 IV NE', name: 'Caldera / Gualaca', south: 8.583333, north: 8.666667, west: -82.375000, east: -82.250000 },
    { code: '3641 I NE', name: 'Boquerón / Cordillera', south: 8.583333, north: 8.666667, west: -82.625000, east: -82.500000 },
    { code: '3641 II NW', name: 'Divalá Norte / Bugaba Sur', south: 8.416667, north: 8.500000, west: -82.750000, east: -82.625000 },
    { code: '3642 II SE', name: 'Volcán / Paso Ancho', south: 8.666667, north: 8.750000, west: -82.625000, east: -82.500000 },
    { code: '3642 II NE', name: 'Cerro Punta / Bambito', south: 8.750000, north: 8.833333, west: -82.625000, east: -82.500000 },
    { code: '3641 III NE', name: 'Puerto Armuelles / Barú', south: 8.416667, north: 8.500000, west: -82.875000, east: -82.750000 },
    { code: '3641 III SE', name: 'Puerto Armuelles Sur', south: 8.333333, north: 8.416667, west: -82.875000, east: -82.750000 },
    { code: '3741 III NW', name: 'David', south: 8.416667, north: 8.500000, west: -82.500000, east: -82.375000 },
    { code: '3741 III NE', name: 'Las Lomas / Chiriquí', south: 8.416667, north: 8.500000, west: -82.375000, east: -82.250000 },
    { code: '3741 IV SW', name: 'Dolega / Los Algarrobos', south: 8.500000, north: 8.583333, west: -82.500000, east: -82.375000 },
    { code: '3741 IV SE', name: 'Gualaca Sur / Tinajas', south: 8.500000, north: 8.583333, west: -82.375000, east: -82.250000 },
    { code: '3741 IV NW', name: 'Potrerillos / Boquete Sur', south: 8.583333, north: 8.666667, west: -82.500000, east: -82.375000 },
    { code: '3742 III SW', name: 'Bajo Boquete / Alto Boquete', south: 8.666667, north: 8.750000, west: -82.500000, east: -82.375000 },
    { code: '3742 III NW', name: 'Boquete Norte / Alto Quiel', south: 8.750000, north: 8.833333, west: -82.500000, east: -82.375000 },
    { code: '3641 II NE', name: 'San Pablo / Alanje Norte', south: 8.416667, north: 8.500000, west: -82.625000, east: -82.500000 },
    { code: '3641 II SE', name: 'Alanje / Guarumal', south: 8.333333, north: 8.416667, west: -82.625000, east: -82.500000 },
    { code: '3641 II SW', name: 'Divalá / Santo Tomás', south: 8.333333, north: 8.416667, west: -82.750000, east: -82.625000 },
    { code: '3641 I SE', name: 'La Concepción / Bugaba', south: 8.500000, north: 8.583333, west: -82.625000, east: -82.500000 },
    { code: '3641 I SW', name: 'Bugaba Oeste / Jacú', south: 8.500000, north: 8.583333, west: -82.750000, east: -82.625000 },
    { code: '3641 I NW', name: 'Santa Marta / Sortová', south: 8.583333, north: 8.666667, west: -82.750000, east: -82.625000 },
    { code: '3641 IV SE', name: 'Paso Canoas / Progreso', south: 8.500000, north: 8.583333, west: -82.875000, east: -82.750000 },
    { code: '3641 IV NE', name: 'San Andrés / Progreso Norte', south: 8.583333, north: 8.666667, west: -82.875000, east: -82.750000 },
    { code: '3642 II SW', name: 'Cuesta de Piedra / Santa Cruz', south: 8.666667, north: 8.750000, west: -82.750000, east: -82.625000 },
    { code: '3642 II NW', name: 'Volcán Oeste / Dominical', south: 8.750000, north: 8.833333, west: -82.750000, east: -82.625000 },
    { code: '3642 I SW', name: 'Parque La Amistad / Jurutungo', south: 8.833333, north: 8.916667, west: -82.750000, east: -82.625000 },
    { code: '3642 III SE', name: 'Plaza Caisán / Renacimiento Sur', south: 8.666667, north: 8.750000, west: -82.875000, east: -82.750000 },
    { code: '3642 III NE', name: 'Río Sereno / Monte Lirio', south: 8.750000, north: 8.833333, west: -82.875000, east: -82.750000 }
  ];

  let sheets = BUILTIN_SHEETS.map(s => ({ ...s }));
  let globalOpacity = 0.85;
  let dbPromise = null;
  let pdfJsLoaded = false;

  // ==================== INDEXEDDB ====================
  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      if (!global.indexedDB) return resolve(null);
      const req = global.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
    return dbPromise;
  }

  async function loadSavedSheets() {
    const db = await openDb();
    if (!db) return sheets;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const userSheets = (req.result || []).map(s => ({ ...s, builtin: false }));
        sheets = [...BUILTIN_SHEETS.map(s => ({ ...s })), ...userSheets];
        resolve(sheets);
      };
      req.onerror = () => resolve(sheets);
    });
  }

  async function saveUserSheet(sheet) {
    const record = {
      id: sheet.id || `ign_${Date.now()}`,
      code: sheet.code || 'CUSTOM',
      name: sheet.name || 'Hoja IGN',
      scale: sheet.scale || '1:25,000',
      url: sheet.url, // DataURL JPEG
      bounds: sheet.bounds,
      builtin: false,
      enabled: sheet.enabled !== false,
      createdAt: Date.now()
    };
    const db = await openDb();
    if (db) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(record);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    }
    const existingIdx = sheets.findIndex(s => s.id === record.id);
    if (existingIdx >= 0) sheets[existingIdx] = record;
    else sheets.push(record);
    return record;
  }

  async function deleteUserSheet(id) {
    const target = sheets.find(s => s.id === id);
    if (!target || target.builtin) return false;
    const db = await openDb();
    if (db) {
      await new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = resolve;
        tx.onerror = resolve;
      });
    }
    sheets = sheets.filter(s => s.id !== id);
    return true;
  }

  function setSheetEnabled(id, enabled) {
    const s = sheets.find(item => item.id === id);
    if (s) s.enabled = Boolean(enabled);
    return s;
  }

  function setOpacity(val) {
    globalOpacity = Math.max(0.05, Math.min(1.0, Number(val) || 0.85));
    return globalOpacity;
  }

  function getOpacity() { return globalOpacity; }
  function getSheets() { return sheets; }
  function getEnabledSheets() { return sheets.filter(s => s.enabled); }

  // ==================== RENDERIZADO PDF EN NAVEGADOR (PDF.JS BAJO DEMANDA) ====================
  function ensurePdfJs() {
    if (pdfJsLoaded && global.pdfjsLib) return Promise.resolve(global.pdfjsLib);
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = () => {
        if (!global.pdfjsLib) return reject(new Error('No se pudo cargar pdf.js'));
        global.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        pdfJsLoaded = true;
        resolve(global.pdfjsLib);
      };
      script.onerror = () => reject(new Error('Error cargando pdf.js para leer el PDF. Puedes subir la hoja como JPG/PNG.'));
      document.head.appendChild(script);
    });
  }

  /**
   * Procesa un archivo subido (PDF oficial IGN o imagen JPG/PNG) y devuelve un JPEG DataURL optimizado.
   * Si es PDF y autoCropIgn25k=true, recorta automáticamente el marco cartográfico interior IGN 1:25,000.
   */
  async function processUploadedSheetFile(file, options = {}) {
    const autoCropIgn25k = options.autoCropIgn25k !== false;
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

    if (isPdf) {
      const pdfjsLib = await ensurePdfJs();
      const arrBuf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrBuf }).promise;
      const page = await pdf.getPage(1);

      const baseVp = page.getViewport({ scale: 1.0 });
      const targetFullW = 3200;
      const scale = targetFullW / baseVp.width;
      const vp = page.getViewport({ scale });

      const fullCanvas = document.createElement('canvas');
      fullCanvas.width = Math.round(vp.width);
      fullCanvas.height = Math.round(vp.height);
      const fctx = fullCanvas.getContext('2d');
      fctx.fillStyle = '#ffffff';
      fctx.fillRect(0, 0, fullCanvas.width, fullCanvas.height);

      await page.render({ canvasContext: fctx, viewport: vp }).promise;

      // Recorte del marco cartográfico interior IGN 1:25,000 o hoja completa
      const sx = autoCropIgn25k ? Math.round(fullCanvas.width * IGN_25K_CROP_RATIO.x) : 0;
      const sy = autoCropIgn25k ? Math.round(fullCanvas.height * IGN_25K_CROP_RATIO.y) : 0;
      const sw = autoCropIgn25k ? Math.round(fullCanvas.width * IGN_25K_CROP_RATIO.w) : fullCanvas.width;
      const sh = autoCropIgn25k ? Math.round(fullCanvas.height * IGN_25K_CROP_RATIO.h) : fullCanvas.height;

      const outW = Math.min(2200, sw);
      const outH = Math.round(outW * (sh / sw));
      const outCanvas = document.createElement('canvas');
      outCanvas.width = outW;
      outCanvas.height = outH;
      outCanvas.getContext('2d').drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, outW, outH);

      return {
        dataUrl: outCanvas.toDataURL('image/jpeg', 0.85),
        width: outW,
        height: outH
      };
    }

    // Imagen JPG / PNG directa
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Error leyendo el archivo de imagen.'));
      reader.readAsDataURL(file);
    });

    const img = await loadImage(dataUrl);
    const maxW = 2400;
    const outW = Math.min(maxW, img.naturalWidth);
    const outH = Math.round(outW * (img.naturalHeight / img.naturalWidth));
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    canvas.getContext('2d').drawImage(img, 0, 0, outW, outH);

    return {
      dataUrl: canvas.toDataURL('image/jpeg', 0.86),
      width: outW,
      height: outH
    };
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('No se pudo cargar la imagen de la hoja IGN.'));
      img.src = src;
    });
  }

  // ==================== RECORTE AUTOMÁTICO PARA EL PDF ANATI ====================
  /** Busca qué hoja IGN (activada o precargada) contiene el centroide (lat, lon) del polígono */
  function findCoveringSheet(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    // Priorizar hojas activas; si ninguna activa lo cubre, revisar todas las disponibles
    const ordered = [...sheets.filter(s => s.enabled), ...sheets.filter(s => !s.enabled)];
    for (const s of ordered) {
      const b = s.bounds;
      if (lat >= b.south && lat <= b.north && lon >= b.west && lon <= b.east) {
        return s;
      }
    }
    return null;
  }

  /**
   * Genera un recorte JPEG limpio de la Hoja IGN centrado en el polígono,
   * dibujando el polígono en rojo/verde como GLOBO MEDIDO, listo para incrustar
   * en el cuadro LOCALIZACION REGIONAL del PDF Vectorial ANATI.
   * @returns {Promise<{ jpegBytes: Uint8Array, width: number, height: number, sheetCode: string, sheetName: string } | null>}
   */
  async function generateRegionalCropForPdf(points, utmZone = 17, utmHemi = 'N') {
    const Geo = global.TopoGeodesy;
    if (!points || points.length === 0 || !Geo) return null;

    const geoPts = points
      .filter(p => Geo.isPlausibleUtm(p.e, p.n))
      .map(p => Geo.utmToLatLon(p.e, p.n, utmZone, utmHemi, 'WGS84'));
    if (geoPts.length === 0) return null;

    const avgLat = geoPts.reduce((s, p) => s + p.lat, 0) / geoPts.length;
    const avgLon = geoPts.reduce((s, p) => s + p.lon, 0) / geoPts.length;

    const sheet = findCoveringSheet(avgLat, avgLon);
    if (!sheet) return null;

    try {
      const img = await loadImage(sheet.url);
      const b = sheet.bounds;
      const latSpan = b.north - b.south;
      const lonSpan = b.east - b.west;

      // Ventana regional proporcional a 115 x 104 mm (~4.2 km x 3.8 km en terreno ≈ escala 1:36,000 - 1:40,000)
      const winLonDeg = 0.038;
      const winLatDeg = winLonDeg * (104 / 115);

      let cropW = (winLonDeg / lonSpan) * img.naturalWidth;
      let cropH = (winLatDeg / latSpan) * img.naturalHeight;
      cropW = Math.min(img.naturalWidth, Math.max(220, cropW));
      cropH = Math.min(img.naturalHeight, Math.max(200, cropH));

      const cxPx = ((avgLon - b.west) / lonSpan) * img.naturalWidth;
      const cyPx = ((b.north - avgLat) / latSpan) * img.naturalHeight;

      let sx = cxPx - cropW / 2;
      let sy = cyPx - cropH / 2;
      sx = Math.max(0, Math.min(img.naturalWidth - cropW, sx));
      sy = Math.max(0, Math.min(img.naturalHeight - cropH, sy));

      const outW = 920;
      const outH = Math.round(outW * (104 / 115)); // 832 px exacto para la caja 115x104 mm
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, outW, outH);
      ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, outW, outH);

      // Dibujar el polígono medido exactamente sobre el recorte de la hoja IGN
      const mapGeoToOut = (lat, lon) => ({
        x: (((lon - b.west) / lonSpan) * img.naturalWidth - sx) * (outW / cropW),
        y: (((b.north - lat) / latSpan) * img.naturalHeight - sy) * (outH / cropH)
      });

      const polyPx = geoPts.map(g => mapGeoToOut(g.lat, g.lon));
      if (polyPx.length >= 3) {
        ctx.save();
        ctx.beginPath();
        polyPx.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
        ctx.closePath();
        ctx.fillStyle = 'rgba(239, 68, 68, 0.42)';
        ctx.fill();
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.restore();
      }

      // Marcador de centroide + flecha "GLOBO MEDIDO"
      const cOut = mapGeoToOut(avgLat, avgLon);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cOut.x, cOut.y, 10, 0, Math.PI * 2);
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 3.5;
      ctx.stroke();

      const lblX = cOut.x > outW * 0.58 ? cOut.x - 210 : cOut.x + 38;
      const lblY = cOut.y < outH * 0.25 ? cOut.y + 42 : cOut.y - 48;
      ctx.beginPath();
      ctx.moveTo(cOut.x, cOut.y);
      ctx.lineTo(lblX + 75, lblY + 14);
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 2;
      ctx.fillRect(lblX, lblY, 168, 30);
      ctx.strokeRect(lblX, lblY, 168, 30);
      ctx.fillStyle = '#b91c1c';
      ctx.font = 'bold 17px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('GLOBO MEDIDO', lblX + 84, lblY + 15);
      ctx.restore();

      const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
      const b64 = dataUrl.split(',')[1];
      const binStr = atob(b64);
      const bytes = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);

      return {
        jpegBytes: bytes,
        width: outW,
        height: outH,
        sheetCode: sheet.code,
        sheetName: sheet.name
      };
    } catch (err) {
      console.warn('No se pudo recortar la hoja IGN para el PDF:', err);
      return null;
    }
  }

  global.TopoIGN = {
    CHIRIQUI_QUADRANTS,
    loadSavedSheets,
    saveUserSheet,
    deleteUserSheet,
    setSheetEnabled,
    setOpacity,
    getOpacity,
    getSheets,
    getEnabledSheets,
    processUploadedSheetFile,
    findCoveringSheet,
    generateRegionalCropForPdf
  };
})(window);
