# Aquafix Sensor Ingestion Gateway

This module provides dedicated, microcontroller-friendly endpoints to receive telemetry directly from ESP32 (and other IoT microcontrollers) running temperature, pH, and water level sensors over Wi-Fi.

---

## 1. Endpoints

### Ingest Sensor Telemetry
- **Method:** `POST`
- **Path:** `/api/sensors/data` (alias `/api/sensors/telemetry`)
- **Headers:** `Content-Type: application/json`

### Check Connection & Device Info
- **Method:** `GET`
- **Path:** `/api/sensors/info` (alias `/api/sensors/ping`)
- Returns server status, current timestamp, default pond information, and recommended reporting interval.

---

## 2. Expected Payload Formats

### Format A: Simple Flat JSON (Recommended for ESP32)
Minimal overhead for microcontrollers. `pondId` is optional; if omitted, the backend automatically attaches the reading to the active pond.

```json
{
  "deviceId": "ESP32_AQUA_01",
  "temperature": 27.5,
  "ph": 7.4,
  "water_level": 1.25
}
```

*Key aliases supported:*
- `temperature` or `temp` (in °C, bounds: -5 to 60)
- `ph` (pH units, bounds: 0 to 14)
- `water_level` or `waterLevel` (in meters, bounds: 0 to 50)
- `dissolved_oxygen` (in mg/L, bounds: 0 to 50, optional)

### Format B: Full Nested Aquafix Format
```json
{
  "pondId": "00000000000000000000b001",
  "source": "live",
  "values": [
    { "parameter": "temperature", "value": 27.5, "unit": "C" },
    { "parameter": "ph", "value": 7.4, "unit": "pH" },
    { "parameter": "water_level", "value": 1.25, "unit": "m" }
  ]
}
```

---

## 3. Server Response

### Success Response (`201 Created` or `200 OK`)
```json
{
  "success": true,
  "deviceId": "ESP32_AQUA_01",
  "pondId": "00000000000000000000b001",
  "pondName": "SAMPLE Pond A",
  "measurementId": "65b...",
  "recordedAt": "2026-10-14T06:45:00.000Z",
  "receivedAt": "2026-10-14T06:45:00.120Z",
  "receivedValues": {
    "temperature": 27.5,
    "ph": 7.4,
    "water_level": 1.25
  },
  "riskSummary": {
    "temperature": "NORMAL",
    "ph": "NORMAL",
    "water_level": "UNKNOWN"
  },
  "activeAlertsCount": 0
}
```

---

---

## 4. Dry-Run Mode (Testing without database writes)

When testing your ESP32 Wi-Fi firmware and sensor readings, you can run in **dry-run mode**:
- Validates the JSON payload and sensor value ranges
- Evaluates risk thresholds in memory (e.g. `NORMAL`, `WARNING`, `CRITICAL`)
- Prints formatted log output to the terminal
- **Skips writing to MongoDB** and does not create/update any alerts.

### Ways to activate dry-run:
1. **Query parameter on the URL:**
   `POST http://<SERVER_IP>:4000/api/sensors/data?dryRun=true`
2. **Field in the JSON body:**
   Add `"dryRun": true` inside the payload sent by the ESP32.
3. **Environment variable:**
   Set `SENSOR_DRY_RUN=true` in `backend/.env`.

### Dry-run Terminal Log Output:
```text
[SENSOR DRY-RUN] Received from device "ESP32_AQUA_01" for pond "SAMPLE Pond A" (00000000000000000000b001):
  -> temperature: 27.5 C [status: NORMAL]
  -> ph: 7.4 pH [status: NORMAL]
  -> water_level: 1.25 m [status: UNKNOWN]
[SENSOR DRY-RUN] Database write skipped. No data modified.
```

---

## 5. How to Test with cURL or PowerShell

### PowerShell (Dry-run):
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:4000/api/sensors/data?dryRun=true" `
  -Method POST `
  -Headers @{ "Content-Type" = "application/json" } `
  -Body '{"deviceId":"ESP32_TEST_01","temperature":26.8,"ph":7.2,"water_level":1.4}'
```

### cURL in PowerShell:
```powershell
curl.exe -X POST "http://127.0.0.1:4000/api/sensors/data?dryRun=true" `
  -H "Content-Type: application/json" `
  --data-raw '{"deviceId":"ESP32_TEST_01","temperature":26.8,"ph":7.2,"water_level":1.4}'
```

---

## 6. Important Network Notice for ESP32

When testing the ESP32:
- Do **NOT** use `http://localhost:4000` or `http://127.0.0.1:4000` on the ESP32, because on the ESP32 "localhost" refers to the microcontroller itself.
- Use your PC's local Wi-Fi IP address (e.g., `http://192.168.1.50:4000/api/sensors/data?dryRun=true`).
- Ensure your PC firewall allows inbound connections on port 4000.

