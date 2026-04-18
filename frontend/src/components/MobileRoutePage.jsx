import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import crowdLogo from '../assets/CrowdLogo.png';
import '../mobileRoute.css';

const MAPBOX_JS_CDN = 'https://api.mapbox.com/mapbox-gl-js/v3.8.0/mapbox-gl.js';
const MAPBOX_CSS_CDN = 'https://api.mapbox.com/mapbox-gl-js/v3.8.0/mapbox-gl.css';

const DEFAULT_MAIN_GATE = {
  name: 'Main Gate',
  coordinates: [73.856111, 18.516389],
};

const DEFAULT_EXITS = [
  { id: 'route-1-west', route: 'Route 1 (Western Exit)', name: 'Laxmi Road', coordinates: [73.8487, 18.5140] },
  { id: 'route-2-north', route: 'Route 2 (Northern Exit)', name: 'Mamledar Kacheri', coordinates: [73.8581, 18.5067] },
  { id: 'route-3-east', route: 'Route 3 (Eastern Exit)', name: 'Subhanshah Dargah (Raviwar Peth)', coordinates: [73.8605, 18.5152] },
  { id: 'route-4-southwest', route: 'Route 4 (South-Western Exit)', name: 'Perugate', coordinates: [73.8487, 18.5114] },
];

const DEFAULT_COWORKERS = [
  {
    id: 'cw-1',
    name: 'Officer A. Patil',
    role: 'Field Marshal',
    task: 'Managing barricade flow at Main Gate lane',
    status: 'active',
    coordinates: [73.8553, 18.5168],
  },
  {
    id: 'cw-2',
    name: 'Officer R. Kulkarni',
    role: 'Medical Lead',
    task: 'Assisting first-aid queue near east corridor',
    status: 'assisting',
    coordinates: [73.8579, 18.5147],
  },
  {
    id: 'cw-3',
    name: 'Officer S. Shaikh',
    role: 'Exit Coordinator',
    task: 'Moving crowd toward nearest emergency exit',
    status: 'enroute',
    coordinates: [73.8521, 18.5134],
  },
];

const DEFAULT_RESPONSE_UNITS = [
  {
    id: 'amb-1',
    type: 'ambulance',
    name: 'Ambulance Unit A1',
    coordinates: [73.8572, 18.5171],
    task: 'Standby for medical response near Main Gate',
  },
  {
    id: 'amb-2',
    type: 'ambulance',
    name: 'Ambulance Unit A2',
    coordinates: [73.8539, 18.5149],
    task: 'Covering east lane first-aid transfer',
  },
  {
    id: 'fire-1',
    type: 'fire-van',
    name: 'Fire Fighter Van F1',
    coordinates: [73.8587, 18.5150],
    task: 'Hydrant-ready at north corridor',
  },
  {
    id: 'fire-2',
    type: 'fire-van',
    name: 'Fire Fighter Van F2',
    coordinates: [73.8518, 18.5128],
    task: 'Monitoring electrical hazard points',
  },
];

function normalizeCoworkerStatus(value) {
  const normalized = String(value || 'active').trim().toLowerCase();
  if (normalized === 'enroute') {
    return 'enroute';
  }
  if (normalized === 'assisting') {
    return 'assisting';
  }
  return 'active';
}

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

function buildDirectionsUrl(token, start, end) {
  const [startLng, startLat] = start;
  const [endLng, endLat] = end;
  const coordinates = `${startLng},${startLat};${endLng},${endLat}`;
  return `https://api.mapbox.com/directions/v5/mapbox/walking/${coordinates}?alternatives=false&geometries=geojson&overview=full&steps=true&access_token=${encodeURIComponent(token)}`;
}

