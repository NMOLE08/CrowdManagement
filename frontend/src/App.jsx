import { useEffect, useMemo, useRef, useState } from 'react';
import LiveCommandMap from './components/LiveCommandMap';
import ChatLauncherButton from './components/ChatLauncherButton';
import ChatWindow from './components/ChatWindow';
import FallbackPage from './components/FallbackPage';
import { getDemoSuggestion, triggerHighAlert, triggerWarningAlert } from './api/mlApi';
import { useMlSceneData } from './hooks/useMlSceneData';
import { useCameraAnalytics } from './hooks/useCameraAnalytics';
import { useEmotionDetection } from './hooks/useEmotionDetection';
import { useTranslation } from 'react-i18next';
import crowdLogo from './assets/CrowdLogo.png';

export default function App() {
  const { t, i18n } = useTranslation();
  const { scene, loading, error, systemStatus } = useMlSceneData(7000);
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [isAmberDemoOpen, setIsAmberDemoOpen] = useState(false);
  const [amberActionNote, setAmberActionNote] = useState('');
  const [isRedDemoOpen, setIsRedDemoOpen] = useState(false);
  const [redActionNote, setRedActionNote] = useState('');
  const [redCountdown, setRedCountdown] = useState(10);
  const [highlightedRoute, setHighlightedRoute] = useState(null);
  const [amberSuggestion, setAmberSuggestion] = useState('');
  const [redSuggestion, setRedSuggestion] = useState('');
  const [isAmberActionLoading, setIsAmberActionLoading] = useState(false);
  const [isRedActionLoading, setIsRedActionLoading] = useState(false);
  const amberSendInFlightRef = useRef(false);
  const redSendInFlightRef = useRef(false);
  const redAutoTriggeredRef = useRef(false);
  const modalVideoRef = useRef(null);
  const { cameras, getCameraDetails } = useCameraAnalytics(scene);
  const emotionDetection = useEmotionDetection(selectedCamera);

  const emotionKeyByName = {
    calm: 'emotion.calm',
    neutral: 'emotion.neutral',
    anxious: 'emotion.anxious',
    panic: 'emotion.panic',
  };

  const locationKeyByText = {
    'East gate approach lane, Dagdusheth Temple perimeter.': 'location.cam1',
    'North barricade checkpoint near vendor corridor.': 'location.cam2',
    'South lane queue spillover near utility gate.': 'location.cam3',
    'Inner ring walkway near barricade turn.': 'location.cam4',
    'Vendor-side corridor near hydration point.': 'location.cam5',
    'Temple exit merge lane near crowd diversion rope.': 'location.cam6',
    'Location details unavailable.': 'location.unavailable',
  };

  const alertKeyByMessage = {
    'Critical alert at Shivajinagar Hub - 9 min ago': 'alerts.defaultCritical',
    'Moderate surge at Swargate Junction - 21 min ago': 'alerts.defaultModerate',
    'Flow stabilized near Sarasbaug Access - 37 min ago': 'alerts.defaultSafe',
    'Alert update pending': 'alerts.pending',
  };

  const hotspotZoneKeyByName = {
    'Shivajinagar Hub': 'map.zoneNames.shivajinagar',
    'Swargate Junction': 'map.zoneNames.swargate',
    'Pune Station Gate': 'map.zoneNames.puneStation',
    'Deccan Square': 'map.zoneNames.deccan',
    'Sarasbaug Access': 'map.zoneNames.sarasbaug',
  };

  const cameraTitleKeyByName = {
    cam1: 'cameraNames.cam1',
    cam2: 'cameraNames.cam2',
    cam3: 'cameraNames.cam3',
    cam4: 'cameraNames.cam4',
    cam5: 'cameraNames.cam5',
    cam6: 'cameraNames.cam6',
  };

  const numberLocale = i18n.language === 'mr' ? 'mr-IN' : 'en-IN';

  const formatStatusTime = (isoTime) => {
    if (!isoTime) {
      return t('common.na');
    }
    const date = new Date(isoTime);
    if (Number.isNaN(date.getTime())) {
      return t('common.na');
    }
    return date.toLocaleString(numberLocale);
  };

  const headerStatusText = !systemStatus?.networkOnline
    ? t('fallback.networkOffline')
    : loading
      ? t('status.syncing')
      : systemStatus?.isFallbackActive
        ? t('status.fallbackMode')
        : t('status.allOkay');

  const fallbackModeLabel = systemStatus?.isFallbackActive
    ? t('fallback.modeFallback')
    : t('fallback.modeLive');

  const fallbackSourceLabel = systemStatus?.dataSource === 'live'
    ? t('fallback.sourceLive')
    : systemStatus?.dataSource === 'cache'
      ? t('fallback.sourceCache')
      : t('fallback.sourceDefault');

  const formatLocalizedNumber = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return '0';
    }
    return numeric.toLocaleString(numberLocale);
  };

  const localizeEmotion = (value) => {
    const key = emotionKeyByName[String(value || '').toLowerCase()];
    return key ? t(key) : value || t('common.na');
  };

  const localizeLocation = (value) => {
    const key = locationKeyByText[value];
    return key ? t(key) : value || t('location.unavailable');
  };

  const localizeAlertMessage = (value) => {
    const key = alertKeyByMessage[value];
    return key ? t(key) : value || t('alerts.pending');
  };

  const localizeSystemValue = (value) => {
    if (!value) {
      return t('common.online');
    }
    if (String(value).trim().toLowerCase() === 'online') {
      return t('common.online');
    }
    return value;
  };

  const localizeCameraTitle = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    const key = cameraTitleKeyByName[normalized];
    return key ? t(key) : value;
  };

  const localizeHotspotValue = (value) => {
    if (!value) {
      return t('metrics.awaitingModelUpdate');
    }

    const text = String(value);
    const [left, right] = text.split(' - ');
    const zoneKey = hotspotZoneKeyByName[left?.trim()];
    const zoneLabel = zoneKey ? t(zoneKey) : left;

    if (!right) {
      return zoneLabel || text;
    }

    const percentText = right.trim();
    if (!percentText.endsWith('%')) {
      return `${zoneLabel} - ${percentText}`;
    }

    const rawNumber = Number(percentText.slice(0, -1));
    if (!Number.isFinite(rawNumber)) {
      return `${zoneLabel} - ${percentText}`;
    }

    return `${zoneLabel} - ${formatLocalizedNumber(rawNumber)}%`;
  };

  const getHotspotFromMapZones = (zones) => {
    if (!Array.isArray(zones) || zones.length === 0) {
      return '';
    }

    const sorted = [...zones]
      .filter((zone) => Number.isFinite(Number(zone?.riskScore)))
      .sort((a, b) => Number(b.riskScore) - Number(a.riskScore));

    const topZone = sorted[0];
    if (!topZone) {
      return '';
    }

    const zoneKey = hotspotZoneKeyByName[topZone.name];
    const zoneLabel = zoneKey ? t(zoneKey) : topZone.name;
    const score = Number(topZone.riskScore);
    return `${zoneLabel} - ${formatLocalizedNumber(score)}%`;
  };

  const hotspotFromMap = getHotspotFromMapZones(scene?.map?.zones);

  const shortestExitRoute = useMemo(() => {
    const mainGateCoords = scene?.map?.main_gate?.coordinates;
    const exits = Array.isArray(scene?.map?.emergency_exits) ? scene.map.emergency_exits : [];

    if (!Array.isArray(mainGateCoords) || mainGateCoords.length < 2 || exits.length === 0) {
      return null;
    }

    const toRadians = (value) => (value * Math.PI) / 180;
    const haversineMeters = (a, b) => {
      const [lng1, lat1] = a;
      const [lng2, lat2] = b;

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
    };

    const ranked = exits
      .filter((exitPoint) => Array.isArray(exitPoint?.coordinates) && exitPoint.coordinates.length >= 2)
      .map((exitPoint) => ({
        ...exitPoint,
        distance: haversineMeters(mainGateCoords, exitPoint.coordinates),
      }))
      .sort((a, b) => a.distance - b.distance);

    if (ranked.length === 0) {
      return null;
    }

    const targetExit = ranked[0];
    return {
      coordinates: [mainGateCoords, targetExit.coordinates],
      exitName: targetExit.name,
      routeName: targetExit.route,
    };
  }, [scene?.map?.emergency_exits, scene?.map?.main_gate?.coordinates]);

  const amberDemoCamera = useMemo(() => {
    if (!Array.isArray(cameras) || cameras.length === 0) {
      return null;
    }

    const ranked = [...cameras].sort((a, b) => {
      const aCount = Number(getCameraDetails(a).count || 0);
      const bCount = Number(getCameraDetails(b).count || 0);
      return bCount - aCount;
    });

    return ranked[0] || null;
  }, [cameras, getCameraDetails]);

  const amberCameraCount = amberDemoCamera ? getCameraDetails(amberDemoCamera).count : 0;
  const amberCameraLocation = amberDemoCamera
    ? localizeLocation(getCameraDetails(amberDemoCamera).locationDetails)
    : t('location.unavailable');

  const metrics = [
    {
      label: t('metrics.liveCount'),
      value: formatLocalizedNumber(scene?.metrics?.live_count || 0),
    },
    {
      label: t('metrics.hotspot'),
      value: hotspotFromMap || localizeHotspotValue(scene?.metrics?.hotspot),
    },
    {
      label: t('metrics.system'),
      value: localizeSystemValue(scene?.metrics?.system),
    },
  ];

  const alerts = (scene?.alerts || []).map((alert, idx) => ({
    id: alert.id || `alert-${idx}`,
    message: localizeAlertMessage(alert.message || t('alerts.pending')),
    severity: ['critical', 'medium', 'safe'].includes(alert.severity)
      ? alert.severity
      : 'medium',
  }));

  const mainPlace = t('mainPlace.name');

  const activeCameraStats = useMemo(() => {
    if (!selectedCamera) {
      return {
        count: 0,
        emotion: t('common.na'),
        locationDetails: t('location.unavailable'),
        emotionBars: [],
      };
    }

    const details = getCameraDetails(selectedCamera);

    return {
      count: details.count,
      emotion: localizeEmotion(emotionDetection.primaryEmotion),
      locationDetails: localizeLocation(details.locationDetails),
      emotionBars: emotionDetection.emotionBars.map((entry) => ({
        ...entry,
        displayName: localizeEmotion(entry.name),
      })),
    };
  }, [emotionDetection.emotionBars, emotionDetection.primaryEmotion, getCameraDetails, selectedCamera, t]);

  const toggleLanguage = () => {
    const nextLanguage = i18n.language === 'mr' ? 'en' : 'mr';
    i18n.changeLanguage(nextLanguage);
  };

  useEffect(() => {
    if (!selectedCamera) {
      return undefined;
    }

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setSelectedCamera(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedCamera]);

  useEffect(() => {
    if (!selectedCamera || !selectedCamera.streamUrl || !modalVideoRef.current) {
      return;
    }

    const playPromise = modalVideoRef.current.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        // Keep controls available so user can start playback manually if browser blocks autoplay.
      });
    }
  }, [selectedCamera]);

  useEffect(() => {
    if (!isAmberDemoOpen) {
      return undefined;
    }

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsAmberDemoOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isAmberDemoOpen]);

  useEffect(() => {
    if (!isRedDemoOpen) {
      return undefined;
    }

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsRedDemoOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isRedDemoOpen]);

  useEffect(() => {
    if (!isRedDemoOpen || redCountdown <= 0) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setRedCountdown((prev) => prev - 1);
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [isRedDemoOpen, redCountdown]);

  useEffect(() => {
    if (!isRedDemoOpen || redCountdown !== 0 || redAutoTriggeredRef.current) {
      return;
    }

    redAutoTriggeredRef.current = true;

    const triggerAutoHighAlert = async () => {
      setIsRedActionLoading(true);
      try {
        const response = await triggerHighAlert(i18n.resolvedLanguage || i18n.language);
        setHighlightedRoute(shortestExitRoute);
        if (response?.aiSuggestion) {
          setRedSuggestion(response.aiSuggestion);
        }
        setRedActionNote(t('demoCritical.autoSmsSent'));
        setIsRedDemoOpen(false);
      } catch (err) {
        setRedActionNote(t('demoCritical.actionError'));
      } finally {
        setIsRedActionLoading(false);
      }
    };

    triggerAutoHighAlert();
  }, [i18n.language, i18n.resolvedLanguage, isRedDemoOpen, redCountdown, shortestExitRoute, t]);

  useEffect(() => {
    if (!isRedDemoOpen) {
      redAutoTriggeredRef.current = false;
      redSendInFlightRef.current = false;
    }
  }, [isRedDemoOpen]);

  useEffect(() => {
    if (!isAmberDemoOpen) {
      amberSendInFlightRef.current = false;
    }
  }, [isAmberDemoOpen]);

  useEffect(() => {
    if (!isAmberDemoOpen) {
      return undefined;
    }

    let cancelled = false;
    const loadSuggestion = async () => {
      try {
        const response = await getDemoSuggestion('warning', i18n.resolvedLanguage || i18n.language);
        if (!cancelled) {
          setAmberSuggestion(response?.suggestion || t('demo.rerouteGate2'));
        }
      } catch {
        if (!cancelled) {
          setAmberSuggestion(t('demo.rerouteGate2'));
        }
      }
    };

    loadSuggestion();
    return () => {
      cancelled = true;
    };
  }, [i18n.language, i18n.resolvedLanguage, isAmberDemoOpen, t]);

  useEffect(() => {
    if (!isRedDemoOpen) {
      return undefined;
    }

    let cancelled = false;
    const loadSuggestion = async () => {
      try {
        const response = await getDemoSuggestion('high', i18n.resolvedLanguage || i18n.language);
        if (!cancelled) {
          setRedSuggestion(response?.suggestion || t('demoCritical.rerouteNearestExit'));
        }
      } catch {
        if (!cancelled) {
          setRedSuggestion(t('demoCritical.rerouteNearestExit'));
        }
      }
    };

    loadSuggestion();
    return () => {
      cancelled = true;
    };
  }, [i18n.language, i18n.resolvedLanguage, isRedDemoOpen, t]);

  const openAmberDemo = () => {
    setAmberActionNote('');
    setAmberSuggestion(t('demo.suggestionLoading'));
    setIsAmberDemoOpen(true);
  };

  const closeAmberDemo = () => {
    setIsAmberDemoOpen(false);
  };

  const onAmberSendSms = async () => {
    if (amberSendInFlightRef.current) {
      return;
    }

    amberSendInFlightRef.current = true;
    setIsAmberActionLoading(true);
    try {
      const response = await triggerWarningAlert(i18n.resolvedLanguage || i18n.language);
      if (response?.aiSuggestion) {
        setAmberSuggestion(response.aiSuggestion);
      }
      setAmberActionNote(t('demo.smsSent'));
    } catch (err) {
      setAmberActionNote(t('demo.actionError'));
    } finally {
      amberSendInFlightRef.current = false;
      setIsAmberActionLoading(false);
    }
  };

  const onAmberIgnore = () => {
    setAmberActionNote('');
    closeAmberDemo();
  };

  const openRedDemo = () => {
    redAutoTriggeredRef.current = false;
    redSendInFlightRef.current = false;
    setHighlightedRoute(null);
    setRedActionNote('');
    setRedCountdown(10);
    setRedSuggestion(t('demoCritical.suggestionLoading'));
    setIsRedDemoOpen(true);
  };

  const closeRedDemo = () => {
    setIsRedDemoOpen(false);
  };

  const onRedSendSms = async () => {
    if (redSendInFlightRef.current) {
      return;
    }

    redSendInFlightRef.current = true;
    redAutoTriggeredRef.current = true;
    setIsRedActionLoading(true);
    try {
      const response = await triggerHighAlert(i18n.resolvedLanguage || i18n.language);
      setHighlightedRoute(shortestExitRoute);
      if (response?.aiSuggestion) {
        setRedSuggestion(response.aiSuggestion);
      }
      setRedActionNote(t('demoCritical.smsSent'));
      closeRedDemo();
    } catch (err) {
      setRedActionNote(t('demoCritical.actionError'));
    } finally {
      redSendInFlightRef.current = false;
      setIsRedActionLoading(false);
    }
  };

  const onRedIgnore = () => {
    setRedActionNote('');
    closeRedDemo();
  };

  return (
    <div className={`dashboard-shell${isAmberDemoOpen ? ' dashboard-shell--amber' : ''}`}>
      <header className={`dashboard-header${systemStatus?.isFallbackActive ? ' dashboard-header--emergency' : ''}`}>

        <div className="logo-block">
          <span className="logo-badge">
            <img
              src={crowdLogo}
              alt={t('header.logoAlt')}
              className="logo-image"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                const fallback = e.currentTarget.nextElementSibling;
                if (fallback) {
                  fallback.style.display = 'grid';
                }
              }}
            />
            <span className="logo-fallback">CS</span>
          </span>
          <div>
            <p className="logo-title">CrowdShield</p>
            <p className="logo-subtitle">{t('header.subtitle')}</p>
          </div>
        </div>

        <div className="header-right">
          <div className="status-block" aria-live="polite">
            <span className="status-icon" aria-hidden="true">◉</span>
            <span>{headerStatusText}</span>
          </div>
          <button
            type="button"
            className="lang-toggle"
            onClick={toggleLanguage}
            aria-label={t('header.languageToggleAria')}
          >
            <i className="fa-solid fa-language" aria-hidden="true" />
            <span>{i18n.language === 'mr' ? t('header.switchToEnglish') : t('header.switchToMarathi')}</span>
          </button>
        </div>
      </header>

      {systemStatus?.isFallbackActive ? (
        <FallbackPage scene={scene} systemStatus={systemStatus} />
      ) : (
        <main className="dashboard-main">
          <section className="upper-grid">
            <aside className="left-panel">
              <div className="panel-card">
                <div className="main-place-block" aria-label={t('mainPlace.label')}>
                  <p className="main-place-label">{t('mainPlace.label')}</p>
                  <p className="main-place-name">{mainPlace}</p>
                </div>
                <h2>{t('sections.keyMetrics')}</h2>
                <div className="metric-list">
                  {metrics.map((metric) => (
                    <article className="metric-item" key={metric.label}>
                      <p className="metric-label">{metric.label}</p>
                      <p className="metric-value">{metric.value}</p>
                    </article>
                  ))}
                </div>
              </div>

              <div className="panel-card">
                <h2>{t('sections.alertLog')}</h2>
                <ul className="alert-list">
                  {alerts.map((alert) => (
                    <li key={alert.id} className={`alert-item alert-item--${alert.severity}`}>
                      {alert.message}
                    </li>
                  ))}
                </ul>
              </div>
            </aside>

            <section className="map-panel" aria-label={t('sections.mapPreview')}>
              <div className="map-inner map-inner--live">
                <LiveCommandMap mapData={scene?.map} highlightedRoute={highlightedRoute} />
              </div>
            </section>
          </section>

          <section className="camera-section" aria-label={t('sections.cameraFeed')}>
            <div className="camera-section__header">
              <h2>{t('sections.cameraFeed')}</h2>
            </div>

            <div className="camera-board" aria-label={t('sections.cameraFeeds')}>
              {cameras.map((cam) => (
                <article
                  className={`camera-card${cam.live ? ' camera-card--live' : ''}`}
                  key={cam.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedCamera(cam)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedCamera(cam);
                    }
                  }}
                >
                  <div className="camera-card__frame">
                    {cam.streamUrl ? (
                      <video
                        className="camera-card__video"
                        src={cam.streamUrl}
                        autoPlay
                        muted
                        loop
                        preload="metadata"
                        playsInline
                        controls={false}
                      />
                    ) : (
                      <div className="camera-card__placeholder" aria-hidden="true" />
                    )}
                  </div>
                  <div className="camera-label-row">
                    <span>{localizeCameraTitle(cam.title)}</span>
                    {cam.live ? <span className="live-pill">{t('common.live')}</span> : null}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="demo-actions" aria-label="Demo actions">
            <button
              type="button"
              className="demo-btn demo-btn--orange"
              onClick={openAmberDemo}
            >
              DEMO
            </button>
            <button type="button" className="demo-btn demo-btn--red" onClick={openRedDemo}>DEMO</button>
          </section>
        </main>
      )}

        <ChatLauncherButton />
        <ChatWindow isFallbackActive={systemStatus?.isFallbackActive} />

        {selectedCamera ? (
          <div
            className="camera-modal-overlay"
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setSelectedCamera(null);
              }
            }}
          >
            <section className="camera-modal" role="dialog" aria-modal="true" aria-label={t('camera.details')}>
              <button
                type="button"
                className="camera-modal__close"
                aria-label={t('camera.closeDetails')}
                onClick={() => setSelectedCamera(null)}
              >
                ×
              </button>

              <div className="camera-modal__top">
                <div className="camera-modal__video-wrap">
                  {selectedCamera.streamUrl ? (
                    <video
                      ref={modalVideoRef}
                      className="camera-modal__video"
                      src={selectedCamera.streamUrl}
                      autoPlay
                      muted
                      loop
                      preload="auto"
                      controls
                      playsInline
                    />
                  ) : (
                    <div className="camera-modal__video-placeholder">{localizeCameraTitle(selectedCamera.title)}</div>
                  )}
                </div>

                <div className="camera-modal__side">
                  <div className="camera-modal__stat-box">
                    <p className="camera-modal__stat-title">{t('camera.count')}</p>
                    <p className="camera-modal__stat-value">{formatLocalizedNumber(activeCameraStats.count)}</p>
                  </div>

                  <div className="camera-modal__stat-box">
                    <p className="camera-modal__stat-title">{t('camera.emotion')}</p>
                    <p className="camera-modal__stat-value">{activeCameraStats.emotion}</p>
                  </div>

                  <div className="camera-modal__emotion-bars" aria-label={t('camera.emotionBreakdown')}>
                    {activeCameraStats.emotionBars.length > 0 ? (
                      activeCameraStats.emotionBars.map((entry) => (
                        <div key={entry.name} className="camera-modal__bar-row">
                          <span className="camera-modal__bar-label">{entry.displayName || entry.name}</span>
                          <div className="camera-modal__bar-track">
                            <span className="camera-modal__bar-fill" style={{ width: `${entry.percentage}%` }} />
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="camera-modal__no-emotion">{t('camera.noEmotionScores')}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="camera-modal__location">
                <p className="camera-modal__location-title">{t('camera.locationDetails')}</p>
                <p className="camera-modal__location-text">{activeCameraStats.locationDetails}</p>
              </div>
            </section>
          </div>
        ) : null}

        {isAmberDemoOpen ? (
          <div
            className="amber-overlay"
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                closeAmberDemo();
              }
            }}
          >
            <section className="amber-card" role="dialog" aria-modal="true" aria-label={t('demo.title')}>
              <button
                type="button"
                className="amber-close"
                aria-label={t('demo.close')}
                onClick={closeAmberDemo}
              >
                ×
              </button>

              <div className="amber-title-pill">{t('demo.title')}</div>

              <p className="amber-warning-text">{t('demo.warningText')}</p>

              <div className="amber-content-grid">
                <article className="amber-live-panel">
                  <div className="amber-live-frame">
                    {amberDemoCamera?.streamUrl ? (
                      <video
                        className="amber-live-video"
                        src={amberDemoCamera.streamUrl}
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="metadata"
                      />
                    ) : (
                      <div className="amber-live-fallback">{t('demo.liveCameraFeed')}</div>
                    )}
                  </div>
                  <p className="amber-location-text">
                    <span>{t('camera.locationDetails')}:</span> {amberCameraLocation}
                  </p>
                </article>

                <aside className="amber-insight-panel">
                  <div className="amber-info-box">
                    <p className="amber-info-title">{t('demo.crowdDensity')}</p>
                    <p className="amber-info-value">{formatLocalizedNumber(amberCameraCount)}</p>
                    <p className="amber-info-sub">{t('demo.neutralExpression')}</p>
                  </div>

                  <div className="amber-info-box amber-info-box--ai">
                    <p className="amber-info-title">{t('demo.aiSuggestion')}</p>
                    <p className="amber-info-value amber-info-value--text amber-info-value--ai">{amberSuggestion || t('demo.rerouteGate2')}</p>
                  </div>
                </aside>
              </div>

              <div className="amber-actions">
                <button type="button" className="amber-action-btn amber-action-btn--sms" onClick={onAmberSendSms} disabled={isAmberActionLoading}>
                  {isAmberActionLoading ? t('demo.sending') : t('demo.sendSms')}
                </button>
                <button type="button" className="amber-action-btn amber-action-btn--ignore" onClick={onAmberIgnore}>
                  {t('demo.ignore')}
                </button>
              </div>

              {amberActionNote ? <p className="amber-action-note">{amberActionNote}</p> : null}
            </section>
          </div>
        ) : null}

        {isRedDemoOpen ? (
          <div
            className="amber-overlay amber-overlay--critical"
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                closeRedDemo();
              }
            }}
          >
            <section className="amber-card amber-card--critical" role="dialog" aria-modal="true" aria-label={t('demoCritical.title')}>
              <button
                type="button"
                className="amber-close amber-close--critical"
                aria-label={t('demoCritical.close')}
                onClick={closeRedDemo}
              >
                ×
              </button>

              <div className="amber-title-pill amber-title-pill--critical">{t('demoCritical.title')}</div>

              <p className="amber-warning-text">{t('demoCritical.warningText')}</p>

              <div className="amber-content-grid">
                <article className="amber-live-panel">
                  <div className="amber-live-frame">
                    {amberDemoCamera?.streamUrl ? (
                      <video
                        className="amber-live-video"
                        src={amberDemoCamera.streamUrl}
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="metadata"
                      />
                    ) : (
                      <div className="amber-live-fallback">{t('demoCritical.liveCameraFeed')}</div>
                    )}
                  </div>
                  <p className="amber-location-text">
                    <span>{t('camera.locationDetails')}:</span> {amberCameraLocation}
                  </p>
                </article>

                <aside className="amber-insight-panel">
                  <div className="amber-info-box">
                    <p className="amber-info-title">{t('demoCritical.crowdDensity')}</p>
                    <p className="amber-info-value">{formatLocalizedNumber(amberCameraCount)}</p>
                    <p className="amber-info-sub">{t('demoCritical.neutralExpression')}</p>
                  </div>

                  <div className="amber-info-box amber-info-box--ai amber-info-box--critical-ai">
                    <p className="amber-info-title">{t('demoCritical.aiSuggestion')}</p>
                    <p className="amber-info-value amber-info-value--text amber-info-value--ai">{redSuggestion || t('demoCritical.rerouteNearestExit')}</p>
                  </div>
                </aside>
              </div>

              <p className="critical-countdown">
                {t('demoCritical.countdownLabel')}: {formatLocalizedNumber(redCountdown)}
              </p>

              <div className="amber-actions">
                <button type="button" className="amber-action-btn amber-action-btn--sms" onClick={onRedSendSms} disabled={isRedActionLoading}>
                  {isRedActionLoading ? t('demoCritical.sending') : t('demoCritical.sendSms')}
                </button>
                <button type="button" className="amber-action-btn amber-action-btn--ignore" onClick={onRedIgnore}>
                  {t('demoCritical.ignore')}
                </button>
              </div>

              {redActionNote ? <p className="amber-action-note">{redActionNote}</p> : null}
            </section>
          </div>
        ) : null}
    </div>
  );
}
