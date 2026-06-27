// Shadowdark page entry point: wire the shared controller to the Shadowdark
// system module.
import * as shadowdark from './sheet.js';
import { initApp } from './controller.js';

initApp(shadowdark, { lsPrefix: 'sd' });
