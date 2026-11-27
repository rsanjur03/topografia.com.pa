/**
 * share.js — Guardado local ("Mis Planos") y Enlaces Compartibles sin servidor (#p=...)
 * Empaqueta el polígono, CRS, mapa base, hojas IGN activas, lotes, colindantes y datos ANATI
 * en un enlace comprimido (deflate-raw + Base64URL) que funciona 100% estático en GitHub Pages.
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'topo_saved_projects_v1';

  // ==================== BASE64URL HELPERS ====================
  function bytesToBase64Url(bytes) {
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function base64UrlToBytes(str) {
    let b64 = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function compressBytes(bytes) {
    if (typeof CompressionStream === 'undefined') return null;
    try {
      const cs = new CompressionStream('deflate-raw');
      const writer = cs.writable.getWriter();
      writer.write(bytes);
      writer.close();
      const buf = await new Response(cs.readable).arrayBuffer();
      return new Uint8Array(buf);
    } catch {
      return null;
    }
  }

  async function decompressBytes(bytes) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Tu navegador no soporta DecompressionStream para abrir enlaces comprimidos.');
    }
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const buf = await new Response(ds.readable).arrayBuffer();
    return new Uint8Array(buf);
  }

  // ==================== COMPACTACIÓN DEL PROYECTO ====================
  function compactPayload(payload) {
    const out = {
      v: 1,
      n: payload.projectName || 'Plano_ANATI',
      c: payload.crsMode === 'local' ? 'local' : (payload.utmZone === 18 ? 'utm18N' : 'utm17N'),
      cl: payload.closed ? 1 : 0,
      bm: payload.basemap || 'satellite',
      p: (payload.points || []).map(pt => {
        const row = [
          String(pt.id || ''),
          Number(Number(pt.e).toFixed(4)),
          Number(Number(pt.n).toFixed(4))
        ];
        const z = Number(pt.z) || 0;
        const d = (pt.desc || '').trim();
        if (z !== 0 || d) row.push(Number(z.toFixed(3)));
        if (d) row.push(d);
        return row;
      })
    };

    if (payload.ign && Array.isArray(payload.ign.codes) && payload.ign.codes.length > 0) {
      out.ign = { c: payload.ign.codes, o: Number((payload.ign.opacity ?? 0.85).toFixed(2)) };
    }
    if (payload.lotDivision && payload.lotDivision.numLots >= 2) {
      out.lt = { n: payload.lotDivision.numLots, a: Number(Number(payload.lotDivision.cutAzimuth || 0).toFixed(6)) };
    }
    if (payload.boundaries && Object.keys(payload.boundaries).length > 0) {
      const cleanBnd = {};
      for (const [k, v] of Object.entries(payload.boundaries)) {
        if (v && v.type && v.type !== 'none') cleanBnd[k] = v;
      }
      if (Object.keys(cleanBnd).length > 0) out.b = cleanBnd;
    }
    if (payload.anati) {
      const cleanA = {};
      for (const [k, v] of Object.entries(payload.anati)) {
        if (v === null || v === undefined || v === '') continue;
        if (Array.isArray(v) && v.length === 0) continue;
        cleanA[k] = v;
      }
      if (Object.keys(cleanA).length > 0) out.a = cleanA;
    }
    if (payload.tiePoints && payload.tiePoints.length > 0) {
      out.t = payload.tiePoints.map(tp => [Math.round(tp.e), Math.round(tp.n)]);
    }
    return out;
  }

  function expandPayload(raw) {
    if (!raw || typeof raw !== 'object') return null;
    // Soporta tanto formato compacto (v:1) como formato expandido (.topo.json)
    if (Array.isArray(raw.points) && !raw.p) return raw;
    if (!Array.isArray(raw.p)) return null;

    const crs = raw.c || 'utm17N';
    const crsMode = crs === 'local' ? 'local' : 'utm';
    const utmZone = crs === 'utm18N' ? 18 : 17;

    return {
      version: raw.v || 1,
      projectName: raw.n || 'Plano_Compartido',
      crsMode,
      utmZone,
      utmHemi: 'N',
      closed: raw.cl !== 0,
      basemap: raw.bm || 'satellite',
      points: raw.p.map((row, idx) => ({
        id: String(row[0] || (idx + 1)),
        e: Number(row[1]) || 0,
        n: Number(row[2]) || 0,
        z: row[3] !== undefined ? (Number(row[3]) || 0) : 0,
        desc: row[4] !== undefined ? String(row[4]) : ''
      })),
      ign: raw.ign ? { codes: raw.ign.c || [], opacity: raw.ign.o ?? 0.85 } : null,
      lotDivision: raw.lt ? { numLots: Number(raw.lt.n) || 2, cutAzimuth: Number(raw.lt.a) || 0 } : null,
      boundaries: raw.b || {},
      anati: raw.a || null,
      tiePoints: Array.isArray(raw.t) ? raw.t.map(pair => ({ e: Number(pair[0]), n: Number(pair[1]) })) : []
    };
  }

  // ==================== ENLACE COMPARTIBLE (#p=...) ====================
  async function encodeProjectToUrl(payload) {
    const compact = compactPayload(payload);
    const jsonStr = JSON.stringify(compact);
    const utf8 = new TextEncoder().encode(jsonStr);
    const compressed = await compressBytes(utf8);

    let token;
    let method;
    if (compressed && compressed.length < utf8.length) {
      token = 'z.' + bytesToBase64Url(compressed);
      method = 'deflate';
    } else {
      token = 'j.' + bytesToBase64Url(utf8);
      method = 'base64';
    }

    const baseUrl = `${global.location.origin}${global.location.pathname}`;
    const url = `${baseUrl}#p=${token}`;
    return {
      url,
      hash: `#p=${token}`,
      length: url.length,
      rawBytes: utf8.length,
      encodedBytes: token.length,
      method
    };
  }

  async function decodeProjectFromHash(hashStr = global.location.hash) {
    const h = String(hashStr || '').trim();
    const m = h.match(/[#&?]p=([zj]\.[A-Za-z0-9_-]+)/);
    if (!m) return null;

    const token = m[1];
    const kind = token[0];
    const b64 = token.slice(2);
    const bytes = base64UrlToBytes(b64);

    let utf8Bytes = bytes;
    if (kind === 'z') {
      utf8Bytes = await decompressBytes(bytes);
    }
    const jsonStr = new TextDecoder().decode(utf8Bytes);
    const parsed = JSON.parse(jsonStr);
    return expandPayload(parsed);
  }

  // ==================== BIBLIOTECA LOCAL ("MIS PLANOS") ====================
  function listProjects() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)) : [];
    } catch {
      return [];
    }
  }

  function persistProjects(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  function saveProject(name, payload, areaM2 = 0) {
    const cleanName = String(name || payload.projectName || 'Plano sin título').trim();
    const list = listProjects();
    const now = Date.now();
    const existingIdx = list.findIndex(item => item.name.toLowerCase() === cleanName.toLowerCase());
    const record = {
      id: existingIdx >= 0 ? list[existingIdx].id : `proj_${now}_${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName,
      updatedAt: now,
      pointsCount: (payload.points || []).length,
      areaM2: Number(areaM2) || 0,
      crsMode: payload.crsMode || 'utm',
      utmZone: payload.utmZone || 17,
      payload: { ...payload, projectName: cleanName }
    };
    if (existingIdx >= 0) list[existingIdx] = record;
    else list.unshift(record);
    persistProjects(list);
    return record;
  }

  function deleteProject(id) {
    const next = listProjects().filter(item => item.id !== id);
    persistProjects(next);
    return next;
  }

  function exportProjectJson(payload) {
    return JSON.stringify({
      format: 'topografia.com.pa/project/v1',
      exportedAt: new Date().toISOString(),
      project: payload
    }, null, 2);
  }

  function parseProjectJson(text) {
    const obj = JSON.parse(text);
    const inner = obj && obj.project ? obj.project : obj;
    return expandPayload(inner);
  }

  global.TopoShare = {
    encodeProjectToUrl,
    decodeProjectFromHash,
    listProjects,
    saveProject,
    deleteProject,
    exportProjectJson,
    parseProjectJson
  };
})(window);
