import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import PeerStore from './models/Peer.js';
import AgentRelay from './models/AgentRelay.js';
import JobQueue from './models/JobQueue.js';
import { uploadDir } from '../shared/utils/files.js';

dotenv.config();

import createPeerController from './controllers/peerController.js';
import createAggregateController from './controllers/aggregateController.js';
import createScanController from './controllers/scanController.js';
import createProxyController from './controllers/proxyController.js';
import createRelayController from './controllers/relayController.js';
import createHubApp from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = {
  port: Number(process.env.PRINT_PORT || 8000),
  agentPort: Number(process.env.PRINT_AGENT_PORT || 8001),
  agentHost: process.env.PRINT_AGENT_HOST || '192.168.29.40',
  pin: process.env.PRINT_PIN || '',
};

const peersPath = path.join(__dirname, '..', '..', 'peers.json');
const peerStore = new PeerStore(peersPath, config.agentPort, config.agentHost);
const relay = new AgentRelay();
const jobQueue = new JobQueue(uploadDir('printer_hub_relay_jobs'));

const controllers = {
  peers: createPeerController(peerStore),
  aggregate: createAggregateController(peerStore, relay, jobQueue),
  scan: createScanController(peerStore, config.agentPort),
  proxy: createProxyController(peerStore, relay, jobQueue),
  relay: createRelayController({ peerStore, relay, jobQueue }),
};

const app = createHubApp({ config, controllers });

app.listen(config.port, '0.0.0.0', () => {
  console.log(`Print Hub listening on http://0.0.0.0:${config.port}`);
  console.log(`Dashboard: http://localhost:${config.port}/`);
  console.log(`Default office Agent: ${config.agentHost}:${config.agentPort} (relay)`);
  if (config.pin) console.log('PIN authentication enabled');
});