function haversineMeters(a, b) {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;

  const toRadians = (value) => (value * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const rLat1 = toRadians(lat1);
  const rLat2 = toRadians(lat2);
  const earthRadius = 6371000;

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return earthRadius * c;
}

function bearingBetweenPoints(start, end) {
  const [lng1, lat1] = start;
  const [lng2, lat2] = end;

  const toRadians = (value) => (value * Math.PI) / 180;
  const toDegrees = (value) => (value * 180) / Math.PI;

  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const lambda1 = toRadians(lng1);
  const lambda2 = toRadians(lng2);

  const y = Math.sin(lambda2 - lambda1) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda2 - lambda1);

  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

export default function MobileRoutePage({ mapData, onBackToDashboard }) {
  const { t } = useTranslation();
  const token = import.meta.env.VITE_MAPBOX_TOKEN;
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const [routeInfo, setRouteInfo] = useState({ distanceKm: null, durationMin: null });

  const mainGate =
    mapData?.main_gate && Array.isArray(mapData.main_gate.coordinates)
      ? mapData.main_gate
      : DEFAULT_MAIN_GATE;

  const emergencyExits = useMemo(() => {
    const provided = Array.isArray(mapData?.emergency_exits) ? mapData.emergency_exits : [];
    if (provided.length === 0) {
      return DEFAULT_EXITS;
    }
    return provided.filter((exitPoint) => Array.isArray(exitPoint?.coordinates) && exitPoint.coordinates.length >= 2);
  }, [mapData?.emergency_exits]);

  const nearestExit = useMemo(() => {
    if (!Array.isArray(mainGate?.coordinates) || emergencyExits.length === 0) {
      return null;
    }

    const ranked = [...emergencyExits]
      .map((exitPoint) => ({
        ...exitPoint,
        distance: haversineMeters(mainGate.coordinates, exitPoint.coordinates),
      }))
      .sort((a, b) => a.distance - b.distance);

    return ranked[0] || null;
  }, [emergencyExits, mainGate?.coordinates]);

  const responseUnits = useMemo(() => {
    const raw = Array.isArray(mapData?.response_units) && mapData.response_units.length > 0
      ? mapData.response_units
      : DEFAULT_RESPONSE_UNITS;

    return raw
      .filter((entry) => Array.isArray(entry?.coordinates) && entry.coordinates.length >= 2)
      .map((entry, index) => ({
        id: entry.id || `unit-${index + 1}`,
        type: String(entry.type || '').trim().toLowerCase() === 'ambulance' ? 'ambulance' : 'fire-van',
        name: entry.name || `Unit ${index + 1}`,
        task: entry.task || 'On standby',
        coordinates: entry.coordinates,
      }));
  }, [mapData?.response_units]);

  const nearestAmbulance = useMemo(() => {
    if (!Array.isArray(mainGate?.coordinates) || responseUnits.length === 0) {
      return null;
    }

    const ambulances = responseUnits.filter((unit) => unit.type === 'ambulance');
    if (ambulances.length === 0) {
      return null;
    }

    const ranked = ambulances
      .map((unit) => ({
        ...unit,
        distanceMeters: haversineMeters(mainGate.coordinates, unit.coordinates),
      }))
      .sort((a, b) => a.distanceMeters - b.distanceMeters);

    return ranked[0] || null;
  }, [mainGate?.coordinates, responseUnits]);

  const nearestFireVan = useMemo(() => {
    if (!Array.isArray(mainGate?.coordinates) || responseUnits.length === 0) {
      return null;
    }

    const fireUnits = responseUnits.filter((unit) => unit.type === 'fire-van');
    if (fireUnits.length === 0) {
      return null;
    }

    const ranked = fireUnits
      .map((unit) => ({
        ...unit,
        distanceMeters: haversineMeters(mainGate.coordinates, unit.coordinates),
      }))
      .sort((a, b) => a.distanceMeters - b.distanceMeters);

    return ranked[0] || null;
  }, [mainGate?.coordinates, responseUnits]);

  const coworkers = useMemo(() => {
    const raw = Array.isArray(mapData?.coworkers) && mapData.coworkers.length > 0 ? mapData.coworkers : DEFAULT_COWORKERS;

    return raw
      .filter((entry) => Array.isArray(entry?.coordinates) && entry.coordinates.length >= 2)
      .map((entry, index) => ({
        id: entry.id || `cw-${index + 1}`,
        name: entry.name || `Officer ${index + 1}`,
        role: entry.role || 'Field Officer',
        task: entry.task || 'Monitoring assigned zone',
        status: normalizeCoworkerStatus(entry.status),
        coordinates: entry.coordinates,
      }));
  }, [mapData?.coworkers]);

  useEffect(() => {
    if (!token || !mapContainerRef.current || !nearestExit || mapRef.current) {
      return undefined;
    }

    let mounted = true;
    let startMarker;
    let endMarker;
    const coworkerMarkers = [];
    const responseUnitMarkers = [];

    ensureMapboxAssets()
      .then((mapboxgl) => {
        if (!mounted || !mapContainerRef.current || mapRef.current) {
          return;
        }

        mapboxgl.accessToken = token;

        const map = new mapboxgl.Map({
          container: mapContainerRef.current,
          style: 'mapbox://styles/mapbox/navigation-day-v1',
          center: mainGate.coordinates,
          zoom: 15.2,
          pitch: 36,
          bearing: -8,
          antialias: true,
          attributionControl: false,
        });

        map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');

        map.on('load', async () => {
          map.addSource('mobile-route', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });

          map.addLayer({
            id: 'mobile-route-line-casing',
            type: 'line',
            source: 'mobile-route',
            paint: {
              'line-color': '#ffffff',
              'line-width': 10,
              'line-opacity': 0.95,
            },
          });

          map.addLayer({
            id: 'mobile-route-line',
            type: 'line',
            source: 'mobile-route',
            paint: {
              'line-color': '#1a73e8',
              'line-width': 6,
              'line-opacity': 0.98,
            },
          });

          startMarker = new mapboxgl.Marker({ color: '#0ea05a', scale: 1.05 })
            .setLngLat(mainGate.coordinates)
            .setPopup(new mapboxgl.Popup({ offset: 18 }).setText(t('mobileRoute.mainGate')))
            .addTo(map);

          endMarker = new mapboxgl.Marker({ color: '#d93025', scale: 1.05 })
            .setLngLat(nearestExit.coordinates)
            .setPopup(new mapboxgl.Popup({ offset: 18 }).setText(nearestExit.name || t('mobileRoute.nearestExit')))
            .addTo(map);

          coworkers.forEach((coworker) => {
            const markerEl = document.createElement('div');
            markerEl.className = 'mobile-coworker-marker';
            markerEl.title = coworker.name;

            const popupHtml = `
              <div class="map-popup">
                <h4>${coworker.name}</h4>
                <p><strong>${t('mobileRoute.coworkerRole')}:</strong> ${coworker.role}</p>
                <p><strong>${t('mobileRoute.coworkerTask')}:</strong> ${coworker.task}</p>
                <p><strong>${t('mobileRoute.coworkerStatus')}:</strong> ${t(`mobileRoute.statuses.${coworker.status}`)}</p>
              </div>
            `;

            const marker = new mapboxgl.Marker({ element: markerEl, anchor: 'center' })
              .setLngLat(coworker.coordinates)
              .setPopup(new mapboxgl.Popup({ offset: 16 }).setHTML(popupHtml))
              .addTo(map);

            coworkerMarkers.push(marker);
          });

          [nearestAmbulance, nearestFireVan].filter(Boolean).forEach((unit) => {
            const markerEl = document.createElement('div');
            markerEl.className = `mobile-emergency-marker mobile-emergency-marker--${unit.type}`;
            markerEl.title = unit.name;

            const popupHtml = `
              <div class="map-popup">
                <h4>${unit.name}</h4>
                <p><strong>${t('mobileRoute.unitType')}:</strong> ${unit.type === 'ambulance' ? t('mobileRoute.ambulance') : t('mobileRoute.fireVan')}</p>
                <p><strong>${t('mobileRoute.coworkerTask')}:</strong> ${unit.task}</p>
              </div>
            `;

            const marker = new mapboxgl.Marker({ element: markerEl, anchor: 'center' })
              .setLngLat(unit.coordinates)
              .setPopup(new mapboxgl.Popup({ offset: 16 }).setHTML(popupHtml))
              .addTo(map);

            responseUnitMarkers.push(marker);
          });

          const fallbackCoords = [mainGate.coordinates, nearestExit.coordinates];

          try {
            const response = await fetch(buildDirectionsUrl(token, mainGate.coordinates, nearestExit.coordinates));
            if (!response.ok) {
              throw new Error(`Directions request failed: ${response.status}`);
            }

            const data = await response.json();
            const route = data?.routes?.[0];
            const routeCoordinates = route?.geometry?.coordinates;

            if (!Array.isArray(routeCoordinates) || routeCoordinates.length < 2) {
              throw new Error('Missing route geometry');
            }

            const routeSource = map.getSource('mobile-route');
            if (routeSource) {
              routeSource.setData({
                type: 'FeatureCollection',
                features: [
                  {
                    type: 'Feature',
                    geometry: {
                      type: 'LineString',
                      coordinates: routeCoordinates,
                    },
                    properties: {},
                  },
                ],
              });
            }

            const km = Number(route.distance || 0) / 1000;
            const mins = Number(route.duration || 0) / 60;
            setRouteInfo({
              distanceKm: Number.isFinite(km) ? km : null,
              durationMin: Number.isFinite(mins) ? mins : null,
            });

            const bounds = routeCoordinates.reduce(
              (acc, point) => acc.extend(point),
              new mapboxgl.LngLatBounds(routeCoordinates[0], routeCoordinates[0])
            );
            map.fitBounds(bounds, {
              padding: { top: 70, bottom: 90, left: 26, right: 26 },
              maxZoom: 16.8,
              duration: 1200,
              essential: true,
            });

            const midIdx = Math.max(1, Math.floor(routeCoordinates.length * 0.35));
            const walkBearing = bearingBetweenPoints(routeCoordinates[0], routeCoordinates[midIdx]);
            map.once('moveend', () => {
              map.easeTo({
                pitch: 58,
                bearing: walkBearing,
                zoom: Math.min(map.getZoom() + 0.6, 17.4),
                duration: 1400,
                essential: true,
              });
            });
            return;
          } catch {
            const routeSource = map.getSource('mobile-route');
            if (routeSource) {
              routeSource.setData({
                type: 'FeatureCollection',
                features: [
                  {
                    type: 'Feature',
                    geometry: {
                      type: 'LineString',
                      coordinates: fallbackCoords,
                    },
                    properties: {},
                  },
                ],
              });
            }

            const straightKm = haversineMeters(mainGate.coordinates, nearestExit.coordinates) / 1000;
            setRouteInfo({ distanceKm: straightKm, durationMin: null });

            const bounds = fallbackCoords.reduce(
              (acc, point) => acc.extend(point),
              new mapboxgl.LngLatBounds(fallbackCoords[0], fallbackCoords[0])
            );
            map.fitBounds(bounds, {
              padding: { top: 70, bottom: 90, left: 26, right: 26 },
              maxZoom: 16.8,
              duration: 1200,
              essential: true,
            });

            const walkBearing = bearingBetweenPoints(mainGate.coordinates, nearestExit.coordinates);
            map.once('moveend', () => {
              map.easeTo({
                pitch: 56,
                bearing: walkBearing,
                zoom: Math.min(map.getZoom() + 0.45, 17.2),
                duration: 1200,
                essential: true,
              });
            });
          }
        });

        mapRef.current = map;
      })
      .catch((error) => {
        console.error('Mapbox load failed for mobile route page:', error);
      });

    return () => {
      mounted = false;
      if (startMarker) {
        startMarker.remove();
      }
      if (endMarker) {
        endMarker.remove();
      }
      coworkerMarkers.forEach((marker) => marker.remove());
      responseUnitMarkers.forEach((marker) => marker.remove());
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [token]);

  if (!token) {
    return (
      <div className="mobile-route-page mobile-route-page--fallback">
        <header className="mobile-route-header">
          <button type="button" className="mobile-route-back" onClick={onBackToDashboard}>
            <i className="fa-solid fa-arrow-left" aria-hidden="true" />
            <span>{t('mobileRoute.back')}</span>
          </button>
          <div className="mobile-route-brand">
            <img src={crowdLogo} alt={t('header.logoAlt')} />
            <p>{t('mobileRoute.title')}</p>
          </div>
        </header>
        <div className="mobile-route-token-missing">{t('map.fallbackSubtitle')}</div>
      </div>
    );
  }

  return (
    <div className="mobile-route-page">
      <header className="mobile-route-header">
        <button type="button" className="mobile-route-back" onClick={onBackToDashboard}>
          <i className="fa-solid fa-arrow-left" aria-hidden="true" />
          <span>{t('mobileRoute.back')}</span>
        </button>
        <div className="mobile-route-brand">
          <img src={crowdLogo} alt={t('header.logoAlt')} />
          <p>{t('mobileRoute.title')}</p>
        </div>
      </header>

      <div ref={mapContainerRef} className="mobile-route-map" />

      <section className="mobile-route-sheet" aria-label={t('mobileRoute.routeDetails')}>
        <p className="mobile-route-sheet__title">{t('mobileRoute.routeDetails')}</p>
        <p className="mobile-route-sheet__line">
          <strong>{t('mobileRoute.from')}:</strong> {mainGate.name || t('mobileRoute.mainGate')}
        </p>
        <p className="mobile-route-sheet__line">
          <strong>{t('mobileRoute.to')}:</strong> {nearestExit?.name || t('mobileRoute.nearestExit')}
        </p>
        <div className="mobile-route-stats">
          <div>
            <span>{t('mobileRoute.distance')}</span>
            <strong>
              {routeInfo.distanceKm != null
                ? `${routeInfo.distanceKm.toLocaleString('en-IN', { maximumFractionDigits: 2 })} km`
                : '--'}
            </strong>
          </div>
          <div>
            <span>{t('mobileRoute.eta')}</span>
            <strong>
              {routeInfo.durationMin != null
                ? `${Math.max(1, Math.round(routeInfo.durationMin)).toLocaleString('en-IN')} min`
                : t('mobileRoute.na')}
            </strong>
          </div>
        </div>

        <div className="mobile-route-units">
          <p className="mobile-route-units__title">{t('mobileRoute.responseUnitsTitle')}</p>
          <p className="mobile-route-units__item">
            <strong>{t('mobileRoute.nearestAmbulance')}:</strong>{' '}
            {nearestAmbulance
              ? `${nearestAmbulance.name} (${(nearestAmbulance.distanceMeters / 1000).toLocaleString('en-IN', { maximumFractionDigits: 2 })} km)`
              : t('mobileRoute.na')}
          </p>
          <p className="mobile-route-units__item">
            <strong>{t('mobileRoute.nearestFireVan')}:</strong>{' '}
            {nearestFireVan
              ? `${nearestFireVan.name} (${(nearestFireVan.distanceMeters / 1000).toLocaleString('en-IN', { maximumFractionDigits: 2 })} km)`
              : t('mobileRoute.na')}
          </p>
        </div>

        <div className="mobile-route-coworkers">
          <p className="mobile-route-coworkers__title">{t('mobileRoute.coworkersTitle')}</p>
          {coworkers.map((coworker) => (
            <div key={coworker.id} className="mobile-route-coworkers__item">
              <span className="mobile-route-coworkers__dot" aria-hidden="true" />
              <div className="mobile-route-coworkers__meta">
                <p><strong>{coworker.name}</strong> • {coworker.role}</p>
                <p>{coworker.task}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
