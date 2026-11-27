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

  // 56 hojas oficiales IGN Tommy Guardia 1:25,000 de Chiriquí precargadas y georreferenciadas (WGS84)
  const BUILTIN_SHEETS = [
    // Bloque Este, Cordillera y Costa Sur: David / Dolega / Boquete / Caldera / Gualaca / Fortuna / San Lorenzo / San Juan
    { id: 'builtin_3741_III_NW', code: '3741 III NW', name: 'David', scale: '1:25,000', url: 'assets/ign/3741_III_NW_DAVID.jpg', bounds: { south: 8.416667, north: 8.500000, west: -82.500000, east: -82.375000 }, builtin: true, enabled: false },
    { id: 'builtin_3741_III_NE', code: '3741 III NE', name: 'Las Lomas / Chiriquí', scale: '1:25,000', url: 'assets/ign/3741_III_NE.jpg', bounds: { south: 8.416667, north: 8.500000, west: -82.375000, east: -82.250000 }, builtin: true, enabled: false },
    { id: 'builtin_3741_III_SW', code: '3741 III SW', name: 'Pedregal / David Sur', scale: '1:25,000', url: 'assets/ign/3741_III_SW.jpg', bounds: { south: 8.333333, north: 8.416667, west: -82.500000, east: -82.375000 }, builtin: true, enabled: false },
    { id: 'builtin_3741_III_SE', code: '3741 III SE', name: 'Chiriquí', scale: '1:25,000', url: 'assets/ign/3741_III_SE.jpg', bounds: { south: 8.333333, north: 8.416667, west: -82.375000, east: -82.250000 }, builtin: true, enabled: false },
    { id: 'builtin_3741_II_SW', code: '3741 II SW', name: 'Batipa / Chorchita', scale: '1:25,000', url: 'assets/ign/3741_II_SW.jpg', bounds: { south: 8.333333, north: 8.416667, west: -82.250000, east: -82.125000 }, builtin: true, enabled: false },
    { id: 'builtin_3741_IV_SW', code: '3741 IV SW', name: 'Dolega / Los Algarrobos', scale: '1:25,000', url: 'assets/ign/3741_IV_SW.jpg', bounds: { south: 8.500000, north: 8.583333, west: -82.500000, east: -82.375000 }, builtin: true, enabled: false },
    { id: 'builtin_3741_IV_SE', code: '3741 IV SE', name: 'Gualaca Sur / Tinajas', scale: '1:25,000', url: 'assets/ign/3741_IV_SE.jpg', bounds: { south: 8.500000, north: 8.583333, west: -82.375000, east: -82.250000 }, builtin: true, enabled: false },
    { id: 'builtin_3741_IV_NW', code: '3741 IV NW', name: 'Potrerillos / Boquete Sur', scale: '1:25,000', url: 'assets/ign/3741_IV_NW.jpg', bounds: { south: 8.583333, north: 8.666667, west: -82.500000, east: -82.375000 }, builtin: true, enabled: false },
    { id: 'builtin_3741_IV_NE', code: '3741 IV NE', name: 'Caldera / Gualaca', scale: '1:25,000', url: 'assets/ign/3741_IV_NE.jpg', bounds: { south: 8.583333, north: 8.666667, west: -82.375000, east: -82.250000 }, builtin: true, enabled: false },
    { id: 'builtin_3741_I_SW', code: '3741 I SW', name: 'Los Ángeles', scale: '1:25,000', url: 'assets/ign/3741_I_SW.jpg', bounds: { south: 8.500000, north: 8.583333, west: -82.250000, east: -82.125000 }, builtin: true, enabled: false },
    { id: 'builtin_3741_I_NW', code: '3741 I NW', name: 'Valle de la Mina', scale: '1:25,000', url: 'assets/ign/3741_I_NW.jpg', bounds: { south: 8.583333, north: 8.666667, west: -82.250000, east: -82.125000 }, builtin: true, enabled: false },
    { id: 'builtin_3742_III_SW', code: '3742 III SW', name: 'Bajo Boquete / Alto Boquete', scale: '1:25,000', url: 'assets/ign/3742_III_SW.jpg', bounds: { south: 8.666667, north: 8.750000, west: -82.500000, east: -82.375000 }, builtin: true, enabled: false },
    { id: 'builtin_3742_III_NW', code: '3742 III NW', name: 'Boquete Norte / Alto Quiel', scale: '1:25,000', url: 'assets/ign/3742_III_NW.jpg', bounds: { south: 8.750000, north: 8.833333, west: -82.500000, east: -82.375000 }, builtin: true, enabled: false },
    { id: 'builtin_3742_III_SE', code: '3742 III SE', name: 'Paja de Sombrero', scale: '1:25,000', url: 'assets/ign/3742_III_SE.jpg', bounds: { south: 8.666667, north: 8.750000, west: -82.375000, east: -82.250000 }, builtin: true, enabled: false },
    { id: 'builtin_3742_III_NE', code: '3742 III NE', name: 'Totole', scale: '1:25,000', url: 'assets/ign/3742_III_NE.jpg', bounds: { south: 8.750000, north: 8.833333, west: -82.375000, east: -82.250000 }, builtin: true, enabled: false },
    { id: 'builtin_3742_II_SW', code: '3742 II SW', name: 'Cerro Pata de Macho', scale: '1:25,000', url: 'assets/ign/3742_II_SW.jpg', bounds: { south: 8.666667, north: 8.750000, west: -82.250000, east: -82.125000 }, builtin: true, enabled: false },
    { id: 'builtin_3742_II_NW', code: '3742 II NW', name: 'Río Guabo', scale: '1:25,000', url: 'assets/ign/3742_II_NW.jpg', bounds: { south: 8.750000, north: 8.833333, west: -82.250000, east: -82.125000 }, builtin: true, enabled: false },
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
    { id: 'builtin_3640_I_NW', code: '3640 I NW', name: 'Bahía de Charco Azul', scale: '1:25,000', url: 'assets/ign/3640_I_NW.jpg', bounds: { south: 8.250000, north: 8.333333, west: -82.750000, east: -82.625000 }, builtin: true, enabled: false },
    { id: 'builtin_3641_II_SW', code: '3641 II SW', name: 'Divalá / Santo Tomás', scale: '1:25,000', url: 'assets/ign/3641_II_SW.jpg', bounds: { south: 8.333333, north: 8.416667, west: -82.750000, east: -82.625000 }, builtin: true, enabled: false },
    { id: 'builtin_3641_II_NW', code: '3641 II NW', name: 'Las Mercedes', scale: '1:25,000', url: 'assets/ign/3641_II_NW.jpg', bounds: { south: 8.416667, north: 8.500000, west: -82.750000, east: -82.625000 }, builtin: true, enabled: false },
    { id: 'builtin_3641_I_SE', code: '3641 I SE', name: 'Boquerón / Bugaba Este', scale: '1:25,000', url: 'assets/ign/3641_I_SE.jpg', bounds: { south: 8.500000, north: 8.583333, west: -82.625000, east: -82.500000 }, builtin: true, enabled: false },
    { id: 'builtin_3641_I_NE', code: '3641 I NE', name: 'Guayabal', scale: '1:25,000', url: 'assets/ign/3641_I_NE.jpg', bounds: { south: 8.583333, north: 8.666667, west: -82.625000, east: -82.500000 }, builtin: true, enabled: false },
    { id: 'builtin_3641_I_SW', code: '3641 I SW', name: 'Santa Marta / La Concepción', scale: '1:25,000', url: 'assets/ign/3641_I_SW.jpg', bounds: { south: 8.500000, north: 8.583333, west: -82.750000, east: -82.625000 }, builtin: true, enabled: false },
    { id: 'builtin_3641_I_NW', code: '3641 I NW', name: 'Gómez Norte / Aserrío', scale: '1:25,000', url: 'assets/ign/3641_I_NW.jpg', bounds: { south: 8.583333, north: 8.666667, west: -82.750000, east: -82.625000 }, builtin: true, enabled: false },
    { id: 'builtin_3642_II_SE', code: '3642 II SE', name: 'Cordillera', scale: '1:25,000', url: 'assets/ign/3642_II_SE.jpg', bounds: { south: 8.666667, north: 8.750000, west: -82.625000, east: -82.500000 }, builtin: true, enabled: false },
    { id: 'builtin_3642_II_NE', code: '3642 II NE', name: 'Volcán Barú', scale: '1:25,000', url: 'assets/ign/3642_II_NE.jpg', bounds: { south: 8.750000, north: 8.833333, west: -82.625000, east: -82.500000 }, builtin: true, enabled: false },
    { id: 'builtin_3642_I_SE', code: '3642 I SE', name: 'Cerro Punta', scale: '1:25,000', url: 'assets/ign/3642_I_SE.jpg', bounds: { south: 8.833333, north: 8.916667, west: -82.625000, east: -82.500000 }, builtin: true, enabled: false },
    // Bloque Oeste: Tierras Altas / Renacimiento / Paso Canoas / Barú / Puerto Armuelles / Punta Burica
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
    { id: 'builtin_3640_IV_SW', code: '3640 IV SW', name: 'Río Guanábano', scale: '1:25,000', url: 'assets/ign/3640_IV_SW.jpg', bounds: { south: 8.166667, north: 8.250000, west: -83.000000, east: -82.875000 }, builtin: true, enabled: false },
    { id: 'builtin_3640_III_NW', code: '3640 III NW', name: 'Caña Blanca', scale: '1:25,000', url: 'assets/ign/3640_III_NW.jpg', bounds: { south: 8.083333, north: 8.166667, west: -83.000000, east: -82.875000 }, builtin: true, enabled: false },
    { id: 'builtin_3640_III_NE', code: '3640 III NE', name: 'Puerto Limones', scale: '1:25,000', url: 'assets/ign/3640_III_NE.jpg', bounds: { south: 8.083333, north: 8.166667, west: -82.875000, east: -82.750000 }, builtin: true, enabled: false },
    { id: 'builtin_3640_III_SW', code: '3640 III SW', name: 'Cerro Punta Gorda', scale: '1:25,000', url: 'assets/ign/3640_III_SW.jpg', bounds: { south: 8.000000, north: 8.083333, west: -83.000000, east: -82.875000 }, builtin: true, enabled: false },
    { id: 'builtin_3640_III_SE', code: '3640 III SE', name: 'Quebrada de Tallo / Punta Burica', scale: '1:25,000', url: 'assets/ign/3640_III_SE.jpg', bounds: { south: 8.000000, north: 8.083333, west: -82.875000, east: -82.750000 }, builtin: true, enabled: false }
  ];

  // Catálogo oficial de cuadrantes IGN 1:25,000 en Chiriquí (7.5' lon x 5' lat) para subir nuevas hojas
  const CHIRIQUI_QUADRANTS = [
    { code: '3741 II NW', name: 'Gualaca / San Lorenzo N', south: 8.416667, north: 8.500000, west: -82.250000, east: -82.125000 },
    { code: '3741 II NE', name: 'San Lorenzo Norte', south: 8.416667, north: 8.500000, west: -82.125000, east: -82.000000 },
    { code: '3741 II SE', name: 'San Félix Oeste', south: 8.333333, north: 8.416667, west: -82.125000, east: -82.000000 },
    { code: '3840 IV NE', name: 'San Félix / Las Lajas Este', south: 8.250000, north: 8.333333, west: -81.875000, east: -81.750000 },
    { code: '3840 I NW', name: 'Remedios / Tolé Oeste', south: 8.250000, north: 8.333333, west: -81.750000, east: -81.625000 },
    { code: '3840 I NE', name: 'Tolé', south: 8.250000, north: 8.333333, west: -81.625000, east: -81.500000 },
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
      const isCrossOrigin = /^https?:\/\//i.test(src) && global.location && !src.startsWith(global.location.origin);
      if (isCrossOrigin) img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('No se pudo cargar la imagen de la hoja IGN: ' + src));
      img.src = src;
    });
  }

  // ==================== BÚSQUEDA DE HOJAS E INTERSECCIONES VIALES (OSM) ====================
  /** Busca qué hoja IGN (activada o precargada) contiene el centroide (lat, lon) del polígono */
  function findCoveringSheet(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const ordered = [...sheets.filter(s => s.enabled), ...sheets.filter(s => !s.enabled)];
    for (const s of ordered) {
      const b = s.bounds;
      if (lat >= b.south && lat <= b.north && lon >= b.west && lon <= b.east) {
        return s;
      }
    }
    return null;
  }

  /** Devuelve todas las hojas IGN que intersectan una ventana geográfica {south, north, west, east} */
  function findCoveringSheetsInBounds(winGeo) {
    if (!winGeo) return [];
    const seenCodes = new Set();
    const out = [];
    // Priorizar hojas de usuario activas, luego precargadas
    const ordered = [...sheets.filter(s => !s.builtin && s.enabled), ...sheets.filter(s => s.builtin), ...sheets.filter(s => !s.builtin && !s.enabled)];
    for (const s of ordered) {
      const b = s.bounds;
      const overlaps = !(b.east < winGeo.west || b.west > winGeo.east || b.north < winGeo.south || b.south > winGeo.north);
      if (overlaps && !seenCodes.has(s.code)) {
        seenCodes.add(s.code);
        out.push(s);
      }
    }
    return out;
  }

  /**
   * Busca automáticamente 2 intersecciones de calles/caminos cercanas usando OpenStreetMap (Overpass API)
   * y devuelve sus coordenadas UTM exactas para el cuadro DETALLE DE AMARRE ANATI.
   */
  async function findNearbyRoadIntersections(lat, lon, utmZone = 17, utmHemi = 'N', maxRadiusM = 1200) {
    const Geo = global.TopoGeodesy;
    if (!Geo || !Number.isFinite(lat) || !Number.isFinite(lon)) return [];

    const centerUtm = Geo.latLonToUtm(lat, lon, utmZone, 'WGS84');
    const cUtmE = centerUtm.easting;
    const cUtmN = centerUtm.northing;
    const endpoints = [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
    ];

    const queryOverpass = async (radius) => {
      const q = `[out:json][timeout:7];way(around:${radius},${lat.toFixed(6)},${lon.toFixed(6)})["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|track)$"];(._;>;);out body;`;
      for (const ep of endpoints) {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 7500);
        try {
          const resp = await fetch(ep, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
            body: 'data=' + encodeURIComponent(q),
            signal: ctrl.signal
          });
          clearTimeout(tid);
          if (!resp.ok) continue;
          return await resp.json();
        } catch {
          clearTimeout(tid);
        }
      }
      return null;
    };

    const radii = [Math.min(850, maxRadiusM), Math.max(1600, maxRadiusM)];
    for (const radius of radii) {
      const data = await queryOverpass(radius);
      if (!data || !Array.isArray(data.elements)) continue;

      const nodes = new Map();
      const ways = [];
      for (const el of data.elements) {
        if (el.type === 'node') nodes.set(el.id, el);
        else if (el.type === 'way' && Array.isArray(el.nodes) && el.nodes.length >= 2) ways.push(el);
      }

      // Contar cuántos caminos distintos (y grado de conexión) confluyen en cada nodo
      const roadRank = {
        motorway: 5, trunk: 5, primary: 5, secondary: 4, tertiary: 4,
        unclassified: 3, residential: 3, living_street: 2, service: 1, track: 1
      };
      const nodeWays = new Map();
      const nodeDegree = new Map();
      for (const w of ways) {
        const hw = (w.tags && w.tags.highway) || 'unclassified';
        const rank = roadRank[hw] || 2;
        const name = (w.tags && (w.tags.name || w.tags.ref)) || hw;
        const nList = w.nodes;
        for (let i = 0; i < nList.length; i++) {
          const nid = nList[i];
          const degAdd = (i === 0 || i === nList.length - 1) ? 1 : 2;
          nodeDegree.set(nid, (nodeDegree.get(nid) || 0) + degAdd);
          if (!nodeWays.has(nid)) nodeWays.set(nid, []);
          nodeWays.get(nid).push({ id: w.id, name, hw, rank });
        }
      }

      const candidates = [];
      for (const [nid, wList] of nodeWays.entries()) {
        const deg = nodeDegree.get(nid) || 0;
        if (wList.length < 2 || deg < 3) continue; // Intersección real (>= 3 brazos / >= 2 vías)
        const nd = nodes.get(nid);
        if (!nd) continue;
        const u = Geo.latLonToUtm(nd.lat, nd.lon, utmZone, 'WGS84');
        const ue = u.easting, un = u.northing;
        const dist = Math.hypot(ue - cUtmE, un - cUtmN);
        if (dist < 25 || dist > radius * 0.95) continue;
        const maxRank = Math.max(...wList.map(x => x.rank));
        const uniqueNames = [...new Set(wList.map(x => x.name).filter(Boolean))];
        // Preferir intersecciones cercanas (60..750 m) sobre vías principales
        const score = (maxRank * 180) - dist + (wList.length >= 3 ? 60 : 0);
        candidates.push({
          e: Math.round(ue),
          n: Math.round(un),
          lat: nd.lat,
          lon: nd.lon,
          dist,
          angle: Math.atan2(un - cUtmN, ue - cUtmE),
          label: uniqueNames.slice(0, 2).join(' / ') || 'Intersección vial',
          score
        });
      }

      if (candidates.length === 0) continue;
      candidates.sort((a, b) => b.score - a.score);

      const picked = [candidates[0]];
      // Elegir una 2da intersección bien separada (>= 90 m de la 1ra, idealmente en dirección distinta)
      let bestSecond = null;
      let bestSecondScore = -Infinity;
      for (let i = 1; i < candidates.length; i++) {
        const c = candidates[i];
        const sep = Math.hypot(c.e - picked[0].e, c.n - picked[0].n);
        if (sep < 75) continue;
        const angDiff = Math.abs(Math.atan2(Math.sin(c.angle - picked[0].angle), Math.cos(c.angle - picked[0].angle)));
        const s2 = c.score + angDiff * 140 + Math.min(sep, 400) * 0.25;
        if (s2 > bestSecondScore) {
          bestSecondScore = s2;
          bestSecond = c;
        }
      }
      if (bestSecond) picked.push(bestSecond);
      if (picked.length > 0) return picked;
    }
    return [];
  }

  // ==================== HELPERS DE DIBUJO CARTOGRÁFICO ANATI ====================
  function drawArrowHead(ctx, fromX, fromY, toX, toY, headLen = 18) {
    const ang = Math.atan2(toY - fromY, toX - fromX);
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLen * Math.cos(ang - 0.34), toY - headLen * Math.sin(ang - 0.34));
    ctx.lineTo(toX - headLen * Math.cos(ang + 0.34), toY - headLen * Math.sin(ang + 0.34));
    ctx.closePath();
    ctx.fill();
  }

  /** Rosa de los vientos clásica ANATI dentro de la esquina superior izquierda de Localización Regional */
  function drawCompassRose(ctx, cx, cy, r = 56) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = '#111827';
    ctx.fillStyle = '#111827';
    ctx.lineWidth = 2.2;

    // Eje Norte-Sur alargado + Este-Oeste
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.45); ctx.lineTo(0, r * 1.15);
    ctx.moveTo(-r * 0.95, 0); ctx.lineTo(r * 0.95, 0);
    ctx.stroke();

    // Estrella de 8 puntas
    const pts = [
      [0, -r * 0.72], [r * 0.16, -r * 0.16], [r * 0.72, 0], [r * 0.16, r * 0.16],
      [0, r * 0.72], [-r * 0.16, r * 0.16], [-r * 0.72, 0], [-r * 0.16, -r * 0.16]
    ];
    ctx.beginPath();
    pts.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fill();
    ctx.stroke();

    // Triángulos sombreados clásicos
    ctx.fillStyle = '#111827';
    for (let k = 0; k < 4; k++) {
      ctx.save();
      ctx.rotate(k * Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -r * 0.72);
      ctx.lineTo(r * 0.16, -r * 0.16);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Anillo central
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.36, 0, Math.PI * 2);
    ctx.stroke();

    // Letras N, S, E, O
    ctx.font = `bold ${Math.round(r * 0.42)}px Georgia, "Times New Roman", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#111827';
    ctx.fillText('N', 0, -r * 1.08);
    ctx.fillText('S', 0, r * 1.32);
    ctx.fillText('E', r * 1.12, 0);
    ctx.fillText('O', -r * 1.12, 0);
    ctx.restore();
  }

  /** Selecciona los vértices principales de un polígono para etiquetar sin saturación (máx 6 si hay muchos) */
  function selectPrincipalVertices(points, maxLabels = 6) {
    if (!points || points.length === 0) return [];
    const n = points.length;
    if (n <= maxLabels) {
      return points.map((p, idx) => ({ pt: p, idx, label: String(p.id || (idx + 1)).replace(/^P/i, '') || String(idx + 1) }));
    }
    // Calcular ángulo de giro en cada vértice para priorizar esquinas principales
    const scored = points.map((p, i) => {
      const prev = points[(i - 1 + n) % n];
      const next = points[(i + 1) % n];
      const v1x = p.e - prev.e, v1y = p.n - prev.n;
      const v2x = next.e - p.e, v2y = next.n - p.n;
      const l1 = Math.hypot(v1x, v1y) || 1;
      const l2 = Math.hypot(v2x, v2y) || 1;
      const dot = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (l1 * l2)));
      const turn = Math.acos(dot); // 0 = recto, PI/2 = esquina 90°
      return { pt: p, idx: i, turn, bonus: i === 0 ? 10 : 0 };
    });
    scored.sort((a, b) => (b.turn + b.bonus) - (a.turn + a.bonus));
    const chosen = scored.slice(0, maxLabels).sort((a, b) => a.idx - b.idx);
    return chosen.map(c => ({
      pt: c.pt,
      idx: c.idx,
      label: String(c.pt.id || (c.idx + 1)).replace(/^P/i, '') || String(c.idx + 1)
    }));
  }

  /** Elige la posición de caja de texto que menos choque con obstáculos y bordes del lienzo */
  function placeCalloutBox(anchorX, anchorY, boxW, boxH, outW, outH, avoidRects, preferredDist = 110) {
    const dirs = [
      [1, -0.75], [-1, -0.75], [1, 0.75], [-1, 0.75],
      [0, -1], [0, 1], [1.25, 0], [-1.25, 0]
    ];
    let best = null;
    let bestCost = Infinity;
    const pad = 22;

    for (const [dx, dy] of dirs) {
      const len = Math.hypot(dx, dy) || 1;
      const cx = anchorX + (dx / len) * (preferredDist + boxW * 0.42);
      const cy = anchorY + (dy / len) * (preferredDist + boxH * 0.42);
      const bx = Math.max(pad, Math.min(outW - boxW - pad, cx - boxW / 2));
      const by = Math.max(pad, Math.min(outH - boxH - pad, cy - boxH / 2));

      let cost = Math.hypot((bx + boxW / 2) - cx, (by + boxH / 2) - cy) * 2.5;
      // Penalizar si cubre su propio ancla
      if (anchorX >= bx - 18 && anchorX <= bx + boxW + 18 && anchorY >= by - 18 && anchorY <= by + boxH + 18) {
        cost += 6000;
      }
      // Penalizar superposición con cajas/objetos existentes
      for (const r of avoidRects) {
        const ox = Math.max(0, Math.min(bx + boxW + 14, r.x + r.w + 14) - Math.max(bx - 14, r.x - 14));
        const oy = Math.max(0, Math.min(by + boxH + 14, r.y + r.h + 14) - Math.max(by - 14, r.y - 14));
        if (ox > 0 && oy > 0) cost += ox * oy * 0.4 + 3500;
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = { x: bx, y: by, w: boxW, h: boxH };
      }
    }
    return best;
  }

  /** Punto más cercano del borde de un rectángulo a un punto objetivo (para conectar flechas limpiamente) */
  function rectEdgePoint(rect, tx, ty) {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const dx = tx - cx;
    const dy = ty - cy;
    if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) return { x: cx, y: cy };
    const sx = Math.abs(dx) > 1e-3 ? (rect.w / 2) / Math.abs(dx) : Infinity;
    const sy = Math.abs(dy) > 1e-3 ? (rect.h / 2) / Math.abs(dy) : Infinity;
    const t = Math.min(sx, sy);
    return { x: cx + dx * t, y: cy + dy * t };
  }

  function canvasToJpegBytes(canvas, quality = 0.88) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const b64 = dataUrl.split(',')[1];
    const binStr = atob(b64);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
    return bytes;
  }

  /**
   * Renderiza una ventana UTM exacta cosiendo todas las Hojas IGN Tommy Guardia que la cubren
   * y dibuja el lote, vértices, rosa de los vientos y puntos de amarre vial estilo ANATI Panamá.
   */
  async function renderIgnMapBox({
    mode, // 'regional' | 'amarre'
    points,
    utmZone,
    utmHemi,
    scale,
    boxWmm,
    boxHmm,
    tiePoints = []
  }) {
    const Geo = global.TopoGeodesy;
    let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
    for (const p of points) {
      if (p.e < minE) minE = p.e;
      if (p.e > maxE) maxE = p.e;
      if (p.n < minN) minN = p.n;
      if (p.n > maxN) maxN = p.n;
    }
    let cE = (minE + maxE) / 2;
    let cN = (minN + maxN) / 2;

    // Dimensiones reales en metros en el terreno a la escala exacta 1:scale
    const groundW = (boxWmm / 1000) * scale;
    const groundH = (boxHmm / 1000) * scale;

    // En Detalle de Amarre, desplazar suavemente el centro si hay puntos de amarre cercanos para mantenerlos dentro del cuadro
    if (mode === 'amarre' && tiePoints.length > 0) {
      let allMinE = minE, allMaxE = maxE, allMinN = minN, allMaxN = maxN;
      for (const tp of tiePoints) {
        if (Math.hypot(tp.e - cE, tp.n - cN) <= Math.max(groundW, groundH) * 0.72) {
          allMinE = Math.min(allMinE, tp.e);
          allMaxE = Math.max(allMaxE, tp.e);
          allMinN = Math.min(allMinN, tp.n);
          allMaxN = Math.max(allMaxN, tp.n);
        }
      }
      if ((allMaxE - allMinE) < groundW * 0.80) cE = (allMinE + allMaxE) / 2;
      if ((allMaxN - allMinN) < groundH * 0.80) cN = (allMinN + allMaxN) / 2;
    }

    const winUtm = {
      minE: cE - groundW / 2,
      maxE: cE + groundW / 2,
      minN: cN - groundH / 2,
      maxN: cN + groundH / 2
    };

    const swGeo = Geo.utmToLatLon(winUtm.minE, winUtm.minN, utmZone, utmHemi, 'WGS84');
    const neGeo = Geo.utmToLatLon(winUtm.maxE, winUtm.maxN, utmZone, utmHemi, 'WGS84');
    const centerGeo = Geo.utmToLatLon((minE + maxE) / 2, (minN + maxN) / 2, utmZone, utmHemi, 'WGS84');

    const primarySheet = findCoveringSheet(centerGeo.lat, centerGeo.lon);
    const overlappingSheets = findCoveringSheetsInBounds({
      south: swGeo.lat,
      north: neGeo.lat,
      west: swGeo.lon,
      east: neGeo.lon
    });

    if (overlappingSheets.length === 0) return null;

    // Cargar todas las hojas IGN que cubren esta ventana en paralelo
    const loaded = await Promise.all(
      overlappingSheets.map(async (s) => {
        try {
          const img = await loadImage(s.url);
          return { sheet: s, img };
        } catch (err) {
          console.warn('Hoja IGN no pudo cargarse para PDF:', s.code, err);
          return null;
        }
      })
    );
    const validLoaded = loaded.filter(Boolean);
    if (validLoaded.length === 0) return null;

    const outW = mode === 'amarre' ? 1440 : 1100;
    const outH = Math.round(outW * (boxHmm / boxWmm));
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, outW, outH);

    const utmToPx = (e, n) => ({
      x: ((e - winUtm.minE) / (winUtm.maxE - winUtm.minE)) * outW,
      y: ((winUtm.maxN - n) / (winUtm.maxN - winUtm.minN)) * outH
    });

    // Coser cada hoja IGN exactamente en coordenadas UTM sobre el lienzo
    for (const { sheet, img } of validLoaded) {
      const b = sheet.bounds;
      const shSw = Geo.latLonToUtm(b.south, b.west, utmZone, 'WGS84');
      const shNe = Geo.latLonToUtm(b.north, b.east, utmZone, 'WGS84');
      const p0 = utmToPx(shSw.easting, shNe.northing); // top-left
      const p1 = utmToPx(shNe.easting, shSw.northing); // bottom-right
      ctx.drawImage(img, p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
    }

    // Dibujar cuadrícula UTM 1 km muy sutil si alguna zona quedó sin líneas marcadas (coincide 1:1 con las hojas IGN)
    const firstE = Math.ceil(winUtm.minE / 1000) * 1000;
    const firstN = Math.ceil(winUtm.minN / 1000) * 1000;
    ctx.save();
    ctx.strokeStyle = 'rgba(17, 24, 39, 0.28)';
    ctx.lineWidth = 1.2;
    for (let ge = firstE; ge <= winUtm.maxE; ge += 1000) {
      const gx = utmToPx(ge, winUtm.minN).x;
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, outH); ctx.stroke();
    }
    for (let gn = firstN; gn <= winUtm.maxN; gn += 1000) {
      const gy = utmToPx(winUtm.minE, gn).y;
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(outW, gy); ctx.stroke();
    }
    ctx.restore();

    const avoidRects = [];

    // Rosa de los vientos en esquina superior izquierda (solo en Localización Regional, igual al ejemplo ANATI)
    if (mode === 'regional') {
      const roseX = 95, roseY = 128;
      drawCompassRose(ctx, roseX, roseY, 54);
      avoidRects.push({ x: roseX - 66, y: roseY - 92, w: 132, h: 175 });
    }

    // Polígono del Lote Medido
    const polyPx = points.map(p => utmToPx(p.e, p.n));
    const lotCenterPx = utmToPx((minE + maxE) / 2, (minN + maxN) / 2);
    let maxRadPx = 0;
    for (const pp of polyPx) {
      maxRadPx = Math.max(maxRadPx, Math.hypot(pp.x - lotCenterPx.x, pp.y - lotCenterPx.y));
    }

    ctx.save();
    if (polyPx.length >= 3) {
      ctx.beginPath();
      polyPx.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      ctx.closePath();
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = mode === 'amarre' ? 3.5 : 3.0;
      ctx.stroke();
    }
    // Si el lote es muy pequeño a esta escala, garantizar visibilidad con punto sólido
    if (maxRadPx < 5) {
      ctx.beginPath();
      ctx.arc(lotCenterPx.x, lotCenterPx.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
    }

    // Círculo resaltador del lote (estilo ANATI, con holgura para los números de vértice)
    const ringR = Math.max(mode === 'amarre' ? 62 : 28, Math.min(outW * 0.22, maxRadPx + (mode === 'amarre' ? 36 : 16)));
    ctx.beginPath();
    ctx.arc(lotCenterPx.x, lotCenterPx.y, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = mode === 'amarre' ? 4.2 : 3.5;
    ctx.stroke();
    ctx.restore();

    avoidRects.push({
      x: lotCenterPx.x - ringR - 12,
      y: lotCenterPx.y - ringR - 12,
      w: (ringR + 12) * 2,
      h: (ringR + 12) * 2
    });

    // Vértices principales numerados en DETALLE DE AMARRE (como 1, 2, 4, 6 del ejemplo ANATI)
    if (mode === 'amarre' && points.length >= 2) {
      const principal = selectPrincipalVertices(points, 6);
      ctx.save();
      ctx.font = 'bold 24px Georgia, "Times New Roman", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const placedLbls = [];

      for (const v of principal) {
        const vp = utmToPx(v.pt.e, v.pt.n);
        let dx = vp.x - lotCenterPx.x;
        let dy = vp.y - lotCenterPx.y;
        const d = Math.hypot(dx, dy);
        if (d < 1) { dx = 1; dy = -1; } else { dx /= d; dy /= d; }
        const pushOut = Math.max(15, maxRadPx < 16 ? 20 : 16);
        const lx = vp.x + dx * pushOut;
        const ly = vp.y + dy * pushOut;

        // Evitar que dos números de vértice queden montados uno encima del otro
        if (placedLbls.some(p => Math.hypot(p.x - lx, p.y - ly) < 22)) continue;
        placedLbls.push({ x: lx, y: ly });

        // Halo blanco discreto para máxima legibilidad sobre curvas/trama del IGN
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.strokeText(v.label, lx, ly);
        ctx.fillStyle = '#0f172a';
        ctx.fillText(v.label, lx, ly);
      }
      ctx.restore();
    }

    // Callout "LOTE MEDIDO" con flecha al círculo del lote
    const loteBoxW = mode === 'amarre' ? 215 : 230;
    const loteBoxH = mode === 'amarre' ? 114 : 122;
    const loteBox = placeCalloutBox(
      lotCenterPx.x, lotCenterPx.y, loteBoxW, loteBoxH, outW, outH, avoidRects,
      ringR + (mode === 'amarre' ? 75 : 55)
    );
    avoidRects.push(loteBox);

    const loteStart = rectEdgePoint(loteBox, lotCenterPx.x, lotCenterPx.y);
    const dirToLoteX = lotCenterPx.x - loteStart.x;
    const dirToLoteY = lotCenterPx.y - loteStart.y;
    const distToLote = Math.hypot(dirToLoteX, dirToLoteY) || 1;
    const targetRingX = lotCenterPx.x - (dirToLoteX / distToLote) * (ringR * 0.72);
    const targetRingY = lotCenterPx.y - (dirToLoteY / distToLote) * (ringR * 0.72);

    ctx.save();
    ctx.strokeStyle = '#111827';
    ctx.fillStyle = '#111827';
    ctx.lineWidth = 3.0;
    drawArrowHead(ctx, loteStart.x, loteStart.y, targetRingX, targetRingY, 22);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.6;
    ctx.fillRect(loteBox.x, loteBox.y, loteBox.w, loteBox.h);
    ctx.strokeRect(loteBox.x, loteBox.y, loteBox.w, loteBox.h);

    ctx.fillStyle = '#0f172a';
    ctx.font = `bold ${mode === 'amarre' ? 36 : 40}px Georgia, "Times New Roman", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LOTE', loteBox.x + loteBox.w / 2, loteBox.y + loteBox.h * 0.34);
    ctx.fillText('MEDIDO', loteBox.x + loteBox.w / 2, loteBox.y + loteBox.h * 0.70);
    ctx.restore();

    // En DETALLE DE AMARRE: dibujar las 2 intersecciones de calles cercanas con sus cajas E / N
    const drawnTies = [];
    if (mode === 'amarre' && tiePoints.length > 0) {
      for (const tp of tiePoints.slice(0, 2)) {
        const tpPx = utmToPx(tp.e, tp.n);
        if (tpPx.x < 16 || tpPx.x > outW - 16 || tpPx.y < 16 || tpPx.y > outH - 16) continue;

        const boxW = 285, boxH = 96;
        const tBox = placeCalloutBox(tpPx.x, tpPx.y, boxW, boxH, outW, outH, avoidRects, 85);
        avoidRects.push(tBox);

        const edgePt = rectEdgePoint(tBox, tpPx.x, tpPx.y);
        ctx.save();
        // Punto exacto en la intersección vial
        ctx.beginPath();
        ctx.arc(tpPx.x, tpPx.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = '#111827';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.2;
        ctx.stroke();

        // Flecha desde la caja hacia la intersección
        ctx.strokeStyle = '#111827';
        ctx.fillStyle = '#111827';
        ctx.lineWidth = 2.8;
        drawArrowHead(ctx, edgePt.x, edgePt.y, tpPx.x, tpPx.y, 20);

        // Caja blanca con borde negro + coordenadas E / N (formato ANATI exacto)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.strokeStyle = '#111827';
        ctx.lineWidth = 2.4;
        ctx.fillRect(tBox.x, tBox.y, tBox.w, tBox.h);
        ctx.strokeRect(tBox.x, tBox.y, tBox.w, tBox.h);

        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 34px "Courier New", Consolas, monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`E:${Math.round(tp.e)}`, tBox.x + 18, tBox.y + tBox.h * 0.33);
        ctx.fillText(`N:${Math.round(tp.n)}`, tBox.x + 18, tBox.y + tBox.h * 0.72);
        ctx.restore();

        drawnTies.push(tp);
      }
    }

    const bytes = canvasToJpegBytes(canvas, 0.88);
    const mainSheet = primarySheet || validLoaded[0].sheet;

    return {
      jpegBytes: bytes,
      width: outW,
      height: outH,
      scale,
      sheetCode: mainSheet.code,
      sheetName: mainSheet.name,
      utmBounds: winUtm,
      tiePoints: drawnTies,
      sheetsUsed: validLoaded.map(v => v.sheet.code)
    };
  }

  /**
   * Genera AMBOS cuadros cartográficos IGN Tommy Guardia para el PDF ANATI:
   * - Localización Regional (1:25,000 o 1:40,000 según tamaño del lote o selección manual)
   * - Detalle de Amarre (1:10,000 o 1:15,000 con vértices principales + 2 intersecciones de calles cercanas)
   */
  async function generateAnatiMapsForPdf(points, options = {}) {
    const Geo = global.TopoGeodesy;
    const utmZone = Number(options.utmZone) || 17;
    const utmHemi = options.utmHemi || 'N';
    if (!points || points.length === 0 || !Geo) return null;

    const validPts = points.filter(p => Geo.isPlausibleUtm(p.e, p.n));
    if (validPts.length === 0) return null;

    let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
    for (const p of validPts) {
      if (p.e < minE) minE = p.e;
      if (p.e > maxE) maxE = p.e;
      if (p.n < minN) minN = p.n;
      if (p.n > maxN) maxN = p.n;
    }
    const maxSpan = Math.max(maxE - minE, maxN - minN);
    const cE = (minE + maxE) / 2;
    const cN = (minN + maxN) / 2;

    // Selección automática de escalas según tamaño del lote/finca
    const regScaleOpt = options.regionalScale;
    const amaScaleOpt = options.amarreScale;
    const regionalScale = (Number(regScaleOpt) === 25000 || Number(regScaleOpt) === 40000)
      ? Number(regScaleOpt)
      : (maxSpan <= 900 ? 25000 : 40000);
    const amarreScale = (Number(amaScaleOpt) === 10000 || Number(amaScaleOpt) === 15000)
      ? Number(amaScaleOpt)
      : (maxSpan <= 450 ? 10000 : 15000);

    // Puntos de amarre vial: usar los proporcionados por el usuario, o auto-detectar 2 intersecciones OSM cercanas
    let tiePoints = (options.tiePoints || []).filter(t => t && Number.isFinite(t.e) && Number.isFinite(t.n));
    if (tiePoints.length === 0 && options.autoDetectTies !== false) {
      try {
        const cGeo = Geo.utmToLatLon(cE, cN, utmZone, utmHemi, 'WGS84');
        const radiusM = amarreScale === 10000 ? 950 : 1450;
        tiePoints = await findNearbyRoadIntersections(cGeo.lat, cGeo.lon, utmZone, utmHemi, radiusM);
      } catch (err) {
        console.warn('Auto-detección de intersecciones viales omitida:', err);
      }
    }

    const [regional, amarre] = await Promise.all([
      renderIgnMapBox({
        mode: 'regional',
        points: validPts,
        utmZone,
        utmHemi,
        scale: regionalScale,
        boxWmm: options.regionalBoxWmm || 110,
        boxHmm: options.regionalBoxHmm || 100
      }),
      renderIgnMapBox({
        mode: 'amarre',
        points: validPts,
        utmZone,
        utmHemi,
        scale: amarreScale,
        boxWmm: options.amarreBoxWmm || 160,
        boxHmm: options.amarreBoxHmm || 148,
        tiePoints
      })
    ]);

    if (!regional && !amarre) return null;
    return {
      regional,
      amarre,
      sheetCode: (regional && regional.sheetCode) || (amarre && amarre.sheetCode) || '',
      tiePoints
    };
  }

  /** Alias de compatibilidad hacia atrás */
  async function generateRegionalCropForPdf(points, utmZone = 17, utmHemi = 'N') {
    const res = await generateAnatiMapsForPdf(points, { utmZone, utmHemi, autoDetectTies: false });
    return res ? res.regional : null;
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
    findCoveringSheetsInBounds,
    findNearbyRoadIntersections,
    generateAnatiMapsForPdf,
    generateRegionalCropForPdf
  };
})(window);
