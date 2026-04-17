import { useState } from 'react';
import { requestChatOpen } from '../chat/chatLauncherBridge';
import { useTranslation } from 'react-i18next';

export default function ChatLauncherButton() {
  const { t } = useTranslation();
  const [showHint, setShowHint] = useState(false);

  const onOpenChat = () => {
    const opened = requestChatOpen();
    setShowHint(!opened);
  };

  return (
    <>
      <button
        id="chat-launcher"
        className="chat-fab"
        aria-label={t('chat.openAssistant')}
        title={t('chat.openAssistant')}
        data-chat-launcher="true"
        onClick={onOpenChat}
      >
        💬
      </button>

      {showHint ? (
        <div className="chat-fab-hint" role="status" aria-live="polite">
          {t('chat.notConnectedHint')}
        </div>
      ) : null}
    </>
  );
}
