import { useEffect, useMemo, useRef, useState } from 'react';
import LiveCommandMap from './components/LiveCommandMap';
import ChatLauncherButton from './components/ChatLauncherButton';
import { useMlSceneData } from './hooks/useMlSceneData';
import { useCameraAnalytics } from './hooks/useCameraAnalytics';
import { useEmotionDetection } from './hooks/useEmotionDetection';
import crowdLogo from './assets/CrowdLogo.png';

export default function App() {
  const { scene, loading, error } = useMlSceneData(7000);
  const [selectedCamera, setSelectedCamera] = useState(null);
  const modalVideoRef = useRef(null);
  const { cameras, getCameraDetails } = useCameraAnalytics(scene);
  const emotionDetection = useEmotionDetection(selectedCamera);

  const metrics = [
    {
      label: 'Live Count',
      value: Number(scene?.metrics?.live_count || 0).toLocaleString(),
    },
    {
      label: 'Hotspot',
      value: scene?.metrics?.hotspot || 'Awaiting model update',
    },
    {
      label: 'System',
      value: scene?.metrics?.system || 'Online',
    },
  ];

  const alerts = (scene?.alerts || []).map((alert, idx) => ({
    id: alert.id || `alert-${idx}`,
    message: alert.message || 'Alert update pending',
    severity: ['critical', 'medium', 'safe'].includes(alert.severity)
      ? alert.severity
      : 'medium',
  }));

  const mainPlace = 'Dagdusheth Temple';

  const activeCameraStats = useMemo(() => {
    if (!selectedCamera) {
      return {
        count: 0,
        emotion: 'N/A',
        locationDetails: 'Location details unavailable.',
        emotionBars: [],
      };
    }

    const details = getCameraDetails(selectedCamera);

    return {
      count: details.count,
      emotion: emotionDetection.primaryEmotion,
      locationDetails: details.locationDetails,
      emotionBars: emotionDetection.emotionBars,
    };
  }, [emotionDetection.emotionBars, emotionDetection.primaryEmotion, getCameraDetails, selectedCamera]);

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

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <div className="logo-block">
          <span className="logo-badge">
            <img
              src={crowdLogo}
              alt="CrowdShield logo"
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
            <p className="logo-subtitle">Crowd Management System</p>
          </div>
        </div>

        <div className="status-block" aria-live="polite">
          <span className="status-icon" aria-hidden="true">◉</span>
          <span>{error ? 'Backend Offline' : loading ? 'Syncing...' : 'All Okay!'}</span>
        </div>
      </header>

      <main className="dashboard-main">
        <section className="upper-grid">
          <aside className="left-panel">
            <div className="panel-card">
              <div className="main-place-block" aria-label="Main place">
                <p className="main-place-label">Main Place</p>
                <p className="main-place-name">{mainPlace}</p>
              </div>
              <h2>Key Metrics</h2>
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
              <h2>Alert Log</h2>
              <ul className="alert-list">
                {alerts.map((alert) => (
                  <li key={alert.id} className={`alert-item alert-item--${alert.severity}`}>
                    {alert.message}
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          <section className="map-panel" aria-label="Map preview">
            <div className="map-inner map-inner--live">
              <LiveCommandMap mapData={scene?.map} />
            </div>
          </section>
        </section>

        <section className="camera-section" aria-label="Camera feed section">
          <div className="camera-section__header">
            <h2>Camera Feed</h2>
          </div>

          <div className="camera-board" aria-label="Camera feeds">
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
                  <span>{cam.title}</span>
                  {cam.live ? <span className="live-pill">live</span> : null}
                </div>
              </article>
            ))}
          </div>
        </section>

        <ChatLauncherButton />

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
            <section className="camera-modal" role="dialog" aria-modal="true" aria-label="Camera details">
              <button
                type="button"
                className="camera-modal__close"
                aria-label="Close camera details"
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
                    <div className="camera-modal__video-placeholder">{selectedCamera.title}</div>
                  )}
                </div>

                <div className="camera-modal__side">
                  <div className="camera-modal__stat-box">
                    <p className="camera-modal__stat-title">Count</p>
                    <p className="camera-modal__stat-value">{Number(activeCameraStats.count).toLocaleString()}</p>
                  </div>

                  <div className="camera-modal__stat-box">
                    <p className="camera-modal__stat-title">Emotion</p>
                    <p className="camera-modal__stat-value">{activeCameraStats.emotion}</p>
                  </div>

                  <div className="camera-modal__emotion-bars" aria-label="Emotion breakdown">
                    {activeCameraStats.emotionBars.length > 0 ? (
                      activeCameraStats.emotionBars.map((entry) => (
                        <div key={entry.name} className="camera-modal__bar-row">
                          <span className="camera-modal__bar-label">{entry.name}</span>
                          <div className="camera-modal__bar-track">
                            <span className="camera-modal__bar-fill" style={{ width: `${entry.percentage}%` }} />
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="camera-modal__no-emotion">No emotion scores from model.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="camera-modal__location">
                <p className="camera-modal__location-title">Location Details</p>
                <p className="camera-modal__location-text">{activeCameraStats.locationDetails}</p>
              </div>
            </section>
          </div>
        ) : null}
      </main>
    </div>
  );
}
