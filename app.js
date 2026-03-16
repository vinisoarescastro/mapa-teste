// ===== GLOBALS =====
const items = DATA.items;
const colors = DATA.colors;
const stats = DATA.stats;

let activeRegionals = new Set();
let polygonLayers = [];
let searchTerm = '';
let somenteVinculados = false;

// ===== HELPERS =====
const fmtNum = (n) => n ? n.toLocaleString('pt-BR') : '-';
const fmtBRL  = (n) => n ? 'R$ ' + n.toLocaleString('pt-BR', {minimumFractionDigits:0, maximumFractionDigits:0}) + ' mi' : '-';
const fmtArea = (n) => n ? (n / 10000).toLocaleString('pt-BR', {minimumFractionDigits:0, maximumFractionDigits:0}) + ' ha' : '-';

function isLinked(item) {
  return !!(item.e && item.e.regional !== null && item.e.regional !== undefined);
}

function getCentroid(item) {
  if (item.c) return item.c;
  if (item.p && item.p.length > 0 && item.p[0].length > 0) {
    const coords = item.p[0];
    const lat = coords.reduce((s, c) => s + c[0], 0) / coords.length;
    const lng = coords.reduce((s, c) => s + c[1], 0) / coords.length;
    return [lat, lng];
  }
  return null;
}

// ===== STATS =====
document.getElementById('statsGrid').innerHTML = `
  <div class="stat-card stat-card-emp"><div class="val">230</div><div class="label">Empreendimentos</div></div>
  <div class="stat-card"><div class="val green">122</div><div class="label">No Mapa (KML)</div></div>
  <div class="stat-card"><div class="val">${fmtNum(Math.round(stats.total_units))}</div><div class="label">Total Unidades</div></div>
  <div class="stat-card"><div class="val">${fmtArea(stats.total_area)}</div><div class="label">Área Total</div></div>
  <div class="stat-card"><div class="val green">${fmtBRL(stats.total_vgv)}</div><div class="label">VGV Total</div></div>
  <div class="stat-card"><div class="val green">${fmtBRL(stats.total_vgv_bt)}</div><div class="label">VGV Total BT</div></div>
`;

// ===== MAP INIT =====
const map = L.map('map', {zoomControl: false, attributionControl: false}).setView([-12, -50], 4);
L.control.zoom({position: 'topright'}).addTo(map);

// ===== TILE LAYERS =====
const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap', maxZoom: 19
}).addTo(map);

const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: '© Esri', maxZoom: 19
});

const terrainLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenTopoMap', maxZoom: 17, opacity: 0.7
});

const vegetationLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenTopoMap', maxZoom: 17, opacity: 0.55
});

const layerMap = {
  layerStreets: streetLayer,
  layerSatellite: satelliteLayer,
  layerTerrain: terrainLayer,
  layerVegetation: vegetationLayer
};

// ===== LAYER GROUPS =====
// Declarados logo após a criação do mapa, antes de qualquer função que os usa.
// Ambos adicionados ao mapa desde o início; a função applyZoomVisibility
// controla a visibilidade via CSS (display) para evitar piscar.
const ZOOM_THRESHOLD = 12; // zoom < 12 → marcadores de visão geral; zoom >= 12 → polígonos

const layerGroup    = L.layerGroup().addTo(map);
const overviewGroup = L.layerGroup().addTo(map);

// ===== LAYER TOGGLE LOGIC =====
function handleLayerToggle(id) {
  const cb = document.getElementById(id);
  const layer = layerMap[id];
  if (cb.checked) {
    if (id === 'layerStreets') {
      document.getElementById('layerSatellite').checked = false;
      map.removeLayer(satelliteLayer);
    } else if (id === 'layerSatellite') {
      document.getElementById('layerStreets').checked = false;
      map.removeLayer(streetLayer);
    }
    map.addLayer(layer);
    if (id === 'layerStreets' || id === 'layerSatellite') layer.bringToBack();
  } else {
    map.removeLayer(layer);
    if (id === 'layerStreets' && !document.getElementById('layerSatellite').checked) {
      cb.checked = true;
      return;
    }
    if (id === 'layerSatellite' && !document.getElementById('layerStreets').checked) {
      document.getElementById('layerStreets').checked = true;
      map.addLayer(streetLayer);
      streetLayer.bringToBack();
    }
  }
}

