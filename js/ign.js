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

  // 44 hojas oficiales IGN Tommy Guardia 1:25,000 de Chiriquí precargadas y georreferenciadas (WGS84)
  const BUILTIN_SHEETS = [
    // Bloque Este y Costa Sur: David / Dolega / Boquete / Gualaca / San Lorenzo / San Juan / Golfo de Chiriquí
    { id: 'builtin_3741_III_NW', code: '3741 III NW', name: 'David', scale: '1:25,000', url: 'assets/ign/3741_III_NW_DAVID.jpg', bounds: { south: 8.416667, north: 8.500000, west: -82.500000, east: -82.375000 }, builtin: true, enabled: false },
    { id: 'builtin_3741_III_NE', code: '3741 III NE', name: 'Las Lomas / Chiriquí', scale: '1:25,000', url: 'assets/ign/3741_III_NE.jpg', bounds: { south: 8.416667, north: 8.500000, west: -82.375000, east: -82.250000 }, builtin: true, enabled: false },
    { id: 'builtin_3741_III_SW', code: '3741 III SW', name: 'Pedregal / David Sur', scale: '1:25,000', url: 'assets/ign/3741_III_SW.jpg', bounds: { south: 8.333333, north: 8.416667, west: -82.500000, east: -82.375000 }, builtin: true, enabled: false },
    { id: 'builtin_3741_III_SE', code: '3741 III SE', name: 'Chiriquí', scale: '1:25,000', url: 'assets/ign/3741_III_SE.jpg', bounds: { south: 8.333333, north: 8.416667, west: -82.375000, east: -82.250000 }, builtin: true, enabled: false },
    { id: 'builtin_3741_II_SW', code: '3741 II SW', name: 'Batipa / Chorchita', scale: '1:25,000', url: 'assets/ign/3741_II_SW.jpg', bounds: { south: 8.333333, north: 8.416667, west: -82.250000, east: -82.125000 }, builtin: true, enabled: false },
    { id: 'builtin_3741_IV_SW', code: '3741 IV SW', name: 'Dolega / Los Algarrobos', scale: '1:25,000', url: 'assets/ign/3741_IV_SW.jpg', bounds: { south: 8.500000, north: 8.583333, west: -82.500000, east: -82.375000 }, builtin: true, enabled: false },
    { id: 'builtin_3741_IV_SE', code: '3741 IV SE', name: 'Gualaca Sur / Tinajas', scale: '1:25,000', url: 'assets/ign/3741_IV_SE.jpg', bounds: { south: 8.500000, north: 8.583333, west: -82.375000, east: -82.250000 }, builtin: true, enabled: false },
    { id: 'builtin_3741_IV_NW', code: '3741 IV NW', name: 'Potrerillos / Boquete Sur', scale: '1:25,000', url: 'assets/ign/3741_IV_NW.jpg', bounds: { south: 8.583333, north: 8.666667, west: -82.500000, east: -82.375000 }, builtin: true, enabled: false },
    { id: 'builtin_3742_III_SW', code: '3742 III SW', name: 'Bajo Boquete / Alto Boquete', scale: '1:25,000', url: 'assets/ign/3742_III_SW.jpg', bounds: { south: 8.666667, north: 8.750000, west: -82.500000, east: -82.375000 }, builtin: true, enabled: false },
    { id: 'builtin_3742_III_NW', code: '3742 III NW', name: 'Boquete Norte / Alto Quiel', scale: '1:25,000', url: 'assets/ign/3742_III_NW.jpg', bounds: { south: 8.750000, north: 8.833333, west: -82.500000, east: -82.375000 }, builtin: true, enabled: false },
    { id: 'builtin_3740_IV_NW', code: '3740 IV NW', name: 'Boca de San Pedro', scale: '1:25,000', url: 'assets/ign/3740_IV_NW.jpg', bounds: { south: 8.250000, north: 8.333333, west: -82.500000, east: -82.375000 }, builtin: true, enabled: false },
    { id: 'builtin_3740_IV_NE', code: '3740 IV NE', name: 'Isla Mono', scale: '1:25,000', url: 'assets/ign/3740_IV_NE.jpg', bounds: { south: 8.250000, north: 8.333333, west: -82.375000, east: -82.250000 }, builtin: true, enabled: false },
    { id: 'builtin_3740_IV_SE', code: '3740 IV SE', name: 'Isla Boca Brava', scale: '1:25,000', url: 'assets/ign/3740_IV_SE.jpg', bounds: { south: 8.166667, north: 8.250000, west: -82.375000, east: -82.250000 }, builtin: true, enabled: false },
    { id: 'builtin_3740_I_NW', code: '3740 I NW', name: 'Horconcitos', scale: '1:25,000', url: 'assets/ign/3740_I_NW.jpg', bounds: { south: 8.250000, north: 8.333333, west: -82.250000, east: -82.125000 }, builtin: true, enabled: false },
    { id: 'builtin_3740_I_SW', code: '3740 I SW', name: 'Boca Chica', scale: '1:25,000', url: 'assets/ign/3740_I_SW.jpg', bounds: { south: 8.166667, north: 8.250000, west: -82.250000, east: -82.125000 }, builtin: true, enabled: false },
    { id: 'builtin_3740_I_NE', code: '3740 I NE', name: 'San Lorenzo', scale: '1:25,000', url: 'assets/ign/3740_I_NE.jpg', bounds: { south: 8.250000, north: 8.333333, west: -82.125000, east: -82.000000 }, builtin: true, enabled: false },
    { id: 'builtin_3740_I_SE', code: '3740 I SE', name: 'Bahía de San Lorenzo', scale: '1:25,000', url: 'assets/ign/3740_I_SE.jpg', bounds: { south: 8.166667, north: 8.250000, west: -82.125000, east: -82.000000 }, builtin: true, enabled: false },
    { id: 'builtin_3840_IV_NW', code: '3840 IV NW', name: 'San Juan', scale: '1:25,000', url: 'assets/ign/3840_IV_NW.jpg', bounds: { south: 8.250000, north: 8.333333, west: -82.000000, east: -81.875000 }, builtin: true, enabled: false },
    { id: 'builtin_3840_IV_SW', code: '3840 IV SW', name: 'San Juan Sur / Las Lajas', scale: '1:25,000', url: 'assets/ign/3840_IV_SW.jpg', bounds: { south: 8.166667, north: 8.250000, west: -82.000000, east: -81.875000 }, builtin: true, enabled: false },
    // Bloque Centro: Alanje / Bugaba / Boquerón / Volcán Barú / Cerro Punta
    { id: 'builtin_3641_II_NE', code: '3641 II NE', name: 'San Pablo / Alanje Norte', scale: '1:25,000', url: 'assets/ign/3641_II_NE.jpg', bounds: { south: 8.416667, north: 8.500000, west: -82.625000, east: -82.500000 }, builtin: true, enabled: false },
    { id: 'builtin_3641_II_SE', code: '3641 II SE', name: 'Alanje / Guarumal', scale: '1:25,000', url: 'assets/ign/3641_II_SE.jpg', bounds: { south: 8.333333, north: 8.416667, west: -82.625000, east: -82.500000 }, builtin: true, enabled: false },
    { id: 'builtin_3640_I_NE', code: '3640 I NE', name: 'Cacao', scale: '1:25,000', url: 'assets/ign/3640_I_NE.jpg', bounds: { south: 8.250000, north: 8.333333, west: -82.625000, east: -82.500000 }, builtin: true, enabled: false },
    { id: 'builtin_3641_II_SW', code: '3641 II SW', name: 'Divalá / Santo Tomás', scale: '1:25,000', url: 'assets/ign/3641_II_SW.jpg', bounds: { south: 8.333333, north: 8.416667, west: -82.750000, east: -82.625000 }, builtin: true, enabled: false },
    { id: 'builtin_3641_II_NW', code: '3641 II NW', name: 'Las Mercedes', scale: '1:25,000', url: 'assets/ign/3641_II_NW.jpg', bounds: { south: 8.416667, north: 8.500000, west: -82.750000, east: -82.625000 }, builtin: true, enabled: false },
    { id: 'builtin_3641_I_SE', code: '3641 I SE', name: 'Boquerón / Bugaba Este', scale: '1:25,000', url: 'assets/ign/3641_I_SE.jpg', bounds: { south: 8.500000, north: 8.583333, west: -82.625000, east: -82.500000 }, builtin: true, enabled: false },
    { id: 'builtin_3641_I_NE', code: '3641 I NE', name: 'Guayabal', scale: '1:25,000', url: 'assets/ign/3641_I_NE.jpg', bounds: { south: 8.583333, north: 8.666667, west: -82.625000, east: -82.500000 }, builtin: true, enabled: false },
    { id: 'builtin_3641_I_SW', code: '3641 I SW', name: 'Santa Marta / La Concepción', scale: '1:25,000', url: 'assets/ign/3641_I_SW.jpg', bounds: { south: 8.500000, north: 8.583333, west: -82.750000, east: -82.625000 }, builtin: true, enabled: false },
    { id: 'builtin_3641_I_NW', code: '3641 I NW', name: 'Gómez Norte / Aserrío', scale: '1:25,000', url: 'assets/ign/3641_I_NW.jpg', bounds: { south: 8.583333, north: 8.666667, west: -82.750000, east: -82.625000 }, builtin: true, enabled: false },
    { id: 'builtin_3642_II_SE', code: '3642 II SE', name: 'Cordillera', scale: '1:25,000', url: 'assets/ign/3642_II_SE.jpg', bounds: { south: 8.666667, north: 8.750000, west: -82.625000, east: -82.500000 }, builtin: true, enabled: false },
    { id: 'builtin_3642_II_NE', code: '3642 II NE', name: 'Volcán Barú', scale: '1:25,000', url: 'assets/ign/3642_II_NE.jpg', bounds: { south: 8.750000, north: 8.833333, west: -82.625000, east: -82.500000 }, builtin: true, enabled: false },
    { id: 'builtin_3642_I_SE', code: '3642 I SE', name: 'Cerro Punta', scale: '1:25,000', url: 'assets/ign/3642_I_SE.jpg', bounds: { south: 8.833333, north: 8.916667, west: -82.625000, east: -82.500000 }, builtin: true, enabled: false },
    // Bloque Oeste: Tierras Altas / Renacimiento / Paso Canoas / Barú / Puerto Armuelles
    { id: 'builtin_3642_II_SW', code: '3642 II SW', name: 'Cuesta de Piedra / Santa Cruz', scale: '1:25,000', url: 'assets/ign/3642_II_SW.jpg', bounds: { south: 8.666667, north: 8.750000, west: -82.750000, east: -82.625000 }, builtin: true, enabled: false },
    { id: 'builtin_3642_II_NW', code: '3642 II NW', name: 'Volcán Oeste / Dominical', scale: '1:25,000', url: 'assets/ign/3642_II_NW.jpg', bounds: { south: 8.750000, north: 8.833333, west: -82.750000, east: -82.625000 }, builtin: true, enabled: false },
    { id: 'builtin_3642_I_SW', code: '3642 I SW', name: 'Parque La Amistad / Jurutungo', scale: '1:25,000', url: 'assets/ign/3642_I_SW.jpg', bounds: { south: 8.833333, north: 8.916667, west: -82.750000, east: -82.625000 }, builtin: true, enabled: false },
    { id: 'builtin_3642_III_SE', code: '3642 III SE', name: 'Plaza Caisán / Renacimiento Sur', scale: '1:25,000', url: 'assets/ign/3642_III_SE.jpg', bounds: { south: 8.666667, north: 8.750000, west: -82.875000, east: -82.750000 }, builtin: true, enabled: false },
    { id: 'builtin_3642_III_NE', code: '3642 III NE', name: 'Río Sereno / Monte Lirio', scale: '1:25,000', url: 'assets/ign/3642_III_NE.jpg', bounds: { south: 8.750000, north: 8.833333, west: -82.875000, east: -82.750000 }, builtin: true, enabled: false },
    { id: 'builtin_3641_IV_NE', code: '3641 IV NE', name: 'San Andrés / Progreso Norte', scale: '1:25,000', url: 'assets/ign/3641_IV_NE.jpg', bounds: { south: 8.583333, north: 8.666667, west: -82.875000, east: -82.750000 }, builtin: true, enabled: false },
    { id: 'builtin_3641_IV_SE', code: '3641 IV SE', name: 'Paso Canoas / Progreso', scale: '1:25,000', url: 'assets/ign/3641_IV_SE.jpg', bounds: { south: 8.500000, north: 8.583333, west: -82.875000, east: -82.750000 }, builtin: true, enabled: false },
    { id: 'builtin_3641_III_NE', code: '3641 III NE', name: 'Progreso', scale: '1:25,000', url: 'assets/ign/3641_III_NE.jpg', bounds: { south: 8.416667, north: 8.500000, west: -82.875000, east: -82.750000 }, builtin: true, enabled: false },
    { id: 'builtin_3641_III_SE', code: '3641 III SE', name: 'Colorado', scale: '1:25,000', url: 'assets/ign/3641_III_SE.jpg', bounds: { south: 8.333333, north: 8.416667, west: -82.875000, east: -82.750000 }, builtin: true, enabled: false },
    { id: 'builtin_3641_III_SW', code: '3641 III SW', name: 'Blanco Arriba', scale: '1:25,000', url: 'assets/ign/3641_III_SW.jpg', bounds: { south: 8.333333, north: 8.416667, west: -83.000000, east: -82.875000 }, builtin: true, enabled: false },
    { id: 'builtin_3640_IV_NE', code: '3640 IV NE', name: 'Puerto Armuelles', scale: '1:25,000', url: 'assets/ign/3640_IV_NE.jpg', bounds: { south: 8.250000, north: 8.333333, west: -82.875000, east: -82.750000 }, builtin: true, enabled: false },
    { id: 'builtin_3640_IV_NW', code: '3640 IV NW', name: 'Río San Bartolo', scale: '1:25,000', url: 'assets/ign/3640_IV_NW.jpg', bounds: { south: 8.250000, north: 8.333333, west: -83.000000, east: -82.875000 }, builtin: true, enabled: false },
    { id: 'builtin_3640_IV_SW', code: '3640 IV SW', name: 'Río Guanábano', scale: '1:25,000', url: 'assets/ign/3640_IV_SW.jpg', bounds: { south: 8.166667, north: 8.250000, west: -83.000000, east: -82.875000 }, builtin: true, enabled: false }
  ];

  // Catálogo oficial de cuadrantes IGN 1:25,000 en Chiriquí (7.5' lon x 5' lat) para subir nuevas hojas
  const CHIRIQUI_QUADRANTS = [
    { code: '3741 IV NE', name: 'Caldera / Gualaca', south: 8.583333, north: 8.666667, west: -82.375000, east: -82.250000 },
    { code: '3742 III SE', name: 'Caldera Norte / Hornito', south: 8.666667, north: 8.750000, west: -82.375000, east: -82.250000 },
    { code: '3742 III NE', name: 'Fortuna / Boquete NE', south: 8.750000, north: 8.833333, west: -82.375000, east: -82.250000 },
    { code: '3741 II NW', name: 'Gualaca / San Lorenzo N', south: 8.416667, north: 8.500000, west: -82.250000, east: -82.125000 },
    { code: '3741 I SW', name: 'Gualaca Este', south: 8.500000, north: 8.583333, west: -82.250000, east: -82.125000 },
    { code: '3840 IV NE', name: 'San Félix / Las Lajas Este', south: 8.250000, north: 8.333333, west: -81.875000, east: -81.750000 },
    { code: '3840 I NW', name: 'Tolé / Remedios', south: 8.250000, north: 8.333333, west: -81.750000, east: -81.625000 },
    { code: '3640 III NW', name: 'Limones / Punta Burica N', south: 8.083333, north: 8.166667, west: -83.000000, east: -82.875000 },
    { code: '3640 III SW', name: 'Punta Burica', south: 8.000000, north: 8.083333, west: -83.000000, east: -82.875000 },
    ...BUILTIN_SHEETS.map(s => ({ code: s.code, name: s.name, south: s.bounds.south, north: s.bounds.north, west: s.bounds.west, east: s.bounds.east }))
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
