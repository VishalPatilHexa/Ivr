const cors = require('cors');
const config = require('./index');

module.exports = cors({
  origin: config.cors.origin,
  methods: config.cors.methods,
  credentials: true
});