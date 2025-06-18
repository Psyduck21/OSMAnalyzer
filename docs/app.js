import { initWasm } from './wasmloader.js';

const startInput = document.getElementById('start-input');
const endInput = document.getElementById('end-input');
const startList = document.getElementById('start-list');
const endList = document.getElementById('end-list');
const locBtn = document.getElementById('loc-btn');
const findBtn = document.getElementById('find-btn');
const critBtn = document.getElementById('crit-btn');
const algoSelect = document.getElementById('algo-select');
const outputDiv = document.getElementById('log-footer');
const rdetails = document.getElementById('rdetails');
const cdetails = document.getElementById('cdetails');
const rightPanel = document.getElementById('right-panel');

// Global variables
let locations = {};
let wasmAPI;
let startMarker = null;
let endMarker = null;
let startCoordinates = null;
let endCoordinates = null;
let routeLines = [];
let routeMarkers = [];
let criticalMarkers = [];
let criticalPointsGroup = null;
let clickCount = 0;
let isManualSelection = false;

// Map initialization
const dehradunBounds = L.latLngBounds([30.26, 77.95], [30.38, 78.10]);
const map = L.map('map', {
  center: [30.3165, 78.0322],
  zoom: 13,
  minZoom: 13,
  maxZoom: 19,
  maxBounds: dehradunBounds,
  maxBoundsViscosity: 1.0,
  zoomControl: true,
  scrollWheelZoom: true
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const legend = L.control({ position: 'bottomleft' });
legend.onAdd = function (map) {
  const div = L.DomUtil.create('div', 'critical-legend');
  div.innerHTML = `
        <div style="
          background: rgba(255, 255, 255, 0.95);
          padding: 12px;
          border-radius: 8px;
          box-shadow: 0 3px 10px rgba(0, 0, 0, 0.3);
          border-left: 4px solid #FF1744;
          font-size: 12px;
        ">
          <h4 style="margin: 0 0 8px 0; color: #333;">⚠️ Critical Points</h4>
          <div style="display: flex; align-items: center; margin-bottom: 4px;">
            <div style="
              width: 12px; 
              height: 12px; 
              border-radius: 50%; 
              background: linear-gradient(135deg, #FF1744, #FF1744cc);
              margin-right: 8px;
              border: 1px solid white;
            "></div>
            <span>Network Vulnerability Points</span>
          </div>
          <div style="font-size: 10px; color: #666; margin-top: 6px;">
            Points where network disruption<br>would significantly impact connectivity
          </div>
        </div>
      `;
  return div;
};

legend.addTo(map);

// Enhanced route styling configuration
const routeStyles = [
  {
    color: '#007FFF',
    weight: 8,
    opacity: 0.95,
    dashArray: null,
    label: 'Optimal Route',
    icon: '🏆',
    priority: 'Best',
    shadowColor: '#6f42c140'
  },
  {
    color: '#fd7e14',
    weight: 6,
    opacity: 0.85,
    dashArray: '12, 8',
    label: 'Alternative 1',
    icon: '🥈',
    priority: 'Good',
    shadowColor: '#fd7e1440'
  },
  {
    color: '#28a745',
    weight: 5,
    opacity: 0.8,
    dashArray: '18, 12',
    label: 'Alternative 2',
    icon: '🥉',
    priority: 'Fair',
    shadowColor: '#28a74540'
  },
  {
    color: '#dc3545',
    weight: 4,
    opacity: 0.75,
    dashArray: '8, 20',
    label: 'Alternative 3',
    icon: '⚠️',
    priority: 'Backup',
    shadowColor: '#dc354540'
  }
];

// Enhanced marker creation with better styling
function createEnhancedMarker(coords, type, label = '') {
  const isStart = type === 'start';
  const color = isStart ? '#28a745' : '#dc3545';
  const emoji = isStart ? '🚀' : '🎯';
  const title = isStart ? 'Start Point' : 'Destination';

  const marker = L.marker(coords, {
    icon: L.divIcon({
      html: `
        <div class="enhanced-marker ${type}-marker" style="
          background: linear-gradient(135deg, ${color}dd, ${color});
          color: white;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          border: 4px solid white;
          box-shadow: 0 4px 15px rgba(0,0,0,0.4), 0 0 0 3px ${color}40;
          position: relative;
          z-index: 1000;
        ">
          ${emoji}
          <div style="
            position: absolute;
            top: -8px;
            right: -8px;
            width: 16px;
            height: 16px;
            background: white;
            border-radius: 50%;
            border: 2px solid ${color};
            animation: pulse 2s infinite;
          "></div>
        </div>
      `,
      className: `enhanced-marker-icon ${type}-marker-icon`, // FIXED TEMPLATE STRING
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    })
  }).bindPopup(`
    <div class="marker-popup" style="text-align: center; padding: 12px; min-width: 200px;">
      <h4 style="margin: 0 0 8px 0; color: ${color}; font-size: 16px;">
        ${emoji} ${title}
      </h4>
      <div style="font-size: 13px; color: #666; margin-bottom: 8px;">
        ${label || `${coords[0].toFixed(6)}, ${coords[1].toFixed(6)}`}
      </div>
      <div style="
        font-size: 11px; 
        color: ${color}; 
        background: ${color}20; 
        padding: 4px 8px; 
        border-radius: 12px;
        display: inline-block;
      ">
        ${isStart ? 'Journey Begins Here' : 'Final Destination'}
      </div>
    </div>
  `);

  return marker;
}

// Clear all routes and markers
function clearAllRoutes() {
  routeLines.forEach(line => {
    if (map.hasLayer(line)) {
      map.removeLayer(line);
    }
  });
  routeLines = [];

  routeMarkers.forEach(marker => {
    if (map.hasLayer(marker)) {
      map.removeLayer(marker);
    }
  });
  routeMarkers = [];
}

// Enhanced route details panel with better comparison
function createRouteDetailsPanel(routes, executionTime, startLabel, endLabel) {
  let detailsHTML = `
    <div class="route-analysis-header" style="
      background: linear-gradient(135deg, #f8f9fa, #e9ecef);
      padding: 18px;
      border-radius: 12px;
      margin-bottom: 18px;
      border-left: 5px solid #007bff;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    ">
      <h3 style="margin: 0 0 12px 0; color: #007bff; display: flex; align-items: center; font-size: 18px;">
        <i class="fas fa-route" style="margin-right: 10px;"></i> K-Shortest Paths Analysis
      </h3>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px;">
        <div><strong>From:</strong> <span style="color: #28a745;">${startLabel}</span></div>
        <div><strong>To:</strong> <span style="color: #dc3545;">${endLabel}</span></div>
        <div><strong>Routes Found:</strong> <span style="color: #007bff;">${routes.length}</span></div>
        <div><strong>Execution Time:</strong> <span style="color: #6c757d;">${executionTime}ms</span></div>
      </div>
    </div>
  `;

  routes.forEach((route, index) => {
    const style = routeStyles[index];
    const distance = (route.distance / 1000).toFixed(2);
    const difference = index === 0 ? 0 : ((route.distance - routes[0].distance) / 1000).toFixed(2);
    const percentDiff = index === 0 ? 0 : (((route.distance - routes[0].distance) / routes[0].distance) * 100).toFixed(1);

    detailsHTML += `
      <div class="route-card" data-route-index="${index}" style="
        background: white;
        border: 3px solid ${style.color};
        border-radius: 12px;
        padding: 16px;
        margin-bottom: 12px;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 3px 12px rgba(0, 0, 0, 0.15);
        position: relative;
        overflow: hidden;
      "
      onmouseover="this.style.transform='translateY(-3px) scale(1.02)'; this.style.boxShadow='0 8px 25px rgba(0,0,0,0.25)';"
      onmouseout="this.style.transform='translateY(0px) scale(1)'; this.style.boxShadow='0 3px 12px rgba(0,0,0,0.15)';"
      >
        <div style="
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          background: linear-gradient(90deg, ${style.color}, ${style.color}80);
        "></div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h4 style="margin: 0; color: ${style.color}; display: flex; align-items: center; font-size: 16px;">
            <span style="font-size: 20px; margin-right: 8px;">${style.icon}</span>
            ${style.label}
          </h4>
          <span style="
            background: linear-gradient(135deg, ${style.color}, ${style.color}dd);
            color: white;
            padding: 4px 12px;
            border-radius: 16px;
            font-size: 11px;
            font-weight: bold;
            box-shadow: 0 2px 6px ${style.shadowColor};
          ">${style.priority}</span>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px; margin-bottom: 12px;">
          <div style="display: flex; flex-direction: column;">
            <strong style="color: #495057;">Distance</strong>
            <span style="font-size: 18px; font-weight: bold; color: ${style.color};">${distance} km</span>
          </div>
          <div style="display: flex; flex-direction: column;">
            <strong style="color: #495057;">Waypoints</strong>
            <span style="font-size: 16px; color: #6c757d;">${route.coordinates.length}</span>
          </div>
          ${index > 0 ? `
            <div style="display: flex; flex-direction: column;">
              <strong style="color: #dc3545;">Extra Distance</strong>
              <span style="color: #dc3545; font-weight: bold;">+${difference} km</span>
            </div>
            <div style="display: flex; flex-direction: column;">
              <strong style="color: #6c757d;">Percentage</strong>
              <span style="color: #6c757d;">(+${percentDiff}% longer)</span>
            </div>
          ` : `
            <div style="display: flex; flex-direction: column;">
              <strong style="color: #28a745;">Status</strong>
              <span style="color: #28a745; font-weight: bold;">Shortest Path</span>
            </div>
            <div style="display: flex; flex-direction: column;">
              <strong style="color: #28a745;">Rating</strong>
              <span style="color: #28a745;">⭐ Recommended</span>
            </div>
          `}
        </div>

        <div style="
          height: 6px;
          background: #f1f3f4;
          border-radius: 3px;
          overflow: hidden;
          position: relative;
        ">
          <div style="
            height: 100%;
            background: linear-gradient(90deg, ${style.color}, ${style.color}cc);
            width: ${index === 0 ? 100 : Math.max(25, 100 - (percentDiff * 1.5))}%;
            transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
          ">
            <div style="
              position: absolute;
              top: 0;
              right: 0;
              bottom: 0;
              width: 20px;
              background: linear-gradient(90deg, transparent, ${style.color}40);
            "></div>
          </div>
        </div>
      </div>
    `;
  });

  // Route comparison summary
  const shortest = routes[0].distance / 1000;
  const longest = routes[routes.length - 1].distance / 1000;
  const variation = ((longest - shortest) / shortest * 100).toFixed(1);

  detailsHTML += `
    <div style="
      background: linear-gradient(135deg, #17a2b8, #138496);
      color: white;
      padding: 16px;
      border-radius: 12px;
      text-align: center;
      margin-top: 18px;
      box-shadow: 0 4px 15px rgba(23, 162, 184, 0.3);
    ">
      <h4 style="margin: 0 0 10px 0; font-size: 16px;">📊 Route Comparison Summary</h4>
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; font-size: 12px;">
        <div>
          <div style="font-weight: bold;">Shortest</div>
          <div>${shortest.toFixed(2)} km</div>
        </div>
        <div>
          <div style="font-weight: bold;">Longest</div>
          <div>${longest.toFixed(2)} km</div>
        </div>
        <div>
          <div style="font-weight: bold;">Variation</div>
          <div>${variation}%</div>
        </div>
      </div>
    </div>
  `;

  return detailsHTML;
}

// Custom ResetControl for Leaflet
const ResetControl = L.Control.extend({
  options: { position: 'topleft' },
  onAdd: function (map) {
    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
    container.style.cssText = `
      background-color: white;
      width: 42px;
      height: 42px;
      border-radius: 50%;
      box-shadow: 0 3px 12px rgba(0, 0, 0, 0.3);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
    `;
    container.title = 'Reset Map';
    container.innerHTML = '<i class="fas fa-undo-alt" style="font-size:18px; color:#444;"></i>';

    container.addEventListener('mouseenter', () => {
      container.style.transform = 'scale(1.1)';
      container.style.boxShadow = '0 5px 20px rgba(0,0,0,0.4)';
    });
    container.addEventListener('mouseleave', () => {
      container.style.transform = 'scale(1)';
      container.style.boxShadow = '0 3px 12px rgba(0,0,0,0.3)';
    });

    L.DomEvent.disableClickPropagation(container);
    container.addEventListener('click', () => clearAll());

    return container;
  }
});

// Assuming 'map' is your Leaflet map instance
map.addControl(new ResetControl());


// UI helpers
function setUIEnabled(enabled) {
  [locBtn, findBtn, critBtn, algoSelect, startInput, endInput].forEach(el => {
    el.disabled = !enabled;
  });
}

function showLoading(msg = 'Loading...') {
  outputDiv.innerHTML = `
    <div style="color: #007bff; display: flex; align-items: center;">
      <i class="fas fa-spinner fa-spin" style="margin-right: 8px;"></i> ${msg}
    </div>
  `;
}

function clearLoading(msg = '') {
  outputDiv.innerHTML = msg || 'Ready...';
}

function showRightPanel() {
  rightPanel.classList.add('show');
}

function hideRightPanel() {
  rightPanel.classList.remove('show');
}

function populateList(list) {
  list.innerHTML = "";
  Object.keys(locations).forEach(place => {
    const option = document.createElement('option');
    option.value = place;
    list.appendChild(option);
  });
}

function populateDropdowns() {
  populateList(startList);
  populateList(endList);
}

function geoDistance(lat1, lon1, lat2, lon2) {
  return map.distance([lat1, lon1], [lat2, lon2]);
}

function clearAll() {
  hideRightPanel();
  clearAllRoutes();

  [startMarker, endMarker].forEach(m => {
    if (m && map.hasLayer(m)) map.removeLayer(m);
  });

  startMarker = null;
  endMarker = null;
  startCoordinates = null;
  endCoordinates = null;

  if (criticalPointsGroup && map.hasLayer(criticalPointsGroup)) {
    map.removeLayer(criticalPointsGroup);
  }

  // criticalMarkers.forEach(m => map.removeLayer(m));
  // criticalMarkers = [];

  rdetails.innerHTML = "Select start and end points to see route analysis.";
  cdetails.innerHTML = "Click on Critical Points button to analyze network vulnerabilities.";

  startInput.value = '';
  endInput.value = '';

  clearLoading('Ready to analyze routes...');
  clickCount = 0;
  isManualSelection = false;
  setUIEnabled(true);
}

function formatCoordinateDisplay(lat, lng) {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

function setupManualSelection() {
  clearAll();
  showRightPanel();
  isManualSelection = true;

  rdetails.innerHTML = `
    <div style="
      color: #007bff;
      padding: 15px;
      background: #f8f9fa;
      border-radius: 8px;
      border-left: 4px solid #007bff;
    ">
      <i class="fas fa-mouse-pointer" style="margin-right: 8px;"></i>
      <strong>Step 1:</strong> Click on the map to select your starting point
    </div>
  `;

  clickCount = 0;

  map.off('click');
  map.on('click', function handleMapClick(e) {
    const { lat, lng } = e.latlng;
    const coords = [lat, lng];
    const coordDisplay = formatCoordinateDisplay(lat, lng);

    if (clickCount === 0) {
      // Set start point
      if (startMarker) map.removeLayer(startMarker);
      startMarker = createEnhancedMarker(coords, 'start', coordDisplay);
      startMarker.addTo(map);

      startCoordinates = coords;
      startInput.value = coordDisplay;
      clickCount++;

      rdetails.innerHTML = `
        <div style="
          color: #28a745;
          padding: 12px;
          background: #f8f9fa;
          border-radius: 8px;
          border-left: 4px solid #28a745;
          margin-bottom: 10px;
        ">
          <i class="fas fa-check-circle" style="margin-right: 8px;"></i>
          <strong>Start point selected!</strong><br>
          <small>${coordDisplay}</small>
        </div>
        <div style="
          color: #007bff; 
          padding: 12px; 
          background: #f8f9fa; 
          border-radius: 8px; 
          border-left: 4px solid #007bff;
        ">
          <i class="fas fa-mouse-pointer" style="margin-right: 8px;"></i> 
          <strong>Step 2:</strong> Now click to select your destination
        </div>
      `;
    } else if (clickCount === 1) {
      // Set end point
      if (endMarker) map.removeLayer(endMarker);
      endMarker = createEnhancedMarker(coords, 'end', coordDisplay);
      endMarker.addTo(map);

      endCoordinates = coords;
      endInput.value = coordDisplay;

      map.off('click', handleMapClick);

      rdetails.innerHTML = `
        <div style="
          color: #28a745;
          padding: 15px;
          background: linear-gradient(135deg, #d4edda, #c3e6cb);
          border-radius: 10px;
          border-left: 4px solid #28a745;
          text-align: center;
        ">
          <i class="fas fa-check-circle" style="margin-right: 8px; font-size: 18px;"></i>
          <strong>Both points selected successfully!</strong><br>
          <div style="margin-top: 8px; font-size: 14px;">
            <div>🚀 Start: ${formatCoordinateDisplay(startCoordinates[0], startCoordinates[1])}</div>
            <div>🎯 End: ${formatCoordinateDisplay(endCoordinates[0], endCoordinates[1])}</div>
          </div>
          <div style="
            margin-top: 12px; 
            padding: 8px; 
            background: rgba(255,255,255,0.7); 
            border-radius: 6px;
            font-size: 13px;
          ">
            Click <strong>"Find Shortest Path"</strong> to calculate optimal routes
          </div>
        </div>
      `;
    }
  });
}
function highlightRoute(indexToHighlight) {
  for (let i = 0; i < routeLines.length; i++) {
    // Only modify the colored routeLine (odd indexes)
    if (i % 2 === 1) {
      const routeIndex = (i - 1) / 2;
      const routeLine = routeLines[i];
      const style = routeStyles[routeIndex] || routeStyles[0]; // fallback

      if (!routeLine) continue;

      if (routeIndex === indexToHighlight) {
        // Highlight this route
        routeLine.setStyle({
          color: style.color,
          weight: style.weight + 2,
          opacity: 1,
          dashArray: null,
        });
        routeLines[i].bringToFront();
      } else {
        // Fade out others
        routeLines[i].setStyle({
          weight: style.weight,
          color: '#aaa',
          opacity: 0.3,
          dashArray: '5, 10',
        });
      }
    }
  }
}




function determineCoordinatesAndLabels() {
  let startLat, startLon, endLat, endLon, startLabel, endLabel;

  if (isManualSelection && startCoordinates && endCoordinates) {
    // Use direct coordinates from map clicks
    [startLat, startLon] = startCoordinates;
    [endLat, endLon] = endCoordinates;
    startLabel = formatCoordinateDisplay(startLat, startLon);
    endLabel = formatCoordinateDisplay(endLat, endLon);
  } else {
    // Use locations from input fields
    const startPlace = startInput.value.trim();
    const endPlace = endInput.value.trim();

    if (!startPlace || !endPlace || !locations[startPlace] || !locations[endPlace]) {
      throw new Error("Please select valid start and end locations.");
    }

    [startLon, startLat] = locations[startPlace];
    [endLon, endLat] = locations[endPlace];
    startLabel = startPlace;
    endLabel = endPlace;
  }

  return { startLat, startLon, endLat, endLon, startLabel, endLabel };
}

async function calculateShortestPath() {
  try {
    if (criticalPointsGroup && map.hasLayer(criticalPointsGroup)) {
    map.removeLayer(criticalPointsGroup);
    }
    const { startLat, startLon, endLat, endLon, startLabel, endLabel } = determineCoordinatesAndLabels();
    const useAstar = algoSelect.value === 'astar' ? 1 : 0;

    setUIEnabled(false);
    showLoading('Calculating K-shortest paths with advanced algorithms...');
    showRightPanel();
    clearAllRoutes();

    const result = wasmAPI.findkShortestRoute(startLat, startLon, endLat, endLon, useAstar);
    // console.log('Route calculation result:', result);

    if (!result.yenKShortestPaths || !result.yenKShortestPaths.length) {
      rdetails.innerHTML = `
        <div style="
          color: #dc3545;
          padding: 15px;
          background: #f8d7da;
          border-radius: 8px;
          border-left: 4px solid #dc3545;
        ">
          <i class="fas fa-exclamation-triangle" style="margin-right: 8px;"></i>
          No K-shortest paths found between the selected points.
        </div>`;
      clearLoading('No paths found.');
      return;
    }

    const routes = result.yenKShortestPaths;
    // console.log(routes);
    const executionTime = result.executionTime || 0;

    const validRoutes = routes.filter(route => route.coordinates?.length);

    // Function to check if start/end are within 500 meters (overlapping)
    const areCoordinatesOverlapping = () =>
      geoDistance(startLat, startLon, endLat, endLon) < 500;

    const showOnlyOptimal = areCoordinatesOverlapping();
    const routesToDisplay = showOnlyOptimal ? validRoutes.slice(0, 1) : validRoutes;

    routesToDisplay.forEach((route, index) => {
      console.log(route.distance);
      const style = routeStyles[index];
      // console.log((route.coordinates.length / 1000));
      const shadowLine = L.polyline(route.coordinates, {
        weight: style.weight + 3,
        color: '#000',
        opacity: 0.2,
      });

      const routeLine = L.polyline(route.coordinates, {
        weight: style.weight,
        color: style.color,
        opacity: style.opacity,
        dashArray: style.dashArray,
        lineCap: 'round',
        lineJoin: 'round',
      }).bindPopup(`
        <div style="
          text-align: center;
          padding: 12px;
          min-width: 180px;
          background: linear-gradient(135deg, ${style.color}10, white);
        ">
          <h4 style="margin: 0 0 10px 0; color: ${style.color}; font-size: 16px;">
            ${style.icon} ${style.label}
          </h4>
          <div style="font-size: 13px;">
            <div><strong>Distance:</strong> ${(route.distance / 1000).toFixed(2)} km</div>
            <div><strong>Waypoints:</strong> ${route.coordinates.length}</div>
            <div><strong>Priority:</strong> <span style="color: ${style.color};">${style.priority}</span></div>
          </div>
        </div>
      `);

      routeLine.on('mouseover', function (e) {
        this.setStyle({ weight: style.weight + 2, opacity: 1 });
        this.openPopup(e.latlng);
      });

      routeLine.on('mouseout', function () {
        this.setStyle({ weight: style.weight, opacity: style.opacity });
        this.closePopup();
      });

      routeLine.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        highlightRoute(index);
      });

      shadowLine.addTo(map);
      routeLine.addTo(map);
      routeLines.push(shadowLine, routeLine);
    });

    if (!startMarker || !endMarker) {
      if (startMarker) map.removeLayer(startMarker);
      if (endMarker) map.removeLayer(endMarker);

      startMarker = createEnhancedMarker([startLat, startLon], 'start', startLabel);
      endMarker = createEnhancedMarker([endLat, endLon], 'end', endLabel);
      startMarker.addTo(map);
      endMarker.addTo(map);
      routeMarkers.push(startMarker, endMarker);
    }

    if (routeLines.length) {
      const group = new L.featureGroup(routeLines.filter((_, i) => i % 2 === 1));
      map.fitBounds(group.getBounds(), { padding: [30, 30], maxZoom: 16 });
    }

    const statusMessage = showOnlyOptimal ? `
      <div style="background: #fff3cd; padding: 8px; border-radius: 6px; margin-bottom: 12px; font-size: 12px;">
        <i class="fas fa-info-circle"></i> Showing optimal route only due to overlapping coordinates
      </div>` : '';

    rdetails.innerHTML = statusMessage + createRouteDetailsPanel(validRoutes, executionTime, startLabel, endLabel);

    document.querySelectorAll('.route-card').forEach((card, index) => {
      card.addEventListener('click', () => highlightRoute(index));
    });

    clearLoading(`Route analysis complete - ${routesToDisplay.length} path${routesToDisplay.length > 1 ? 's' : ''} found.`);
  } catch (err) {
    console.error('Pathfinding error:', err);
    rdetails.innerHTML = `
      <div style="
        color: #dc3545;
        padding: 15px;
        background: #f8d7da;
        border-radius: 8px;
        border-left: 4px solid #dc3545;
      ">
        <i class="fas fa-exclamation-triangle" style="margin-right: 8px;"></i>
        ${err.message || 'Error calculating K-shortest paths.'}
      </div>`;
    clearLoading('Error calculating paths.');
  } finally {
    setUIEnabled(true);
  }
}

// Add CSS for animations
const routeStyles_CSS = `
  .route-start-marker, .route-end-marker {
    animation: bounce 2s infinite;
  }

  @keyframes bounce {
    0%, 20%, 50%, 80%, 100% {
      transform: translateY(0);
    }
    40% {
      transform: translateY(-5px);
    }
    60% {
      transform: translateY(-3px);
    }
  }
  
  .route-card:hover {
    transform: translateY(-2px) !important;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2) !important;
  }
`;

if (!document.querySelector('#route-styles')) {
  const styleElement = document.createElement('style');
  styleElement.id = 'route-styles';
  styleElement.textContent = routeStyles_CSS;
  document.head.appendChild(styleElement);
}


function detectCriticalPoints() {
  setUIEnabled(false);
  showLoading('Detecting critical points...');
  showRightPanel();

  try {
    const result = wasmAPI.getCriticalPoints();
    const { coordinates = [], executionTime = 0 } = result.criticalPoints || {};

    if (!coordinates.length) {
      cdetails.innerHTML = `
        <div style="color: #dc3545;">
          <i class="fas fa-exclamation-triangle"></i> No critical points found.
        </div>
      `;
      clearLoading('No critical points found.');
      return;
    }

    // Clean up existing markers
    if (criticalPointsGroup) map.removeLayer(criticalPointsGroup);
    criticalMarkers.forEach(m => map.removeLayer(m));
    criticalMarkers = [];

    // Color palette for critical points
    const criticalColors = [
      '#FF1744', // Bright Red
      '#FF6D00', // Deep Orange
      '#9C27B0', // Purple
      '#3F51B5', // Indigo
      '#00BCD4', // Cyan
      '#4CAF50', // Green
      '#FFC107', // Amber
      '#E91E63'  // Pink
    ];

    // Enhanced cluster group with gradient styling
    criticalPointsGroup = L.markerClusterGroup({
      iconCreateFunction: cluster => {
        const count = cluster.getChildCount();
        const size = count < 10 ? 35 : count < 100 ? 45 : 55;
        const color = criticalColors[Math.floor(Math.random() * criticalColors.length)];

        return L.divIcon({
          html: `
            <div style="
              background: linear-gradient(135deg, ${color}dd, ${color});
              color: white;
              border-radius: 50%;
              width: ${size}px;
              height: ${size}px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: bold;
              font-size: ${count < 10 ? '12px' : '14px'};
              box-shadow: 0 3px 10px rgba(0, 0, 0, 0.3);
              border: 3px solid white;
              animation: pulse 2s infinite;
            ">
              ${count}
            </div>
            <style>
              @keyframes pulse {
                0% { transform: scale(1); }
                50% { transform: scale(1.05); }
                100% { transform: scale(1); }
              }
            </style>
          `,
          className: 'critical-cluster',
          iconSize: [size, size]
        });
      },
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: true,
      zoomToBoundsOnClick: true
    });

    // Create colorful individual markers
    coordinates.forEach(([lat, lon], index) => {
      const color = criticalColors[index % criticalColors.length];
      const lightColor = color + '44'; // Add transparency

      // Create custom icon with enhanced styling
      const customIcon = L.divIcon({
        html: `
          <div style="
            width: 24px;
            height: 24px;
            background: linear-gradient(135deg, ${color}, ${color}cc);
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: 0 3px 15px rgba(0, 0, 0, 0.4);
            position: relative;
          ">
            <div style="
              position: absolute;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              width: 8px;
              height: 8px;
              background: white;
              border-radius: 50%;
            "></div>
          </div>
        `,
        className: 'critical-point-marker',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      // Alternative: Enhanced circle marker with animations
      const marker = L.circleMarker([lat, lon], {
        radius: 8,
        color: 'white',
        fillColor: color,
        fillOpacity: 0.9,
        weight: 3,
        className: 'critical-circle-marker'
      }).bindPopup(`
        <div style="text-align: center; padding: 10px;">
          <h4 style="margin: 0 0 8px 0; color: ${color};">⚠️ Critical Point</h4>
          <p style="margin: 0; font-size: 12px; color: #666;">
            Lat: ${lat.toFixed(6)}<br>
            Lon: ${lon.toFixed(6)}
          </p>
          <div style="
            margin-top: 8px;
            padding: 4px 8px;
            background: ${lightColor};
            border-radius: 4px;
            font-size: 11px;
            color: ${color};
            font-weight: bold;
          ">
            Network Vulnerability Point
          </div>
        </div>
      `, {
        closeButton: true,
        maxWidth: 200
      });

      // Add hover effects
      marker.on('mouseover', function () {
        this.setStyle({ radius: 12, weight: 4 });
      });

      marker.on('mouseout', function () {
        this.setStyle({ radius: 8, weight: 3 });
      });

      criticalPointsGroup.addLayer(marker);
      criticalMarkers.push(marker);
    });

    // Add the cluster group to the map
    map.addLayer(criticalPointsGroup);

    cdetails.innerHTML = `
      <div style="color: #28a745;">
        <i class="fas fa-check-circle"></i> Critical points detected!
      </div>
      <div><strong>Found:</strong> ${coordinates.length} critical points</div>
      <div><strong>Execution time:</strong> ${executionTime}ms</div>
      <div style="font-size: 0.85em; color: #666;">
        <i class="fas fa-info-circle"></i> Critical points are clustered for better visualization
      </div>
    `;

    clearLoading('Critical points detection complete.');

  } catch (err) {
    console.error('Critical point error:', err);
    cdetails.innerHTML = `
      <div style="color: #dc3545;">
        <i class="fas fa-exclamation-triangle"></i> Error detecting critical points.
      </div>
    `;
    clearLoading('Error detecting critical points.');
  } finally {
    setUIEnabled(true);
  }
}

async function initializeApp() {
  setUIEnabled(false);
  showLoading('Loading graph and initializing...');
  try {
    wasmAPI = await initWasm();
    wasmAPI.initGraph('./data/dehradun.geojson');
    clearLoading('Application ready!');
    setUIEnabled(true);
  } catch (err) {
    console.error('Error initializing WASM:', err);
    clearLoading('Failed to load graph.');
  }
}

// DOM Ready
window.addEventListener('DOMContentLoaded', () => {
  fetch('./data/places.json')
    .then(response => response.json())
    .then(data => {
      locations = data;
      populateDropdowns();
      initializeApp();
    })
    .catch(error => {
      console.error('Error loading places JSON:', error);
      clearLoading('Failed to load places.');
    });

  locBtn.addEventListener('click', setupManualSelection);
  findBtn.addEventListener('click', calculateShortestPath);
  critBtn.addEventListener('click', detectCriticalPoints);
  [startInput, endInput].forEach(input => {
    input.addEventListener('input', function () {
      this.style.borderColor = this.value && !locations[this.value] ? '#ffc107' : '#ced4da';
    });
  });
});