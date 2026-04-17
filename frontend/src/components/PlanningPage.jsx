import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import crowdLogo from '../assets/CrowdLogo.png';
import '../planning.css';

const MAPBOX_JS_CDN = 'https://api.mapbox.com/mapbox-gl-js/v3.8.0/mapbox-gl.js';
const MAPBOX_CSS_CDN = 'https://api.mapbox.com/mapbox-gl-js/v3.8.0/mapbox-gl.css';

const DEFAULT_CENTER = [73.856111, 18.516389];

const TOOL_CONFIG = {
  firstaid: {
    iconClass: 'fa-solid fa-kit-medical',
    color: '#e74d4d',
    pinLabel: 'F',
    titleKey: 'planning.tools.firstaid',
  },
  emergency: {
    iconClass: 'fa-solid fa-person-running',
    color: '#30b864',
    pinLabel: 'E',
    titleKey: 'planning.tools.emergency',
  },
  water: {
    iconClass: 'fa-solid fa-droplet',
    color: '#3d8dff',
    pinLabel: 'W',
    titleKey: 'planning.tools.water',
  },
  helpdesk: {
    iconClass: 'fa-solid fa-headset',
    color: '#7c68ff',
    pinLabel: 'H',
    titleKey: 'planning.tools.helpdesk',
  },
  boundary: {
    iconClass: 'fa-solid fa-draw-polygon',
    color: '#f4a938',
    pinLabel: 'B',
    titleKey: 'planning.tools.boundary',
  },
};

const ZONE_NAME_KEY_BY_NAME = {
  'Shivajinagar Hub': 'map.zoneNames.shivajinagar',
  'Swargate Junction': 'map.zoneNames.swargate',
  'Pune Station Gate': 'map.zoneNames.puneStation',
  'Deccan Square': 'map.zoneNames.deccan',
  'Sarasbaug Access': 'map.zoneNames.sarasbaug',
};

const EXIT_NAME_KEY_BY_NAME = {
  'Sevasadan Chowk': 'map.exitNames.sevasadanChowk',
  'Laxmi Road': 'map.exitNames.laxmiRoad',
  'Tilak Road': 'map.exitNames.tilakRoad',
  'Mamledar Kacheri': 'map.exitNames.mamledarKacheri',
  'Jayantrao Tilak Bridge': 'map.exitNames.jayantraoTilakBridge',
  'Subhanshah Dargah (Raviwar Peth)': 'map.exitNames.subhanshahDargah',
  'Govind Halwai Chowk': 'map.exitNames.govindHalwaiChowk',
  Perugate: 'map.exitNames.perugate',
  'Maharana Pratap Udyan': 'map.exitNames.maharanaPratapUdyan',
};

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

function createPlacementMarker(toolId) {
  const tool = TOOL_CONFIG[toolId] || TOOL_CONFIG.firstaid;
  const markerEl = document.createElement('div');
  markerEl.className = 'planning-marker';
  markerEl.style.borderColor = tool.color;
  markerEl.style.boxShadow = `0 0 0 4px color-mix(in srgb, ${tool.color} 28%, transparent), 0 10px 24px color-mix(in srgb, ${tool.color} 40%, black 32%)`;

  const inner = document.createElement('span');
  inner.className = 'planning-marker__inner';
  inner.style.background = tool.color;
  inner.textContent = tool.pinLabel;
  markerEl.appendChild(inner);

  return markerEl;
}

function getBoundaryFillFeature(points) {
  if (!Array.isArray(points) || points.length < 3) {
    return { type: 'FeatureCollection', features: [] };
  }

  const ring = points.map((point) => [point.lng, point.lat]);
  ring.push([points[0].lng, points[0].lat]);

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [ring],
        },
        properties: {},
      },
    ],
  };
}

function getBoundaryLineFeature(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return { type: 'FeatureCollection', features: [] };
  }

  const lineCoords = points.map((point) => [point.lng, point.lat]);

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: lineCoords,
        },
        properties: {},
      },
    ],
  };
}

