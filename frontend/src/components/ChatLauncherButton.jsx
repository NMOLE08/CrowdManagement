import { useState } from 'react';
import { requestChatOpen } from '../chat/chatLauncherBridge';

export default function ChatLauncherButton() {
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
        aria-label="Open assistant"
        title="Open assistant"
        data-chat-launcher="true"
        onClick={onOpenChat}
      >
        💬
      </button>

      {showHint ? (
        <div className="chat-fab-hint" role="status" aria-live="polite">
          Chatbot not connected yet. Integrate by calling registerChatLauncher(openFn).
        </div>
      ) : null}
    </>
  );
}
