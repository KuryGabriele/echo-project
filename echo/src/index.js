import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import reportWebVitals from './reportWebVitals';

import EchoProtocol from './echoProtocol';
import Storage from './cache/storage';
import AudioPlayer from './lib/audioPlayer';

const storage = new Storage();
const sessionStorage = new Storage('session');

let ep = new EchoProtocol();

const ap = new AudioPlayer(storage.get('soundQueuesVolume') || 0.6);
export { ep, storage, ap };

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <App />
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();