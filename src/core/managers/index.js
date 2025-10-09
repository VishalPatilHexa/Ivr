/**
 * ===============================================================================
 * CORE MANAGERS INDEX
 * ===============================================================================
 *
 * Central export for all core management classes
 * Provides a clean API for importing managers throughout the application
 */

const conversationManager = require("./conversation");
const websocketManager = require("./websocket");

module.exports = {
  conversationManager,
  websocketManager,
};
