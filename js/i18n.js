/**
 * i18n.js — Soporte bilingüe Español (ES) / English (EN) para topografia.com.pa
 */
(function (global) {
  'use strict';

  const DICT = {
    es: {
      brandSub: 'Calculadora Gráfica COGO',
      crsUtm17: 'UTM WGS84 · Zona 17N (Panamá)',
      crsUtm18: 'UTM WGS84 · Zona 18N (Panamá Este / Darién)',
      crsLocal: 'Sistema Local (Plano CAD)',
      btnDemo: 'Ejemplo',
      btnDrawMap: 'Dibujar en Mapa',
      btnEditPts: 'Editar Puntos',
      btnImport: 'Importar CSV/TXT',
      btnExportDxf: 'Exportar DXF',

      tabTraverse: 'Poligonal',
      tabCogo: 'COGO',
      tabTable: 'Cuadro',

      secInitTitle: '1. Coordenada Inicial',
      btnPickMap: '📍 Elegir en mapa',
      lblPoint: 'Punto',
      lblEast: 'Este (X)',
      lblNorth: 'Norte (Y)',
      lblElev: 'Cota (Z)',
      lblDesc: 'Descripción',
      btnSetInitial: 'Establecer Punto Inicial',

      secLegTitle: '2. Agregar Tramo',
      modeBearing: 'Rumbo',
      modeAzimuth: 'Azimut',
      modeCoords: 'E, N',
      lblFromStation: 'Desde Estación',
      lblNewPointId: 'Nuevo Punto (ID)',
      lblBearingDms: 'Rumbo (Cuadrante + Grados° Min\' Seg")',
      lblQuickBearing: 'o entrada rápida de rumbo (opcional)',
      lblAzimuthDms: 'Azimut (0° – 360°)',
      lblDistM: 'Distancia (m)',
      lblDzM: 'ΔZ (m)',
      btnAddPoint: '+ Agregar Punto al Dibujo',
      btnUndo: 'Deshacer',

      secAreaTitle: '3. Poligonal y Superficie',
      lblClosePoly: 'Cerrar polígono',
      statAreaM2: 'Área (m²)',
      statAreaHa: 'Hectáreas (ha)',
      statPerim: 'Perímetro (m)',
      statAcres: 'Acres (ac)',
      btnBowditch: 'Ajuste Bowditch (Cierre)',

      lblCogoTool: 'Herramienta COGO',
      optInverse: '1. Inverso (Rumbo, Azimut, Distancia y Pendiente)',
      optDirect: '2. Directo / Radiación (Estación + Rumbo/Az + Dist)',
      optIntBB: '3. Intersección Rumbo – Rumbo',
      optIntDD: '4. Intersección Distancia – Distancia (Trilateración)',
      optIntBD: '5. Intersección Rumbo – Distancia',
      optOffset: '6. Estación y Offset (Línea Base A → B)',
      optSubdivide: '7. Subdividir Línea en N Tramos Iguales',
      optCurve: '8. Curva Horizontal Simple (Replanteo Vial)',
      optRotate: '9. Girar Polígono / Puntos (desde Vértice)',
      optMove: '10. Mover / Trasladar Todos los Puntos',
      optLots: '11. Dividir Polígono en Lotes Iguales (2, 3, N)',

      hInverse: 'Inverso entre Dos Puntos',
      lblFromA: 'Desde Punto A',
      lblToB: 'Hasta Punto B',
      btnCalcInverse: 'Calcular Inverso',
      btnDrawAux: 'Trazar Aux.',

      hDirect: 'Cálculo Directo / Radiación',
      lblBaseStation: 'Estación Base',
      lblNewPtId: 'ID Nuevo Punto',
      lblBearingOrAz: 'Rumbo o Azimut',
      lblHorizDist: 'Distancia H (m)',
      btnCalcDirect: 'Calcular y Agregar Punto',

      hIntBB: 'Intersección Rumbo – Rumbo',
      lblPt1: 'Punto 1',
      lblDir1: 'Rumbo / Azimut 1',
      lblPt2: 'Punto 2',
      lblDir2: 'Rumbo / Azimut 2',
      btnCalcIntersection: 'Calcular Intersección',

      hIntDD: 'Intersección Distancia – Distancia',
      lblCenter1: 'Centro 1 (P1)',
      lblRadius1: 'Distancia / Radio 1 (m)',
      lblCenter2: 'Centro 2 (P2)',
      lblRadius2: 'Distancia / Radio 2 (m)',
      btnCalcTrilat: 'Calcular Trilateración',

      hIntBD: 'Intersección Rumbo – Distancia',
      lblPtDir1: 'Punto Dirección (P1)',
      lblPtCenter2: 'Punto Centro (P2)',
      lblRadius: 'Distancia / Radio (m)',

      hOffset: 'Estación y Offset sobre Línea A → B',
      lblLineStart: 'Inicio Línea (A)',
      lblLineEnd: 'Fin Línea (B)',
      lblStation: 'Estación / Abscisa (m)',
      lblOffset: 'Offset (m) [-Izq / +Der]',
      btnCreateOffsetPt: 'Crear Punto por Estación/Offset',
      lblProjExisting: 'O proyectar punto existente P sobre A → B:',
      btnProject: 'Proyectar',

      hSubdivide: 'Subdividir Línea en Tramos Iguales',
      lblPtA: 'Punto A',
      lblPtB: 'Punto B',
      lblNumSegs: 'N° Tramos',
      btnSubdivide: 'Generar Puntos Intermedios',

      hCurve: 'Curva Horizontal Simple (Replanteo Vial)',
      lblPtPI: 'Punto PI (Vértice)',
      lblRadiusR: 'Radio R (m)',
      lblAzIn: 'Rumbo/Az. Entrada (hacia PI)',
      lblAzOut: 'Rumbo/Az. Salida (desde PI)',
      lblArcStep: 'Intervalo de replanteo en arco (m)',
      btnCalcCurve: 'Calcular y Dibujar Curva',
      btnClear: 'Limpiar',

      hRotate: 'Girar Polígono / Todos los Puntos',
      lblPivotPt: 'Punto Pivote (Centro de Giro)',
      lblRotAngle: 'Ángulo de giro (grados)',
      lblRotDir: 'Sentido',
      optCW: 'Horario / Derecha (+)',
      optCCW: 'Antihorario / Izquierda (−)',
      btnApplyRotate: 'Aplicar Giro',

      hMove: 'Mover / Trasladar Todos los Puntos',
      lblMoveDe: 'ΔEste (m)',
      lblMoveDn: 'ΔNorte (m)',
      lblMoveDz: 'ΔCota (m)',
      btnMoveDelta: 'Mover por Desplazamiento (ΔE, ΔN)',
      hMoveBase: 'O mover desde vértice a destino',
      lblBaseVertex: 'Vértice base',
      lblDestE: 'Destino E',
      lblDestN: 'Destino N',
      btnMoveToCoord: 'Trasladar Vértice a Destino',

      hLots: 'Dividir Polígono en Lotes Iguales',
      lblNumLots: 'N° de partes iguales',
      lblCutDir: 'Dirección de corte',
      optCutSide: 'Paralela a un lado',
      optCutNS: 'Norte – Sur (0°)',
      optCutEW: 'Este – Oeste (90°)',
      optCutCustom: 'Rumbo / Azimut libre',
      lblRefSide: 'Lado de referencia',
      lblCustomCutDir: 'Rumbo o Azimut de corte',
      btnCalcLots: 'Dividir en Lotes Iguales',
      btnClearAux: 'Limpiar líneas auxiliares COGO',

      subFieldTable: 'Cuadro de Campo',
      subPointsList: 'Puntos',
      btnCopy: '📋 Copiar',
      mainPolyHead: 'Polígono Completo (Finca Madre)',
      thEst: 'Est.',
      thPv: 'P.V.',
      thBearing: 'Rumbo',
      thDist: 'Dist (m)',
      thNorth: 'Norte (Y)',
      thEast: 'Este (X)',
      thElev: 'Cota',
      thAct: 'Acc.',

      bmSat: 'Satelital',
      bmHybrid: 'Híbrido',
      bmStreet: 'StreetMap',
      bmTopo: 'Topo',
      bmCad: 'Plano CAD',
      btnFinishDraw: '✓ Terminar y Cerrar',
      btnCancelEsc: 'Cancelar (Esc)',

      modImportTitle: 'Importar Puntos desde CSV / TXT',
      dropTitle: 'Arrastra tu archivo .CSV o .TXT aquí',
      dropSub: 'Soporta exportaciones de estación total, RTK, Civil 3D, Leica, Trimble y Topcon',
      lblColFormat: 'Formato de Columnas',
      lblDelim: 'Separador',
      lblImportAction: 'Acción',
      optReplace: 'Reemplazar puntos actuales',
      optAppend: 'Agregar al dibujo actual',
      lblPasteCoords: 'O pega directamente tus coordenadas (1 punto por línea):',
      lblAutoClose: 'Cerrar poligonal automáticamente',
      btnCancel: 'Cancelar',
      btnConfirmImport: 'Importar Puntos',

      modDxfTitle: 'Exportar Dibujo a DXF (AutoCAD / Civil 3D)',
      dxfNote: 'Genera un archivo DXF estándar (R12/AC1009) en coordenadas reales (metros) con capas separadas y el Cuadro de Datos de Campo dibujado vectorialmente.',
      lblFilename: 'Nombre del archivo',
      lblTextScale: 'Escala de textos',
      dxfOptPoly: 'Poligonal / Linderos',
      dxfOptPts: 'Puntos, vértices e IDs',
      dxfOptBearings: 'Rumbos y distancias rotados',
      dxfOptArea: 'Área y perímetro en centroide',
      dxfOptTable: 'Cuadro de Datos de Campo',
      dxfOptNorth: 'Flecha Norte vectorial',
      dxfOptGrid: 'Cuadrícula y cruces de coordenadas',
      btnDownloadDxf: 'Descargar Archivo .DXF'
    },
    en: {
      brandSub: 'Graphical COGO Calculator',
      crsUtm17: 'UTM WGS84 · Zone 17N (Panama)',
      crsUtm18: 'UTM WGS84 · Zone 18N (East Panama / Darien)',
      crsLocal: 'Local System (CAD Grid)',
      btnDemo: 'Demo',
      btnDrawMap: 'Draw on Map',
      btnEditPts: 'Edit Points',
      btnImport: 'Import CSV/TXT',
      btnExportDxf: 'Export DXF',

      tabTraverse: 'Traverse',
      tabCogo: 'COGO',
      tabTable: 'Field Data',

      secInitTitle: '1. Starting Coordinate',
      btnPickMap: '📍 Pick on map',
      lblPoint: 'Point',
      lblEast: 'Easting (X)',
      lblNorth: 'Northing (Y)',
      lblElev: 'Elev (Z)',
      lblDesc: 'Description',
      btnSetInitial: 'Set Starting Point',

      secLegTitle: '2. Add Course',
      modeBearing: 'Bearing',
      modeAzimuth: 'Azimuth',
      modeCoords: 'E, N',
      lblFromStation: 'From Station',
      lblNewPointId: 'New Point (ID)',
      lblBearingDms: 'Bearing (Quadrant + Deg° Min\' Sec")',
      lblQuickBearing: 'or quick bearing entry (optional)',
      lblAzimuthDms: 'Azimuth (0° – 360°)',
      lblDistM: 'Distance (m)',
      lblDzM: 'ΔZ (m)',
      lblDescShort: 'Description',
      btnAddPoint: '+ Add Point to Drawing',
      btnUndo: 'Undo',

      secAreaTitle: '3. Traverse & Area',
      lblClosePoly: 'Close polygon',
      statAreaM2: 'Area (m²)',
      statAreaHa: 'Hectares (ha)',
      statPerim: 'Perimeter (m)',
      statAcres: 'Acres (ac)',
      btnBowditch: 'Bowditch Adjustment (Closure)',

      lblCogoTool: 'COGO Tool',
      optInverse: '1. Inverse (Bearing, Azimuth, Distance & Slope)',
      optDirect: '2. Direct / Sideshot (Station + Brg/Az + Dist)',
      optIntBB: '3. Bearing – Bearing Intersection',
      optIntDD: '4. Distance – Distance Intersection (Trilateration)',
      optIntBD: '5. Bearing – Distance Intersection',
      optOffset: '6. Station & Offset (Baseline A → B)',
      optSubdivide: '7. Subdivide Line into N Equal Segments',
      optCurve: '8. Simple Horizontal Curve (Road Stakeout)',
      optRotate: '9. Rotate Polygon / Points (around Vertex)',
      optMove: '10. Move / Translate All Points',
      optLots: '11. Divide Polygon into Equal Lots (2, 3, N)',

      hInverse: 'Inverse Between Two Points',
      lblFromA: 'From Point A',
      lblToB: 'To Point B',
      btnCalcInverse: 'Compute Inverse',
      btnDrawAux: 'Draw Aux.',

      hDirect: 'Direct / Sideshot Calculation',
      lblBaseStation: 'Occupied Station',
      lblNewPtId: 'New Point ID',
      lblBearingOrAz: 'Bearing or Azimuth',
      lblHorizDist: 'Horiz. Distance (m)',
      btnCalcDirect: 'Compute & Add Point',

      hIntBB: 'Bearing – Bearing Intersection',
      lblPt1: 'Point 1',
      lblDir1: 'Bearing / Azimuth 1',
      lblPt2: 'Point 2',
      lblDir2: 'Bearing / Azimuth 2',
      btnCalcIntersection: 'Compute Intersection',

      hIntDD: 'Distance – Distance Intersection',
      lblCenter1: 'Center 1 (P1)',
      lblRadius1: 'Distance / Radius 1 (m)',
      lblCenter2: 'Center 2 (P2)',
      lblRadius2: 'Distance / Radius 2 (m)',
      btnCalcTrilat: 'Compute Trilateration',

      hIntBD: 'Bearing – Distance Intersection',
      lblPtDir1: 'Direction Point (P1)',
      lblPtCenter2: 'Center Point (P2)',
      lblRadius: 'Distance / Radius (m)',

      hOffset: 'Station & Offset on Line A → B',
      lblLineStart: 'Line Start (A)',
      lblLineEnd: 'Line End (B)',
      lblStation: 'Station / Chainage (m)',
      lblOffset: 'Offset (m) [-Left / +Right]',
      btnCreateOffsetPt: 'Create Station/Offset Point',
      lblProjExisting: 'Or project existing point P onto A → B:',
      btnProject: 'Project',

      hSubdivide: 'Subdivide Line into Equal Segments',
      lblPtA: 'Point A',
      lblPtB: 'Point B',
      lblNumSegs: '# Segments',
      btnSubdivide: 'Generate Intermediate Points',

      hCurve: 'Simple Horizontal Curve (Road Stakeout)',
      lblPtPI: 'PI Point (Vertex)',
      lblRadiusR: 'Radius R (m)',
      lblAzIn: 'In Bearing/Az (to PI)',
      lblAzOut: 'Out Bearing/Az (from PI)',
      lblArcStep: 'Arc stakeout interval (m)',
      btnCalcCurve: 'Compute & Draw Curve',
      btnClear: 'Clear',

      hRotate: 'Rotate Polygon / All Points',
      lblPivotPt: 'Pivot Point (Rotation Center)',
      lblRotAngle: 'Rotation angle (degrees)',
      lblRotDir: 'Direction',
      optCW: 'Clockwise / Right (+)',
      optCCW: 'Counter-Clockwise / Left (−)',
      btnApplyRotate: 'Apply Rotation',

      hMove: 'Move / Translate All Points',
      lblMoveDe: 'ΔEast (m)',
      lblMoveDn: 'ΔNorth (m)',
      lblMoveDz: 'ΔElev (m)',
      btnMoveDelta: 'Move by Offset (ΔE, ΔN)',
      hMoveBase: 'Or move base vertex to target',
      lblBaseVertex: 'Base vertex',
      lblDestE: 'Target E',
      lblDestN: 'Target N',
      btnMoveToCoord: 'Translate Vertex to Target',

      hLots: 'Divide Polygon into Equal Lots',
      lblNumLots: '# Equal lots',
      lblCutDir: 'Cut direction',
      optCutSide: 'Parallel to a side',
      optCutNS: 'North – South (0°)',
      optCutEW: 'East – West (90°)',
      optCutCustom: 'Custom Bearing / Azimuth',
      lblRefSide: 'Reference side',
      lblCustomCutDir: 'Custom cut Bearing or Azimuth',
      btnCalcLots: 'Divide into Equal Lots',
      btnClearAux: 'Clear COGO auxiliary lines',

      subFieldTable: 'Field Table',
      subPointsList: 'Points',
      btnCopy: '📋 Copy',
      mainPolyHead: 'Full Polygon (Parent Parcel)',
      thEst: 'Sta.',
      thPv: 'To',
      thBearing: 'Bearing',
      thDist: 'Dist (m)',
      thNorth: 'North (Y)',
      thEast: 'East (X)',
      thElev: 'Elev',
      thAct: 'Act.',

      bmSat: 'Satellite',
      bmHybrid: 'Hybrid',
      bmStreet: 'StreetMap',
      bmTopo: 'Topo',
      bmCad: 'CAD Grid',
      btnFinishDraw: '✓ Finish & Close',
      btnCancelEsc: 'Cancel (Esc)',

      modImportTitle: 'Import Points from CSV / TXT',
      dropTitle: 'Drag your .CSV or .TXT file here',
      dropSub: 'Supports Total Station, RTK, Civil 3D, Leica, Trimble & Topcon exports',
      lblColFormat: 'Column Format',
      lblDelim: 'Delimiter',
      lblImportAction: 'Action',
      optReplace: 'Replace current points',
      optAppend: 'Append to current drawing',
      lblPasteCoords: 'Or paste your coordinates directly (1 point per line):',
      lblAutoClose: 'Close traverse automatically',
      btnCancel: 'Cancel',
      btnConfirmImport: 'Import Points',

      modDxfTitle: 'Export Drawing to DXF (AutoCAD / Civil 3D)',
      dxfNote: 'Generates a standard DXF (R12/AC1009) in real-world coordinates (meters) with organized layers and a vector Field Data Table.',
      lblFilename: 'File name',
      lblTextScale: 'Text scale',
      dxfOptPoly: 'Traverse / Boundaries',
      dxfOptPts: 'Points, vertices & IDs',
      dxfOptBearings: 'Rotated bearings & distances',
      dxfOptArea: 'Centroid area & perimeter',
      dxfOptTable: 'Field Data Table',
      dxfOptNorth: 'Vector North arrow',
      dxfOptGrid: 'Coordinate grid & ticks',
      btnDownloadDxf: 'Download .DXF File'
    }
  };

  let currentLang = 'es';
  try {
    const saved = localStorage.getItem('topo_lang');
    if (saved === 'en' || saved === 'es') currentLang = saved;
  } catch {}

  function t(key) {
    return (DICT[currentLang] && DICT[currentLang][key]) || DICT.es[key] || key;
  }

  function applyLanguage(lang) {
    if (lang === 'es' || lang === 'en') {
      currentLang = lang;
      try { localStorage.setItem('topo_lang', lang); } catch {}
    }
    document.documentElement.lang = currentLang;

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      const val = t(key);
      if (val) el.textContent = val;
    });

    const toggleBtn = document.getElementById('btnLangToggle');
    if (toggleBtn) {
      toggleBtn.textContent = currentLang === 'es' ? 'EN' : 'ES';
      toggleBtn.title = currentLang === 'es' ? 'Switch interface to English' : 'Cambiar interfaz a Español';
    }
  }

  function toggleLanguage() {
    applyLanguage(currentLang === 'es' ? 'en' : 'es');
    return currentLang;
  }

  function getLang() {
    return currentLang;
  }

  global.TopoI18n = {
    t,
    applyLanguage,
    toggleLanguage,
    getLang
  };
})(window);
