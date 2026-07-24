import type { App as VueApp } from 'vue';
import { createApp } from 'vue';
import App from './App.vue';

let app: VueApp<Element> | null = null;

function mountApp() {
  if (app) {
    return;
  }

  app = createApp(App).use(createPinia());
  app.mount('#app');
}

function unmountApp() {
  if (!app) {
    return;
  }

  app.unmount();
  app = null;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountApp, { once: true });
} else {
  mountApp();
}

window.addEventListener('pagehide', unmountApp);