Object.keys(layerMap).forEach(id => {
  document.getElementById(id).addEventListener('change', () => handleLayerToggle(id));
});

// Layer panel collapse
let panelOpen = true;
document.getElementById('layerToggle').addEventListener('click', () => {
  panelOpen = !panelOpen;
  document.getElementById('layerBody').classList.toggle('collapsed', !panelOpen);
  document.getElementById('chevron').innerHTML = panelOpen ? '&#9660;' : '&#9654;';
});

// ===== MOBILE SIDEBAR DRAWER =====
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebarOverlay');
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const sidebarCloseBtn = document.getElementById('sidebarClose');

function openSidebar() {
  sidebar.classList.add('open');
  overlay.classList.add('visible');
  document.body.style.overflow = 'hidden';
}
function closeSidebar() {
  sidebar.classList.remove('open');
  overlay.classList.remove('visible');
  document.body.style.overflow = '';
}

if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', openSidebar);
if (overlay) overlay.addEventListener('click', closeSidebar);
if (sidebarCloseBtn) sidebarCloseBtn.addEventListener('click', closeSidebar);

// ===== FILTER CHIPS =====
const allRegionals = [...new Set(
  items.filter(i => isLinked(i)).map(i => i.e.regional).filter(Boolean).filter(r => r !== 'None')
)].sort();

const chipsEl = document.getElementById('filterChips');
const allChip = document.createElement('div');
allChip.className = 'chip active';
allChip.textContent = 'Todos';
allChip.onclick = () => {
  activeRegionals.clear();
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  allChip.classList.add('active');
  updateMap();
};
chipsEl.appendChild(allChip);

const vinculadosChip = document.createElement('div');
vinculadosChip.className = 'chip';
vinculadosChip.innerHTML = `<span class="dot" style="background:#27ae60"></span>Vinculados`;
vinculadosChip.onclick = () => {
  somenteVinculados = !somenteVinculados;
  vinculadosChip.classList.toggle('active', somenteVinculados);
  updateMap();
};
chipsEl.appendChild(vinculadosChip);

allRegionals.forEach(r => {
  const chip = document.createElement('div');
  chip.className = 'chip';
  chip.innerHTML = `<span class="dot" style="background:${colors[r] || '#7f8c8d'}"></span>${r}`;
  chip.onclick = () => {
    if (activeRegionals.has(r)) {
      activeRegionals.delete(r);
      chip.classList.remove('active');
    } else {
      activeRegionals.add(r);
      chip.classList.add('active');
    }
    allChip.classList.toggle('active', activeRegionals.size === 0);
    updateMap();
  };
  chipsEl.appendChild(chip);
});

// ===== SEARCH =====
document.getElementById('searchInput').addEventListener('input', (e) => {
  searchTerm = e.target.value.toUpperCase();
  updateMap();
});

// ===== POPUP CONTENT =====
function popupContent(item) {
  if (!isLinked(item)) {
    return `
      <div class="popup-title">${item.n}</div>
      <div class="popup-nodata">Área KML sem dados da planilha vinculados</div>`;
  }
  const e = item.e;
  return `
    <div class="popup-city">${e.regional || ''} · ${e.cidade || ''}</div>
    <div class="popup-title">${e.empreendimento || e.nome}</div>
    <div class="popup-grid">
      <div><div class="pg-label">Tipo</div><div class="pg-val">${e.tipo || '-'}</div></div>
      <div><div class="pg-label">Ano</div><div class="pg-val">${e.year || '-'}</div></div>
      <div><div class="pg-label">Área Total</div><div class="pg-val">${fmtArea(e.area_total)}</div></div>
      <div><div class="pg-label">Unidades</div><div class="pg-val">${fmtNum(e.total_unidades)}</div></div>
      <div><div class="pg-label">VGV Total</div><div class="pg-val">${fmtBRL(e.vgv_total)}</div></div>
      <div><div class="pg-label">VGV BT</div><div class="pg-val">${fmtBRL(e.vgv_bt)}</div></div>
      <div><div class="pg-label">Custo Terreno</div><div class="pg-val">${fmtBRL(e.custo_terreno)}</div></div>
      <div><div class="pg-label">Custo Construção</div><div class="pg-val">${fmtBRL(e.custo_construcao)}</div></div>
      <div><div class="pg-label">Part. Buriti</div><div class="pg-val">${e.participacao_buriti ? (e.participacao_buriti * 100).toFixed(1) + '%' : '-'}</div></div>
      <div><div class="pg-label">Status</div><div class="pg-val">${e.on_off === 1 ? '🟢 ON' : '🔴 OFF'}</div></div>
    </div>`;
}

