/// <reference types="vite/client" />
declare module 'uuid';

interface Window {
  __ENV__?: { VITE_API_URL?: string };
}
