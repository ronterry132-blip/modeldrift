"use strict";

// undici's package entry always loads its WebSocket client. That handshake
// uses SHA-1 because RFC 6455 requires it, and CodeQL flags the hash. This
// action never opens a WebSocket. Export only the two undici pieces the
// bundled @actions libraries import: fetch and ProxyAgent.

const { fetch: fetchImpl } = require("undici/lib/web/fetch");
const ProxyAgent = require("undici/lib/dispatcher/proxy-agent");

async function fetch(input, options) {
  try {
    return await fetchImpl(input, options);
  } catch (error) {
    if (error && typeof error === "object") Error.captureStackTrace(error);
    throw error;
  }
}

module.exports = { fetch, ProxyAgent };
