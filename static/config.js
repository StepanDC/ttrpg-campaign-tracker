// Deployment config — a plain (non-module) script so you can edit it per host
// without touching the app code or rebuilding.
//
// Local one-box setup (backend serves this page): leave apiBase as ''.
// Split hosting (frontend on GitHub Pages, backend on your server): set apiBase
// to the backend origin, e.g. 'https://nightcity.example.com' (no trailing /).
window.SD_CONFIG = {
  apiBase: '',
};
