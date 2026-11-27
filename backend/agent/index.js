import dotenv from 'dotenv';
import { hostnameDefault } from '../shared/utils/auth.js';
import { uploadDir } from '../shared/utils/files.js';
import PrinterCache from './models/Printer.js';
import OrderStore from './models/Order.js';
import { discoverPrinters } from './services/printerDiscovery.js';
import createInfoController from './controllers/infoController.js';
import createPrinterController from './controllers/printerController.js';
import createJobController from './controllers/jobController.js';
import createPrintController from './controllers/printController.js';
import createOrderController from './controllers/orderController.js';
import createAgentApp from './app.js';

dotenv.config();

const config = {
  port: Number(process.env.PRINT_PORT || 8001),
  name: process.env.PRINT_NAME || hostnameDefault(),
  pin: process.env.PRINT_PIN || '',
  sumatraPath: process.env.SUMATRA_PATH || 'SumatraPDF.exe',
};

const printerCache = new PrinterCache();
const orderStore = new OrderStore();
const uploads = uploadDir('printer_app_uploads');

async function refreshPrinters() {
  try {
    const printers = await discoverPrinters();
    printerCache.set(printers, null);
  } catch (err) {
    printerCache.set(printerCache.list().printers, err.message || 'Discovery failed');
    console.error('Printer discovery error:', err.message);
  }
}

const controllers = {
  info: createInfoController(config),
  printers: createPrinterController(printerCache),
  jobs: createJobController(printerCache),
  print: createPrintController({
    printerCache,
    orderStore,
    uploadDir: uploads,
    sumatraPath: config.sumatraPath,
  }),
  orders: createOrderController(orderStore),
};

const app = createAgentApp({ config, controllers });

async function start() {
  console.log(`Agent starting on ${process.platform} as "${config.name}"`);
  await refreshPrinters();
  setInterval(refreshPrinters, 3000);

  app.listen(config.port, '0.0.0.0', () => {
    console.log(`Printer Agent listening on http://0.0.0.0:${config.port}`);
    if (config.pin) console.log('PIN authentication enabled');
  });
}

start().catch((err) => {
  console.error('Failed to start Agent:', err);
  process.exit(1);
});
