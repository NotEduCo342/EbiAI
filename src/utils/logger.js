// src/utils/logger.js
const chalk = require('chalk');

// This new helper function allows our logger to accept multiple arguments like console.log
const log = (color, ...args) => {
  // We check if the last argument is an object to print it nicely
  const lastArg = args[args.length - 1];
  if (typeof lastArg === 'object' && lastArg !== null) {
    // Print all but the last argument on one line
    const message = args.slice(0, -1).join(' ');
    console.log(color(message), lastArg);
  } else {
    console.log(color(args.join(' ')));
  }
};

const logger = {
  // Standard log types
  info: (...args) => log(chalk.blue, ...args),
  warn: (...args) => log(chalk.yellow.bold, ...args),
  error: (...args) => log(chalk.red.bold.bgWhite, ...args),

  // Custom log types for specific parts of the bot
  api: (...args) => log(chalk.hex('#6c5ce7'), ...args), // Purple for API
  db: (...args) => log(chalk.green, ...args),         // Green for Database
  event: (...args) => log(chalk.cyan, ...args),        // Cyan for Events
  handler: (...args) => log(chalk.magenta, ...args),   // Magenta for Handlers
  server: (...args) => log(chalk.white.bold, ...args), // Bright White for Server
};

module.exports = logger;