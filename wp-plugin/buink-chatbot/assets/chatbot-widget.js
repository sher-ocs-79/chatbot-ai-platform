/* Buink Chatbot floating iframe widget */
(function () {
  'use strict';

  var cfg       = window.BuinkChatbotConfig || {};
  var src       = cfg.iframeSrc;
  var serverUrl = cfg.serverUrl;
  var apiKey    = cfg.apiKey;
  if (!src || !serverUrl || !apiKey) return;

  // ── Shadow host ──────────────────────────────────────────────────────────────

  var host = document.createElement('div');
  host.id  = 'buink-chatbot-host';
  document.body.appendChild(host);

  var shadow = host.attachShadow({ mode: 'open' });

  var style = document.createElement('style');
  style.textContent = [
    ':host { all: initial; }',
    '*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }',

    /* Toggle bubble */
    '#buink-toggle {',
    '  position: fixed; bottom: 24px; right: 24px; z-index: 2147483647;',
    '  width: 56px; height: 56px; border-radius: 50%;',
    '  background: #6c63ff; color: #fff; border: none; cursor: pointer;',
    '  display: flex; align-items: center; justify-content: center;',
    '  box-shadow: 0 4px 20px rgba(108,99,255,.45);',
    '  transition: background .15s, transform .15s;',
    '}',
    '#buink-toggle:hover { background: #4e47c0; transform: scale(1.07); }',

    /* Panel */
    '#buink-panel {',
    '  position: fixed; bottom: 92px; right: 24px; z-index: 2147483646;',
    '  width: 400px; max-width: calc(100vw - 32px);',
    '  height: 580px; max-height: calc(100vh - 108px);',
    '  border-radius: 14px; overflow: hidden;',
    '  box-shadow: 0 12px 40px rgba(0,0,0,.5);',
    '  transition: opacity .18s, transform .18s;',
    '  transform-origin: bottom right;',
    '}',
    '#buink-panel.hidden { opacity: 0; transform: scale(.92); pointer-events: none; }',

    /* iframe fills the panel */
    '#buink-iframe {',
    '  width: 100%; height: 100%; border: none; display: block;',
    '}',
  ].join('\n');
  shadow.appendChild(style);

  // ── Toggle button ────────────────────────────────────────────────────────────

  var toggle = document.createElement('button');
  toggle.id = 'buink-toggle';
  toggle.setAttribute('aria-label', 'Open chat');
  toggle.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  shadow.appendChild(toggle);

  // ── Panel with iframe ────────────────────────────────────────────────────────

  var panel = document.createElement('div');
  panel.id = 'buink-panel';
  panel.className = 'hidden';

  var iframe = document.createElement('iframe');
  iframe.id  = 'buink-iframe';
  iframe.src = src;
  iframe.setAttribute('allow', 'microphone');
  iframe.setAttribute('title', 'Buink Chatbot');

  // Data attributes store the config visibly on the element.
  iframe.dataset.serverUrl = serverUrl;
  iframe.dataset.apiKey    = apiKey;

  // Once the iframe app has loaded, deliver the config via postMessage
  // (data attributes are not readable cross-origin, so postMessage is required).
  iframe.addEventListener('load', function () {
    iframe.contentWindow.postMessage(
      { type: 'buink-config', serverUrl: serverUrl, apiKey: apiKey },
      new URL(src).origin
    );
  });

  panel.appendChild(iframe);
  shadow.appendChild(panel);

  // ── Open / close ─────────────────────────────────────────────────────────────

  var isOpen = false;

  toggle.addEventListener('click', function () {
    isOpen = !isOpen;
    if (isOpen) {
      panel.classList.remove('hidden');
      toggle.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      toggle.setAttribute('aria-label', 'Close chat');
    } else {
      panel.classList.add('hidden');
      toggle.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
      toggle.setAttribute('aria-label', 'Open chat');
    }
  });

})();