// ===== FILTER LOGIC =====
function passesFilter(item) {
  if (somenteVinculados && !isLinked(item)) return false;
  if (activeRegionals.size > 0) {
    const r = isLinked(item) ? item.e.regional : null;
    if (!r || !activeRegionals.has(r)) return false;
  }
  if (searchTerm) {
    const haystack = [
      item.n,
      item.e ? item.e.nome : '',
      item.e ? item.e.cidade : '',
      item.e ? item.e.empreendimento : '',
      item.e ? item.e.regional : ''
    ].join(' ').toUpperCase();
    if (!haystack.includes(searchTerm)) return false;
  }
  return true;
}

function getColor(item) {
  if (isLinked(item)) return colors[item.e.regional] || '#7f8c8d';
  return '#94a3b8';
}

// ===== OVERVIEW MARKERS =====

/**
 * Cria um ícone HTML puro com um pino estilizado na cor da regional.
 * Usar divIcon com HTML/CSS é mais confiável cross-browser do que SVG inline.
 */
function makeOverviewIcon(color) {
  return L.divIcon({
    className: '', // sem classe no wrapper externo para evitar reset de estilos do Leaflet
    html: `<div class="ov-pin" style="--pin-color:${color}"></div>`,
    iconSize:   [24, 32],
    iconAnchor: [12, 32],
    tooltipAnchor: [0, -34],
  });
}

/**
 * Reconstrói todos os marcadores de visão geral respeitando os filtros ativos.
 */
function buildOverviewMarkers() {
  overviewGroup.clearLayers();

  items.forEach((item) => {
    if (!passesFilter(item)) return;
    const centroid = getCentroid(item);
    if (!centroid) return;

    const color    = getColor(item);
    const linked   = isLinked(item);
    const name     = linked ? (item.e.empreendimento || item.e.nome || item.n) : item.n;
    const city     = linked ? (item.e.cidade   || '') : '';
    const regional = linked ? (item.e.regional || '') : '';
    const units    = linked && item.e.total_unidades
      ? fmtNum(item.e.total_unidades) + ' unidades'
      : '';

    const marker = L.marker(centroid, {
      icon: makeOverviewIcon(color),
      zIndexOffset: 200,
    });

    marker.bindTooltip(`
      <div class="ov-tooltip">
        ${regional ? `<span class="ov-tag" style="background:${color}">${regional}</span>` : ''}
        <strong>${name}</strong>
        ${city  ? `<div class="ov-city">${city}</div>`   : ''}
        ${units ? `<div class="ov-units">${units}</div>` : ''}
        <div class="ov-hint">Clique para aproximar</div>
      </div>`, {
      direction: 'top',
      className: 'ov-tooltip-outer',
      offset: [0, -4],
    });

    marker.on('click', () => {
      map.flyTo(centroid, 13, { duration: 1.2, easeLinearity: 0.35 });
    });

    overviewGroup.addLayer(marker);
  });
}

/**
 * Controla quais camadas ficam visíveis de acordo com o zoom atual.
 * zoom < ZOOM_THRESHOLD  → marcadores de visão geral
 * zoom >= ZOOM_THRESHOLD → polígonos detalhados
 *
 * Usa getPane().style para ocultar o container inteiro de cada grupo,
 * o que é mais simples e confiável do que iterar sobre cada layer.
 */
