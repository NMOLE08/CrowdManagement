import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import LiveCommandMap from './LiveCommandMap';

// Assets for fallback
import cam2Video from '../assets/cam2_h264.mp4';
import cam3Video from '../assets/cam3_h264.mp4';

export default function FallbackPage({ scene, systemStatus }) {
  const { t, i18n } = useTranslation();
  const numberLocale = i18n.language === 'mr' ? 'mr-IN' : 'en-IN';

  const formatStatusTime = (isoTime) => {
    if (!isoTime) return t('common.na');
    const date = new Date(isoTime);
    if (isNaN(date.getTime())) return t('common.na');
    return date.toLocaleString(numberLocale);
  };

  const formatLocalizedNumber = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '0';
    return numeric.toLocaleString(numberLocale);
  };

  const metrics = [
    { label: t('metrics.liveCount'), value: formatLocalizedNumber(scene?.metrics?.live_count || 0) },
    { label: t('metrics.hotspot'), value: scene?.metrics?.hotspot || t('metrics.awaitingModelUpdate') },
    { label: t('metrics.system'), value: t('fallback.offline'), isOffline: true },
  ];

  const alerts = (scene?.alerts || []).map((alert, idx) => ({
    id: alert.id || `alert-${idx}`,
    message: alert.message || t('alerts.pending'),
    severity: alert.severity || 'medium',
  }));

  const cameras = useMemo(() => [
    { id: 1, title: 'cam1', mode: 'signal_lost' },
    { id: 2, title: 'cam2', mode: 'thermal', streamUrl: cam2Video },
    { id: 3, title: 'cam3', mode: 'stream', streamUrl: cam3Video },
  ], []);

  return (
    <main className="dashboard-main fallback-view">
      <div className="fallback-emergency-banner">
        <i className="fa-solid fa-triangle-exclamation"></i>
        <span>{t('fallback.networkOffline')} — {t('fallback.lastSync')}: {formatStatusTime(systemStatus?.lastSuccessfulAt)}</span>
      </div>

      <section className="upper-grid">
        <aside className="left-panel">
          <div className="panel-card emergency-card">
            <h2>{t('sections.keyMetrics')}</h2>
            <div className="metric-list">
              {metrics.map((m) => (
                <div className={`metric-item ${m.isOffline ? 'metric-item--offline' : ''}`} key={m.label}>
                  <p className="metric-label">{m.label}</p>
                  <p className="metric-value">{m.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="panel-card emergency-card">
            <h2>{t('sections.alertLog')}</h2>
            <ul className="alert-list">
              {alerts.length > 0 ? alerts.map((a) => (
                <li key={a.id} className={`alert-item alert-item--${a.severity}`}>
                  {a.message}
                </li>
              )) : <li className="alert-item">{t('alerts.pending')}</li>}
            </ul>
          </div>
        </aside>

        <section className="map-panel emergency-map-panel">
          <div className="map-inner map-inner--live">
            <div className="map-emergency-overlay">
              <p>EMERGENCY SNAPSHOT MODE</p>
            </div>
            <LiveCommandMap mapData={scene?.map} />
          </div>
        </section>
      </section>

      <section className="camera-section fallback-camera-section">
        <div className="camera-section__header">
          <h2>{t('sections.cameraFeeds')} — {t('fallback.title')}</h2>
        </div>

        <div className="camera-board camera-board--3col">
          {cameras.map((cam) => (
            <article key={cam.id} className={`camera-card fallback-card--${cam.mode}`}>
              <div className="camera-card__frame">
                {cam.mode === 'signal_lost' ? (
                  <div className="signal-lost-placeholder">
                    <div className="static-noise"></div>
                    <i className="fa-solid fa-triangle-exclamation"></i>
                    <p>SIGNAL LOST</p>
                  </div>
                ) : (
                  <video
                    className={`camera-card__video ${cam.mode === 'thermal' ? 'emergency-thermal' : ''}`}
                    src={cam.streamUrl}
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="auto"
                  />
                )}
              </div>
              <div className="camera-label-row">
                <span>{cam.title}</span>
                <span className={`mode-pill mode-pill--${cam.mode}`}>
                  {cam.mode.toUpperCase()}
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>
      
      <div className="fallback-footer-attribution">
        <p>{t('fallback.noteCached')}</p>
      </div>
    </main>
  );
}
