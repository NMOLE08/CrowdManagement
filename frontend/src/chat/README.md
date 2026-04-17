# Chat Launcher Integration

The bottom-right chat icon is already wired through a bridge.

## Fast integration

1. Import `registerChatLauncher` from `src/chat/chatLauncherBridge.js`.
2. Register your chatbot open method once during app/chat initialization.

```js
import { registerChatLauncher } from './chat/chatLauncherBridge';

registerChatLauncher(() => {
  // open your chatbot widget/modal here
  // example: window.MyBot?.open();
});
```

## Alternative event-based integration

If you do not want to import the bridge, listen to this event:

- `crowdshield:chat-open-request`

```js
window.addEventListener('crowdshield:chat-open-request', () => {
  // open chatbot
});
```

The chat launcher button is rendered in `src/components/ChatLauncherButton.jsx`.
