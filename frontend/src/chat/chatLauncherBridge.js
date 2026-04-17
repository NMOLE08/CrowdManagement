const CHAT_OPEN_EVENT = 'crowdshield:chat-open-request';

let openHandler = null;

export function registerChatLauncher(handler) {
  if (typeof handler !== 'function') {
    throw new Error('registerChatLauncher expects a function.');
  }

  openHandler = handler;

  if (typeof window !== 'undefined') {
    window.CrowdShieldChat = {
      open: () => {
        openHandler?.();
      },
    };
  }
}

export function unregisterChatLauncher() {
  openHandler = null;
  if (typeof window !== 'undefined' && window.CrowdShieldChat) {
    delete window.CrowdShieldChat;
  }
}

export function requestChatOpen() {
  if (openHandler) {
    openHandler();
    return true;
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(CHAT_OPEN_EVENT, {
        detail: { source: 'chat-fab' },
      })
    );
  }

  return false;
}

export function getChatOpenEventName() {
  return CHAT_OPEN_EVENT;
}
