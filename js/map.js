/**
 * map.js — Motor gráfico dual: Mapa GIS (Leaflet con Satelital/Híbrido/OSM/Topo)
 * + Visor CAD Canvas de alta precisión (para Sistema Local o uso offline en campo).
 */
(function (global) {
  'use strict';

  const Geo = global.TopoGeodesy;
  const C = global.TopoCOGO;

  class TopoMapEngine {
    constructor(containerId, cadCanvasId, callbacks = {}) {
      this.containerId = containerId;
      this.cadCanvasId = cadCanvasId;
      this.callbacks = callbacks;

      this.mode = 'utm'; // 'utm' | 'local'
      this.utmZone = 17;
      this.utmHemi = 'N';
      this.basemap = 'satellite'; // 'satellite' | 'hybrid' | 'osm' | 'topo' | 'cad'
      this.showLabels = true;
      this.showPoints = true;
      this.pickMode = null; // null | 'initial' | 'addPoint' | 'drawPoly' | 'moveDest'
      this.editMode = false;

      // Estado Leaflet
      this.leafletAvailable = typeof global.L !== 'undefined';
      this.map = null;
      this.tileLayers = {};
      this.activeTileLayers = [];
      this.overlayGroup = null;
      this.labelGroup = null;
      this.auxGroup = null;
      this.mainPolyLayer = null;

      // Estado CAD Canvas (para modo local o fallback offline)
      this.canvas = document.getElementById(cadCanvasId);
      this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
      this.cadView = { centerE: 1000, centerN: 1000, scale: 2.5 }; // px por metro
      this.isDragging = false;
      this.dragStart = null;
      this.dragMoved = false;
      this.draggingVertexIdx = -1;

      this.lastData = { points: [], closed: false, curves: [], auxLines: [], lotDivision: null, selectedIndex: -1 };
      this.previewLine = null;
      this.cadCursorWorld = null;

      this._initLeaflet();
      this._initCadCanvas();
      this._syncActiveRenderer();
    }

    _initLeaflet() {
      if (!this.leafletAvailable) return;
      const L = global.L;

      // Centro inicial: David, Chiriquí, Panamá (Zona 17N)
      this.map = L.map(this.containerId, {
        center: [8.4333, -82.4333],
        zoom: 17,
        maxZoom: 22,
        zoomControl: false,
        doubleClickZoom: true,
        preferCanvas: true
      });

      L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(this.map);

      // Definición de basemaps (Esri funciona sin bloqueo 403 tanto local como en dominio)
      this.tileLayers = {
        satellite: [
          L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri &mdash; World Imagery',
            maxNativeZoom: 19,
            maxZoom: 22
          })
        ],
        hybrid: [
          L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri',
            maxNativeZoom: 19,
            maxZoom: 22
          }),
          L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
            maxNativeZoom: 19,
            maxZoom: 22,
            opacity: 0.9
          }),
          L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', {
            maxNativeZoom: 19,
            maxZoom: 22,
            opacity: 0.8
          })
        ],
        osm: [
          L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri &mdash; World Street Map',
            maxNativeZoom: 19,
            maxZoom: 22
          })
        ],
        topo: [
          L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri &mdash; World Topo Map',
            maxNativeZoom: 19,
            maxZoom: 22
          })
        ],
        cad: []
      };

      this.overlayGroup = L.layerGroup().addTo(this.map);
      this.auxGroup = L.layerGroup().addTo(this.map);
      this.labelGroup = L.layerGroup().addTo(this.map);

      this.setBasemap(this.basemap);

      // Eventos del mapa
      this.map.on('mousemove', (ev) => {
        const { lat, lng } = ev.latlng;
        const utm = Geo.latLonToUtm(lat, lng, this.utmZone);
        if (this.callbacks.onCursorMove) {
          this.callbacks.onCursorMove({ e: utm.easting, n: utm.northing, lat, lon: lng });
        }
        // Línea elástica en vivo al dibujar polígono sobre satelital/mapa
        if (this.pickMode === 'drawPoly' && this.lastData.points.length > 0) {
          const lastLL = this._ptToLatLng(this.lastData.points[this.lastData.points.length - 1]);
          const firstLL = this._ptToLatLng(this.lastData.points[0]);
          if (lastLL) {
            const previewPts = this.lastData.points.length >= 2 && firstLL
              ? [lastLL, [lat, lng], firstLL]
              : [lastLL, [lat, lng]];
            if (this.previewLine) {
              this.previewLine.setLatLngs(previewPts);
            } else {
              this.previewLine = L.polyline(previewPts, {
                color: '#fbbf24',
                weight: 2,
                dashArray: '6, 6',
                interactive: false
              }).addTo(this.map);
            }
          }
        } else if (this.previewLine) {
          this.map.removeLayer(this.previewLine);
          this.previewLine = null;
        }
      });

      this.map.on('click', (ev) => {
        if (!this.pickMode) return;
        const { lat, lng } = ev.latlng;
        const utm = Geo.latLonToUtm(lat, lng, this.utmZone);
        if (this.callbacks.onMapPick) {
          this.callbacks.onMapPick(this.pickMode, {
            e: Number(utm.easting.toFixed(3)),
            n: Number(utm.northing.toFixed(3)),
            lat,
            lon: lng
          });
        }
      });

      this.map.on('dblclick', (ev) => {
        if (this.pickMode === 'drawPoly' && this.callbacks.onFinishDraw) {
          L.DomEvent.stop(ev);
          this.callbacks.onFinishDraw();
        }
      });
    }

    _initCadCanvas() {
      if (!this.canvas) return;
      const resize = () => {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        const dpr = global.devicePixelRatio || 1;
        this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
        this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
        this.canvas.style.width = `${rect.width}px`;
        this.canvas.style.height = `${rect.height}px`;
        if (this.ctx) this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (this.isUsingCadCanvas()) this._renderCadCanvas();
      };

      global.addEventListener('resize', resize);
      setTimeout(resize, 50);

      // Zoom con rueda del mouse
      this.canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const before = this._screenToWorld(mx, my);
        const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
        this.cadView.scale = Math.max(0.002, Math.min(500, this.cadView.scale * factor));
        const after = this._screenToWorld(mx, my);
        this.cadView.centerE += (before.e - after.e);
        this.cadView.centerN += (before.n - after.n);
        this._renderCadCanvas();
      }, { passive: false });

      // Pan con arrastre o arrastre de vértices en Modo Edición (CAD Canvas)
      this.canvas.addEventListener('mousedown', (e) => {
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        if (this.editMode && this.lastData.points && this.lastData.points.length > 0) {
          let hitIdx = -1;
          let bestDist = 14;
          this.lastData.points.forEach((p, idx) => {
            const s = this._worldToScreen(p.e, p.n);
            const d = Math.hypot(s.x - mx, s.y - my);
            if (d < bestDist) {
              bestDist = d;
              hitIdx = idx;
            }
          });
          if (hitIdx !== -1) {
            this.draggingVertexIdx = hitIdx;
            this.canvas.style.cursor = 'grabbing';
            return;
          }
        }

        this.isDragging = true;
        this.dragMoved = false;
        this.dragStart = { x: e.clientX, y: e.clientY, cE: this.cadView.centerE, cN: this.cadView.centerN };
      });

      global.addEventListener('mousemove', (e) => {
        if (!this.isUsingCadCanvas()) return;
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        if (this.draggingVertexIdx !== -1) {
          const w = this._screenToWorld(mx, my);
          const pt = this.lastData.points[this.draggingVertexIdx];
          if (pt) {
            pt.e = Number(w.e.toFixed(3));
            pt.n = Number(w.n.toFixed(3));
            this._renderCadCanvas();
            if (this.callbacks.onVertexDragMove) {
              this.callbacks.onVertexDragMove(this.draggingVertexIdx, { e: pt.e, n: pt.n });
            }
          }
          if (this.callbacks.onCursorMove) {
            this.callbacks.onCursorMove({ e: w.e, n: w.n, lat: null, lon: null });
          }
          return;
        }

        if (this.isDragging && this.dragStart) {
          const dx = e.clientX - this.dragStart.x;
          const dy = e.clientY - this.dragStart.y;
          if (Math.hypot(dx, dy) > 3) this.dragMoved = true;
          this.cadView.centerE = this.dragStart.cE - dx / this.cadView.scale;
          this.cadView.centerN = this.dragStart.cN + dy / this.cadView.scale;
          this._renderCadCanvas();
        }

        if (mx >= 0 && my >= 0 && mx <= rect.width && my <= rect.height) {
          const w = this._screenToWorld(mx, my);
          if (this.callbacks.onCursorMove) {
            this.callbacks.onCursorMove({ e: w.e, n: w.n, lat: null, lon: null });
          }
        }
      });

      global.addEventListener('mouseup', () => {
        if (this.draggingVertexIdx !== -1) {
          const idx = this.draggingVertexIdx;
          const pt = this.lastData.points[idx];
          this.draggingVertexIdx = -1;
          this.canvas.style.cursor = this.pickMode ? 'crosshair' : 'grab';
          if (pt && this.callbacks.onVertexDragEnd) {
            this.callbacks.onVertexDragEnd(idx, { e: pt.e, n: pt.n });
          }
        }
        this.isDragging = false;
      });

      this.canvas.addEventListener('click', (e) => {
        if (this.dragMoved || !this.pickMode) return;
        const rect = this.canvas.getBoundingClientRect();
        const w = this._screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        if (this.callbacks.onMapPick) {
          this.callbacks.onMapPick(this.pickMode, {
            e: Number(w.e.toFixed(3)),
            n: Number(w.n.toFixed(3)),
            lat: null,
            lon: null
          });
        }
      });
    }

    isUsingCadCanvas() {
      return this.mode === 'local' || !this.leafletAvailable || this.basemap === 'cad';
    }

    _syncActiveRenderer() {
      const mapEl = document.getElementById(this.containerId);
      const useCad = this.isUsingCadCanvas();
      if (mapEl) mapEl.style.display = useCad ? 'none' : 'block';
      if (this.canvas) {
        this.canvas.style.display = useCad ? 'block' : 'none';
        if (useCad) {
          const rect = this.canvas.parentElement.getBoundingClientRect();
          const dpr = global.devicePixelRatio || 1;
          this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
          this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
          this.canvas.style.width = `${rect.width}px`;
          this.canvas.style.height = `${rect.height}px`;
          if (this.ctx) this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
      }
      if (!useCad && this.map) {
        setTimeout(() => this.map.invalidateSize(), 60);
      }
    }

    setCRS(mode, zone = 17, hemisphere = 'N') {
      this.mode = mode;
      this.utmZone = Number(zone) || 17;
      this.utmHemi = hemisphere || 'N';
      this._syncActiveRenderer();
      this.render(this.lastData);
      this.fitBounds();
    }

    setBasemap(name) {
      this.basemap = name;
      this._syncActiveRenderer();

      if (this.map && this.leafletAvailable) {
        for (const tl of this.activeTileLayers) {
          this.map.removeLayer(tl);
        }
        this.activeTileLayers = [];
        const layers = this.tileLayers[name] || [];
        for (const tl of layers) {
          tl.addTo(this.map);
          this.activeTileLayers.push(tl);
        }
      }

      if (this.isUsingCadCanvas()) {
        this._renderCadCanvas();
        if (this.lastData.points.length > 0) this.fitBounds();
      } else {
        this._renderLeaflet();
      }
    }

    setPickMode(mode) {
      this.pickMode = mode;
      const mapEl = document.getElementById(this.containerId);
      const cursor = mode ? 'crosshair' : '';
      if (mapEl) mapEl.style.cursor = cursor;
      if (this.canvas) this.canvas.style.cursor = cursor || 'grab';
      if (this.map) {
        if (mode === 'drawPoly') this.map.doubleClickZoom.disable();
        else this.map.doubleClickZoom.enable();
      }
      if (!mode && this.previewLine && this.map) {
        this.map.removeLayer(this.previewLine);
        this.previewLine = null;
      }
    }

    setEditMode(enabled) {
      this.editMode = Boolean(enabled);
      this.render(this.lastData);
    }

    setLabelsVisible(visible) {
      this.showLabels = visible;
      this.render(this.lastData);
    }

    zoomIn() {
      if (this.isUsingCadCanvas()) {
        this.cadView.scale = Math.min(500, this.cadView.scale * 1.35);
        this._renderCadCanvas();
      } else if (this.map) {
        this.map.zoomIn();
      }
    }

    zoomOut() {
      if (this.isUsingCadCanvas()) {
        this.cadView.scale = Math.max(0.002, this.cadView.scale / 1.35);
        this._renderCadCanvas();
      } else if (this.map) {
        this.map.zoomOut();
      }
    }

    invalidateSize() {
      if (this.isUsingCadCanvas() && this.canvas) {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        const dpr = global.devicePixelRatio || 1;
        this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
        this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
        this.canvas.style.width = `${rect.width}px`;
        this.canvas.style.height = `${rect.height}px`;
        if (this.ctx) this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this._renderCadCanvas();
      } else if (this.map) {
        this.map.invalidateSize();
      }
    }

    render(data) {
      this.lastData = data;
      if (this.isUsingCadCanvas()) {
        this._renderCadCanvas();
      } else {
        this._renderLeaflet();
      }
    }

    fitBounds() {
      const pts = this.lastData.points || [];
      if (pts.length === 0) {
        if (!this.isUsingCadCanvas() && this.map) {
          this.map.setView([8.4333, -82.4333], 14);
        }
        return;
      }

      if (this.isUsingCadCanvas()) {
        let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
        for (const p of pts) {
          if (p.e < minE) minE = p.e;
          if (p.e > maxE) maxE = p.e;
          if (p.n < minN) minN = p.n;
          if (p.n > maxN) maxN = p.n;
        }
        const rect = this.canvas.getBoundingClientRect();
        const w = Math.max(200, rect.width);
        const h = Math.max(200, rect.height);
        const spanE = Math.max(maxE - minE, 10);
        const spanN = Math.max(maxN - minN, 10);
        this.cadView.centerE = (minE + maxE) / 2;
        this.cadView.centerN = (minN + maxN) / 2;
        this.cadView.scale = Math.min((w * 0.72) / spanE, (h * 0.72) / spanN);
        this._renderCadCanvas();
        return;
      }

      if (!this.map || !this.leafletAvailable) return;
      const latLngs = pts.map(p => this._ptToLatLng(p)).filter(Boolean);
      if (latLngs.length === 1) {
        this.map.setView(latLngs[0], 18);
      } else if (latLngs.length > 1) {
        const bounds = global.L.latLngBounds(latLngs);
        this.map.fitBounds(bounds, { padding: [55, 55], maxZoom: 20 });
      }
    }

    focusPoint(pt) {
      if (!pt) return;
      if (this.isUsingCadCanvas()) {
        this.cadView.centerE = pt.e;
        this.cadView.centerN = pt.n;
        this._renderCadCanvas();
      } else if (this.map) {
        const ll = this._ptToLatLng(pt);
        if (ll) this.map.setView(ll, Math.max(this.map.getZoom(), 19));
      }
    }

    _ptToLatLng(pt) {
      if (!Geo.isPlausibleUtm(pt.e, pt.n)) return null;
      const { lat, lon } = Geo.utmToLatLon(pt.e, pt.n, this.utmZone, this.utmHemi);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return [lat, lon];
    }

    // ==================== RENDERIZADO LEAFLET ====================
    _renderLeaflet() {
      if (!this.map || !this.leafletAvailable) return;
      const L = global.L;
      this.overlayGroup.clearLayers();
      this.auxGroup.clearLayers();
      this.labelGroup.clearLayers();

      const { points, closed, curves, auxLines, lotDivision } = this.lastData;
      if (!points || points.length === 0) return;

      const latLngs = points.map(p => this._ptToLatLng(p));
      const validLatLngs = latLngs.filter(Boolean);
      if (validLatLngs.length === 0) return;

      const metrics = C.polygonMetrics(points, closed && points.length >= 3);

      // Polígono o polilínea
      this.mainPolyLayer = null;
      if (validLatLngs.length >= 2) {
        if (closed && validLatLngs.length >= 3) {
          this.mainPolyLayer = L.polygon(validLatLngs, {
            color: '#00e5a0',
            weight: 2.8,
            fillColor: '#00e5a0',
            fillOpacity: lotDivision && lotDivision.ok ? 0.05 : 0.18
          }).addTo(this.overlayGroup);
        } else {
          this.mainPolyLayer = L.polyline(validLatLngs, {
            color: '#38bdf8',
            weight: 3,
            opacity: 0.95
          }).addTo(this.overlayGroup);
        }
      }

      // Lotes subdivididos (División en partes iguales)
      if (lotDivision && lotDivision.ok) {
        const lotColors = ['#38bdf8', '#f59e0b', '#a855f7', '#10b981', '#f43f5e', '#eab308', '#06b6d4'];
        (lotDivision.lots || []).forEach((lot, idx) => {
          const lotLL = (lot.points || []).map(p => this._ptToLatLng(p)).filter(Boolean);
          if (lotLL.length >= 3) {
            const color = lotColors[idx % lotColors.length];
            L.polygon(lotLL, {
              color,
              weight: 1.5,
              fillColor: color,
              fillOpacity: 0.22
            }).addTo(this.auxGroup);
          }
          if (lot.centroid) {
            const cLL = this._ptToLatLng(lot.centroid);
            if (cLL) {
              const lotIcon = L.divIcon({
                className: 'map-area-label',
                html: `<div class="lot-pill"><strong>${lot.name}</strong><span>${lot.areaM2.toLocaleString('en-US', { maximumFractionDigits: 2 })} m²</span></div>`,
                iconSize: [0, 0]
              });
              L.marker(cLL, { icon: lotIcon, interactive: false }).addTo(this.labelGroup);
            }
          }
        });
        (lotDivision.cutLines || []).forEach((cl) => {
          const a = this._ptToLatLng(cl.from);
          const b = this._ptToLatLng(cl.to);
          if (a && b) {
            L.polyline([a, b], {
              color: '#fbbf24',
              weight: 2.6,
              dashArray: '8, 5'
            }).addTo(this.auxGroup);
          }
        });
        (lotDivision.cutPoints || []).forEach((cp) => {
          const ll = this._ptToLatLng(cp);
          if (!ll) return;
          L.circleMarker(ll, {
            radius: 4.8,
            color: '#1c1917',
            weight: 1.8,
            fillColor: '#fbbf24',
            fillOpacity: 1
          }).addTo(this.auxGroup);
          if (this.showLabels) {
            const cpIcon = L.divIcon({
              className: 'map-pt-label',
              html: `<span class="pt-tag pt-tag-cut">${cp.id}</span>`,
              iconSize: [0, 0],
              iconAnchor: [-8, 11]
            });
            L.marker(ll, { icon: cpIcon, interactive: false }).addTo(this.labelGroup);
          }
        });
      }

      // Líneas auxiliares COGO
      if (auxLines && auxLines.length > 0) {
        for (const line of auxLines) {
          const a = this._ptToLatLng(line.from);
          const b = this._ptToLatLng(line.to);
          if (a && b) {
            L.polyline([a, b], {
              color: line.color || '#f59e0b',
              weight: 2,
              dashArray: '6, 6'
            }).addTo(this.auxGroup);
          }
        }
      }

      // Curvas horizontales
      if (curves && curves.length > 0) {
        for (const curve of curves) {
          const arcLL = (curve.arcPoints || []).map(p => this._ptToLatLng(p)).filter(Boolean);
          if (arcLL.length >= 2) {
            L.polyline(arcLL, { color: '#ec4899', weight: 3.2 }).addTo(this.auxGroup);
            const pcLL = this._ptToLatLng(curve.pc);
            const piLL = this._ptToLatLng(curve.pi);
            const ptLL = this._ptToLatLng(curve.pt);
            if (pcLL && piLL && ptLL) {
              L.polyline([pcLL, piLL, ptLL], { color: '#f472b6', weight: 1.5, dashArray: '5,5' }).addTo(this.auxGroup);
            }
          }
        }
      }

      // Etiquetas de Rumbo y Distancia en cada lado
      if (this.showLabels && metrics.legs.length > 0) {
        for (const leg of metrics.legs) {
          const a = this._ptToLatLng(leg.from);
          const b = this._ptToLatLng(leg.to);
          if (!a || !b) continue;
          const midLat = (a[0] + b[0]) / 2;
          const midLon = (a[1] + b[1]) / 2;

          const icon = L.divIcon({
            className: 'map-leg-label',
            html: `<div class="leg-pill"><span>${leg.bearing}</span><strong>${leg.dist.toFixed(2)} m</strong></div>`,
            iconSize: [0, 0]
          });
          L.marker([midLat, midLon], { icon, interactive: false }).addTo(this.labelGroup);
        }
      }

      // Etiqueta de Área en el centroide (se oculta si hay lotes subdivididos para no encimar texto)
      if (closed && points.length >= 3 && metrics.centroid && metrics.areaM2 > 0 && !(lotDivision && lotDivision.ok)) {
        const cLL = this._ptToLatLng(metrics.centroid);
        if (cLL) {
          const icon = L.divIcon({
            className: 'map-area-label',
            html: `<div class="area-pill"><strong>${metrics.areaM2.toLocaleString('en-US', { maximumFractionDigits: 2 })} m²</strong><span>${metrics.areaHa.toFixed(4)} ha</span></div>`,
            iconSize: [0, 0]
          });
          L.marker(cLL, { icon, interactive: false }).addTo(this.labelGroup);
        }
      }

      // Marcadores de vértices / puntos (arrastrables cuando editMode está activo)
      const liveLatLngs = latLngs.map(ll => (ll ? [ll[0], ll[1]] : null));
      points.forEach((p, idx) => {
        const ll = latLngs[idx];
        if (!ll) return;
        const isFirst = idx === 0;

        if (this.editMode) {
          const handleIcon = L.divIcon({
            className: 'vertex-drag-icon',
            html: `<div class="vertex-handle ${isFirst ? 'is-start' : ''}" title="Arrastra para mover ${p.id}"></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          });
          const dragMarker = L.marker(ll, {
            icon: handleIcon,
            draggable: true,
            zIndexOffset: 500
          }).addTo(this.overlayGroup);

          dragMarker.on('drag', (ev) => {
            const pos = ev.target.getLatLng();
            liveLatLngs[idx] = [pos.lat, pos.lng];
            if (this.mainPolyLayer) {
              this.mainPolyLayer.setLatLngs(liveLatLngs.filter(Boolean));
            }
            const utm = Geo.latLonToUtm(pos.lat, pos.lng, this.utmZone);
            if (this.callbacks.onCursorMove) {
              this.callbacks.onCursorMove({ e: utm.easting, n: utm.northing, lat: pos.lat, lon: pos.lng });
            }
            if (this.callbacks.onVertexDragMove) {
              this.callbacks.onVertexDragMove(idx, {
                e: Number(utm.easting.toFixed(3)),
                n: Number(utm.northing.toFixed(3))
              });
            }
          });

          dragMarker.on('dragend', (ev) => {
            const pos = ev.target.getLatLng();
            const utm = Geo.latLonToUtm(pos.lat, pos.lng, this.utmZone);
            if (this.callbacks.onVertexDragEnd) {
              this.callbacks.onVertexDragEnd(idx, {
                e: Number(utm.easting.toFixed(3)),
                n: Number(utm.northing.toFixed(3))
              });
            }
          });
        } else {
          const marker = L.circleMarker(ll, {
            radius: isFirst ? 7 : 5.5,
            color: '#0f172a',
            weight: 2,
            fillColor: isFirst ? '#f59e0b' : '#38bdf8',
            fillOpacity: 1
          }).addTo(this.overlayGroup);

          marker.bindPopup(`
            <div class="map-popup">
              <div class="map-popup-title">${p.id} ${p.desc ? `<small>(${p.desc})</small>` : ''}</div>
              <div><b>Este (X):</b> ${p.e.toFixed(3)} m</div>
              <div><b>Norte (Y):</b> ${p.n.toFixed(3)} m</div>
              <div><b>Cota (Z):</b> ${(Number(p.z) || 0).toFixed(2)} m</div>
              <div class="map-popup-geo">Lat ${ll[0].toFixed(6)}°, Lon ${ll[1].toFixed(6)}°</div>
            </div>
          `);
        }

        if (this.showLabels) {
          const ptIcon = L.divIcon({
            className: 'map-pt-label',
            html: `<span class="pt-tag ${isFirst ? 'pt-tag-start' : ''}">${p.id}</span>`,
            iconSize: [0, 0],
            iconAnchor: [-12, 12]
          });
          L.marker(ll, { icon: ptIcon, interactive: false }).addTo(this.labelGroup);
        }
      });
    }

    // ==================== RENDERIZADO CAD CANVAS (LOCAL / PLANO CAD) ====================
    _worldToScreen(e, n) {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: rect.width / 2 + (e - this.cadView.centerE) * this.cadView.scale,
        y: rect.height / 2 - (n - this.cadView.centerN) * this.cadView.scale
      };
    }

    _screenToWorld(x, y) {
      const rect = this.canvas.getBoundingClientRect();
      return {
        e: this.cadView.centerE + (x - rect.width / 2) / this.cadView.scale,
        n: this.cadView.centerN - (y - rect.height / 2) / this.cadView.scale
      };
    }

    _renderCadCanvas() {
      if (!this.ctx || !this.canvas) return;
      const ctx = this.ctx;
      const rect = this.canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';

      // Fondo CAD
      ctx.fillStyle = isLight ? '#f8fafc' : '#0b1120';
      ctx.fillRect(0, 0, w, h);

      // Cuadrícula dinámica
      const targetPx = 85;
      const rawStep = targetPx / this.cadView.scale;
      const pow = Math.pow(10, Math.floor(Math.log10(Math.max(rawStep, 1e-4))));
      const norm = rawStep / pow;
      const step = (norm <= 1.5 ? 1 : norm <= 3.5 ? 2 : norm <= 7.5 ? 5 : 10) * pow;

      const topLeft = this._screenToWorld(0, 0);
      const botRight = this._screenToWorld(w, h);
      const startE = Math.floor(topLeft.e / step) * step;
      const endE = Math.ceil(botRight.e / step) * step;
      const startN = Math.floor(botRight.n / step) * step;
      const endN = Math.ceil(topLeft.n / step) * step;

      ctx.strokeStyle = isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(148, 163, 184, 0.11)';
      ctx.lineWidth = 1;
      ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillStyle = isLight ? '#64748b' : '#64748b';

      ctx.beginPath();
      for (let gx = startE; gx <= endE; gx += step) {
        const s = this._worldToScreen(gx, 0);
        ctx.moveTo(s.x, 0);
        ctx.lineTo(s.x, h);
      }
      for (let gy = startN; gy <= endN; gy += step) {
        const s = this._worldToScreen(0, gy);
        ctx.moveTo(0, s.y);
        ctx.lineTo(w, s.y);
      }
      ctx.stroke();

      // Etiquetas de coordenadas en los bordes
      for (let gx = startE; gx <= endE; gx += step) {
        const s = this._worldToScreen(gx, 0);
        if (s.x > 48 && s.x < w - 30) {
          ctx.fillText(`E ${gx.toFixed(step < 1 ? 1 : 0)}`, s.x + 4, h - 10);
        }
      }
      for (let gy = startN; gy <= endN; gy += step) {
        const s = this._worldToScreen(0, gy);
        if (s.y > 24 && s.y < h - 24) {
          ctx.fillText(`N ${gy.toFixed(step < 1 ? 1 : 0)}`, 8, s.y - 4);
        }
      }

      // Flecha Norte en esquina superior derecha
      ctx.save();
      ctx.translate(w - 42, 54);
      ctx.strokeStyle = isLight ? '#0f172a' : '#e2e8f0';
      ctx.fillStyle = isLight ? '#0f172a' : '#e2e8f0';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, 18); ctx.lineTo(0, -18);
      ctx.moveTo(0, -18); ctx.lineTo(-6, -6);
      ctx.moveTo(0, -18); ctx.lineTo(6, -6);
      ctx.stroke();
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('N', 0, -23);
      ctx.restore();

      const { points, closed, curves, auxLines, lotDivision } = this.lastData;
      if (!points || points.length === 0) {
        ctx.fillStyle = isLight ? '#64748b' : '#94a3b8';
        ctx.font = '14px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Ingrese una coordenada inicial o importe un archivo CSV/TXT para comenzar', w / 2, h / 2);
        return;
      }

      const metrics = C.polygonMetrics(points, closed && points.length >= 3);

      // Líneas auxiliares
      if (auxLines && auxLines.length > 0) {
        ctx.save();
        ctx.setLineDash([6, 5]);
        ctx.lineWidth = 1.6;
        for (const line of auxLines) {
          const a = this._worldToScreen(line.from.e, line.from.n);
          const b = this._worldToScreen(line.to.e, line.to.n);
          ctx.strokeStyle = line.color || '#f59e0b';
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Curvas horizontales
      if (curves && curves.length > 0) {
        for (const curve of curves) {
          const arc = curve.arcPoints || [];
          if (arc.length < 2) continue;
          ctx.save();
          ctx.strokeStyle = '#ec4899';
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          arc.forEach((p, idx) => {
            const s = this._worldToScreen(p.e, p.n);
            if (idx === 0) ctx.moveTo(s.x, s.y);
            else ctx.lineTo(s.x, s.y);
          });
          ctx.stroke();
          ctx.restore();
        }
      }

      // Polígono / Polilínea
      if (points.length >= 2) {
        ctx.save();
        ctx.beginPath();
        points.forEach((p, i) => {
          const s = this._worldToScreen(p.e, p.n);
          if (i === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        });
        if (closed && points.length >= 3) {
          ctx.closePath();
          ctx.fillStyle = isLight ? 'rgba(16, 185, 129, 0.16)' : 'rgba(0, 229, 160, 0.16)';
          ctx.fill();
          ctx.strokeStyle = isLight ? '#059669' : '#00e5a0';
        } else {
          ctx.strokeStyle = isLight ? '#0284c7' : '#38bdf8';
        }
        ctx.lineWidth = 2.6;
        ctx.stroke();
        ctx.restore();
      }

      // Lotes subdivididos en CAD Canvas
      if (lotDivision && lotDivision.ok) {
        const lotFills = [
          'rgba(56, 189, 248, 0.16)',
          'rgba(245, 158, 11, 0.16)',
          'rgba(168, 85, 247, 0.16)',
          'rgba(16, 185, 129, 0.16)',
          'rgba(244, 63, 94, 0.16)'
        ];
        (lotDivision.lots || []).forEach((lot, idx) => {
          if (lot.points && lot.points.length >= 3) {
            ctx.save();
            ctx.beginPath();
            lot.points.forEach((p, i) => {
              const s = this._worldToScreen(p.e, p.n);
              if (i === 0) ctx.moveTo(s.x, s.y);
              else ctx.lineTo(s.x, s.y);
            });
            ctx.closePath();
            ctx.fillStyle = lotFills[idx % lotFills.length];
            ctx.fill();
            ctx.restore();
          }
          if (lot.centroid) {
            const c = this._worldToScreen(lot.centroid.e, lot.centroid.n);
            ctx.save();
            ctx.textAlign = 'center';
            ctx.font = 'bold 12px system-ui, sans-serif';
            ctx.fillStyle = isLight ? '#92400e' : '#fde68a';
            ctx.fillText(lot.name, c.x, c.y - 3);
            ctx.font = '11px ui-monospace, monospace';
            ctx.fillText(`${lot.areaM2.toFixed(2)} m²`, c.x, c.y + 12);
            ctx.restore();
          }
        });
        (lotDivision.cutLines || []).forEach((cl) => {
          const a = this._worldToScreen(cl.from.e, cl.from.n);
          const b = this._worldToScreen(cl.to.e, cl.to.n);
          ctx.save();
          ctx.setLineDash([7, 5]);
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          ctx.restore();
        });
      }

      // Etiquetas de Rumbo y Distancia
      if (this.showLabels && metrics.legs.length > 0) {
        ctx.save();
        ctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.textAlign = 'center';
        for (const leg of metrics.legs) {
          const a = this._worldToScreen(leg.from.e, leg.from.n);
          const b = this._worldToScreen(leg.to.e, leg.to.n);
          const lenPx = Math.hypot(b.x - a.x, b.y - a.y);
          if (lenPx < 28) continue;
          let angle = Math.atan2(b.y - a.y, b.x - a.x);
          if (angle > Math.PI / 2) angle -= Math.PI;
          if (angle < -Math.PI / 2) angle += Math.PI;

          ctx.save();
          ctx.translate((a.x + b.x) / 2, (a.y + b.y) / 2);
          ctx.rotate(angle);
          ctx.fillStyle = isLight ? '#0f172a' : '#e2e8f0';
          ctx.fillText(leg.bearing, 0, -7);
          ctx.fillStyle = isLight ? '#0369a1' : '#38bdf8';
          ctx.fillText(`${leg.dist.toFixed(2)} m`, 0, 14);
          ctx.restore();
        }
        ctx.restore();
      }

      // Área en centroide
      if (closed && points.length >= 3 && metrics.centroid && metrics.areaM2 > 0 && !(lotDivision && lotDivision.ok)) {
        const c = this._worldToScreen(metrics.centroid.e, metrics.centroid.n);
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.fillStyle = isLight ? '#065f46' : '#6ee7b7';
        ctx.fillText(`${metrics.areaM2.toLocaleString('en-US', { maximumFractionDigits: 2 })} m²`, c.x, c.y - 3);
        ctx.font = '11px ui-monospace, monospace';
        ctx.fillStyle = isLight ? '#047857' : '#a7f3d0';
        ctx.fillText(`(${metrics.areaHa.toFixed(4)} ha)`, c.x, c.y + 13);
        ctx.restore();
      }

      // Vértices (con aro resaltado si editMode está activo)
      points.forEach((p, idx) => {
        const s = this._worldToScreen(p.e, p.n);
        const isFirst = idx === 0;
        if (this.editMode) {
          ctx.beginPath();
          ctx.arc(s.x, s.y, 11, 0, Math.PI * 2);
          ctx.fillStyle = isFirst ? 'rgba(0, 229, 160, 0.25)' : 'rgba(245, 158, 11, 0.28)';
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(s.x, s.y, this.editMode ? 7.5 : (isFirst ? 6.5 : 5), 0, Math.PI * 2);
        ctx.fillStyle = this.editMode ? (isFirst ? '#00e5a0' : '#f59e0b') : (isFirst ? '#f59e0b' : '#38bdf8');
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = this.editMode ? '#ffffff' : (isLight ? '#ffffff' : '#0b1120');
        ctx.stroke();

        if (this.showLabels) {
          ctx.font = 'bold 11.5px ui-monospace, monospace';
          ctx.fillStyle = isLight ? '#0f172a' : '#f8fafc';
          ctx.textAlign = 'left';
          ctx.fillText(p.id, s.x + 9, s.y - 6);
        }
      });
    }
  }

  global.TopoMapEngine = TopoMapEngine;
})(window);
