import { useState } from 'react';
import { requestChatOpen } from '../chat/chatLauncherBridge';
import { useTranslation } from 'react-i18next';

export default function ChatLauncherButton({ disconnected }) {
  const { t } = useTranslation();
  const [showHint, setShowHint] = useState(false);

  const onOpenChat = () => {
    if (disconnected) {
      setShowHint(true);
      return;
    }
    const opened = requestChatOpen();
    setShowHint(!opened);
  };

  return (
    <>
      <button
        id="chat-launcher"
        className={`chat-fab ${disconnected ? 'chat-fab--disconnected' : ''}`}
        aria-label={disconnected ? t('chat.errorOffline') : t('chat.openAssistant')}
        title={disconnected ? t('chat.errorOffline') : t('chat.openAssistant')}
        data-chat-launcher="true"
        onClick={onOpenChat}
      >
        💬
      </button>

      {(showHint || disconnected) ? (
        <div className={`chat-fab-hint ${disconnected ? 'chat-fab-hint--error' : ''}`} role="status" aria-live="polite">
          {disconnected ? t('chat.errorOffline') : t('chat.notConnectedHint')}
        </div>
      ) : null}
    </>
  );
}
