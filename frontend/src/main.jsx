import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './i18n';
import './styles.css';
import crowdLogo from './assets/CrowdLogo.png';

function setFaviconFromLogo() {
  const source = new Image();
  source.src = crowdLogo;

  source.onload = () => {
    const working = document.createElement('canvas');
    working.width = source.naturalWidth;
    working.height = source.naturalHeight;
    const wctx = working.getContext('2d');
    if (!wctx) {
      return;
    }

    wctx.drawImage(source, 0, 0);
    const image = wctx.getImageData(0, 0, working.width, working.height);
    const data = image.data;

    // Chroma key near-black pixels and compute tight bounds.
    let minX = working.width;
    let minY = working.height;
    let maxX = 0;
    let maxY = 0;

    for (let y = 0; y < working.height; y += 1) {
      for (let x = 0; x < working.width; x += 1) {
        const i = (y * working.width + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        if (r < 18 && g < 18 && b < 18) {
          data[i + 3] = 0;
        }

        if (data[i + 3] > 0) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }

    wctx.putImageData(image, 0, 0);

    if (minX > maxX || minY > maxY) {
      return;
    }

    const cropped = document.createElement('canvas');
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const size = 64;
    cropped.width = size;
    cropped.height = size;
    const cctx = cropped.getContext('2d');
    if (!cctx) {
      return;
    }

    cctx.clearRect(0, 0, size, size);
    cctx.drawImage(working, minX, minY, width, height, 0, 0, size, size);

    const iconHref = cropped.toDataURL('image/png');
    const faviconLink = document.querySelector("link[rel='icon']") || document.createElement('link');
    faviconLink.setAttribute('rel', 'icon');
    faviconLink.setAttribute('type', 'image/png');
    faviconLink.setAttribute('sizes', '64x64');
    faviconLink.setAttribute('href', iconHref);
    if (!faviconLink.parentElement) {
      document.head.appendChild(faviconLink);
    }
  };
}

setFaviconFromLogo();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
