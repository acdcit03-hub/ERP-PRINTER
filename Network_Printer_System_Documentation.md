# ERP Network Printer System — Technical Documentation

## 1. Overview

This project provides a central dashboard for sending documents to
printers installed on multiple office computers over a private LAN.

It has two main runtime components:

- **Printer Agent** (`backend/agent`): runs on each computer that has one
  or more locally installed printers. It discovers printers, exposes
  printer APIs, receives documents, and submits print jobs to the
  operating system.
- **Print Hub** (`backend/hub`): runs on a central computer. It registers
  Agents, discovers Agents on the LAN, collects printer information,
  and proxies print, queue, cancellation, and history requests.

The browser dashboard (`frontend/`) is served by the Hub.

> This is an ES-module (`"type": "module"`) Node.js Express application
> with MVC-style `controllers`, `models`, `routes`, and `services`.

## 2. Architecture

```text
User's Browser
    |
    | HTTP: dashboard and /api requests
    v
Central Office PC – Print Hub (backend/hub, default port 8000)
    |
    | HTTP requests over the office LAN
    +--------------------------+
    |                          |
    v                          v
Office PC 1                 Office PC 2
Printer Agent               Printer Agent
(backend/agent:8001)        (backend/agent:8001)
    |                          |
    v                          v
Installed printer(s)        Installed printer(s)
```

The Hub does not directly drive the physical printer. The Agent must run
on the computer where the printer is installed.

**Important:** This system is designed for **local office LAN** use. A
cloud server cannot reach private office IPs without a VPN/tunnel, and
an Agent process must still run on the printer PC.

### Project structure

```text
ERP-PRINTER/
├── backend/
│   ├── agent/                 # Printer Agent
│   │   ├── controllers/       # info, printer, print, job, order
│   │   ├── models/            # PrinterCache, OrderStore
│   │   ├── routes/api.js
│   │   ├── services/          # discovery, print, queue
│   │   ├── app.js
│   │   └── index.js
│   ├── hub/                   # Print Hub
│   │   ├── controllers/       # peer, aggregate, scan, proxy
│   │   ├── models/Peer.js
│   │   ├── routes/api.js
│   │   ├── services/          # proxy, scan
│   │   ├── app.js
│   │   └── index.js
│   └── shared/utils/          # auth, files, network
├── frontend/
│   ├── index.html
│   ├── css/style.css
│   └── js/dashboard.js
├── package.json               # "type": "module"
├── peers.json                 # created by Hub at runtime
├── README.md
└── Network_Printer_System_Documentation.md
```

## 3. Requirements

- Node.js **20 or newer**
- Windows: PowerShell and installed printer drivers
- Windows PDF printing: **SumatraPDF is strongly recommended**
  - Set `SUMATRA_PATH` if not installed in a default location
- Windows image printing: uses .NET `System.Drawing` to the selected printer
- Linux/macOS: CUPS (`lp`, `lpstat`)
- Hub and Agent PCs must communicate on the office LAN

### Windows Firewall

Allow inbound TCP (defaults; change if you override ports):

- Hub: **8000** (or your `PRINT_PORT`)
- Agent: **8001** (or your `PRINT_PORT`)

Restrict rules to the trusted office network.

## 4. Installation

Copy the project folder to each PC that will run Hub or Agent.

```powershell
cd D:\ERP-PRINTER
npm install
```

`package.json` scripts:

```json
{
  "type": "module",
  "scripts": {
    "agent": "node backend/agent/index.js",
    "hub": "node backend/hub/index.js",
    "start": "node backend/hub/index.js"
  }
}
```

Dependencies: Express 4 and Multer.

## 5. Starting the Printer Agent

Run on **every PC that has a physical printer attached/installed**.

```powershell
$env:PRINT_PORT="4001"
$env:PRINT_NAME="Brother-PC"
$env:PRINT_PIN="ChangeThisPIN"
npm run agent
```

Default Agent URL (if `PRINT_PORT` not set): `http://localhost:8001`

From another PC use the Agent LAN address, for example:

```text
http://192.168.29.107:4001
```

### Agent environment

| Variable | Default | Meaning |
|----------|---------|---------|
| `PRINT_PORT` | `8001` | Agent listen port |
| `PRINT_NAME` | computer hostname | Display name |
| `PRINT_PIN` | empty | Optional Basic-auth PIN |
| `SUMATRA_PATH` | `SumatraPDF.exe` | Path/name for SumatraPDF |

The Agent binds to `0.0.0.0`.

### Agent startup behavior

1. Creates temp upload dir: OS temp → `printer_app_uploads`
2. Detects OS
3. Discovers printers:
   - Windows: `Get-CimInstance Win32_Printer`
   - Linux/macOS: `lpstat`
4. Refreshes printer cache every 3 seconds
5. Starts HTTP server

Only printers visible in the OS printer list appear in the dashboard.

## 6. Starting the Print Hub

On the **central / dashboard PC**:

```powershell
$env:PRINT_PORT="4000"
$env:PRINT_AGENT_PORT="4001"
$env:PRINT_PIN="HubPassword"
npm run hub
```

