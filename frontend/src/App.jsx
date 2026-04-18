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
import crowdNameLogo from './assets/CrowdnameLogo.png';

const RED_ALERT_TRIGGER_KEY = 'crowdshield_red_alert_trigger_at';

export default function App({ navigate, activeRole }) {
  const { t, i18n } = useTranslation();
  const { scene, loading, error, systemStatus } = useMlSceneData(900);
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
  const [isAmberDemoPending, setIsAmberDemoPending] = useState(false);
  const [isAmberIgnored, setIsAmberIgnored] = useState(false);
  const [isRedActivated, setIsRedActivated] = useState(false);
  const amberSendInFlightRef = useRef(false);
  const redSendInFlightRef = useRef(false);
  const redAutoTriggeredRef = useRef(false);
  const redDelayTimerRef = useRef(null);
  const amberDelayTimerRef = useRef(null);
  const modalVideoRef = useRef(null);
  const [isRedDemoPending, setIsRedDemoPending] = useState(false);
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
    'main entrance': 'cameraNames.cam1',
    'gate 1': 'cameraNames.cam2',
    'gate 2': 'cameraNames.cam3',
    'gate 3': 'cameraNames.cam4',
    'gate 4': 'cameraNames.cam5',
    'gate 5': 'cameraNames.cam6',
  };

  const numberLocale = i18n.language === 'mr' ? 'mr-IN' : 'en-IN';

  const headerStatusText = !systemStatus?.networkOnline
    ? t('fallback.networkOffline')
    : loading
      ? t('status.syncing')
      : systemStatus?.isFallbackActive
        ? t('status.fallbackMode')
        : isRedActivated
          ? t('status.critical')
          : isAmberIgnored 
            ? t('status.warning')
            : t('status.allOkay');

  const formatLocalizedNumber = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return '0';
    }
    return numeric.toLocaleString(numberLocale);
  };

  const isAllOkay = !loading && 
                    !isAmberDemoPending && !isRedDemoPending &&
                    !isAmberIgnored && !isRedActivated &&
                    systemStatus?.networkOnline && !systemStatus?.isFallbackActive;

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

  const totalLiveCount = useMemo(() => {
    const cameraSum = (cameras || []).reduce((acc, cam) => acc + (Number(cam.ml_count ?? cam.count ?? 0)), 0);
    return cameraSum;
  }, [cameras]);

  const metrics = [
    {
      label: t('metrics.liveCount'),
      value: formatLocalizedNumber(totalLiveCount),
      isDynamic: true,
    },
    {
      label: t('metrics.hotspot'),
      value: `Gate 4-${formatLocalizedNumber(cameras.find(c => c.id === 5)?.ml_count ?? 0)}`,
      isDynamic: true,
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

    // Find the latest camera record from the live analytics array to ensure the modal stays updated
    const liveCam = cameras.find(c => c.id === selectedCamera.id) || selectedCamera;
    const details = getCameraDetails(liveCam);
    const primaryEmotion = liveCam.primary_emotion || liveCam.emotion || 'Calm';

    return {
      count: details.count,
      emotion: localizeEmotion(primaryEmotion),
      locationDetails: localizeLocation(details.locationDetails),
      emotionBars: (liveCam.emotion_scores ? Object.entries(liveCam.emotion_scores).map(([name, percentage]) => ({
        name,
        percentage,
        displayName: localizeEmotion(name)
      })) : []).sort((a, b) => b.percentage - a.percentage),
    };
  }, [cameras, getCameraDetails, selectedCamera, t]);

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
    if (amberDelayTimerRef.current) return;
    setAmberActionNote('');
    setAmberSuggestion(t('demo.suggestionLoading'));
    setIsAmberDemoPending(true);
    setIsAmberIgnored(false); // Reset ignored state when starting a new demo

    amberDelayTimerRef.current = window.setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setIsAmberDemoOpen(true);
      setIsAmberDemoPending(false);
      amberDelayTimerRef.current = null;
    }, 3000);
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
    setIsAmberIgnored(true); // Persist warning state in navbar
    closeAmberDemo();
  };

  const notifyOfficerRedAlertTriggered = () => {
    try {
      window.localStorage.setItem(RED_ALERT_TRIGGER_KEY, String(Date.now()));
    } catch {
      // Continue even if browser blocks storage; dashboard flow should still work.
    }
  };

  const openRedDemo = () => {
    redAutoTriggeredRef.current = false;
    redSendInFlightRef.current = false;
    setHighlightedRoute(null);
    setRedActionNote('');
    setRedCountdown(10);
    setIsRedActivated(false); // Reset persistent critical state on new demo
    setRedSuggestion(t('demoCritical.suggestionLoading'));
    setIsRedDemoPending(true);

    redDelayTimerRef.current = window.setTimeout(() => {
      notifyOfficerRedAlertTriggered();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setIsRedDemoOpen(true);
      setIsRedDemoPending(false);
      redDelayTimerRef.current = null;
    }, 3000);
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
      setIsRedActivated(true); // Navbar turns red permanently
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
      {isRedDemoOpen && <div className="screen-glow--critical" aria-hidden="true" />}
      <header className={`dashboard-header${isRedActivated ? ' dashboard-header--critical' : isAmberIgnored ? ' dashboard-header--warning' : isAllOkay ? ' dashboard-header--success' : ''}`}>
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
            <img src={crowdNameLogo} alt="CrowdShield" className="logo-name-image" />
          </div>
        </div>

        <div className="header-right">
          {activeRole === 'admin' && (
            <button
              type="button"
              className="lang-toggle"
              onClick={() => navigate('/planning')}
              aria-label={t('header.planEvent')}
            >
              <i className="fa-solid fa-calendar-check" aria-hidden="true" />
              <span>{t('header.planEvent')}</span>
            </button>
          )}


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
                    <article className={`metric-item${metric.isDynamic ? ' metric-item--dynamic' : ''}`} key={metric.label}>
                      <p className="metric-label">{metric.label}</p>
                      <p className="metric-value" key={metric.isDynamic ? metric.value : undefined}>{metric.value}</p>
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
                 <LiveCommandMap mapData={scene?.map} cameras={cameras} highlightedRoute={highlightedRoute} />
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
                  className={`camera-card${cam.live ? ' camera-card--live' : ''}${cam.id === 5 ? ' camera-card--gate4' : ''}`}
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
                    {cam.streamUrl && cam.streamUrl.startsWith('data:image') ? (
                      <img
                        className="camera-card__video"
                        src={cam.streamUrl}
                        alt={localizeCameraTitle(cam.title)}
                      />
                    ) : cam.streamUrl ? (
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
                    <div className="camera-label-left">
                      <span>{localizeCameraTitle(cam.title)}</span>
                      {cam.live ? <span className="live-pill">{t('common.live')}</span> : null}
                    </div>
                    <div className="camera-count-badge" aria-label={t('camera.count')}>
                      <i className="fa-solid fa-users" aria-hidden="true" />
                      <span>{formatLocalizedNumber(cam.ml_count ?? cam.count ?? 0)}</span>
                    </div>
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
              disabled={isAmberDemoPending}
            >
              {isAmberDemoPending ? t('status.syncing') : 'DEMO'}
            </button>
            <button
              type="button"
              className="demo-btn demo-btn--red"
              onClick={openRedDemo}
              disabled={isRedDemoPending}
            >
              {isRedDemoPending ? t('status.syncing') : 'DEMO'}
            </button>
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
                  {selectedCamera.streamUrl && selectedCamera.streamUrl.startsWith('data:image') ? (
                    <img
                      className="camera-modal__video"
                      src={selectedCamera.streamUrl}
                      alt={localizeCameraTitle(selectedCamera.title)}
                    />
                  ) : selectedCamera.streamUrl ? (
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
          >
            <section className="amber-card amber-card--critical" role="dialog" aria-modal="true" aria-label={t('demoCritical.title')}>
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
              </div>

              {redActionNote ? <p className="amber-action-note">{redActionNote}</p> : null}
            </section>
          </div>
        ) : null}
    </div>
  );
}
