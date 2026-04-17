import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

const MAPBOX_JS_CDN = 'https://api.mapbox.com/mapbox-gl-js/v3.8.0/mapbox-gl.js';
const MAPBOX_CSS_CDN = 'https://api.mapbox.com/mapbox-gl-js/v3.8.0/mapbox-gl.css';
const BUILDING_LAYER_ID = 'add-3d-buildings';

function ensureMapboxAssets() {
  return new Promise((resolve, reject) => {
    if (window.mapboxgl) {
      resolve(window.mapboxgl);
      return;
    }

    if (!document.querySelector('link[data-mapbox-css="true"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = MAPBOX_CSS_CDN;
      link.setAttribute('data-mapbox-css', 'true');
      document.head.appendChild(link);
    }

    const existingScript = document.querySelector('script[data-mapbox-js="true"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(window.mapboxgl));
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Mapbox script')));
      return;
    }

    const script = document.createElement('script');
    script.src = MAPBOX_JS_CDN;
    script.async = true;
    script.setAttribute('data-mapbox-js', 'true');
    script.onload = () => resolve(window.mapboxgl);
    script.onerror = () => reject(new Error('Failed to load Mapbox script'));
    document.body.appendChild(script);
  });
}

const DEFAULT_ZONES = [
  {
    id: 'shivajinagar',
    name: 'Shivajinagar Hub',
    coordinates: [73.8478, 18.5314],
    risk: 'VERY HIGH',
    riskScore: 92.4,
    crowd: 5980,
    capacity: 6500,
  },
  {
    id: 'swargate',
    name: 'Swargate Junction',
    coordinates: [73.857, 18.5003],
    risk: 'MODERATE',
    riskScore: 71.2,
    crowd: 6420,
    capacity: 10200,
  },
  {
    id: 'pune-station',
    name: 'Pune Station Gate',
    coordinates: [73.8766, 18.5286],
    risk: 'MODERATE',
    riskScore: 59.8,
    crowd: 7115,
    capacity: 13500,
  },
  {
    id: 'deccan',
    name: 'Deccan Square',
    coordinates: [73.8395, 18.5174],
    risk: 'MODERATE',
    riskScore: 52.1,
    crowd: 3920,
    capacity: 8200,
  },
  {
    id: 'sarasbaug',
    name: 'Sarasbaug Access',
    coordinates: [73.8498, 18.5018],
    risk: 'LOW',
    riskScore: 34.6,
    crowd: 2860,
    capacity: 9800,
  },
];

const DEFAULT_BOUNDARY = [
  [73.8538, 18.5185],
  [73.8596, 18.5185],
  [73.8602, 18.5160],
  [73.8591, 18.5138],
  [73.8552, 18.5136],
  [73.8536, 18.5155],
  [73.8538, 18.5185],
];

const DEFAULT_MAIN_GATE = {
  name: 'Main Gate',
  coordinates: [73.856111, 18.516389], // 18°30'59"N, 73°51'22"E
};

const DEFAULT_EMERGENCY_EXITS = [
  {
    id: 'route-1-west',
    route: 'Route 1 (Western Exit)',
    name: 'Laxmi Road',
    coordinates: [73.8487, 18.5140],
  },
  {
    id: 'route-2-north',
    route: 'Route 2 (Northern Exit)',
    name: 'Mamledar Kacheri',
    coordinates: [73.8581, 18.5067],
  },
  {
    id: 'route-3-east',
    route: 'Route 3 (Eastern Exit)',
    name: 'Subhanshah Dargah (Raviwar Peth)',
    coordinates: [73.8605, 18.5152],
  },
  {
    id: 'route-4-southwest',
    route: 'Route 4 (South-Western Exit)',
    name: 'Perugate',
    coordinates: [73.8487, 18.5114],
  },
];

function ensureClosedBoundary(boundary) {
  if (!Array.isArray(boundary) || boundary.length < 3) {
    return DEFAULT_BOUNDARY;
  }

  const [firstLng, firstLat] = boundary[0];
  const last = boundary[boundary.length - 1];
  if (last && last[0] === firstLng && last[1] === firstLat) {
    return boundary;
  }
  return [...boundary, [firstLng, firstLat]];
}

export default function LiveCommandMap({ mapData, highlightedRoute }) {
  const { t, i18n } = useTranslation();
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const token = import.meta.env.VITE_MAPBOX_TOKEN;

  const zoneNameKeyByName = {
    'Shivajinagar Hub': 'map.zoneNames.shivajinagar',
    'Swargate Junction': 'map.zoneNames.swargate',
    'Pune Station Gate': 'map.zoneNames.puneStation',
    'Deccan Square': 'map.zoneNames.deccan',
    'Sarasbaug Access': 'map.zoneNames.sarasbaug',
  };

  const exitNameKeyByName = {
    'Laxmi Road': 'map.exitNames.laxmiRoad',
    'Mamledar Kacheri': 'map.exitNames.mamledarKacheri',
    'Subhanshah Dargah (Raviwar Peth)': 'map.exitNames.subhanshahDargah',
    Perugate: 'map.exitNames.perugate',
  };

  const routeNameKeyByName = {
    'Route 1 (Western Exit)': 'map.routeNames.route1',
    'Route 2 (Northern Exit)': 'map.routeNames.route2',
    'Route 3 (Eastern Exit)': 'map.routeNames.route3',
    'Route 4 (South-Western Exit)': 'map.routeNames.route4',
  };

  const riskKeyByValue = {
    'VERY HIGH': 'map.risk.veryHigh',
    MODERATE: 'map.risk.moderate',
    LOW: 'map.risk.low',
  };

  const localizeZoneName = (value) => {
    const key = zoneNameKeyByName[value];
    return key ? t(key) : value || t('map.unknownZone');
  };

  const localizeExitName = (value) => {
    const key = exitNameKeyByName[value];
    return key ? t(key) : value;
  };

  const localizeRouteName = (value) => {
    const key = routeNameKeyByName[value];
    return key ? t(key) : value;
  };

  const localizeRisk = (value) => {
    const key = riskKeyByValue[value];
    return key ? t(key) : value || t('common.na');
  };

  const localizeMainGateName = (value) => {
    if (value === 'Main Gate') {
      return t('map.mainGateName');
    }
    return value || t('map.mainGateName');
  };

  const zones = Array.isArray(mapData?.zones) && mapData.zones.length > 0
    ? mapData.zones
    : DEFAULT_ZONES;

  const boundary = ensureClosedBoundary(mapData?.boundary || DEFAULT_BOUNDARY);

  const heatmapPoints = Array.isArray(mapData?.heatmap_points) && mapData.heatmap_points.length > 0
    ? mapData.heatmap_points
    : zones;

  const mainGate =
    mapData?.main_gate && Array.isArray(mapData.main_gate.coordinates)
      ? mapData.main_gate
      : DEFAULT_MAIN_GATE;

  const emergencyExits =
    Array.isArray(mapData?.emergency_exits) && mapData.emergency_exits.length > 0
      ? mapData.emergency_exits
      : DEFAULT_EMERGENCY_EXITS;

  const boundaryVertices = useMemo(
    () =>
      boundary.slice(0, -1).map((point, index) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: point,
        },
        properties: {
          label: `L${index + 1}`,
        },
      })),
    [boundary]
  );

  const apply3DView = (map) => {
    if (!map) {
      return;
    }

    if (map.getSource('mapbox-dem')) {
      map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.15 });
    }
    if (map.getLayer(BUILDING_LAYER_ID)) {
      map.setLayoutProperty(BUILDING_LAYER_ID, 'visibility', 'visible');
    }
    map.easeTo({ pitch: 58, bearing: -18, duration: 550 });
  };

  const sourceData = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: heatmapPoints.map((zone) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: zone.coordinates,
        },
        properties: {
          name: zone.name,
          risk: zone.risk,
          riskScore: zone.riskScore,
          crowd: zone.crowd,
          capacity: zone.capacity,
          intensity: Math.max((zone.riskScore || 0) / 100, 0.2),
        },
      })),
    }),
    [heatmapPoints]
  );

  useEffect(() => {
    if (!token || !mapContainerRef.current || mapRef.current) {
      return undefined;
    }

    let mounted = true;

    let resizeObserver;
    const handleWindowResize = () => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    };

    ensureMapboxAssets()
      .then((mapboxgl) => {
        if (!mounted || !mapContainerRef.current || mapRef.current) {
          return;
        }

        mapboxgl.accessToken = token;

        const map = new mapboxgl.Map({
          container: mapContainerRef.current,
          style: 'mapbox://styles/mapbox/dark-v11',
          center: mainGate.coordinates,
          zoom: 15.6,
          pitch: 58,
          bearing: -18,
          antialias: true,
          attributionControl: true,
        });

        map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');

        map.on('load', () => {
          // 3D terrain using Mapbox DEM
          map.addSource('mapbox-dem', {
            type: 'raster-dem',
            url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
            tileSize: 512,
            maxzoom: 14,
          });

          map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.15 });
          map.setFog({
            color: 'rgb(14, 24, 43)',
            'high-color': 'rgb(28, 44, 70)',
            'horizon-blend': 0.12,
          });

          map.addSource('crowd-zones', {
            type: 'geojson',
            data: sourceData,
          });

          // Add 3D buildings from the style's composite source.
          const layers = map.getStyle().layers || [];
          const labelLayerId = layers.find(
            (layer) => layer.type === 'symbol' && layer.layout && layer.layout['text-field']
          )?.id;
          const hotspotMinZoom = Number((map.getMaxZoom() * 0.7).toFixed(1));

          map.addLayer(
            {
              id: BUILDING_LAYER_ID,
              source: 'composite',
              'source-layer': 'building',
              filter: ['==', 'extrude', 'true'],
              type: 'fill-extrusion',
              minzoom: 13,
              paint: {
                'fill-extrusion-color': '#2a3a55',
                'fill-extrusion-height': [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  13,
                  0,
                  16,
                  ['get', 'height'],
                ],
                'fill-extrusion-base': [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  13,
                  0,
                  16,
                  ['get', 'min_height'],
                ],
                'fill-extrusion-opacity': 0.72,
              },
            },
            labelLayerId
          );

          map.addLayer({
            id: 'crowd-heatmap',
            type: 'heatmap',
            source: 'crowd-zones',
            maxzoom: 24,
            paint: {
              'heatmap-weight': ['get', 'intensity'],
              'heatmap-intensity': [
                'interpolate',
                ['linear'],
                ['zoom'],
                10,
                0.9,
                16,
                1.5,
              ],
              'heatmap-color': [
                'interpolate',
                ['linear'],
                ['heatmap-density'],
                0,
                'rgba(0,0,0,0)',
                0.2,
                'rgba(12,78,50,0.56)',
                0.45,
                'rgba(126,87,16,0.8)',
                0.7,
                'rgba(120,44,24,0.9)',
                1,
                'rgba(102,18,18,0.98)',
              ],
              'heatmap-radius': [
                'interpolate',
                ['linear'],
                ['zoom'],
                12,
                38,
                17,
                70,
              ],
              'heatmap-opacity': 0.86,
            },
          });

          // Transparent hit layer so heatmap areas are clickable for popup details.
          map.addLayer({
            id: 'crowd-heatmap-hitbox',
            type: 'circle',
            source: 'crowd-zones',
            maxzoom: 24,
            paint: {
              'circle-radius': [
                'interpolate',
                ['linear'],
                ['zoom'],
                10,
                16,
                16,
                28,
              ],
              'circle-color': 'rgba(255,255,255,0.01)',
              'circle-opacity': 0.01,
            },
          });

          map.on('click', 'crowd-heatmap-hitbox', (event) => {
            const feature = event.features?.[0];
            const zoneName = localizeZoneName(feature?.properties?.name || '');
            const risk = localizeRisk(feature?.properties?.risk || '');
            const scoreRaw = Number(feature?.properties?.riskScore);
            const score = Number.isFinite(scoreRaw)
              ? scoreRaw.toLocaleString(i18n.language === 'mr' ? 'mr-IN' : 'en-IN', {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })
              : t('common.na');

            new mapboxgl.Popup({ offset: 14 })
              .setLngLat(event.lngLat)
              .setHTML(
                `<div class="map-popup"><h4>${zoneName}</h4><p><strong>${t('map.popupRiskLabel')}:</strong> ${risk}</p><p><strong>${t('map.popupScoreLabel')}:</strong> ${score}</p></div>`
              )
              .addTo(map);
          });

          map.on('mouseenter', 'crowd-heatmap-hitbox', () => {
            map.getCanvas().style.cursor = 'pointer';
          });

          map.on('mouseleave', 'crowd-heatmap-hitbox', () => {
            map.getCanvas().style.cursor = '';
          });

          map.addLayer({
            id: 'crowd-hotspots-zoomed',
            type: 'circle',
            source: 'crowd-zones',
            minzoom: hotspotMinZoom,
            paint: {
              'circle-radius': [
                'interpolate',
                ['linear'],
                ['get', 'intensity'],
                0.2,
                7,
                1,
                14,
              ],
              'circle-color': [
                'interpolate',
                ['linear'],
                ['get', 'intensity'],
                0.2,
                '#27b26b',
                0.6,
                '#f1b336',
                1,
                '#ef5b5b',
              ],
              'circle-opacity': [
                'interpolate',
                ['linear'],
                ['zoom'],
                hotspotMinZoom,
                0.15,
                map.getMaxZoom(),
                0.95,
              ],
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 1.2,
            },
          });

          map.addSource('crowd-boundary', {
            type: 'geojson',
            data: {
              type: 'Feature',
              geometry: {
                type: 'Polygon',
                coordinates: [boundary],
              },
              properties: {},
            },
          });

          map.addLayer({
            id: 'crowd-boundary-fill',
            type: 'fill',
            source: 'crowd-boundary',
            paint: {
              'fill-color': '#4f6f92',
              'fill-opacity': 0.14,
            },
          });


          map.addSource('boundary-vertices', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: boundaryVertices,
            },
          });

          map.addLayer({
            id: 'boundary-vertex-pins',
            type: 'symbol',
            source: 'boundary-vertices',
            layout: {
              'icon-image': 'marker-15',
              'icon-size': 1.15,
              'icon-allow-overlap': true,
              'text-field': ['get', 'label'],
              'text-size': 11,
              'text-offset': [0, 1.15],
              'text-allow-overlap': true,
            },
            paint: {
              'text-color': '#dce8ff',
              'text-halo-color': '#071d35',
              'text-halo-width': 1,
            },
          });

          map.addLayer({
            id: 'boundary-vertex-glow',
            type: 'circle',
            source: 'boundary-vertices',
            paint: {
              'circle-radius': 6,
              'circle-color': '#046b3f',
              'circle-stroke-color': '#dce8ff',
              'circle-stroke-width': 1.4,
              'circle-opacity': 0.9,
            },
          });
          map.addLayer({
            id: 'crowd-boundary-line',
            type: 'line',
            source: 'crowd-boundary',
            paint: {
              'line-color': '#8bb8f2',
              'line-width': 2.8,
              'line-opacity': 0.95,
              'line-dasharray': [2, 2],
            },
          });

          map.addSource('auto-evac-route', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: [],
            },
          });

          map.addLayer({
            id: 'auto-evac-route-line',
            type: 'line',
            source: 'auto-evac-route',
            layout: {
              visibility: 'none',
              'line-cap': 'round',
              'line-join': 'round',
            },
            paint: {
              'line-color': '#ef5b5b',
              'line-width': 6,
              'line-opacity': 0.96,
              'line-blur': 0.2,
            },
          });

          const gatePopup = new mapboxgl.Popup({ offset: 24 }).setHTML(
            `<div class="map-popup"><h4>${localizeMainGateName(mainGate.name)}</h4><p><strong>${t('map.popupLocationLabel')}:</strong> ${t('map.mainGateDescription')}</p></div>`
          );

          new mapboxgl.Marker({ color: '#04c977', scale: 1.2 })
            .setLngLat(mainGate.coordinates)
            .setPopup(gatePopup)
            .addTo(map);

          emergencyExits.forEach((route) => {
            const exitPopup = new mapboxgl.Popup({ offset: 18 }).setHTML(
              `<div class="map-popup"><h4>${localizeRouteName(route.route)}</h4><p><strong>${t('map.popupExitPointLabel')}:</strong> ${localizeExitName(route.name)}</p></div>`
            );

            new mapboxgl.Marker({ color: '#ff3030', scale: 0.7 })
              .setLngLat(route.coordinates)
              .setPopup(exitPopup)
              .addTo(map);
          });

          const focusBounds = new mapboxgl.LngLatBounds();
          focusBounds.extend(mainGate.coordinates);
          emergencyExits.forEach((route) => focusBounds.extend(route.coordinates));
          map.fitBounds(focusBounds, {
            padding: { top: 50, bottom: 50, left: 50, right: 50 },
            maxZoom: 15.8,
          });

          // Keep map in 3D after fitBounds normalization.
          map.once('moveend', () => apply3DView(map));

        });

        mapRef.current = map;

        resizeObserver = new ResizeObserver(() => {
          if (mapRef.current) {
            mapRef.current.resize();
          }
        });
        resizeObserver.observe(mapContainerRef.current);

        window.addEventListener('resize', handleWindowResize);
      })
      .catch((error) => {
        console.error('Mapbox CDN load failed:', error);
      });

    return () => {
      mounted = false;
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      window.removeEventListener('resize', handleWindowResize);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [i18n.language, token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const zonesSource = map.getSource('crowd-zones');
    if (zonesSource) {
      zonesSource.setData(sourceData);
    }
  }, [sourceData]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const routeSource = map.getSource('auto-evac-route');
    const routeLayerExists = Boolean(map.getLayer('auto-evac-route-line'));
    const coords = Array.isArray(highlightedRoute?.coordinates) ? highlightedRoute.coordinates : [];
    const showRoute = coords.length >= 2;

    if (routeSource) {
      routeSource.setData({
        type: 'FeatureCollection',
        features: showRoute
          ? [
            {
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: coords,
              },
              properties: {},
            },
          ]
          : [],
      });
    }

    if (routeLayerExists) {
      map.setLayoutProperty('auto-evac-route-line', 'visibility', showRoute ? 'visible' : 'none');
    }
  }, [highlightedRoute]);

  if (!token) {
    return (
      <div className="map-fallback">
        <p className="map-title">{t('map.fallbackTitle')}</p>
        <p className="map-subtitle">
          {t('map.fallbackSubtitle')}
        </p>
      </div>
    );
  }

  return (
    <div className="mapbox-wrapper">
      <div ref={mapContainerRef} className="mapbox-canvas" aria-label={t('map.fallbackTitle')} />
    </div>
  );
}