Dashboard: `http://localhost:4000` (or default `http://localhost:8000`)

### Hub environment

| Variable | Default | Meaning |
|----------|---------|---------|
| `PRINT_PORT` | `8000` | Hub listen port |
| `PRINT_AGENT_PORT` | `8001` | Default Agent port for scan/normalize |
| `PRINT_PIN` | empty | Optional Basic-auth PIN |

Registered Agents are stored in project-root `peers.json`.

Example office ports used in practice:

| Role | Typical port |
|------|----------------|
| Hub | `4000` |
| Agent | `4001` |

## 7. Registering office computers

Dashboard section: **Add office PC / printer agent**

Enter:

- Agent address, e.g. `192.168.29.107:4001` (not `127.0.0.1` unless Agent is on the same PC as Hub)
- Display name, e.g. `Brother-PC`
- Agent PIN if configured

```http
POST /api/peers/add
Content-Type: application/json
```

```json
{
  "address": "192.168.29.107:4001",
  "name": "Brother-PC",
  "pin": "ChangeThisPIN"
}
```

Remove:

```http
POST /api/peers/remove?id=<peer-id>
```

### Network scan

```http
GET /api/scan
```

Hub scans the assumed local `/24` subnet on `PRINT_AGENT_PORT` and returns
Agents that respond with `agent: "printer-live"` and are not already
registered.

## 8. Printer discovery

```http
GET /api/all
```

For each registered peer, Hub calls:

- `GET /api/info`
- `GET /api/printers`

Response includes:

- `hosts`: online/offline Agent status
- `printers`: printers from online Agents, each tagged with `host` (peer id)

A peer is online only when both info and printers requests succeed.

## 9. Sending a print job — end-to-end

1. Open Hub dashboard
2. Load PCs/printers via `GET /api/all`
3. Select one or more printers
4. Choose document and settings (preview shown on the right)
5. Click **Print to selected printers**
6. Frontend sends binary body to Hub `POST /api/print?host=...&printer=...`
7. Hub forwards file to Agent `/api/print`
8. Agent validates size, printer name, extension
9. Agent writes temp file and submits to OS print stack
10. Agent records order history (newest first) and returns result
11. Hub relays response; dashboard refreshes history

### Print request

Hub:

```http
POST /api/print?host=<peer-id>&printer=<printer-name>&copies=1&color=color
Content-Type: application/octet-stream
X-Filename: document.pdf
```

Agent (Hub removes `host` before forwarding):

```http
POST /api/print?printer=<printer-name>&copies=1&color=color
Content-Type: application/octet-stream
X-Filename: document.pdf
```

### Upload limits and supported file types

Max file size: **200 MiB** (one file per request).

All platforms:

- `pdf`, `txt`
- Images: `png`, `jpg`, `jpeg`, `jfif`, `gif`, `bmp`, `tif`, `tiff`, `webp`
- `ps`

Windows additionally:

- `xps`, `doc`, `docx`, `rtf`, `odt`, `xls`, `xlsx`, `ppt`, `pptx`

Allowed extension does not guarantee print success; the OS/app/driver
must be able to handle the file.

## 10. Print settings

| Query param | Values / behavior |
|-------------|-------------------|
| `copies` | 1–999 (default 1) |
| `collate` | `1` enables collating |
| `color` | `color` or `mono` (UI label: **Black & White**) |
| `duplex` | `one`, `long`, `short` |
| `paper` | safe name (letters, numbers, `.`, `_`, `-`) |
| `orientation` | `auto`, `portrait`, `landscape` |
| `range` | e.g. `1-3,5` |
| `nup` | 1–16 |
| `scale` | `fit`, `actual`, `custom` |
| `zoom` | 10–400 |
| `quality` | `draft`, `normal`, `high` |
| `extra` | optional JSON string |

### Frontend behavior

- Left: settings; right: file preview
- Images: live preview; PDF: embedded preview
- **Black & White** (`color=mono`):
  - Image preview shown grayscale
  - Image files converted to grayscale PNG before upload so print is B&W

### Platform print behavior

**Windows**

- **PDF:** SumatraPDF (`-print-to`) → Adobe `/t` → Foxit `/t` → PrintTo verb
- **Images:** .NET `System.Drawing` to the **selected printer** → Sumatra → PrintTo
- **Other types:** PrintTo verb to the selected printer
- Temp upload files are kept briefly (~2 minutes) so print apps can read them
- Install SumatraPDF on every Agent PC for reliable PDF printing

**Linux/macOS**

- CUPS `lp` with mapped options (sides, color, quality, media, etc.)

## 11. Printer queues

```http
GET /api/jobs?host=<peer-id>&printer=<printer-name>
```

Agent:

- Windows: `Get-PrintJob`
- Linux/macOS: `lpstat -o`

Cancel:

```http
POST /api/cancel?host=<peer-id>&printer=<printer-name>&id=<job-id>
```

Agent:

- Windows: `Remove-PrintJob` (printer name and job id are passed explicitly)
- Linux/macOS: `cancel`

