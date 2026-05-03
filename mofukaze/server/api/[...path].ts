import { defineEventHandler, getRequestURL, proxyRequest } from "h3";

export default defineEventHandler((event) => {
  const url = getRequestURL(event);
  const targetBase = (process.env.NUXT_API_PROXY_TARGET ?? "http://127.0.0.1:3001").replace(/\/$/, "");
  return proxyRequest(event, `${targetBase}${url.pathname}${url.search}`);
});
