# Going live — ERP-PRINTER only

This printer system is **standalone**. Do **not** add printer APIs into `ERPupgradeBACK`.

## What to run live

| App | Where |
|-----|--------|
| **ERP-PRINTER** Hub + Agent | Office PCs (LAN) |
| ERP frontend/backend (Vercel/Render) | Separate — not required for printing |

## Deploy / run steps

### Printer PC (Agent)

```powershell
cd ERP-PRINTER
npm install
$env:PRINT_PORT="4001"
$env:PRINT_NAME="Office-Printer-PC"
npm run agent
```

### Central PC (Hub) — e.g. `192.168.29.176`

```powershell
cd ERP-PRINTER
npm install
$env:PRINT_PORT="4000"
$env:PRINT_AGENT_PORT="4001"
npm run hub
```

### Use

1. Browser: `http://192.168.29.176:4000`
2. Add Agent: `PRINTER-PC-IP:4001`
3. Select printer → print

## Note

Vercel (`erp-testing.vercel.app`) and Render (`erpupgradeback`) do **not** need printer code for this approach. Print works from the **Hub dashboard on the office LAN**.