export default function PlanningPage({ mapData, onBackToDashboard }) {
  const { t, i18n } = useTranslation();
  const token = import.meta.env.VITE_MAPBOX_TOKEN;
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);
  const placementMarkersRef = useRef([]);
  const boundaryMarkersRef = useRef([]);
  const placementsRef = useRef([]);
  const boundaryPointsRef = useRef([]);
  const placementCounterRef = useRef(0);
  const activeToolRef = useRef('firstaid');
  const initializedCenterRef = useRef(null);

  const [activeTool, setActiveTool] = useState('firstaid');
  const [placements, setPlacements] = useState([]);
  const [boundaryPoints, setBoundaryPoints] = useState([]);
  const [showToolToast, setShowToolToast] = useState(false);
  const [reportMessage, setReportMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMessage, setSearchMessage] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  const chartOrder = ['firstaid', 'emergency', 'water', 'helpdesk', 'boundary'];

  const pointCounts = useMemo(() => {
    const base = { firstaid: 0, emergency: 0, water: 0, helpdesk: 0, boundary: 0 };
    placements.forEach((item) => {
      const key = item?.toolId;
      if (Object.prototype.hasOwnProperty.call(base, key)) {
        base[key] += 1;
      }
    });
    return base;
  }, [placements]);

  const totalPoints = useMemo(
    () => Object.values(pointCounts).reduce((sum, value) => sum + value, 0),
    [pointCounts]
  );

  const pieGradient = useMemo(() => {
    if (totalPoints === 0) {
      return 'conic-gradient(#2a3c5e 0deg 360deg)';
    }

    let currentDeg = 0;
    const segments = chartOrder
      .filter((toolId) => pointCounts[toolId] > 0)
      .map((toolId) => {
        const tool = TOOL_CONFIG[toolId];
        const amount = pointCounts[toolId];
        const slice = (amount / totalPoints) * 360;
        const start = currentDeg;
        const end = currentDeg + slice;
        currentDeg = end;
        return `${tool.color} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`;
      });

    return `conic-gradient(${segments.join(', ')})`;
  }, [chartOrder, pointCounts, totalPoints]);

  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  useEffect(() => {
    placementsRef.current = placements;
  }, [placements]);

  useEffect(() => {
    boundaryPointsRef.current = boundaryPoints;
  }, [boundaryPoints]);

  const mapCenter = useMemo(() => {
    const center = mapData?.main_gate?.coordinates;
    if (Array.isArray(center) && center.length >= 2) {
      return center;
    }
    return DEFAULT_CENTER;
  }, [mapData?.main_gate?.coordinates]);

  if (!initializedCenterRef.current) {
    initializedCenterRef.current = mapCenter;
  }

  const localizeSectionName = (type, value) => {
    if (type === 'mainGate') {
      return t('map.mainGateName');
    }

    if (type === 'zone') {
      const key = ZONE_NAME_KEY_BY_NAME[value];
      return key ? t(key) : value;
    }

    if (type === 'exit') {
      const key = EXIT_NAME_KEY_BY_NAME[value];
      return key ? t(key) : value;
    }

    return value;
  };

  const sectionOptions = useMemo(() => {
    const options = [];
    const seen = new Set();

    const pushOption = (option) => {
      const key = `${option.type}::${String(option.name).trim().toLowerCase()}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      options.push(option);
    };

    if (Array.isArray(mapData?.main_gate?.coordinates) && mapData.main_gate.coordinates.length >= 2) {
      pushOption({
        id: 'section-main-gate',
        type: 'mainGate',
        name: mapData?.main_gate?.name || 'Main Gate',
        coordinates: mapData.main_gate.coordinates,
      });
    }

    (Array.isArray(mapData?.zones) ? mapData.zones : []).forEach((zone, index) => {
      if (!Array.isArray(zone?.coordinates) || zone.coordinates.length < 2) {
        return;
      }
      pushOption({
        id: `section-zone-${index}`,
        type: 'zone',
        name: zone?.name || `Zone ${index + 1}`,
        coordinates: zone.coordinates,
      });
    });

    (Array.isArray(mapData?.emergency_exits) ? mapData.emergency_exits : []).forEach((exitPoint, index) => {
      if (!Array.isArray(exitPoint?.coordinates) || exitPoint.coordinates.length < 2) {
        return;
      }
      pushOption({
        id: `section-exit-${index}`,
        type: 'exit',
        name: exitPoint?.name || `Exit ${index + 1}`,
        coordinates: exitPoint.coordinates,
      });
    });

    return options;
  }, [mapData?.emergency_exits, mapData?.main_gate?.coordinates, mapData?.main_gate?.name, mapData?.zones]);

  useEffect(() => {
    if (!token || !mapContainerRef.current || mapRef.current) {
      return undefined;
    }

    let mounted = true;

    ensureMapboxAssets()
      .then((mapboxgl) => {
        if (!mounted || !mapContainerRef.current || mapRef.current) {
          return;
        }

        mapboxgl.accessToken = token;

        const map = new mapboxgl.Map({
          container: mapContainerRef.current,
          style: 'mapbox://styles/mapbox/dark-v11',
          center: initializedCenterRef.current || mapCenter,
          zoom: 15.4,
          pitch: 56,
          bearing: -12,
          antialias: true,
          attributionControl: true,
        });

        map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');

        map.on('load', () => {
          map.addSource('mapbox-dem', {
            type: 'raster-dem',
            url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
            tileSize: 512,
            maxzoom: 14,
          });

          map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.12 });
          map.setFog({
            color: 'rgb(14, 24, 43)',
            'high-color': 'rgb(28, 44, 70)',
            'horizon-blend': 0.12,
          });

          map.addSource('planning-boundary-fill', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });

          map.addLayer({
            id: 'planning-boundary-fill-layer',
            type: 'fill',
            source: 'planning-boundary-fill',
            paint: {
              'fill-color': '#f4a938',
              'fill-opacity': 0.2,
            },
          });

          map.addSource('planning-boundary-line', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });

          map.addLayer({
            id: 'planning-boundary-line-layer',
            type: 'line',
            source: 'planning-boundary-line',
            paint: {
              'line-color': '#f4a938',
              'line-width': 3.2,
              'line-opacity': 0.96,
              'line-dasharray': [1.2, 1.1],
            },
          });
        });

        map.on('click', (event) => {
          const selectedTool = activeToolRef.current;
          const id = `placement-${placementCounterRef.current + 1}`;

          if (selectedTool === 'boundary') {
            const markerEl = createPlacementMarker(selectedTool);
            markerEl.classList.add('planning-marker--boundary');
            const marker = new mapboxgl.Marker({ element: markerEl, anchor: 'center' })
              .setLngLat(event.lngLat)
              .addTo(map);

            markerEl.addEventListener('click', (clickEvent) => {
              clickEvent.stopPropagation();
              removeBoundaryPointById(id);
            });

            placementCounterRef.current += 1;
            const point = {
              id,
              toolId: selectedTool,
              titleKey: TOOL_CONFIG.boundary.titleKey,
              lng: Number(event.lngLat.lng.toFixed(6)),
              lat: Number(event.lngLat.lat.toFixed(6)),
            };

            boundaryMarkersRef.current.push({ id, marker });
            const nextBoundaryPoints = [...boundaryPointsRef.current, point];
            const nextPlacements = [...placementsRef.current, point];
            boundaryPointsRef.current = nextBoundaryPoints;
            placementsRef.current = nextPlacements;
            setBoundaryPoints(nextBoundaryPoints);
            setPlacements(nextPlacements);
            setShowToolToast(true);
            window.setTimeout(() => setShowToolToast(false), 1800);
            return;
          }

          const markerEl = createPlacementMarker(selectedTool);
          const marker = new mapboxgl.Marker({ element: markerEl, anchor: 'bottom' })
            .setLngLat(event.lngLat)
            .addTo(map);

          markerEl.addEventListener('click', (clickEvent) => {
            clickEvent.stopPropagation();
            removePlacementById(id);
          });

          placementCounterRef.current += 1;
          const tool = TOOL_CONFIG[selectedTool] || TOOL_CONFIG.firstaid;

          const nextPoint = {
            id,
            toolId: selectedTool,
            titleKey: tool.titleKey,
            lng: Number(event.lngLat.lng.toFixed(6)),
            lat: Number(event.lngLat.lat.toFixed(6)),
          };

          const nextPlacements = [...placementsRef.current, nextPoint];
          placementsRef.current = nextPlacements;
          setPlacements(nextPlacements);

          placementMarkersRef.current.push({ id, marker });
          setShowToolToast(true);
          window.setTimeout(() => setShowToolToast(false), 1800);
        });

        mapRef.current = map;
      })
      .catch((error) => {
        console.error('Mapbox load failed for planning page:', error);
      });

    return () => {
      mounted = false;
      placementMarkersRef.current.forEach((entry) => entry.marker.remove());
      boundaryMarkersRef.current.forEach((entry) => entry.marker.remove());
      placementMarkersRef.current = [];
      boundaryMarkersRef.current = [];
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) {
      return;
    }

    const fillSource = map.getSource('planning-boundary-fill');
    if (fillSource) {
      fillSource.setData(getBoundaryFillFeature(boundaryPoints));
    }

    const lineSource = map.getSource('planning-boundary-line');
    if (lineSource) {
      lineSource.setData(getBoundaryLineFeature(boundaryPoints));
    }
  }, [boundaryPoints]);

  const handleSavePlan = async () => {
    const latestPlacements = placementsRef.current;
    const latestBoundaryPoints = boundaryPointsRef.current;

    if (latestPlacements.length === 0 && latestBoundaryPoints.length === 0) {
      setReportMessage(t('planning.noPointsToSave'));
      return;
    }

    const detailedPlacements = latestPlacements.map((item, index) => ({
      ...item,
      pointId: item.id || `point-${index + 1}`,
      pointType: item.toolId,
      pointLabel: t(item.titleKey),
      geoLocation: {
        latitude: item.lat,
        longitude: item.lng,
      },
    }));

    const payload = {
      generatedAt: new Date().toISOString(),
      totalPlacements: detailedPlacements.length,
      placements: detailedPlacements,
      mapPoints: detailedPlacements,
      boundaryCoordinates: latestBoundaryPoints.map((point) => [point.lng, point.lat]),
    };

    const browserHost = window?.location?.hostname || 'localhost';
    const browserProtocol = window?.location?.protocol === 'https:' ? 'https' : 'http';

    const endpointCandidates = Array.from(
      new Set([
        `${apiBaseUrl}/api/v1/planning/report-pdf`,
        `${browserProtocol}://${browserHost}:5000/api/v1/planning/report-pdf`,
        'http://localhost:5000/api/v1/planning/report-pdf',
        'http://127.0.0.1:5000/api/v1/planning/report-pdf',
      ])
    );

    try {
      let lastFailure = '';

      for (const endpoint of endpointCandidates) {
        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            const errorText = await response.text();
            lastFailure = `${response.status} from ${endpoint}${errorText ? `: ${errorText.slice(0, 120)}` : ''}`;
            continue;
          }

          const contentType = response.headers.get('content-type') || '';
          if (!contentType.toLowerCase().includes('application/pdf')) {
            const errorText = await response.text();
            lastFailure = `Unexpected response from ${endpoint}${errorText ? `: ${errorText.slice(0, 120)}` : ''}`;
            continue;
          }

          const pdfBlob = await response.blob();
          const url = URL.createObjectURL(pdfBlob);
          const link = document.createElement('a');
          link.href = url;
          link.download = 'crowdshield-plan-report.pdf';
          link.click();
          URL.revokeObjectURL(url);
          setReportMessage(t('planning.pdfGenerated'));
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Network error';
          lastFailure = `${message} from ${endpoint}`;
        }
      }

      setReportMessage(
        lastFailure
          ? `${t('planning.pdfGenerationFailed')} (${lastFailure})`
          : t('planning.pdfGenerationFailed')
      );
    } catch {
      setReportMessage(t('planning.pdfGenerationFailed'));
    }
  };

  const handleStartSimulation = () => {
    setReportMessage(t('planning.simulationReady'));
  };

  const toggleLanguage = () => {
    const nextLanguage = i18n.language === 'mr' ? 'en' : 'mr';
    i18n.changeLanguage(nextLanguage);
  };

  const removePlacementById = (id) => {
    const markerIndex = placementMarkersRef.current.findIndex((entry) => entry.id === id);
    if (markerIndex >= 0) {
      placementMarkersRef.current[markerIndex].marker.remove();
      placementMarkersRef.current.splice(markerIndex, 1);
    }

    const nextPlacements = placementsRef.current.filter((item) => item.id !== id);
    placementsRef.current = nextPlacements;
    setPlacements(nextPlacements);
  };

  const removeBoundaryPointById = (id) => {
    const markerIndex = boundaryMarkersRef.current.findIndex((entry) => entry.id === id);
    if (markerIndex >= 0) {
      boundaryMarkersRef.current[markerIndex].marker.remove();
      boundaryMarkersRef.current.splice(markerIndex, 1);
    }

    const nextBoundaryPoints = boundaryPointsRef.current.filter((item) => item.id !== id);
    const nextPlacements = placementsRef.current.filter((item) => item.id !== id);
    boundaryPointsRef.current = nextBoundaryPoints;
    placementsRef.current = nextPlacements;
    setBoundaryPoints(nextBoundaryPoints);
    setPlacements(nextPlacements);
  };

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query || query.length < 2) {
      setSearchSuggestions([]);
      setIsSearching(false);
      return undefined;
    }

    let cancelled = false;

    const timer = window.setTimeout(async () => {
      setIsSearching(true);

      const localMatches = sectionOptions
        .map((option) => ({
          id: option.id,
          label: localizeSectionName(option.type, option.name),
          coordinates: option.coordinates,
          source: 'local',
        }))
        .filter((option) => option.label.toLowerCase().includes(query.toLowerCase()));

      const remoteMatches = [];
      if (token) {
        try {
          const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?autocomplete=true&limit=6&proximity=${mapCenter[0]},${mapCenter[1]}&access_token=${encodeURIComponent(token)}`;
          const response = await fetch(url);
          if (response.ok) {
            const data = await response.json();
            (Array.isArray(data?.features) ? data.features : []).forEach((feature) => {
              if (!Array.isArray(feature?.center) || feature.center.length < 2) {
                return;
              }
              remoteMatches.push({
                id: String(feature.id || feature.place_name),
                label: String(feature.place_name || feature.text || '').trim(),
                coordinates: feature.center,
                source: 'remote',
              });
            });
          }
        } catch (error) {
          // Ignore fetch errors and keep local matches available.
        }
      }

      if (cancelled) {
        return;
      }

      const merged = [...localMatches, ...remoteMatches];
      const unique = [];
      const seen = new Set();

      merged.forEach((entry) => {
        const key = entry.label.toLowerCase();
        if (!key || seen.has(key)) {
          return;
        }
        seen.add(key);
        unique.push(entry);
      });

      setSearchSuggestions(unique.slice(0, 8));
      setIsSearching(false);
    }, 260);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [mapCenter, searchQuery, sectionOptions, t, token]);

  const flyToSuggestion = (item) => {
    if (!item || !Array.isArray(item.coordinates) || item.coordinates.length < 2 || !mapRef.current) {
      return;
    }

    setSearchQuery(item.label);
    setSearchMessage(t('planning.search.movedTo', { section: item.label }));
    setSearchSuggestions([]);

    mapRef.current.stop();
    mapRef.current.flyTo({
      center: item.coordinates,
      zoom: 16.6,
      pitch: 56,
      bearing: -12,
      duration: 1250,
      speed: 0.72,
      curve: 1.28,
      essential: true,
    });
  };

  const handleSearchSection = (event) => {
    event.preventDefault();

    const input = searchQuery.trim();
    if (!input) {
      return;
    }

    const exact = searchSuggestions.find((entry) => entry.label.toLowerCase() === input.toLowerCase());
    const fallback = searchSuggestions[0];
    const selected = exact || fallback;

    if (!selected) {
      setSearchMessage(t('planning.search.noMatch'));
      return;
    }

    flyToSuggestion(selected);
  };

  return (
    <div className="planning-page">
      <header className="planning-page__header">
        <div className="planning-page__brand">
          <img src={crowdLogo} alt={t('header.logoAlt')} className="planning-page__logo" />
          <h1>{t('planning.title')}</h1>
        </div>

        <div className="planning-page__actions">
          <button type="button" className="planning-lang-toggle" onClick={toggleLanguage} aria-label={t('header.languageToggleAria')}>
            <i className="fa-solid fa-language" aria-hidden="true" />
            <span>{i18n.language === 'mr' ? t('header.switchToEnglish') : t('header.switchToMarathi')}</span>
          </button>
          <button type="button" className="planning-action-btn" onClick={handleSavePlan}>{t('planning.actions.savePlan')}</button>
          <button type="button" className="planning-action-btn planning-action-btn--primary" onClick={handleStartSimulation}>{t('planning.actions.startSimulation')}</button>
          <button type="button" className="planning-action-btn planning-action-btn--home" onClick={onBackToDashboard}>
            <i className="fa-solid fa-house" aria-hidden="true" />
            <span>{t('planning.actions.dashboard')}</span>
          </button>
        </div>
      </header>

      <section className="planning-page__body">
        <div className="planning-map-shell">
          {token ? <div ref={mapContainerRef} className="planning-map" /> : <div className="planning-map-fallback">{t('map.fallbackSubtitle')}</div>}

          <div className="planning-legend">
            <p><i className="fa-solid fa-circle" style={{ color: '#30b864' }} /> {t('planning.legend.low')}</p>
            <p><i className="fa-solid fa-circle" style={{ color: '#f1ce37' }} /> {t('planning.legend.moderate')}</p>
            <p><i className="fa-solid fa-circle" style={{ color: '#930d0d' }} /> {t('planning.legend.critical')}</p>
          </div>
        </div>

        <aside className="planning-tools-panel">
          <form className="planning-search" onSubmit={handleSearchSection}>
            <label htmlFor="planning-section-search" className="planning-search__label">{t('planning.search.label')}</label>
            <div className="planning-search__row">
              <input
                id="planning-section-search"
                className="planning-search__input"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t('planning.search.placeholder')}
                autoComplete="off"
              />
              <button type="submit" className="planning-search__btn">{t('planning.search.go')}</button>
            </div>
            {isSearching ? <p className="planning-search__message">{t('planning.search.searching')}</p> : null}
            {!isSearching && searchSuggestions.length > 0 ? (
              <div className="planning-search__suggestions">
                {searchSuggestions.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className="planning-search__suggestion-item"
                    onClick={() => flyToSuggestion(entry)}
                  >
                    <span>{entry.label}</span>
                    <small>{entry.source === 'local' ? t('planning.search.sectionResultTag') : t('planning.search.mapResultTag')}</small>
                  </button>
                ))}
              </div>
            ) : null}
            {searchMessage ? <p className="planning-search__message">{searchMessage}</p> : null}
          </form>

          {Object.entries(TOOL_CONFIG).map(([toolId, tool]) => {
            const isActive = toolId === activeTool;
            return (
              <button
                key={toolId}
                type="button"
                className={`planning-tool-card${isActive ? ' planning-tool-card--active' : ''}`}
                onClick={() => setActiveTool(toolId)}
              >
                <span className="planning-tool-card__icon" style={{ background: tool.color }}>
                  <i className={tool.iconClass} aria-hidden="true" />
                </span>
                <span className="planning-tool-card__label">{t(tool.titleKey)}</span>
              </button>
            );
          })}

          <div className="planning-summary-card">
            <h4>{t('planning.summary.title')}</h4>
            <p>{t('planning.summary.total')}: {placements.length}</p>
            {reportMessage ? <p className="planning-summary-card__report">{reportMessage}</p> : null}
          </div>
        </aside>
      </section>

      <section className="planning-infograph" aria-label={t('planning.infograph.title')}>
        <div className="planning-chart-card">
          <h3>{t('planning.infograph.barTitle')}</h3>
          <div className="planning-bar-chart">
            {chartOrder.map((toolId) => {
              const count = pointCounts[toolId];
              const tool = TOOL_CONFIG[toolId];
              const pct = totalPoints > 0 ? (count / totalPoints) * 100 : 0;

              return (
                <div className="planning-bar-row" key={`bar-${toolId}`}>
                  <div className="planning-bar-row__label">
                    <span className="planning-dot" style={{ background: tool.color }} />
                    <span>{t(tool.titleKey)}</span>
                  </div>
                  <div className="planning-bar-track">
                    <div
                      className="planning-bar-fill"
                      style={{ width: `${pct}%`, background: tool.color }}
                    />
                  </div>
                  <span className="planning-bar-value">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="planning-chart-card planning-chart-card--pie">
          <h3>{t('planning.infograph.pieTitle')}</h3>
          <div className="planning-pie-wrap">
            <div className="planning-pie" style={{ background: pieGradient }}>
              <div className="planning-pie__center">
                <span>{totalPoints}</span>
                <small>{t('planning.infograph.total')}</small>
              </div>
            </div>

            <div className="planning-pie-legend">
              {chartOrder.map((toolId) => {
                const tool = TOOL_CONFIG[toolId];
                const count = pointCounts[toolId];
                const pct = totalPoints > 0 ? Math.round((count / totalPoints) * 100) : 0;

                return (
                  <div className="planning-pie-legend__item" key={`pie-${toolId}`}>
                    <span className="planning-dot" style={{ background: tool.color }} />
                    <span>{t(tool.titleKey)}</span>
                    <span>{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {showToolToast ? (
        <div className="planning-toast" role="status" aria-live="polite">
          <i className="fa-solid fa-circle-check" aria-hidden="true" />
          <span>{t('planning.toastPlaced')}</span>
        </div>
      ) : null}
    </div>
  );
}
