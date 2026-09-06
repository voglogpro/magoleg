import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/cyrillic-400.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/cyrillic-500.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/cyrillic-600.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/cyrillic-700.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/cyrillic-800.css';
import '@fontsource/inter/latin-800.css';
import '@fontsource/montserrat/cyrillic-700.css';
import '@fontsource/montserrat/latin-700.css';
import '@fontsource/montserrat/cyrillic-800.css';
import '@fontsource/montserrat/latin-800.css';
import '@fontsource/montserrat/cyrillic-900.css';
import '@fontsource/montserrat/latin-900.css';
import { App } from './StoreApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