function applyZoomVisibility() {
  const isOverview = map.getZoom() < ZOOM_THRESHOLD;

  // Obtém o elemento pai dos marcadores de cada layerGroup
  // Leaflet coloca markers em .leaflet-marker-pane e vectors em .leaflet-overlay-pane
  // Como ambos os grupos usam o mesmo pane, precisamos usar classes CSS nos próprios elementos.
  // A forma mais simples: setar display nos containers dos layers via eachLayer.

  overviewGroup.eachLayer(l => {
    const el = l.getElement ? l.getElement() : null;
    if (el) el.style.display = isOverview ? '' : 'none';
  });

  layerGroup.eachLayer(l => {
    // circleMarkers e polygons têm getElement()
    const el = l.getElement ? l.getElement() : null;
    if (el) el.style.display = isOverview ? 'none' : '';
  });
}

map.on('zoomend', applyZoomVisibility);

// ===== RENDER MAP + LIST =====
function updateMap() {
  layerGroup.clearLayers();
  polygonLayers = [];
  const listEl = document.getElementById('listContainer');
  listEl.innerHTML = '';
  let visibleCount = 0;

  items.forEach((item, idx) => {
    if (!passesFilter(item)) return;
    visibleCount++;
    const color = getColor(item);
    const centroid = getCentroid(item);

    // Polígonos
    item.p.forEach(polyCoords => {
      const polygon = L.polygon(polyCoords, {
        color: color, weight: 2.5, opacity: 0.9,
        fillColor: color, fillOpacity: 0.18, smoothFactor: 1
      });
      polygon.bindPopup(popupContent(item), {maxWidth: 320});
      polygon.addTo(layerGroup);
      polygonLayers.push({layer: polygon, item: item, idx: idx, centroid: centroid});
    });

    // Marcador de centroide para itens sem polígono
    if (item.p.length === 0 && centroid) {
      const marker = L.circleMarker(centroid, {
        radius: 7, color: color, fillColor: color, fillOpacity: 0.5, weight: 2.5
      });
      marker.bindPopup(popupContent(item), {maxWidth: 320});
      marker.addTo(layerGroup);
      polygonLayers.push({layer: marker, item: item, idx: idx, centroid: centroid, isMarker: true});
    }

    // Lista lateral
    const div = document.createElement('div');
    div.className = 'list-item';

    const linked = isLinked(item);
    const displayName = linked ? (item.e.empreendimento || item.e.nome || item.n) : item.n;
    const cityText    = linked ? (item.e.cidade || '') : '';
    const regional    = linked ? (item.e.regional || '') : '';
    const unitsText   = linked && item.e.total_unidades ? fmtNum(item.e.total_unidades) + ' un.' : '';
    const hasLocation = !!(centroid);

    div.innerHTML = `
      <div class="meta">
        ${regional ? `<span class="regional-tag" style="background:${colors[regional] || '#7f8c8d'}">${regional}</span>` : ''}
        ${cityText ? `<span>${cityText}</span>` : ''}
        ${unitsText ? `<span>${unitsText}</span>` : ''}
        ${!linked ? '<span class="no-match">sem dados</span>' : ''}
        ${!hasLocation ? '<span class="no-match" title="Sem coordenadas cadastradas">📍 sem localização</span>' : ''}
        <div class="name" title="${item.n}">${displayName}</div>
      </div>`;

    div.onclick = () => {
      if (centroid) {
        map.flyTo(centroid, 14, {duration: 1});
        const pl = polygonLayers.find(p => p.idx === idx);
        if (pl) setTimeout(() => pl.layer.openPopup(centroid), 600);
      }
      document.querySelectorAll('.list-item').forEach(el => el.classList.remove('highlight'));
      div.classList.add('highlight');
      if (window.innerWidth <= 768) closeSidebar();
    };

    listEl.appendChild(div);
  });

  document.getElementById('counter').textContent = visibleCount + ' de ' + items.length + ' terrenos';

  // Reconstrói marcadores e aplica visibilidade após o Leaflet renderizar os elementos
  buildOverviewMarkers();
  setTimeout(applyZoomVisibility, 0);
}

// Initial render
updateMap();

// Fix Leaflet map size on resize
window.addEventListener('resize', () => {
  setTimeout(() => map.invalidateSize(), 100);
});