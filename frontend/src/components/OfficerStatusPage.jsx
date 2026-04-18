import { useEffect, useMemo, useRef } from 'react';
import crowdLogo from '../assets/CrowdLogo.png';
import '../officerStatus.css';

const RED_ALERT_TRIGGER_KEY = 'crowdshield_red_alert_trigger_at';

function readTriggerValue() {
  const raw = window.localStorage.getItem(RED_ALERT_TRIGGER_KEY);
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : 0;
}

export default function OfficerStatusPage({ onOpenMap }) {
  const lastSeenTriggerRef = useRef(0);

  const handleTriggerChange = useMemo(
    () => () => {
      const latestTrigger = readTriggerValue();
      if (latestTrigger > lastSeenTriggerRef.current) {
        lastSeenTriggerRef.current = latestTrigger;
        onOpenMap();
      }
    },
    [onOpenMap]
  );

  useEffect(() => {
    lastSeenTriggerRef.current = readTriggerValue();

    const onStorage = (event) => {
      if (event.key === RED_ALERT_TRIGGER_KEY) {
        handleTriggerChange();
      }
    };

    window.addEventListener('storage', onStorage);
    const pollId = window.setInterval(handleTriggerChange, 1200);

    return () => {
      window.removeEventListener('storage', onStorage);
      window.clearInterval(pollId);
    };
  }, [handleTriggerChange]);

  return (
    <div className="officer-status-shell">
      <section className="officer-status-card" aria-label="Officer status">
        <div className="officer-status-brand">
          <img src={crowdLogo} alt="CrowdShield" />
          <h1>Officer Console</h1>
        </div>

        <p className="officer-status-pill">Everything Okay</p>
        <p className="officer-status-text">
          No critical event right now. Keep this page open. You will be redirected automatically to the mobile evacuation map when a red alert is triggered.
        </p>

        <button type="button" className="officer-status-map-btn" onClick={onOpenMap}>
          Open Mobile Map
        </button>
      </section>
    </div>
  );
}
