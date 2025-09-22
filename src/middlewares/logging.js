const Logger = require('../utils/logger');

const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log incoming request
  Logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    body: req.method === 'POST' ? req.body : undefined
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    
    if (statusCode >= 400) {
      Logger.error(`${req.method} ${req.path} - ${statusCode} (${duration}ms)`);
    } else {
      Logger.info(`${req.method} ${req.path} - ${statusCode} (${duration}ms)`);
    }
  });

  next();
};

module.exports = requestLogger;