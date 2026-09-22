import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
// Global stylesheets, in cascade order: fonts, reset, tokens, elements, helpers.
import './styles/fonts.css';
import './styles/reset.css';
import './styles/variables.css';
import './styles/base.css';
import './styles/utilities.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
