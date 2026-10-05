import React from 'react';
import ReactDOM from 'react-dom/client';
import 'modern-css-reset';

import {ChatLog} from './ChatLog';

const rootElement = document.getElementById('root')!;
const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <div style={{margin: '16px auto', maxWidth: 800, padding: '0 16px'}}>
      <ChatLog />
    </div>
  </React.StrictMode>,
);
