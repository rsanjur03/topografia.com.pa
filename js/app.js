/**
 * app.js — Controlador principal de topografia.com.pa (Calculadora Gráfica COGO)
 */
(function (global) {
  'use strict';

  const C = global.TopoCOGO;
  const Geo = global.TopoGeodesy;
  const IO = global.TopoIO;
  const DXF = global.TopoDXF;

  // ==================== ESTADO DEL PROYECTO ====================
  const state = {
    projectName: 'Finca_Chiriqui_17N',
    crsMode: 'utm',          // 'utm' | 'local'
    utmZone: 17,
    utmHemi: 'N',
    crsLabel: 'UTM WGS84 ZONA 17N (PANAMA)',
    points: [],
    closed: true,
    curves: [],
    auxLines: [],
    lotDivision: null,
    closureInfo: null,
    traverseMode: 'bearing', // 'bearing' | 'azimuth' | 'coords'
    labelsVisible: true,
    editMode: false
  };

  let mapEngine = null;
  let toastTimer = null;

  // ==================== UTILIDADES UI ====================
  const $ = (id) => document.getElementById(id);

  function showToast(msg, duration = 3200) {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), duration);
  }

  function nextAutoPointId() {
    let maxNum = 0;
    for (const p of state.points) {
      const m = String(p.id).match(/(\d+)$/);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    }
    return `P${Math.max(maxNum + 1, state.points.length + 1)}`;
  }

  function getPointByIndex(idx) {
    const i = parseInt(idx, 10);
    return Number.isFinite(i) && state.points[i] ? state.points[i] : null;
  }

  function addPoint(pt, fit = false) {
    state.points.push({
      id: String(pt.id || nextAutoPointId()).trim(),
      e: Number(pt.e),
      n: Number(pt.n),
      z: Number(pt.z) || 0,
      desc: String(pt.desc || '').trim()
    });
    state.closureInfo = null;
    refreshAll(fit);
  }

  // ==================== ACTUALIZACIÓN GLOBAL ====================
  function refreshAll(fitBounds = false) {
    // 1. Actualizar contadores y selects de puntos
    $('badgePtCount').textContent = String(state.points.length);
    $('travNextId').value = nextAutoPointId();
    $('dirNewId').value = `R${state.points.length + 1}`;

    populatePointSelects();
    updateMetrics();
    renderTables();

    // 2. Renderizar en el mapa / CAD
    if (mapEngine) {
      mapEngine.render({
        points: state.points,
        closed: state.closed,
        curves: state.curves,
        auxLines: state.auxLines,
        lotDivision: state.lotDivision
      });
      if (fitBounds) mapEngine.fitBounds();
    }
  }

  function populatePointSelects() {
    const travSel = $('travFromSelect');
    const prevTrav = travSel.value;
    travSel.innerHTML = '';

    if (state.points.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '(Fije coordenada inicial primero)';
      travSel.appendChild(opt);
    } else {
      state.points.forEach((p, idx) => {
        const opt = document.createElement('option');
        opt.value = String(idx);
        opt.textContent = `${p.id} (E:${p.e.toFixed(2)}, N:${p.n.toFixed(2)})`;
        travSel.appendChild(opt);
      });
      // Por defecto seleccionar siempre el último punto agregado para avanzar la poligonal
      travSel.value = String(state.points.length - 1);
    }

    // Todos los selects COGO (.pt-select)
    document.querySelectorAll('.pt-select').forEach((sel, sIdx) => {
      const prev = sel.value;
      sel.innerHTML = '';
      state.points.forEach((p, idx) => {
        const opt = document.createElement('option');
        opt.value = String(idx);
        opt.textContent = `${p.id} — (${p.e.toFixed(2)}, ${p.n.toFixed(2)})`;
        sel.appendChild(opt);
      });
      if (prev && state.points[Number(prev)]) {
        sel.value = prev;
      } else if (state.points.length > 1 && (sel.id.endsWith('B') || sel.id.endsWith('2'))) {
        sel.value = '1';
      } else if (state.points.length > 0) {
        sel.value = '0';
      }
    });

    // Poblar selector de lados para División de Lotes
    const sideSel = $('lotsSideSelect');
    if (sideSel) {
      const prevSide = sideSel.value;
      sideSel.innerHTML = '';
      const metrics = C.polygonMetrics(state.points, state.points.length >= 3);
      metrics.legs.forEach((leg, idx) => {
        const opt = document.createElement('option');
        opt.value = String(leg.azimuth);
        opt.textContent = `Lado ${leg.fromId} → ${leg.toId} (${leg.bearing})`;
        sideSel.appendChild(opt);
      });
      if (prevSide && Array.from(sideSel.options).some(o => o.value === prevSide)) {
        sideSel.value = prevSide;
      }
    }

    // Actualizar selects dentro de las filas de control Helmert 2D en COGO
    document.querySelectorAll('.cogo-helmert-pt').forEach((sel, idx) => {
      const prev = sel.value;
      sel.innerHTML = '';
      state.points.forEach((p, pIdx) => {
        const opt = document.createElement('option');
        opt.value = String(pIdx);
        opt.textContent = `${p.id} (${p.e.toFixed(2)}, ${p.n.toFixed(2)})`;
        sel.appendChild(opt);
      });
      if (prev && state.points[Number(prev)]) sel.value = prev;
      else if (state.points[idx]) sel.value = String(idx);
    });
  }

  function updateMetrics() {
    const metrics = C.polygonMetrics(state.points, state.closed && state.points.length >= 3);
    $('statAreaM2').textContent = metrics.areaM2.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    $('statAreaHa').textContent = metrics.areaHa.toFixed(4);
    $('statPerim').textContent = metrics.perimeter.toFixed(3);
    $('statAcres').textContent = metrics.areaAcres.toFixed(4);
  }

  function renderTables() {
    const closed = state.closed && state.points.length >= 3;
    const metrics = C.polygonMetrics(state.points, closed);

    // 1. Cuadro de Datos de Campo (Polígono completo + Cuadros de cada Lote si hay división)
    const hasLots = Boolean(state.lotDivision && state.lotDivision.ok && state.lotDivision.lots && state.lotDivision.lots.length > 0);
    const mainHead = $('mainPolyTableHead');
    if (mainHead) {
      mainHead.classList.toggle('hidden', !hasLots);
      if (hasLots) {
        $('mainPolyTableArea').textContent = `${metrics.areaM2.toFixed(2)} m² · Perím: ${metrics.perimeter.toFixed(2)} m`;
      }
    }

    const fieldBody = $('fieldTableBody');
    fieldBody.innerHTML = '';
    if (metrics.legs.length === 0) {
      fieldBody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:14px;">Agrega al menos 2 puntos para ver el cuadro de campo</td></tr>`;
    } else {
      for (const leg of metrics.legs) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${leg.fromId}</strong></td>
          <td>${leg.toId}</td>
          <td>${leg.bearing}</td>
          <td>${leg.dist.toFixed(3)}</td>
          <td>${leg.from.n.toFixed(3)}</td>
          <td>${leg.from.e.toFixed(3)}</td>
        `;
        fieldBody.appendChild(tr);
      }
      if (!closed && state.points.length > 0) {
        const last = state.points[state.points.length - 1];
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><strong>${last.id}</strong></td><td>-</td><td>FIN</td><td>-</td><td>${last.n.toFixed(3)}</td><td>${last.e.toFixed(3)}</td>`;
        fieldBody.appendChild(tr);
      }
    }

    // Cuadros de Datos de Campo individuales de cada Lote
    const lotContainer = $('lotTablesContainer');
    if (lotContainer) {
      lotContainer.innerHTML = '';
      if (hasLots) {
        state.lotDivision.lots.forEach((lot, idx) => {
          const legs = lot.legs || C.polygonMetrics(lot.points, true).legs;
          const block = document.createElement('div');
          block.className = 'lot-table-block';
          const rowsHtml = legs.map(leg => `
            <tr>
              <td><strong>${leg.fromId}</strong></td>
              <td>${leg.toId}</td>
              <td>${leg.bearing}</td>
              <td>${leg.dist.toFixed(3)}</td>
              <td>${leg.from.n.toFixed(3)}</td>
              <td>${leg.from.e.toFixed(3)}</td>
            </tr>
          `).join('');
          block.innerHTML = `
            <div class="lot-table-head lot-head-amber">
              <span>${lot.name} (Datos de Campo)</span>
              <button type="button" class="chip-btn" data-copy-lot="${idx}" title="Copiar cuadro de ${lot.name}">📋 Copiar</button>
            </div>
            <table class="data-table">
              <thead>
                <tr>
                  <th>Est.</th>
                  <th>P.V.</th>
                  <th>Rumbo</th>
                  <th>Dist (m)</th>
                  <th>Norte (Y)</th>
                  <th>Este (X)</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
            <div class="lot-table-foot">
              <span>Área: ${lot.areaM2.toFixed(2)} m² (${lot.areaHa.toFixed(4)} ha)</span>
              <span>Perím: ${lot.perimeter.toFixed(3)} m</span>
            </div>
          `;
          lotContainer.appendChild(block);
        });

        lotContainer.querySelectorAll('[data-copy-lot]').forEach(btn => {
          btn.addEventListener('click', async () => {
            const lot = state.lotDivision.lots[Number(btn.dataset.copyLot)];
            if (!lot) return;
            const tsv = IO.fieldTableToTSV(lot.points, true, null);
            try {
              await navigator.clipboard.writeText(`${lot.name.toUpperCase()}\r\n${tsv}`);
              showToast(`Cuadro de ${lot.name} copiado para Excel`);
            } catch {
              IO.downloadFile(`${state.projectName}_${lot.name.replace(/\s+/g, '_')}.tsv`, tsv, 'text/tab-separated-values');
              showToast(`Cuadro de ${lot.name} descargado`);
            }
          });
        });
      }
    }

    // 2. Lista de Puntos
    const ptsBody = $('pointsTableBody');
    ptsBody.innerHTML = '';
    if (state.points.length === 0) {
      ptsBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:14px;">Sin puntos cargados</td></tr>`;
    } else {
      state.points.forEach((p, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${p.id}</strong></td>
          <td>${p.e.toFixed(3)}</td>
          <td>${p.n.toFixed(3)}</td>
          <td>${(Number(p.z) || 0).toFixed(2)}</td>
          <td>
            <button class="tbl-act-btn" data-zoom="${idx}" title="Centrar en mapa">🎯</button>
            <button class="tbl-act-btn del" data-del="${idx}" title="Eliminar punto">✕</button>
          </td>
        `;
        ptsBody.appendChild(tr);
      });
    }
  }

  // ==================== POLIGONAL DE EJEMPLO (DAVID, CHIRIQUÍ, UTM 17N) ====================
  function loadPanamaDemo() {
    // Parcela realista en David, Chiriquí, Panamá (UTM WGS84 Zona 17N, ~8.433° N, 82.433° W)
    state.crsMode = 'utm';
    state.utmZone = 17;
    state.utmHemi = 'N';
    state.crsLabel = 'UTM WGS84 ZONA 17N (CHIRIQUI, PANAMA)';
    $('crsSelect').value = 'utm17N';
    $('hudCrsBadge').textContent = 'UTM WGS84 · 17N';
    $('projectNameInput').value = 'Finca_Chiriqui_17N';
    state.projectName = 'Finca_Chiriqui_17N';

    const p1 = { id: 'P1', e: 342527.835, n: 932597.318, z: 0.00, desc: 'MOJON 1' };
    const p2 = { id: 'P2', e: 342604.985, n: 932534.131, z: 0.00, desc: 'MOJON 2' };
    const p3 = { id: 'P3', e: 342643.398, n: 932579.153, z: 0.00, desc: 'MOJON 3' };
    const p4 = { id: 'P4', e: 342564.762, n: 932639.872, z: 0.00, desc: 'MOJON 4' };

    state.points = [p1, p2, p3, p4];
    state.closed = true;
    state.curves = [];
    state.auxLines = [];
    state.lotDivision = null;
    state.closureInfo = null;
    $('chkClosedPoly').checked = true;

    $('initId').value = p1.id;
    $('initE').value = p1.e.toFixed(3);
    $('initN').value = p1.n.toFixed(3);
    $('initZ').value = p1.z.toFixed(2);
    $('initDesc').value = p1.desc;

    mapEngine.setCRS('utm', 17, 'N');
    refreshAll(true);
    showToast('Poligonal de ejemplo cargada en David, Chiriquí (UTM Zona 17N)');
  }

  // ==================== MODO CAPTURA / DIBUJO / EDICIÓN EN MAPA ====================
  function setEditMode(enabled) {
    state.editMode = Boolean(enabled);
    if (state.editMode && mapEngine.pickMode) {
      mapEngine.setPickMode(null);
      $('btnPickInitial').classList.remove('active');
      $('btnMapAddPoint').classList.remove('active');
      $('btnStartDrawPoly').classList.remove('active');
    }
    mapEngine.setEditMode(state.editMode);
    $('btnToggleEditMode').classList.toggle('active', state.editMode);
    $('btnMapEditVertices').classList.toggle('active', state.editMode);

    const banner = $('pickBanner');
    const finishBtn = $('btnFinishDraw');
    if (state.editMode) {
      finishBtn.classList.add('hidden');
      $('pickBannerText').textContent = 'Modo Edición activo — Arrastra cualquier vértice (P1, P2...) sobre el mapa para moverlo';
      banner.classList.remove('hidden');
      showToast('Modo edición activado: arrastra cualquier vértice para moverlo');
    } else if (!mapEngine.pickMode) {
      banner.classList.add('hidden');
    }
  }

  function setMapPickMode(mode) {
    if (mode && state.editMode) {
      state.editMode = false;
      mapEngine.setEditMode(false);
      $('btnToggleEditMode').classList.remove('active');
      $('btnMapEditVertices').classList.remove('active');
    }
    mapEngine.setPickMode(mode);
    const banner = $('pickBanner');
    const finishBtn = $('btnFinishDraw');
    $('btnPickInitial').classList.toggle('active', mode === 'initial');
    $('btnMapAddPoint').classList.toggle('active', mode === 'addPoint');
    $('btnStartDrawPoly').classList.toggle('active', mode === 'drawPoly');
    finishBtn.classList.toggle('hidden', mode !== 'drawPoly');

    if (mode === 'initial') {
      $('pickBannerText').textContent = 'Haz clic en el mapa para fijar la Coordenada Inicial';
      banner.classList.remove('hidden');
    } else if (mode === 'addPoint') {
      $('pickBannerText').textContent = 'Modo clic activo: haz clic en el mapa para agregar puntos';
      banner.classList.remove('hidden');
    } else if (mode === 'drawPoly') {
      $('pickBannerText').textContent = `Dibujando polígono (${state.points.length} pts) — Clic en vértices, doble clic o Terminar`;
      banner.classList.remove('hidden');
    } else if (mode === 'moveDest') {
      $('pickBannerText').textContent = 'Haz clic en el mapa para elegir la nueva ubicación del vértice base';
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }
  }

  function finishDrawPolygon() {
    setMapPickMode(null);
    if (state.points.length >= 3) {
      state.closed = true;
      $('chkClosedPoly').checked = true;
      refreshAll(true);
      showToast(`Polígono cerrado con ${state.points.length} vértices — Cuadro de datos listo`);
    } else if (state.points.length > 0) {
      refreshAll(true);
      showToast(`Trazo finalizado con ${state.points.length} punto(s)`);
    }
  }

  // ==================== INICIALIZACIÓN DE EVENTOS ====================
  function bindEvents() {
    // 1. Navegación de pestañas principales
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        $(`tab-${btn.dataset.tab}`).classList.add('active');
      });
    });

    // Sidebar móvil
    $('btnToggleSidebar').addEventListener('click', () => {
      $('sidebar').classList.toggle('collapsed');
      setTimeout(() => mapEngine.invalidateSize(), 260);
    });

    // Nombre del proyecto
    $('projectNameInput').addEventListener('input', (e) => {
      state.projectName = e.target.value.trim() || 'Levantamiento';
    });

    // Selector CRS (UTM 17N / 18N / Local)
    $('crsSelect').addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'utm17N') {
        state.crsMode = 'utm'; state.utmZone = 17; state.utmHemi = 'N';
        state.crsLabel = 'UTM WGS84 ZONA 17N (PANAMA)';
        $('hudCrsBadge').textContent = 'UTM WGS84 · 17N';
        $('hudLatLonWrap').classList.remove('hidden');
      } else if (val === 'utm18N') {
        state.crsMode = 'utm'; state.utmZone = 18; state.utmHemi = 'N';
        state.crsLabel = 'UTM WGS84 ZONA 18N (PANAMA ESTE)';
        $('hudCrsBadge').textContent = 'UTM WGS84 · 18N';
        $('hudLatLonWrap').classList.remove('hidden');
      } else {
        state.crsMode = 'local';
        state.crsLabel = 'COORDENADAS LOCALES (PLANO CAD)';
        $('hudCrsBadge').textContent = 'SISTEMA LOCAL · CAD';
        $('hudLatLonWrap').classList.add('hidden');
      }
      mapEngine.setCRS(state.crsMode, state.utmZone, state.utmHemi);
      showToast(`Sistema cambiado a: ${state.crsLabel}`);
    });

    // Idioma ES / EN
    $('btnLangToggle').addEventListener('click', () => {
      if (!global.TopoI18n) return;
      const lang = global.TopoI18n.toggleLanguage();
      if (global.TopoCalculators && global.TopoCalculators.refreshGpsLanguage) {
        global.TopoCalculators.refreshGpsLanguage();
      }
      showToast(lang === 'en' ? 'Language switched to English' : 'Idioma cambiado a Español');
    });

    // Tema Claro / Oscuro
    $('btnThemeToggle').addEventListener('click', () => {
      const root = document.documentElement;
      const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      mapEngine.render({ points: state.points, closed: state.closed, curves: state.curves, auxLines: state.auxLines });
      showToast(next === 'light' ? 'Modo Claro activado (ideal para campo)' : 'Modo Oscuro CAD activado');
    });

    // Botones Topbar
    $('btnLoadDemo').addEventListener('click', loadPanamaDemo);
    $('btnStartDrawPoly').addEventListener('click', () => {
      if (mapEngine.pickMode === 'drawPoly') {
        finishDrawPolygon();
        return;
      }
      state.points = [];
      state.curves = [];
      state.auxLines = [];
      state.lotDivision = null;
      state.closureInfo = null;
      state.closed = false;
      $('chkClosedPoly').checked = false;
      refreshAll(false);
      setMapPickMode('drawPoly');
      showToast('Haz clic sobre el mapa satelital para dibujar cada vértice del polígono');
    });
    $('btnFinishDraw').addEventListener('click', finishDrawPolygon);
    $('btnToggleEditMode').addEventListener('click', () => setEditMode(!state.editMode));
    $('btnMapEditVertices').addEventListener('click', () => setEditMode(!state.editMode));

    $('btnClearAll').addEventListener('click', () => {
      state.points = [];
      state.curves = [];
      state.auxLines = [];
      state.lotDivision = null;
      state.closureInfo = null;
      $('bowditchResult').classList.add('hidden');
      refreshAll(false);
      showToast('Proyecto limpiado');
    });

    // Basemap Switcher
    document.querySelectorAll('.bm-btn[data-bm]').forEach(btn => {
      btn.addEventListener('click', () => {
        const bm = btn.dataset.bm;
        if (!bm) return;
        if (state.crsMode === 'local' && bm !== 'cad') {
          showToast('En Sistema Local solo se usa Plano CAD. Cambia a UTM 17N/18N para ver Satelital o StreetMap.');
          return;
        }
        document.querySelectorAll('.bm-btn[data-bm]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        mapEngine.setBasemap(bm);
      });
    });

    // Herramientas flotantes del mapa
    $('btnZoomIn').addEventListener('click', () => mapEngine.zoomIn());
    $('btnZoomOut').addEventListener('click', () => mapEngine.zoomOut());
    $('btnFitBounds').addEventListener('click', () => mapEngine.fitBounds());
    $('btnToggleLabels').addEventListener('click', (e) => {
      state.labelsVisible = !state.labelsVisible;
      e.currentTarget.classList.toggle('active', state.labelsVisible);
      mapEngine.setLabelsVisible(state.labelsVisible);
    });
    $('btnMapAddPoint').addEventListener('click', () => {
      setMapPickMode(mapEngine.pickMode === 'addPoint' ? null : 'addPoint');
    });
    $('btnPickInitial').addEventListener('click', () => {
      setMapPickMode(mapEngine.pickMode === 'initial' ? null : 'initial');
    });
    $('btnCancelPick').addEventListener('click', () => {
      if (state.editMode) setEditMode(false);
      setMapPickMode(null);
    });

    global.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (state.editMode) setEditMode(false);
        if (mapEngine && mapEngine.pickMode) setMapPickMode(null);
      }
    });

    // ==================== TAB 1: POLIGONAL ====================
    $('btnSetInitial').addEventListener('click', () => {
      const id = $('initId').value.trim() || 'P1';
      const e = parseFloat($('initE').value);
      const n = parseFloat($('initN').value);
      const z = parseFloat($('initZ').value) || 0;
      const desc = $('initDesc').value.trim();
      if (!Number.isFinite(e) || !Number.isFinite(n)) {
        showToast('Ingresa coordenadas Este (X) y Norte (Y) válidas.');
        return;
      }

      // Auto-detectar si parecen locales cuando está en UTM
      if (state.crsMode === 'utm' && !Geo.isPlausibleUtm(e, n)) {
        state.crsMode = 'local';
        state.crsLabel = 'COORDENADAS LOCALES (PLANO CAD)';
        $('crsSelect').value = 'local';
        $('hudCrsBadge').textContent = 'SISTEMA LOCAL · CAD';
        mapEngine.setCRS('local');
        showToast('Coordenadas locales detectadas: cambiado automáticamente a Plano CAD.');
      }

      if (state.points.length === 0) {
        addPoint({ id, e, n, z, desc }, true);
      } else {
        state.points[0] = { id, e, n, z, desc };
        refreshAll(true);
      }
      showToast(`Punto inicial ${id} establecido en E:${e.toFixed(3)}, N:${n.toFixed(3)}`);
    });

    // Selector de modo de tramo (Rumbo / Azimut / Coordenadas)
    $('traverseModeToggle').addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      state.traverseMode = btn.dataset.mode;
      $('traverseModeToggle').querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      $('travBearingBox').classList.toggle('hidden', state.traverseMode !== 'bearing');
      $('travAzimuthBox').classList.toggle('hidden', state.traverseMode !== 'azimuth');
      $('travDistBox').classList.toggle('hidden', state.traverseMode === 'coords');
      $('travDirectCoordsBox').classList.toggle('hidden', state.traverseMode !== 'coords');
    });

    // Sincronizar campo rápido de rumbo con los campos estructurados
    $('travQuickDir').addEventListener('change', (e) => {
      const parsed = C.parseDirectionString(e.target.value);
      if (!parsed) return;
      const b = C.azimuthToBearing(parsed.azimuth, 1);
      $('travNS').value = b.ns;
      $('travEW').value = b.ew;
      $('travDeg').value = b.dms.d;
      $('travMin').value = b.dms.m;
      $('travSec').value = b.dms.s;
    });

    // Submit de nuevo tramo / punto
    $('traverseForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const newId = $('travNextId').value.trim() || nextAutoPointId();

      if (state.traverseMode === 'coords') {
        const ex = parseFloat($('travDirectE').value);
        const ny = parseFloat($('travDirectN').value);
        const cz = parseFloat($('travDirectZ').value) || 0;
        const desc = $('travDirectDesc').value.trim();
        if (!Number.isFinite(ex) || !Number.isFinite(ny)) {
          showToast('Ingresa Este (X) y Norte (Y) válidos.');
          return;
        }
        addPoint({ id: newId, e: ex, n: ny, z: cz, desc }, true);
        showToast(`Punto ${newId} agregado por coordenadas.`);
        return;
      }

      // Si no hay punto inicial aún, creamos automáticamente el punto inicial primero
      if (state.points.length === 0) {
        const ie = parseFloat($('initE').value);
        const ino = parseFloat($('initN').value);
        if (!Number.isFinite(ie) || !Number.isFinite(ino)) {
          showToast('Primero establece una coordenada inicial válida.');
          return;
        }
        state.points.push({
          id: $('initId').value.trim() || 'P1',
          e: ie,
          n: ino,
          z: parseFloat($('initZ').value) || 0,
          desc: $('initDesc').value.trim()
        });
      }

      const baseIdx = $('travFromSelect').value !== '' ? parseInt($('travFromSelect').value, 10) : state.points.length - 1;
      const fromPt = state.points[baseIdx] || state.points[state.points.length - 1];
      const dist = parseFloat($('travDist').value);
      const dz = parseFloat($('travDz').value) || 0;
      const desc = $('travDesc').value.trim();

      if (!Number.isFinite(dist) || dist <= 0) {
        showToast('Ingresa una distancia horizontal mayor a 0.');
        return;
      }

      let azDeg;
      if (state.traverseMode === 'bearing') {
        const quick = $('travQuickDir').value.trim();
        if (quick) {
          const parsed = C.parseDirectionString(quick);
          if (!parsed) {
            showToast('Formato de rumbo rápido inválido. Ej: N 45 30 15 E');
            return;
          }
          azDeg = parsed.azimuth;
          $('travQuickDir').value = '';
        } else {
          const ns = $('travNS').value;
          const ew = $('travEW').value;
          const deg = C.dmsToDeg($('travDeg').value, $('travMin').value, $('travSec').value);
          if (deg < 0 || deg > 90) {
            showToast('El ángulo de rumbo debe estar entre 0° y 90°.');
            return;
          }
          azDeg = C.bearingToAzimuth(ns, ew, deg);
        }
      } else {
        azDeg = C.normAzimuth(C.dmsToDeg($('travAzDeg').value, $('travAzMin').value, $('travAzSec').value));
      }

      const res = C.direct(fromPt, azDeg, dist, dz);
      addPoint({ id: newId, e: res.e, n: res.n, z: res.z, desc }, true);
      showToast(`${fromPt.id} → ${newId}: ${res.bearing} · ${dist.toFixed(2)} m`);
    });

    $('btnUndoPoint').addEventListener('click', () => {
      if (state.points.length === 0) return;
      const removed = state.points.pop();
      refreshAll(false);
      showToast(`Punto ${removed.id} eliminado`);
    });

    $('chkClosedPoly').addEventListener('change', (e) => {
      state.closed = e.target.checked;
      refreshAll(false);
    });

    // Ajuste Bowditch
    $('btnBowditch').addEventListener('click', () => {
      const box = $('bowditchResult');
      if (state.points.length < 4) {
        box.className = 'result-box error mt-xs';
        box.innerHTML = 'Para ajustar por Bowditch necesitas una poligonal que vuelva al punto inicial (al menos 4 puntos: P1 → P2 → P3 → P1\').';
        box.classList.remove('hidden');
        return;
      }
      const adj = C.bowditchAdjust(state.points, state.points[0]);
      if (!adj.ok) {
        box.className = 'result-box error mt-xs';
        box.textContent = adj.error;
        box.classList.remove('hidden');
        return;
      }

      state.closureInfo = adj;
      box.className = 'result-box mt-xs';
      box.innerHTML = `
        <div class="result-kv"><span>Error ΔE / ΔN:</span><code>${adj.errE.toFixed(4)} / ${adj.errN.toFixed(4)} m</code></div>
        <div class="result-kv"><span>Error Lineal:</span><code>${adj.errLinear.toFixed(4)} m</code></div>
        <div class="result-kv"><span>Precisión:</span><code>${adj.precisionText}</code></div>
        <button id="btnApplyBowditch" class="btn btn-primary btn-full mt-xs">Aplicar Compensación y Cerrar</button>
      `;
      box.classList.remove('hidden');

      $('btnApplyBowditch').addEventListener('click', () => {
        // Reemplaza por vértices compensados y quita el vértice final repetido que ya cerró exactamente sobre P1
        state.points = adj.adjusted.slice(0, -1);
        state.closed = true;
        $('chkClosedPoly').checked = true;
        refreshAll(true);
        showToast(`Poligonal compensada por Bowditch (${adj.precisionText})`);
      });
    });

    // ==================== TAB 2: FUNCIONES COGO ====================
    $('cogoToolSelect').addEventListener('change', (e) => {
      document.querySelectorAll('.cogo-panel').forEach(p => p.classList.add('hidden'));
      $(`cogo-${e.target.value}`).classList.remove('hidden');
    });

    // 1. Inverso
    const runInverse = (drawAux = false) => {
      const a = getPointByIndex($('invPtA').value);
      const b = getPointByIndex($('invPtB').value);
      const box = $('resInverse');
      if (!a || !b) {
        box.className = 'result-box error mt-sm';
        box.textContent = 'Selecciona dos puntos válidos.';
        box.classList.remove('hidden');
        return;
      }
      const inv = C.inverse(a, b);
      box.className = 'result-box mt-sm';
      box.innerHTML = `
        <div class="result-kv"><span>Rumbo (${a.id} → ${b.id}):</span><code>${inv.bearing}</code></div>
        <div class="result-kv"><span>Azimut:</span><code>${inv.azimuthText}</code></div>
        <div class="result-kv"><span>Distancia Horizontal:</span><code>${inv.dist.toFixed(3)} m</code></div>
        <div class="result-kv"><span>Distancia Inclinada:</span><code>${inv.slopeDist.toFixed(3)} m</code></div>
        <div class="result-kv"><span>ΔE / ΔN / ΔZ:</span><code>${inv.dE.toFixed(3)} / ${inv.dN.toFixed(3)} / ${inv.dZ.toFixed(3)}</code></div>
        <div class="result-kv"><span>Pendiente:</span><code>${inv.slopePct.toFixed(2)} % (${inv.vertAngleDeg.toFixed(2)}°)</code></div>
      `;
      box.classList.remove('hidden');
      if (drawAux) {
        state.auxLines.push({ from: a, to: b, color: '#f59e0b' });
        refreshAll(false);
        showToast(`Línea auxiliar ${a.id} → ${b.id} trazada`);
      }
    };
    $('btnCalcInverse').addEventListener('click', () => runInverse(false));
    $('btnDrawInverse').addEventListener('click', () => runInverse(true));

    // 2. Directo / Radiación
    $('btnCalcDirect').addEventListener('click', () => {
      const base = getPointByIndex($('dirPtBase').value);
      const parsed = C.parseDirectionString($('dirAngle').value);
      const dist = parseFloat($('dirDist').value);
      const dz = parseFloat($('dirDz').value) || 0;
      const box = $('resDirect');
      if (!base || !parsed || !Number.isFinite(dist) || dist <= 0) {
        box.className = 'result-box error mt-sm';
        box.textContent = 'Verifica estación base, rumbo/azimut válido y distancia > 0.';
        box.classList.remove('hidden');
        return;
      }
      const res = C.direct(base, parsed.azimuth, dist, dz);
      const id = $('dirNewId').value.trim() || `R${state.points.length + 1}`;
      state.auxLines.push({ from: base, to: res, color: '#38bdf8' });
      addPoint({ id, e: res.e, n: res.n, z: res.z, desc: $('dirDesc').value.trim() }, true);
      box.className = 'result-box mt-sm';
      box.innerHTML = `
        <div class="result-kv"><span>Punto creado:</span><code>${id}</code></div>
        <div class="result-kv"><span>Este (X):</span><code>${res.e.toFixed(3)} m</code></div>
        <div class="result-kv"><span>Norte (Y):</span><code>${res.n.toFixed(3)} m</code></div>
        <div class="result-kv"><span>Rumbo / Azimut:</span><code>${res.bearing}</code></div>
      `;
      box.classList.remove('hidden');
    });

    // 3. Intersección Rumbo - Rumbo
    $('btnCalcBB').addEventListener('click', () => {
      const p1 = getPointByIndex($('bbPt1').value);
      const p2 = getPointByIndex($('bbPt2').value);
      const d1 = C.parseDirectionString($('bbDir1').value);
      const d2 = C.parseDirectionString($('bbDir2').value);
      const box = $('resBB');
      if (!p1 || !p2 || !d1 || !d2) {
        box.className = 'result-box error mt-sm';
        box.textContent = 'Verifica los dos puntos y sus rumbos/azimuts.';
        box.classList.remove('hidden');
        return;
      }
      const res = C.intersectBearingBearing(p1, d1.azimuth, p2, d2.azimuth);
      if (!res.ok) {
        box.className = 'result-box error mt-sm';
        box.textContent = res.error;
        box.classList.remove('hidden');
        return;
      }
      box.className = 'result-box mt-sm';
      box.innerHTML = `
        <div class="result-kv"><span>Este (X):</span><code>${res.point.e.toFixed(3)} m</code></div>
        <div class="result-kv"><span>Norte (Y):</span><code>${res.point.n.toFixed(3)} m</code></div>
        <div class="result-kv"><span>Dist. desde ${p1.id}:</span><code>${res.distFrom1.toFixed(3)} m</code></div>
        <div class="result-kv"><span>Dist. desde ${p2.id}:</span><code>${res.distFrom2.toFixed(3)} m</code></div>
        ${res.warning ? `<div style="color:var(--amber);margin-top:4px;">⚠ ${res.warning}</div>` : ''}
        <button id="btnAddBBPt" class="btn btn-primary btn-full mt-xs">+ Agregar Intersección al Dibujo</button>
      `;
      box.classList.remove('hidden');
      $('btnAddBBPt').addEventListener('click', () => {
        state.auxLines.push({ from: p1, to: res.point, color: '#f59e0b' });
        state.auxLines.push({ from: p2, to: res.point, color: '#f59e0b' });
        addPoint({ id: `INT_${state.points.length + 1}`, ...res.point, desc: 'INT R-R' }, true);
        showToast('Punto de intersección Rumbo–Rumbo agregado');
      });
    });

    // 4. Intersección Distancia - Distancia
    $('btnCalcDD').addEventListener('click', () => {
      const p1 = getPointByIndex($('ddPt1').value);
      const p2 = getPointByIndex($('ddPt2').value);
      const r1 = parseFloat($('ddR1').value);
      const r2 = parseFloat($('ddR2').value);
      const box = $('resDD');
      if (!p1 || !p2 || !Number.isFinite(r1) || !Number.isFinite(r2)) {
        box.className = 'result-box error mt-sm';
        box.textContent = 'Verifica puntos base y radios válidos.';
        box.classList.remove('hidden');
        return;
      }
      const res = C.intersectDistDist(p1, r1, p2, r2);
      if (!res.ok) {
        box.className = 'result-box error mt-sm';
        box.textContent = res.error;
        box.classList.remove('hidden');
        return;
      }
      box.className = 'result-box mt-sm';
      box.innerHTML = res.solutions.map((sol, idx) => `
        <div style="margin-bottom:8px;">
          <strong>${sol.label}</strong>
          <div class="result-kv"><span>E / N:</span><code>${sol.e.toFixed(3)}, ${sol.n.toFixed(3)}</code></div>
          <button class="btn btn-secondary btn-full mt-xs" data-dd-sol="${idx}">+ Agregar Solución ${idx + 1}</button>
        </div>
      `).join('');
      box.classList.remove('hidden');
      box.querySelectorAll('[data-dd-sol]').forEach(b => {
        b.addEventListener('click', () => {
          const sol = res.solutions[Number(b.dataset.ddSol)];
          state.auxLines.push({ from: p1, to: sol, color: '#f59e0b' });
          state.auxLines.push({ from: p2, to: sol, color: '#f59e0b' });
          addPoint({ id: `TRIL_${state.points.length + 1}`, ...sol, desc: 'TRILATERACION' }, true);
          showToast('Solución de trilateración agregada');
        });
      });
    });

    // 5. Intersección Rumbo - Distancia
    $('btnCalcBD').addEventListener('click', () => {
      const p1 = getPointByIndex($('bdPt1').value);
      const p2 = getPointByIndex($('bdPt2').value);
      const d1 = C.parseDirectionString($('bdDir1').value);
      const r2 = parseFloat($('bdR2').value);
      const box = $('resBD');
      if (!p1 || !p2 || !d1 || !Number.isFinite(r2)) {
        box.className = 'result-box error mt-sm';
        box.textContent = 'Verifica puntos, dirección y distancia.';
        box.classList.remove('hidden');
        return;
      }
      const res = C.intersectBearingDist(p1, d1.azimuth, p2, r2);
      if (!res.ok) {
        box.className = 'result-box error mt-sm';
        box.textContent = res.error;
        box.classList.remove('hidden');
        return;
      }
      box.className = 'result-box mt-sm';
      box.innerHTML = res.solutions.map((sol, idx) => `
        <div style="margin-bottom:8px;">
          <strong>${sol.label}</strong>
          <div class="result-kv"><span>E / N:</span><code>${sol.e.toFixed(3)}, ${sol.n.toFixed(3)}</code></div>
          <button class="btn btn-secondary btn-full mt-xs" data-bd-sol="${idx}">+ Agregar Solución ${idx + 1}</button>
        </div>
      `).join('');
      box.classList.remove('hidden');
      box.querySelectorAll('[data-bd-sol]').forEach(b => {
        b.addEventListener('click', () => {
          const sol = res.solutions[Number(b.dataset.bdSol)];
          state.auxLines.push({ from: p1, to: sol, color: '#f59e0b' });
          state.auxLines.push({ from: p2, to: sol, color: '#f59e0b' });
          addPoint({ id: `IBD_${state.points.length + 1}`, ...sol, desc: 'INT R-D' }, true);
          showToast('Intersección Rumbo–Distancia agregada');
        });
      });
    });

    // 6. Estación y Offset
    $('btnCalcOffsetPt').addEventListener('click', () => {
      const a = getPointByIndex($('offPtA').value);
      const b = getPointByIndex($('offPtB').value);
      const st = parseFloat($('offStation').value);
      const off = parseFloat($('offDist').value) || 0;
      const box = $('resOffset');
      if (!a || !b || !Number.isFinite(st)) {
        box.className = 'result-box error mt-sm';
        box.textContent = 'Verifica línea base y estación.';
        box.classList.remove('hidden');
        return;
      }
      const res = C.stationOffsetPoint(a, b, st, off);
      if (!res.ok) {
        box.className = 'result-box error mt-sm';
        box.textContent = res.error;
        box.classList.remove('hidden');
        return;
      }
      state.auxLines.push({ from: a, to: b, color: '#38bdf8' });
      addPoint({ id: `OFF_${state.points.length + 1}`, ...res.point, desc: `ST ${st.toFixed(1)} OFF ${off.toFixed(1)}` }, true);
      box.className = 'result-box mt-sm';
      box.innerHTML = `
        <div class="result-kv"><span>Este (X):</span><code>${res.point.e.toFixed(3)} m</code></div>
        <div class="result-kv"><span>Norte (Y):</span><code>${res.point.n.toFixed(3)} m</code></div>
      `;
      box.classList.remove('hidden');
    });

    $('btnProjPoint').addEventListener('click', () => {
      const a = getPointByIndex($('offPtA').value);
      const b = getPointByIndex($('offPtB').value);
      const p = getPointByIndex($('offPtP').value);
      const box = $('resOffset');
      if (!a || !b || !p) return;
      const res = C.projectPointToLine(a, b, p);
      if (!res.ok) {
        box.className = 'result-box error mt-sm';
        box.textContent = res.error;
        box.classList.remove('hidden');
        return;
      }
      state.auxLines.push({ from: p, to: res.foot, color: '#f59e0b' });
      refreshAll(false);
      box.className = 'result-box mt-sm';
      box.innerHTML = `
        <div class="result-kv"><span>Estación (Abscisa):</span><code>${res.station.toFixed(3)} m</code></div>
        <div class="result-kv"><span>Offset:</span><code>${res.offset.toFixed(3)} m (${res.offset >= 0 ? 'Derecha' : 'Izquierda'})</code></div>
        <div class="result-kv"><span>Pie Perpendicular:</span><code>E ${res.foot.e.toFixed(3)}, N ${res.foot.n.toFixed(3)}</code></div>
      `;
      box.classList.remove('hidden');
    });

    // 7. Subdividir Línea
    $('btnSubdivide').addEventListener('click', () => {
      const a = getPointByIndex($('subPtA').value);
      const b = getPointByIndex($('subPtB').value);
      const nSeg = parseInt($('subCount').value, 10) || 2;
      const box = $('resSubdivide');
      if (!a || !b || nSeg < 2) return;
      const pts = C.subdivideLine(a, b, nSeg);
      pts.forEach((pt, idx) => {
        state.points.push({ id: `SUB_${idx + 1}`, ...pt, desc: `DIV ${a.id}-${b.id}` });
      });
      refreshAll(true);
      box.className = 'result-box mt-sm';
      box.textContent = `Se agregaron ${pts.length} puntos intermedios equidistantes entre ${a.id} y ${b.id}.`;
      box.classList.remove('hidden');
    });

    // 8. Curva Horizontal Simple
    $('btnCalcCurve').addEventListener('click', () => {
      const pi = getPointByIndex($('curvPtPI').value);
      const azIn = C.parseDirectionString($('curvAzIn').value);
      const azOut = C.parseDirectionString($('curvAzOut').value);
      const radius = parseFloat($('curvRadius').value);
      const step = parseFloat($('curvStep').value) || 5;
      const box = $('resCurve');
      if (!pi || !azIn || !azOut || !Number.isFinite(radius)) {
        box.className = 'result-box error mt-sm';
        box.textContent = 'Verifica el punto PI, rumbos de entrada/salida y radio.';
        box.classList.remove('hidden');
        return;
      }
      const res = C.simpleHorizontalCurve(pi, azIn.azimuth, azOut.azimuth, radius, step);
      if (!res.ok) {
        box.className = 'result-box error mt-sm';
        box.textContent = res.error;
        box.classList.remove('hidden');
        return;
      }
      state.curves.push(res);
      refreshAll(true);
      box.className = 'result-box mt-sm';
      box.innerHTML = `
        <div class="result-kv"><span>Deflexión Δ:</span><code>${C.formatDms(res.absDelta)} ${res.direction}</code></div>
        <div class="result-kv"><span>Tangente (T):</span><code>${res.T.toFixed(3)} m</code></div>
        <div class="result-kv"><span>Long. Curva (Lc):</span><code>${res.Lc.toFixed(3)} m</code></div>
        <div class="result-kv"><span>Cuerda Larga (C):</span><code>${res.C.toFixed(3)} m</code></div>
        <div class="result-kv"><span>Externa (E) / Med (M):</span><code>${res.E.toFixed(3)} / ${res.M.toFixed(3)} m</code></div>
        <div class="result-kv"><span>PC:</span><code>E ${res.pc.e.toFixed(2)}, N ${res.pc.n.toFixed(2)}</code></div>
        <div class="result-kv"><span>PT:</span><code>E ${res.pt.e.toFixed(2)}, N ${res.pt.n.toFixed(2)}</code></div>
        <button id="btnAddCurvePts" class="btn btn-secondary btn-full mt-xs">+ Añadir PC, PT y replanteo a puntos</button>
      `;
      box.classList.remove('hidden');
      $('btnAddCurvePts').addEventListener('click', () => {
        res.arcPoints.forEach((ap) => {
          state.points.push({ id: ap.label, e: ap.e, n: ap.n, z: ap.z, desc: `CURVA R=${radius}` });
        });
        refreshAll(true);
        showToast(`Se agregaron ${res.arcPoints.length} puntos de replanteo de curva`);
      });
    });

    $('btnClearCurves').addEventListener('click', () => {
      state.curves = [];
      refreshAll(false);
      showToast('Curvas limpiadas');
    });

    // 9. Girar Polígono / Puntos
    const executeRotate = (signedAngleDeg) => {
      const pivot = getPointByIndex($('rotPivotSelect').value);
      const box = $('resRotate');
      if (!pivot || state.points.length < 2 || !Number.isFinite(signedAngleDeg)) {
        box.className = 'result-box error mt-sm';
        box.textContent = 'Se necesitan al menos 2 puntos y un vértice pivote válido.';
        box.classList.remove('hidden');
        return;
      }
      state.points = C.rotatePoints(state.points, pivot, signedAngleDeg);
      state.lotDivision = null;
      refreshAll(false);
      box.className = 'result-box mt-sm';
      box.innerHTML = `
        <div class="result-kv"><span>Pivote:</span><code>${pivot.id}</code></div>
        <div class="result-kv"><span>Giro aplicado:</span><code>${signedAngleDeg > 0 ? '+' : ''}${signedAngleDeg.toFixed(2)}° (${signedAngleDeg >= 0 ? 'Horario' : 'Antihorario'})</code></div>
      `;
      box.classList.remove('hidden');
      showToast(`Polígono girado ${signedAngleDeg > 0 ? '+' : ''}${signedAngleDeg.toFixed(2)}° desde ${pivot.id}`);
    };

    $('btnApplyRotate').addEventListener('click', () => {
      const mag = parseFloat($('rotAngleDeg').value);
      const dir = parseFloat($('rotDir').value) || 1;
      if (!Number.isFinite(mag)) return;
      executeRotate(mag * dir);
    });

    document.querySelectorAll('[data-rot]').forEach(btn => {
      btn.addEventListener('click', () => executeRotate(parseFloat(btn.dataset.rot)));
    });

    // 10. Mover / Trasladar Todos los Puntos
    $('btnMoveDelta').addEventListener('click', () => {
      const de = parseFloat($('moveDe').value) || 0;
      const dn = parseFloat($('moveDn').value) || 0;
      const dz = parseFloat($('moveDz').value) || 0;
      const box = $('resMove');
      if (state.points.length === 0) {
        box.className = 'result-box error mt-sm';
        box.textContent = 'No hay puntos para mover.';
        box.classList.remove('hidden');
        return;
      }
      state.points = C.translatePoints(state.points, de, dn, dz);
      state.lotDivision = null;
      refreshAll(true);
      box.className = 'result-box mt-sm';
      box.innerHTML = `<div class="result-kv"><span>Desplazamiento aplicado:</span><code>ΔE ${de.toFixed(3)}, ΔN ${dn.toFixed(3)}, ΔZ ${dz.toFixed(2)}</code></div>`;
      box.classList.remove('hidden');
      showToast(`Se movieron ${state.points.length} puntos`);
    });

    $('btnPickMoveDest').addEventListener('click', () => {
      setMapPickMode(mapEngine.pickMode === 'moveDest' ? null : 'moveDest');
    });

    $('btnMoveToCoord').addEventListener('click', () => {
      const base = getPointByIndex($('moveBasePt').value);
      const destE = parseFloat($('moveDestE').value);
      const destN = parseFloat($('moveDestN').value);
      const box = $('resMove');
      if (!base || !Number.isFinite(destE) || !Number.isFinite(destN)) {
        box.className = 'result-box error mt-sm';
        box.textContent = 'Selecciona un vértice base y coordenadas destino válidas.';
        box.classList.remove('hidden');
        return;
      }
      const de = destE - base.e;
      const dn = destN - base.n;
      state.points = C.translatePoints(state.points, de, dn, 0);
      state.lotDivision = null;
      refreshAll(true);
      box.className = 'result-box mt-sm';
      box.innerHTML = `
        <div class="result-kv"><span>Vértice movido:</span><code>${base.id} → (${destE.toFixed(3)}, ${destN.toFixed(3)})</code></div>
        <div class="result-kv"><span>Desplazamiento:</span><code>ΔE ${de.toFixed(3)} m, ΔN ${dn.toFixed(3)} m</code></div>
      `;
      box.classList.remove('hidden');
      showToast(`Todos los puntos trasladados con base en ${base.id}`);
    });

    // 11. Dividir Polígono en Lotes Iguales
    $('lotsDirMode').addEventListener('change', (e) => {
      const v = e.target.value;
      $('lotsSideWrap').classList.toggle('hidden', v !== 'side');
      $('lotsCustomWrap').classList.toggle('hidden', v !== 'custom');
    });

    document.querySelectorAll('[data-lots]').forEach(btn => {
      btn.addEventListener('click', () => {
        $('lotsCount').value = btn.dataset.lots;
        $('btnCalcLots').click();
      });
    });

    $('btnCalcLots').addEventListener('click', () => {
      const box = $('resLots');
      const nLots = parseInt($('lotsCount').value, 10) || 2;
      const mode = $('lotsDirMode').value;
      let cutAz = 0;

      if (mode === 'side') {
        cutAz = parseFloat($('lotsSideSelect').value);
        if (!Number.isFinite(cutAz)) cutAz = 0;
      } else if (mode === 'ns') {
        cutAz = 0;
      } else if (mode === 'ew') {
        cutAz = 90;
      } else {
        const parsed = C.parseDirectionString($('lotsCustomDir').value);
        if (!parsed) {
          box.className = 'result-box error mt-sm';
          box.textContent = 'Rumbo o azimut personalizado inválido.';
          box.classList.remove('hidden');
          return;
        }
        cutAz = parsed.azimuth;
      }

      const res = C.subdividePolygonEqualArea(state.points, nLots, cutAz);
      if (!res.ok) {
        box.className = 'result-box error mt-sm';
        box.textContent = res.error;
        box.classList.remove('hidden');
        return;
      }

      state.closed = true;
      $('chkClosedPoly').checked = true;
      state.lotDivision = res;
      refreshAll(true);

      const lotsHtml = res.lots.map((l, idx) => `
        <div class="result-kv">
          <span><strong>${l.name}</strong> (${l.areaHa.toFixed(4)} ha):</span>
          <span>
            <code>${l.areaM2.toFixed(2)} m²</code>
            <button type="button" class="tbl-act-btn" data-load-lot="${idx}" title="Cargar solo este lote como poligonal activa">↗</button>
          </span>
        </div>
      `).join('');

      const cutsHtml = res.cutLines.map(cl => `
        <div class="result-kv">
          <span>Corte ${cl.index}:</span>
          <code>${cl.bearing} · ${cl.dist.toFixed(2)} m</code>
        </div>
      `).join('');

      box.className = 'result-box mt-sm';
      box.innerHTML = `
        <div class="result-kv"><span>Total / Cada Lote:</span><code>${res.totalAreaM2.toFixed(2)} / ${res.targetAreaM2.toFixed(2)} m²</code></div>
        ${lotsHtml}
        <hr class="sep" style="margin:6px 0;" />
        ${cutsHtml}
      `;
      box.classList.remove('hidden');

      box.querySelectorAll('[data-load-lot]').forEach(b => {
        b.addEventListener('click', () => {
          const lot = res.lots[Number(b.dataset.loadLot)];
          if (!lot) return;
          state.points = lot.points.map((p, i) => ({
            ...p,
            id: p.id || `V${i + 1}`
          }));
          state.lotDivision = null;
          state.closed = true;
          $('chkClosedPoly').checked = true;
          refreshAll(true);
          showToast(`${lot.name} cargado como poligonal activa (${lot.areaM2.toFixed(2)} m²)`);
        });
      });

      showToast(`Polígono dividido en ${nLots} lotes iguales de ${res.targetAreaM2.toFixed(2)} m²`);
    });

    $('btnClearLots').addEventListener('click', () => {
      state.lotDivision = null;
      $('resLots').classList.add('hidden');
      refreshAll(false);
      showToast('División de lotes limpiada');
    });

    // 12. Georreferenciar / Ajustar a Puntos de Control (Helmert 2D en COGO)
    const helmertRowsContainer = $('cogoHelmertRows');
    let lastCogoHelmertFit = null;

    function addCogoHelmertRow(defaultIdx = 0) {
      if (!helmertRowsContainer) return;
      const row = document.createElement('div');
      row.className = 'helmert-mini-row';
      row.innerHTML = `
        <div class="helmert-mini-row-top">
          <select class="cogo-helmert-pt" title="Punto local del dibujo"></select>
          <button type="button" class="tbl-act-btn del cogo-helmert-del" title="Quitar punto de control">✕</button>
        </div>
        <div class="grid-3">
          <input type="number" step="0.001" class="ch-te" placeholder="Este UTM (X)" />
          <input type="number" step="0.001" class="ch-tn" placeholder="Norte UTM (Y)" />
          <input type="number" step="0.01" class="ch-tz" placeholder="Cota Z (opc)" />
        </div>
      `;
      helmertRowsContainer.appendChild(row);
      const sel = row.querySelector('.cogo-helmert-pt');
      state.points.forEach((p, i) => {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = `${p.id} (${p.e.toFixed(2)}, ${p.n.toFixed(2)})`;
        sel.appendChild(opt);
      });
      if (state.points[defaultIdx]) sel.value = String(defaultIdx);

      row.querySelector('.cogo-helmert-del').addEventListener('click', () => {
        if (helmertRowsContainer.children.length <= 2) {
          showToast('Se requieren al menos 2 puntos de control.');
          return;
        }
        row.remove();
      });
    }

    addCogoHelmertRow(0);
    addCogoHelmertRow(1);

    $('btnCogoAddCtrl').addEventListener('click', () => {
      addCogoHelmertRow(Math.min(helmertRowsContainer.children.length, Math.max(0, state.points.length - 1)));
    });

    function computeCogoHelmert() {
      const box = $('resCogoHelmert');
      const pairs = [];
      helmertRowsContainer.querySelectorAll('.helmert-mini-row').forEach((row) => {
        const idx = parseInt(row.querySelector('.cogo-helmert-pt').value, 10);
        const pt = state.points[idx];
        const te = parseFloat(row.querySelector('.ch-te').value);
        const tn = parseFloat(row.querySelector('.ch-tn').value);
        const tzRaw = row.querySelector('.ch-tz').value;
        const tz = tzRaw !== '' ? parseFloat(tzRaw) : NaN;
        if (pt && Number.isFinite(te) && Number.isFinite(tn)) {
          pairs.push({
            id: pt.id,
            localE: pt.e,
            localN: pt.n,
            localZ: Number(pt.z) || 0,
            targetE: te,
            targetN: tn,
            targetZ: tz
          });
        }
      });

      const fixedScale = $('cogoHelmertMode').value === 'rigid';
      const fit = C.helmert2D(pairs, { fixedScale });
      if (!fit.ok) {
        lastCogoHelmertFit = null;
        box.className = 'result-box error mt-sm';
        box.textContent = fit.error;
        box.classList.remove('hidden');
        return null;
      }

      lastCogoHelmertFit = fit;
      const resRows = fit.residuals.map(r =>
        `<div class="result-kv"><span>${r.id} (vE/vN):</span><code>${r.vE.toFixed(4)} / ${r.vN.toFixed(4)} m (Err ${r.vH.toFixed(4)} m)</code></div>`
      ).join('');

      box.className = 'result-box mt-sm';
      box.innerHTML = `
        <div class="result-kv"><span>Puntos de control:</span><code>${fit.count} (${fixedScale ? 'Rígido' : 'Helmert 2D'})</code></div>
        <div class="result-kv"><span>Rotación Horaria:</span><code>${fit.rotCwDms} (${fit.rotCwDeg.toFixed(5)}°)</code></div>
        <div class="result-kv"><span>Factor de Escala:</span><code>${fit.scale.toFixed(8)} (${fit.ppm >= 0 ? '+' : ''}${fit.ppm.toFixed(1)} ppm)</code></div>
        ${fit.hasVerticalShift ? `<div class="result-kv"><span>Ajuste Vertical ΔZ:</span><code>${fit.dZ >= 0 ? '+' : ''}${fit.dZ.toFixed(3)} m</code></div>` : ''}
        <div class="result-kv"><span>RMSE Horizontal:</span><code>${fit.rmseH.toFixed(4)} m</code></div>
        <hr class="sep" style="margin:6px 0;" />
        ${resRows}
      `;
      box.classList.remove('hidden');
      return fit;
    }

    $('btnCogoHelmertCalc').addEventListener('click', computeCogoHelmert);

    $('btnCogoHelmertApply').addEventListener('click', () => {
      const fit = computeCogoHelmert();
      if (!fit) return;
      state.points = C.applyHelmert2D(state.points, fit);
      state.lotDivision = null;
      state.curves = [];
      state.auxLines = [];
      state.closureInfo = null;

      const targetCrs = $('cogoHelmertCrs').value;
      if (targetCrs === 'utm17N' || targetCrs === 'utm18N') {
        const z = targetCrs === 'utm18N' ? 18 : 17;
        state.crsMode = 'utm';
        state.utmZone = z;
        state.utmHemi = 'N';
        state.crsLabel = `UTM WGS84 ZONA ${z}N (PANAMA)`;
        $('crsSelect').value = targetCrs;
        $('hudCrsBadge').textContent = `UTM WGS84 · ${z}N`;
        $('hudLatLonWrap').classList.remove('hidden');
        mapEngine.setCRS('utm', z, 'N');
        if (mapEngine.basemap === 'cad') {
          document.querySelectorAll('.bm-btn').forEach(b => b.classList.toggle('active', b.dataset.bm === 'satellite'));
          mapEngine.setBasemap('satellite');
        }
      }

      if (state.points[0]) {
        $('initE').value = state.points[0].e.toFixed(3);
        $('initN').value = state.points[0].n.toFixed(3);
        $('initZ').value = (Number(state.points[0].z) || 0).toFixed(2);
      }

      refreshAll(true);
      showToast(`Levantamiento reproyectado (${state.points.length} pts · RMSE ${fit.rmseH.toFixed(4)} m)`);
    });

    $('btnClearAux').addEventListener('click', () => {
      state.auxLines = [];
      refreshAll(false);
      showToast('Líneas auxiliares COGO limpiadas');
    });

    // ==================== TAB 3: CUADRO DE CAMPO Y PUNTOS ====================
    $('tableSubToggle').addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      $('tableSubToggle').querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const isField = btn.dataset.sub === 'field';
      $('subFieldTable').classList.toggle('hidden', !isField);
      $('subPointsTable').classList.toggle('hidden', isField);
    });

    $('pointsTableBody').addEventListener('click', (e) => {
      const zoomBtn = e.target.closest('[data-zoom]');
      if (zoomBtn) {
        const pt = state.points[Number(zoomBtn.dataset.zoom)];
        if (pt) mapEngine.focusPoint(pt);
        return;
      }
      const delBtn = e.target.closest('[data-del]');
      if (delBtn) {
        const idx = Number(delBtn.dataset.del);
        state.points.splice(idx, 1);
        refreshAll(false);
      }
    });

    $('btnCopyTable').addEventListener('click', async () => {
      if (state.points.length === 0) return showToast('No hay datos para copiar');
      const hasLots = Boolean(state.lotDivision && state.lotDivision.ok);
      const tsv = IO.fieldTableToTSV(state.points, state.closed && state.points.length >= 3, state.lotDivision);
      try {
        await navigator.clipboard.writeText(tsv);
        showToast(hasLots
          ? `Cuadro del polígono completo + ${state.lotDivision.lots.length} lotes copiados para Excel`
          : 'Cuadro de datos copiado (listo para pegar en Excel)');
      } catch {
        IO.downloadFile(`${state.projectName}_cuadro.tsv`, tsv, 'text/tab-separated-values');
        showToast('Cuadro descargado en formato TSV');
      }
    });

    $('btnExportCsv').addEventListener('click', () => {
      if (state.points.length === 0) return showToast('No hay puntos para exportar');
      const csv = IO.pointsToCSV(state.points, 'PNEZD');
      IO.downloadFile(`${state.projectName}_puntos.csv`, csv, 'text/csv;charset=utf-8');
      showToast('Archivo CSV descargado');
    });

    // ==================== MODAL IMPORTAR CSV / TXT ====================
    const importDialog = $('importDialog');
    const dropZone = $('dropZone');
    const fileInput = $('fileInput');
    const importTextarea = $('importTextarea');

    const updateImportPreview = () => {
      const text = importTextarea.value.trim();
      const preview = $('importPreview');
      if (!text) {
        preview.innerHTML = '';
        return;
      }
      const res = IO.parsePointsText(text, {
        format: $('importFormat').value,
        delimiter: $('importDelim').value
      });
      const sample = res.points.slice(0, 4).map(p => `${p.id}: E=${p.e.toFixed(2)}, N=${p.n.toFixed(2)}, Z=${p.z.toFixed(2)}`).join(' · ');
      preview.innerHTML = `
        <div class="result-box ${res.points.length === 0 ? 'error' : ''}">
          <div><strong>${res.points.length} puntos válidos detectados</strong> ${res.skippedHeader ? '(encabezado omitido)' : ''}</div>
          ${sample ? `<div style="margin-top:4px;font-family:var(--font-mono);font-size:11px;">${sample}${res.points.length > 4 ? ' ...' : ''}</div>` : ''}
          ${res.errors.length > 0 ? `<div style="color:var(--amber);margin-top:4px;">⚠ ${res.errors.length} línea(s) omitida(s): ${res.errors[0]}</div>` : ''}
        </div>
      `;
    };

    $('btnOpenImport').addEventListener('click', () => {
      importDialog.showModal();
      updateImportPreview();
    });

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) readImportFile(file);
    });
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) readImportFile(file);
      fileInput.value = '';
    });

    function readImportFile(file) {
      const reader = new FileReader();
      reader.onload = () => {
        importTextarea.value = reader.result || '';
        updateImportPreview();
      };
      reader.readAsText(file, 'utf-8');
    }

    ['input', 'change'].forEach(ev => {
      importTextarea.addEventListener(ev, updateImportPreview);
      $('importFormat').addEventListener(ev, updateImportPreview);
      $('importDelim').addEventListener(ev, updateImportPreview);
    });

    $('btnConfirmImport').addEventListener('click', () => {
      const text = importTextarea.value.trim();
      if (!text) return showToast('Carga un archivo o pega coordenadas primero.');
      const res = IO.parsePointsText(text, {
        format: $('importFormat').value,
        delimiter: $('importDelim').value
      });
      if (res.points.length === 0) {
        return showToast('No se encontraron puntos válidos. Revisa el formato de columnas.');
      }

      if ($('importAction').value === 'replace') {
        state.points = res.points;
        state.curves = [];
        state.auxLines = [];
      } else {
        state.points.push(...res.points);
      }

      state.closed = $('importAutoClose').checked;
      $('chkClosedPoly').checked = state.closed;

      // Auto-cambio a Local si los puntos no son UTM plausibles
      if (state.crsMode === 'utm' && !Geo.isPlausibleUtm(state.points[0].e, state.points[0].n)) {
        state.crsMode = 'local';
        state.crsLabel = 'COORDENADAS LOCALES (PLANO CAD)';
        $('crsSelect').value = 'local';
        $('hudCrsBadge').textContent = 'SISTEMA LOCAL · CAD';
        mapEngine.setCRS('local');
      }

      importDialog.close();
      refreshAll(true);
      showToast(`${res.points.length} puntos importados correctamente`);
    });

    // ==================== MODAL EXPORTAR PLANO ANATI (DXF / PDF) ====================
    const dxfDialog = $('dxfDialog');

    const ANATI_STORAGE_KEY = 'topo_anati_profile_v1';
    const anatiFieldIds = {
      provincia: 'anatiProvincia',
      distrito: 'anatiDistrito',
      corregimiento: 'anatiCorregimiento',
      lugar: 'anatiLugar',
      tipoPlano: 'anatiTipoPlano',
      folioReal: 'anatiFolio',
      codUbicacion: 'anatiCodUbic',
      propietario: 'anatiPropietario',
      cedPropietario: 'anatiCedProp',
      favorDe: 'anatiFavorDe',
      cedFavorDe: 'anatiCedFavor',
      areaInscrita: 'anatiAreaInscrita',
      profTitulo: 'anatiProfTitulo',
      profNombre: 'anatiProfNombre',
      profCedula: 'anatiProfCedula',
      profLicencia: 'anatiProfLicencia',
      scale: 'anatiScale',
      fecha: 'anatiFecha',
      ref: 'anatiRef',
      hojaIgn: 'anatiHojaIgn',
      equipo: 'anatiEquipo',
      monumentacion: 'anatiMonumentacion',
      planoRef: 'anatiPlanoRef',
      notaExtra: 'anatiNotaExtra'
    };

    const loadSavedAnatiProfile = () => {
      try {
        const raw = localStorage.getItem(ANATI_STORAGE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw);
        for (const [k, id] of Object.entries(anatiFieldIds)) {
          if (saved[k] !== undefined && $(id)) $(id).value = saved[k];
        }
      } catch {}
    };

    const readAnatiForm = () => {
      const data = {};
      for (const [k, id] of Object.entries(anatiFieldIds)) {
        data[k] = $(id) ? $(id).value.trim() : '';
      }
      if (data.scale === 'auto') data.scale = null;
      try {
        // Persistir datos recurrentes del profesional y ubicación
        localStorage.setItem(ANATI_STORAGE_KEY, JSON.stringify({
          provincia: data.provincia,
          distrito: data.distrito,
          corregimiento: data.corregimiento,
          lugar: data.lugar,
          profTitulo: data.profTitulo,
          profNombre: data.profNombre,
          profCedula: data.profCedula,
          profLicencia: data.profLicencia,
          hojaIgn: data.hojaIgn,
          equipo: data.equipo,
          monumentacion: data.monumentacion
        }));
      } catch {}
      return data;
    };

    loadSavedAnatiProfile();

    // Sub-pestañas dentro del modal DXF/PDF
    $('dxfModalTabs').addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      $('dxfModalTabs').querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const isAnatiTab = btn.dataset.dxfTab === 'anati';
      $('dxfTabAnati').classList.toggle('hidden', !isAnatiTab);
      $('dxfTabLayers').classList.toggle('hidden', isAnatiTab);
    });

    $('btnOpenDxf').addEventListener('click', () => {
      if (state.points.length === 0) {
        return showToast('Agrega o importa puntos antes de exportar el plano.');
      }
      const cleanName = (state.projectName || 'Plano_ANATI').replace(/[^a-zA-Z0-9_-]/g, '_');
      $('dxfFilename').value = cleanName;
      const metrics = C.polygonMetrics(state.points, state.closed && state.points.length >= 3);
      const lotNote = (state.lotDivision && state.lotDivision.ok) ? ` + ${state.lotDivision.lots.length} lotes` : '';
      $('dxfSummaryMeta').textContent = `${state.points.length} pts · ${DXF.formatAnatiArea(metrics.areaM2)}${lotNote}`;
      dxfDialog.showModal();
    });

    $('dxfTextScale').addEventListener('input', (e) => {
      $('dxfScaleVal').textContent = `${Number(e.target.value).toFixed(1)}x`;
    });

    const getExportOpts = () => ({
      layoutMode: $('dxfLayoutMode').value || 'anati',
      paperSize: $('pdfPaperSize').value || 'anati',
      includePolygon: $('dxfOptPoly').checked,
      includePoints: $('dxfOptPts').checked,
      includeBearings: $('dxfOptBearings').checked,
      includeAreaLabel: $('dxfOptArea').checked,
      includeTable: $('dxfOptTable').checked,
      includeNorthArrow: $('dxfOptNorth').checked,
      includeGrid: $('dxfOptGrid').checked,
      textScale: parseFloat($('dxfTextScale').value) || 1.0,
      anati: readAnatiForm()
    });

    $('btnDownloadDxf').addEventListener('click', () => {
      try {
        const opts = getExportOpts();
        const dxfContent = DXF.generateDXF(state, opts);
        let base = ($('dxfFilename').value.trim() || 'Plano_ANATI').replace(/\.(dxf|pdf)$/i, '');
        const filename = `${base}.dxf`;
        IO.downloadFile(filename, dxfContent, 'application/dxf');
        dxfDialog.close();
        showToast(opts.layoutMode === 'anati'
          ? `DXF ANATI "${filename}" descargado (Model 1:1 + Layout 620×470 mm)`
          : `DXF Simple "${filename}" descargado`);
      } catch (err) {
        showToast(`Error al generar DXF: ${err.message}`);
      }
    });

    $('btnDownloadPdf').addEventListener('click', async () => {
      const btn = $('btnDownloadPdf');
      try {
        if (!global.TopoPDF) throw new Error('Módulo PDF no disponible.');
        btn.disabled = true;
        const opts = getExportOpts();
        // Recortar automáticamente la Hoja IGN que cubra el polígono para incrustarla en LOCALIZACION REGIONAL
        if (global.TopoIGN && state.crsMode === 'utm') {
          const crop = await global.TopoIGN.generateRegionalCropForPdf(state.points, state.utmZone, state.utmHemi);
          if (crop) {
            opts.regionalCrop = crop;
            if (!opts.anati.hojaIgn || opts.anati.hojaIgn === '3642 II NE') {
              opts.anati.hojaIgn = crop.sheetCode;
            }
          }
        }
        const pdfBytes = global.TopoPDF.generateAnatiPDF(state, opts);
        let base = ($('dxfFilename').value.trim() || 'Plano_ANATI').replace(/\.(dxf|pdf)$/i, '');
        const filename = `${base}_ANATI.pdf`;
        IO.downloadFile(filename, pdfBytes, 'application/pdf');
        dxfDialog.close();
        showToast(opts.regionalCrop
          ? `PDF ANATI "${filename}" descargado con Hoja IGN ${opts.regionalCrop.sheetCode}`
          : `PDF Vectorial ANATI "${filename}" descargado`);
      } catch (err) {
        showToast(`Error al generar PDF: ${err.message}`);
      } finally {
        btn.disabled = false;
      }
    });

    // ==================== GESTOR DE HOJAS IGN / MOSAICOS ====================
    const ignDialog = $('ignDialog');
    const IGN = global.TopoIGN;

    function syncIgnMapOverlay() {
      if (!IGN || !mapEngine) return;
      const allSheets = IGN.getSheets();
      const activeCount = allSheets.filter(s => s.enabled).length;
      const op = IGN.getOpacity();
      mapEngine.setIgnSheets(allSheets, op);

      $('btnOpenIgnModal').classList.toggle('has-active', activeCount > 0);
      $('ignOpacityBar').classList.toggle('hidden', activeCount === 0 || state.crsMode === 'local');
      $('ignQuickOpacity').value = String(Math.round(op * 100));
      $('ignQuickOpacityVal').textContent = `${Math.round(op * 100)}%`;
      $('ignModalOpacity').value = String(Math.round(op * 100));
      $('ignModalOpacityVal').textContent = `${Math.round(op * 100)}%`;
      $('ignStatusNote').textContent = activeCount > 0
        ? `${activeCount} hoja(s) activa(s) sobre el mapa`
        : 'Ninguna hoja activa en el mapa';
    }

    function renderIgnSheetsList() {
      const container = $('ignSheetsList');
      if (!container || !IGN) return;
      const allSheets = IGN.getSheets();
      const countEl = $('ignSheetsCount');
      if (countEl) countEl.textContent = String(allSheets.length);
      container.innerHTML = '';

      allSheets.forEach((s) => {
        const div = document.createElement('div');
        div.className = `ign-sheet-item${s.enabled ? ' active' : ''}`;
        const b = s.bounds;
        div.innerHTML = `
          <label class="ign-sheet-info" style="cursor:pointer;">
            <input type="checkbox" class="ign-chk" data-ign-id="${s.id}" ${s.enabled ? 'checked' : ''} />
            <div>
              <strong>${s.code} — ${s.name} ${s.builtin ? '<span class="badge">Incluida</span>' : ''}</strong>
              <small>Lat ${b.south.toFixed(4)}°..${b.north.toFixed(4)}° · Lon ${b.west.toFixed(4)}°..${b.east.toFixed(4)}°</small>
            </div>
          </label>
          <div class="row-actions">
            <button type="button" class="tbl-act-btn" data-ign-zoom="${s.id}" title="Centrar mapa en esta hoja">🎯</button>
            ${!s.builtin ? `<button type="button" class="tbl-act-btn" data-ign-dl="${s.id}" title="Descargar JPG recortado para servidor/GitHub">💾</button>` : ''}
            ${!s.builtin ? `<button type="button" class="tbl-act-btn del" data-ign-del="${s.id}" title="Eliminar hoja">✕</button>` : ''}
          </div>
        `;
        container.appendChild(div);
      });

      container.querySelectorAll('.ign-chk').forEach(chk => {
        chk.addEventListener('change', (e) => {
          IGN.setSheetEnabled(e.target.dataset.ignId, e.target.checked);
          syncIgnMapOverlay();
          renderIgnSheetsList();
        });
      });

      container.querySelectorAll('[data-ign-zoom]').forEach(btn => {
        btn.addEventListener('click', () => {
          const s = IGN.getSheets().find(item => item.id === btn.dataset.ignZoom);
          if (!s) return;
          if (!s.enabled) { IGN.setSheetEnabled(s.id, true); syncIgnMapOverlay(); renderIgnSheetsList(); }
          mapEngine.fitLatLngBounds(s.bounds);
          ignDialog.close();
        });
      });

      container.querySelectorAll('[data-ign-dl]').forEach(btn => {
        btn.addEventListener('click', () => {
          const s = IGN.getSheets().find(item => item.id === btn.dataset.ignDl);
          if (!s || !s.url) return;
          const a = document.createElement('a');
          a.href = s.url;
          a.download = `${s.code.replace(/\s+/g, '_')}_${s.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.jpg`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          showToast(`JPG recortado de hoja ${s.code} descargado`);
        });
      });

      container.querySelectorAll('[data-ign-del]').forEach(btn => {
        btn.addEventListener('click', async () => {
          await IGN.deleteUserSheet(btn.dataset.ignDel);
          syncIgnMapOverlay();
          renderIgnSheetsList();
          showToast('Hoja eliminada del mosaico');
        });
      });
    }

    if (IGN) {
      // Poblar selector de cuadrantes IGN de Chiriquí
      const qSel = $('ignQuadrantSelect');
      IGN.CHIRIQUI_QUADRANTS.forEach((q, idx) => {
        const opt = document.createElement('option');
        opt.value = String(idx);
        opt.textContent = `${q.code} — ${q.name} (1:25,000)`;
        qSel.appendChild(opt);
      });
      qSel.addEventListener('change', (e) => {
        if (e.target.value === 'custom') return;
        const q = IGN.CHIRIQUI_QUADRANTS[Number(e.target.value)];
        if (!q) return;
        $('ignNewCode').value = q.code;
        $('ignNewName').value = q.name;
        $('ignSouth').value = q.south.toFixed(6);
        $('ignNorth').value = q.north.toFixed(6);
        $('ignWest').value = q.west.toFixed(6);
        $('ignEast').value = q.east.toFixed(6);
      });

      $('btnOpenIgnModal').addEventListener('click', () => {
        renderIgnSheetsList();
        syncIgnMapOverlay();
        ignDialog.showModal();
      });

      const handleOpacityChange = (valPct) => {
        const op = IGN.setOpacity(Number(valPct) / 100);
        mapEngine.setIgnOpacity(op);
        $('ignQuickOpacity').value = String(valPct);
        $('ignQuickOpacityVal').textContent = `${valPct}%`;
        $('ignModalOpacity').value = String(valPct);
        $('ignModalOpacityVal').textContent = `${valPct}%`;
      };
      $('ignQuickOpacity').addEventListener('input', (e) => handleOpacityChange(e.target.value));
      $('ignModalOpacity').addEventListener('input', (e) => handleOpacityChange(e.target.value));
      $('btnIgnQuickHide').addEventListener('click', () => {
        IGN.getSheets().forEach(s => IGN.setSheetEnabled(s.id, false));
        syncIgnMapOverlay();
        renderIgnSheetsList();
      });

      const computeMosaicBounds = (list) => {
        if (!list || list.length === 0) return null;
        return {
          south: Math.min(...list.map(s => s.bounds.south)),
          north: Math.max(...list.map(s => s.bounds.north)),
          west: Math.min(...list.map(s => s.bounds.west)),
          east: Math.max(...list.map(s => s.bounds.east))
        };
      };

      $('btnIgnEnableAll').addEventListener('click', () => {
        const all = IGN.getSheets();
        all.forEach(s => IGN.setSheetEnabled(s.id, true));
        syncIgnMapOverlay();
        renderIgnSheetsList();
        showToast(`${all.length} hojas IGN activadas en el mosaico`);
      });

      $('btnIgnDisableAll').addEventListener('click', () => {
        IGN.getSheets().forEach(s => IGN.setSheetEnabled(s.id, false));
        syncIgnMapOverlay();
        renderIgnSheetsList();
        showToast('Capas IGN ocultadas');
      });

      $('btnIgnFitAll').addEventListener('click', () => {
        let active = IGN.getEnabledSheets();
        if (active.length === 0) {
          IGN.getSheets().forEach(s => IGN.setSheetEnabled(s.id, true));
          active = IGN.getEnabledSheets();
          syncIgnMapOverlay();
          renderIgnSheetsList();
        }
        const mb = computeMosaicBounds(active);
        if (mb) mapEngine.fitLatLngBounds(mb);
        ignDialog.close();
      });

      $('btnIgnAddSheet').addEventListener('click', async () => {
        const fileInputEl = $('ignUploadFile');
        const file = fileInputEl.files[0];
        const statusEl = $('ignUploadStatus');
        const south = parseFloat($('ignSouth').value);
        const north = parseFloat($('ignNorth').value);
        const west = parseFloat($('ignWest').value);
        const east = parseFloat($('ignEast').value);

        if (!file) return showToast('Selecciona primero el archivo PDF, JPG o PNG de la hoja IGN.');
        if (![south, north, west, east].every(Number.isFinite) || north <= south || east <= west) {
          return showToast('Selecciona un cuadrante IGN o ingresa las 4 esquinas Lat/Lon válidas.');
        }

        const btn = $('btnIgnAddSheet');
        btn.disabled = true;
        statusEl.textContent = 'Procesando y georreferenciando hoja...';
        try {
          const processed = await IGN.processUploadedSheetFile(file, {
            autoCropIgn25k: $('ignAutoCropPdf').checked
          });
          const code = $('ignNewCode').value.trim() || file.name.replace(/\.[^.]+$/, '');
          const name = $('ignNewName').value.trim() || 'Hoja IGN';
          const saved = await IGN.saveUserSheet({
            code,
            name,
            scale: '1:25,000',
            url: processed.dataUrl,
            bounds: { south, north, west, east },
            enabled: true
          });
          fileInputEl.value = '';
          statusEl.textContent = `✓ ${saved.code} agregada (${processed.width}×${processed.height} px)`;
          renderIgnSheetsList();
          syncIgnMapOverlay();
          mapEngine.fitLatLngBounds(saved.bounds);
          showToast(`Hoja IGN ${saved.code} (${saved.name}) georreferenciada y activada`);
        } catch (err) {
          statusEl.textContent = `Error: ${err.message}`;
          showToast(`Error procesando hoja IGN: ${err.message}`);
        } finally {
          btn.disabled = false;
        }
      });

      // Cargar hojas guardadas en IndexedDB al inicio
      IGN.loadSavedSheets().then(() => {
        syncIgnMapOverlay();
      });
    }

    // Cerrar modales
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => $(btn.dataset.close).close());
    });
  }

  // ==================== ARRANQUE ====================
  function init() {
    mapEngine = new global.TopoMapEngine('leafletMap', 'cadCanvas', {
      onCursorMove: ({ e, n, lat, lon }) => {
        $('hudE').textContent = Number.isFinite(e) ? e.toFixed(3) : '-';
        $('hudN').textContent = Number.isFinite(n) ? n.toFixed(3) : '-';
        if (lat !== null && lon !== null) {
          $('hudLatLon').textContent = `${lat.toFixed(6)}°, ${lon.toFixed(6)}°`;
        }
      },
      onMapPick: (mode, coord) => {
        if (mode === 'initial') {
          $('initE').value = coord.e.toFixed(3);
          $('initN').value = coord.n.toFixed(3);
          if (state.points.length === 0) {
            addPoint({ id: $('initId').value.trim() || 'P1', e: coord.e, n: coord.n, z: parseFloat($('initZ').value) || 0, desc: $('initDesc').value.trim() }, false);
          } else {
            state.points[0].e = coord.e;
            state.points[0].n = coord.n;
            refreshAll(false);
          }
          setMapPickMode(null);
          showToast(`Coordenada inicial capturada: E ${coord.e.toFixed(3)}, N ${coord.n.toFixed(3)}`);
        } else if (mode === 'addPoint') {
          addPoint({ id: nextAutoPointId(), e: coord.e, n: coord.n, z: 0, desc: 'MAPA' }, false);
          showToast(`Punto agregado en E ${coord.e.toFixed(2)}, N ${coord.n.toFixed(2)}`);
        } else if (mode === 'drawPoly') {
          addPoint({ id: nextAutoPointId(), e: coord.e, n: coord.n, z: 0, desc: 'DIBUJO MAPA' }, false);
          $('pickBannerText').textContent = `Dibujando polígono (${state.points.length} pts) — Clic en vértices, doble clic o Terminar`;
        } else if (mode === 'moveDest') {
          $('moveDestE').value = coord.e.toFixed(3);
          $('moveDestN').value = coord.n.toFixed(3);
          setMapPickMode(null);
          showToast(`Destino capturado: E ${coord.e.toFixed(3)}, N ${coord.n.toFixed(3)}. Pulsa "Trasladar Vértice a Destino".`);
        }
      },
      onFinishDraw: () => finishDrawPolygon(),
      onVertexDragMove: (idx, coord) => {
        if (!state.points[idx]) return;
        state.points[idx].e = coord.e;
        state.points[idx].n = coord.n;
        updateMetrics();
      },
      onVertexDragEnd: (idx, coord) => {
        if (!state.points[idx]) return;
        state.points[idx].e = coord.e;
        state.points[idx].n = coord.n;
        if (idx === 0) {
          $('initE').value = coord.e.toFixed(3);
          $('initN').value = coord.n.toFixed(3);
        }
        // Recalcular división de lotes automáticamente si estaba activa
        if (state.lotDivision && state.lotDivision.ok) {
          const updated = C.subdividePolygonEqualArea(state.points, state.lotDivision.numLots, state.lotDivision.cutAzimuth);
          state.lotDivision = updated.ok ? updated : null;
        }
        state.closureInfo = null;
        refreshAll(false);
        showToast(`${state.points[idx].id} movido a E ${coord.e.toFixed(3)}, N ${coord.n.toFixed(3)}`);
      }
    });

    bindEvents();
    if (global.TopoI18n) global.TopoI18n.applyLanguage();
    loadPanamaDemo();

    // Puente para que las Calculadoras Geodésicas puedan graficar puntos directo en el mapa COGO
    global.TopoAppBridge = {
      getCogoPoints: () => state.points.map(p => ({ ...p })),
      onReturnToCogo: () => {
        setTimeout(() => { if (mapEngine) mapEngine.invalidateSize(); }, 60);
      },
      plotPointOnMap: (e, n, z = 0, zone = 17, hemi = 'N', label = 'CALC') => {
        state.crsMode = 'utm';
        state.utmZone = Number(zone) || 17;
        state.utmHemi = hemi || 'N';
        state.crsLabel = `UTM WGS84 ZONA ${state.utmZone}${state.utmHemi}`;
        if (state.utmZone === 17) $('crsSelect').value = 'utm17N';
        else if (state.utmZone === 18) $('crsSelect').value = 'utm18N';
        $('hudCrsBadge').textContent = `UTM WGS84 · ${state.utmZone}${state.utmHemi}`;
        mapEngine.setCRS('utm', state.utmZone, state.utmHemi);
        addPoint({ id: label, e, n, z, desc: 'CALCULADORA' }, false);
        setTimeout(() => {
          mapEngine.invalidateSize();
          mapEngine.focusPoint({ e, n });
        }, 120);
        showToast(`Punto ${label} ubicado en mapa: E ${e.toFixed(3)}, N ${n.toFixed(3)}`);
      },
      loadSurveyOnMap: (pts, zone = 17, hemi = 'N', title = 'Reproyectado_UTM') => {
        if (!pts || pts.length === 0) return;
        state.crsMode = 'utm';
        state.utmZone = Number(zone) || 17;
        state.utmHemi = hemi || 'N';
        state.crsLabel = `UTM WGS84 ZONA ${state.utmZone}${state.utmHemi}`;
        state.projectName = title;
        $('projectNameInput').value = title;
        if (state.utmZone === 17) $('crsSelect').value = 'utm17N';
        else if (state.utmZone === 18) $('crsSelect').value = 'utm18N';
        $('hudCrsBadge').textContent = `UTM WGS84 · ${state.utmZone}${state.utmHemi}`;
        $('hudLatLonWrap').classList.remove('hidden');

        state.points = pts.map(p => ({ ...p }));
        state.closed = pts.length >= 3;
        state.curves = [];
        state.auxLines = [];
        state.lotDivision = null;
        state.closureInfo = null;
        $('chkClosedPoly').checked = state.closed;

        if (state.points[0]) {
          $('initId').value = state.points[0].id;
          $('initE').value = state.points[0].e.toFixed(3);
          $('initN').value = state.points[0].n.toFixed(3);
          $('initZ').value = (Number(state.points[0].z) || 0).toFixed(2);
          $('initDesc').value = state.points[0].desc || '';
        }

        mapEngine.setCRS('utm', state.utmZone, state.utmHemi);
        if (mapEngine.basemap === 'cad') {
          document.querySelectorAll('.bm-btn').forEach(b => b.classList.toggle('active', b.dataset.bm === 'satellite'));
          mapEngine.setBasemap('satellite');
        }
        refreshAll(false);
        setTimeout(() => {
          mapEngine.invalidateSize();
          mapEngine.fitBounds();
        }, 120);
        showToast(`${pts.length} puntos reproyectados cargados en COGO Gráfico`);
      }
    };
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
