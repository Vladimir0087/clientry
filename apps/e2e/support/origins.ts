// Fixed: the web build bakes its rewrite to API_URL in, and CI and .env.example both use 4000.
export const WEB_PORT = 3000;
export const API_PORT = 4000;
export const WEB_ORIGIN = `http://localhost:${String(WEB_PORT)}`;
export const API_ORIGIN = `http://127.0.0.1:${String(API_PORT)}`;
