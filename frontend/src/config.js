// Central place for the backend URL. Every page/component should import
// API_BASE_URL from here instead of hardcoding the backend address.
//
// Create React App automatically loads REACT_APP_* vars from:
//   .env.development  -> used by `npm start`
//   .env.production    -> used by `npm run build`
//
// This means the same code talks to your local backend while you're
// developing, and to your deployed backend once you build for production —
// no manual find/replace across files ever again.
export const API_BASE_URL =
  process.env.REACT_APP_API_URL || "http://localhost:5000";
