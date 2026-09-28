import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import './styles.css';
import './motion.css';
import App from './App';
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
