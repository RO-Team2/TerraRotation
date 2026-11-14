import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import WindowBar from './WindowBar';
import './tailwind.css';
import './styles.css';
import './polish.css';
import './team-layout.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><WindowBar /><App /></React.StrictMode>,
);
