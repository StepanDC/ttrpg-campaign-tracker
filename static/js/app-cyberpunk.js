// Cyberpunk RED page entry point: wire the shared controller to the CP:RED
// system module.
import * as cyberpunk from './systems/cyberpunk.js';
import { initApp } from './controller.js';

initApp(cyberpunk, { lsPrefix: 'cp' });
