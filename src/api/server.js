'use strict';

const express = require('express');
const path = require('path');
const { getLogger } = require('../logging/Logger');
const executionsRouter = require('./routes/executions');
const dashboardRouter = require('./routes/dashboard');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../public')));

// Routes
app.use('/api/executions', executionsRouter);
app.use('/api/dashboard', dashboardRouter);

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

function startServer() {
  const logger = getLogger();
  const server = app.listen(PORT, HOST, () => {
    logger.info(`AFG Automation API server listening on http://${HOST}:${PORT}`);
  });
  
  // Graceful shutdown handling
  const shutdown = () => {
    logger.info('Shutting down API server...');
    server.close(() => {
      logger.info('API server stopped.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
