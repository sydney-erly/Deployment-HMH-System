import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './index.css';   // Tailwind + Flowbite + HMH styles
import './i18n';        // languages

import App from './App';

const root = createRoot(document.getElementById('root'));

root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