## 12. Print order history

Agent stores recent results in memory (max 50). Each entry includes:

- `ts` — numeric timestamp (used for sorting, latest first)
- `time` — local display string
- filename, printer, settings summary, success flag, job id, message

```http
GET /api/all_orders
```

Hub merges Agent histories, sorts by `ts` descending (latest first), and
adds `host` display name.

History is lost when an Agent process restarts.

## 13. API reference

### Agent APIs

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/info` | Agent identity, OS, name, Sumatra flag, PIN flag |
| GET | `/api/printers` | Cached printer list |
| GET | `/api/live` | SSE heartbeat |
| GET | `/api/options?printer=...` | Empty options/paper arrays (not implemented) |
| GET | `/api/jobs?printer=...` | OS print queue |
| POST | `/api/cancel?printer=...&id=...` | Cancel job |
| POST | `/api/print?printer=...` | Receive file and print |
| GET | `/api/orders` | In-memory history |

### Hub APIs

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/` | Serve frontend dashboard |
| GET | `/api/all` | Aggregate hosts + printers |
| GET | `/api/all_orders` | Aggregate history (latest first) |
| GET | `/api/scan` | Scan `/24` for Agents |
| POST | `/api/peers/add` | Register Agent |
| POST | `/api/peers/remove?id=...` | Remove Agent |
| GET | `/api/options?host=...` | Proxy options |
| GET | `/api/jobs?host=...` | Proxy queue |
| GET | `/api/orders?host=...` | Proxy orders |
| POST | `/api/cancel?host=...` | Proxy cancel |
| POST | `/api/print?host=...` | Upload/forward print |

## 14. Authentication and security

- Private/local IP check
- Optional HTTP Basic auth via `PRINT_PIN` (timing-safe compare)
- Hub uses the peer’s stored PIN when calling a protected Agent

Keep Hub/Agent ports on the trusted LAN only. Do not expose them to the
public internet.

## 15. Troubleshooting

| Problem | Checks |
|---------|--------|
| Dashboard does not open | Hub running? `PRINT_PORT`? Firewall? |
| Agent offline | Agent running? LAN IP/port? Firewall TCP Agent port? |
| No printers listed | Wrong peer address (use printer PC LAN IP, not Hub PC `127.0.0.1` unless same machine); Agent `/api/printers`; Windows printer list |
| Brother/physical printer missing | Must be installed in Windows Printers on the **Agent** PC |
| PIN failure | Peer PIN must match Agent `PRINT_PIN` |
| PDF print fails | Install SumatraPDF on Agent PC; set `SUMATRA_PATH`; restart Agent |
| Image print goes to wrong device | Update Agent to latest print service (targets selected printer via System.Drawing / PrintTo) |
| File type rejected | Check allowlist; prefer `pdf` / `png` / `jpg` |
| File too large | Max 200 MiB |
| `EADDRINUSE` | Port already in use — stop old process or change `PRINT_PORT` |
| Order history not latest-first | Restart Agent/Hub after update (`ts` field); refresh dashboard |

Useful Windows checks on the Agent PC:

```powershell
Get-CimInstance Win32_Printer
Get-PrintJob -PrinterName "Canon LBP2900"
```

## 16. Operational limitations

- `/api/options` returns empty arrays
- Agent history is memory-only (50 entries)
- No central durable job database
- Network scan assumes `/24`
- PDF printing quality depends on SumatraPDF/Adobe/Foxit being installed
- Successful API response means the print subsystem accepted the job; it
  does not prove the physical printer finished

### Production checklist

- [ ] Stable LAN IPs / DHCP reservations for Hub and Agent PCs
- [ ] Firewall limited to office LAN
- [ ] Strong Hub and Agent PINs
- [ ] Printer drivers installed on Agent PCs
- [ ] SumatraPDF installed on Agent PCs for PDF
- [ ] Test each file type on each target printer
- [ ] Decide if durable job history is required
- [ ] Do not expose ports to the public internet

## 17. Example office deployment

| Machine | Role | Example |
|---------|------|---------|
| Central PC | Hub + dashboard | `192.168.29.100:4000` |
| Office PC 1 | Agent + Brother/Canon | `192.168.29.107:4001` |
| Office PC 2 | Agent + another printer | `192.168.29.108:4001` |

Steps:

1. Copy project to each PC; `npm install`
2. Start Agent on each printer PC
3. Start Hub on central PC
4. Open dashboard → add each Agent LAN address
5. Refresh printers → select printer → print

## 18. ERP / cloud note

If ERP is hosted in the cloud (e.g. DigitalOcean), it cannot directly
reach `192.168.x.x` Agent addresses. You still need:

- An office-side Agent (or Hub) running on the LAN, and
- A secure tunnel/VPN/outbound connector

Do not publish Hub/Agent ports on the public internet.

---

**Document scope:** Describes the current `ERP-PRINTER` Node.js codebase
(`backend/` + `frontend/`, ES modules). Example IPs, ports, and credentials
are illustrative and must be replaced for your network.
