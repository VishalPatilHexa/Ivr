/**
 * ===============================================================================
 * CORE MANAGERS INDEX
 * ===============================================================================
 *
 * Central export for all core management classes
 * Provides a clean API for importing managers throughout the application
 */

const ConnectionPool = require("./connectionPool");
const SessionManager = require("./sessionManager");
const conversationManager = require("./conversation");
const websocketManager = require("./websocket");

module.exports = {
  ConnectionPool,
  SessionManager,
  conversationManager,
  websocketManager,
};
