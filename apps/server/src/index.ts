import 'dotenv/config';
import { createServer } from 'http';
import { initSocketServer, setTelegramPushCallback, setConfirmationPromptCallback } from './socket.js';
import { bot, triggerConfirmationPrompt } from './bot.js';
import { logger } from './logger.js';

const PORT = process.env.PORT || 3000;

process.on('uncaughtException', (error) => {
  logger.error('Unhandled exception', {
    error: error.message,
    stack: error.stack
  });
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason)
  });
});

// Simple HTTP health check server
const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Remote CLI Server is running.\n');
});

// Configure Socket.IO -> Telegram communication pathways
setTelegramPushCallback(async (chatId, text, options) => {
  logger.debug('Pushing Telegram message', {
    chatId,
    length: text.length
  });
  await bot.api.sendMessage(chatId, text, options);
});

setConfirmationPromptCallback((sessionId, text) => {
  logger.warn('Confirmation prompt detected', {
    sessionId,
    preview: text.slice(0, 200)
  });
  triggerConfirmationPrompt(sessionId, text);
});

// Start services
initSocketServer(server);

server.listen(PORT, () => {
  logger.info('Socket.IO server listening', { port: PORT });
});

bot.start({
  onStart(botInfo) {
    logger.info('Telegram bot started', { username: botInfo.username });
  }
}).catch(err => {
  logger.error('Failed to start Telegram bot', {
    error: err instanceof Error ? err.message : String(err)
  });
});
