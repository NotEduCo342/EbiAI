// src/utils/eventBus.js
const EventEmitter = require('events');
const logger = require('./logger');

const eventBus = new EventEmitter();
module.exports = eventBus;
