# Solar Tracking & Cleaning System Documentation

## 1. Project Overview
This project is an advanced **Solar Tracking and Cleaning System** designed to maximize solar panel efficiency. It consists of two main components:
1.  **Hardware Firmware (Arduino):** Controls the mechanics of the solar panel (tracking movement and cleaning brush).
2.  **Web Dashboard (React/Vite):** A modern, responsive interface for monitoring telemetry and controlling the system manually via the **Web Serial API**.

The system operates in real-time, autonomously tracking the sun using Light Dependent Resistors (LDRs) and performing scheduled cleaning cycles. It also features a robust manual control mode and emergency safety mechanisms.

---

## 2. System Architecture

### Hardware Layer
*   **Controller:** Arduino (Compatible Board).
*   **Sensors:**
    *   2x LDRs (Light Dependent Resistors) for differential light sensing.
    *   4x Limit Switches (2 for DC Motor end-stops, 2 for Stepper Motor cleaning path).
*   **Actuators:**
    *   **DC Motor:** Responsible for rotating the solar panel (East/West tracking). Controlled via PWM (H-Bridge).
    *   **Stepper Motor (NEMA 17):** Responsible for driving the cleaning brush across the panel. Controlled via `AccelStepper` library.
*   **Communication:** Serial over USB (Baud Rate: 9600).

### Software Layer
*   **Frontend:** Single Page Application (SPA) built with **React 19** and **Vite**.
*   **Styling:** **Tailwind CSS** for a premium, dark-themed UI.
*   **Visualization:** **Recharts** for real-time sensor data plotting.
*   **Connectivity:** **Web Serial API** (allows direct browser-to-hardware communication without a backend server).

---

## 3. Firmware Details (`ldr.ino`)

### Key Libraries used
*   `AccelStepper`: High-performance control for the cleaning stepper motor (acceleration, speed).
*   `Wire`: For I2C communication (if needed for future expansion).
*   `RTClib`: Included for Real-Time Clock integration.

### Pin Configuration
| Component | Pin | Type | Description |
| :--- | :--- | :--- | :--- |
| **Stepper Step** | 2 | Digital Out | Step pulse for cleaning motor. |
| **Stepper Dir** | 5 | Digital Out | Direction signal for cleaning motor. |
| **Stepper Enable** | 8 | Digital Out | Enables/Disables stepper torque. |
| **Stepper Home** | 9 | Digital In (Pullup) | Cleaning start position limit switch. |
| **Stepper End** | 10 | Digital In (Pullup) | Cleaning end position limit switch. |
| **DC Motor PWM R** | 3 | PWM Out | DC Motor Right (West) drive. |
| **DC Motor PWM L** | 6 | PWM Out | DC Motor Left (East) drive. |
| **DC Limit L** | A3 | Digital In (Pullup) | Westmost mechanical limit. |
| **DC Limit R** | A2 | Digital In (Pullup) | Eastmost mechanical limit. |
| **LDR Left** | A0 | Analog In | Left light sensor. |
| **LDR Right** | A1 | Analog In | Right light sensor. |

### Operational Logic

#### 1. Solar Tracking (Auto Mode)
The system reads values from `LDR_L` and `LDR_R`. It calculates the difference (`diff = LDR_L - LDR_R`).
*   If `|diff| > TRACK_THRESHOLD` (45), the DC motor engages.
*   It moves towards the brighter side until the difference is within the threshold.
*   **Safety:** Movement is blocked if the corresponding Direction Limit Switch is triggered.

#### 2. Cleaning Cycle
*   Triggered automatically by a timer (`cleanInterval`) or manually via Dashboard.
*   **Sequence:**
    1.  **Center:** Moves the panel to a centered position (gentle seek).
    2.  **Lock:** Locks the DC motor to hold the panel steady (`motorDCLock`).
    3.  **Sweep:** The Stepper motor sweeps the brush across the panel (Forward to limit, Back to home) **3 times**.
    4.  **Park:** Returns the brush to a safe parking distance to avoid shading cells.

#### 3. Emergency & Safety
*   **Emergency Stop:** Immediate halt of all motors if `STOP` command is received.
*   **Heartbeat:** If the dashboard disconnects (no heartbeat for 4 seconds), the system auto-locks for safety.
*   **Safe Speed:** Homing and Centering movements use reduced speeds to prevent mechanical stress.

---

## 4. Communication Protocol
The system uses a JSON-based protocol over Serial (9600 baud).

### Device to Dashboard (Telemetry)
Sent every 200ms.
```json
{
  "LDR_L": 450,
  "LDR_R": 462,
  "Manual": false,
  "Active": true,
  "Emergency": false,
  "LimitL": 0,
  "LimitR": 0,
  "Diff": -12,
  "Action": "IDLE"
}
```
**Log Messages:**
```json
{"Log": "Timer: Starting Scheduled Cleaning"}
```

### Dashboard to Device (Commands)
| Command | Description |
| :--- | :--- |
| `HEARTBEAT` | Sent every 1s to keep connection alive. |
| `STOP` | Triggers Emergency Stop. |
| `RESUME` | Resumes from Emergency Stop. |
| `MODE:MANUAL` | Disables auto-tracking, enables manual control. |
| `MODE:AUTO` | Enables auto-tracking. |
| `DC:200` | Move DC motor East at PWM 200. |
| `DC:-200` | Move DC motor West at PWM 200. |
| `DC:0` | Stop DC motor. |
| `CLEAN:1` | Trigger a manual cleaning cycle. |

---

## 5. Web Dashboard Features

### User Interface
*   **Premium Aesthetic:** Dark slate/blue theme with glassmorphism effects and gradient text.
*   **Header:** Shows connection status (Online/Offline) and Connect/Disconnect toggle.

### Dashboard Sections
1.  **Sensor Status:**
    *   Displays raw LDR values.
    *   Visual "Difference Bar" showing which side is brighter.
    *   Status indicators for signal health.
2.  **Control Panel:**
    *   **Mode Switch:** Auto / Manual.
    *   **Manual Controls:** Directional buttons (East/West) and "Run Cleaning Cycle".
    *   **Emergency Stop:** Big Red Button to freeze system instantly.
    *   **System Logs:** Scrollable terminal view of hardware logs.
3.  **Real-Time Analytics:**
    *   Line Chart showing the history of Light Intensity over time (Left vs Right sensors).
    line chart showing the history of cleaning cycles over time 

### Technical Implementation
*   **`navigator.serial`:** Used for acquiring the COM port and setting up read/write streams.
*   **React State:** Manages the high-frequency telemetry updates efficiently.
*   **Resilience:** Auto-detects parsing errors and connection drops.
