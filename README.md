# scanner485 — RS-485 Modbus RTU Reader

A premium, modern web dashboard for reading and diagnostic monitoring of RS-485/Modbus RTU power meters. It operates natively in modern browsers via the **Web Serial API** (Local Computer mode) or through a Socket.io node proxy (Remote Server mode).

---

## 🚀 Key Features

*   **Native Web Serial Support:** Poll Modbus devices directly from your web browser without installing local drivers or software (supported in Chrome, Edge, and Opera).
*   **Intelligent Register Grouping:** Automatically groups registers into contiguous address blocks to minimize queries. Uses a safe **maximum block size of 8 registers** to prevent device buffer overflows.
*   **Enhanced Serial Stability:**
    *   **50ms Inter-packet delay:** Prevents RS-485 bus congestion.
    *   **300ms Recovery delay:** Automatically pauses after a query timeout to let the meter's serial engine reset.
    *   **Optimized timeouts (1000ms):** Keeps the poll cycle fast even during minor signal interruptions.
*   **Connection Profiles:** Save and load custom communication profiles (Baud, Parity, Stop Bits, Data Bits, and Slave ID) to easily connect in one click.
*   **Custom Auto-Detect Mode:** Automatically scan serial settings (Baud, Parity, Stop bits) dynamically targeting a specific device template and Slave ID.
*   **Word-Swapped float32 & uint32 Decoding:** Support for `float32_le` and `uint32_le` data types (Little-Endian Word Order / `CDAB` format) used by ABB M1M meters.

---

## 🔌 Supported Devices

1.  **ABB M1M12:**
    *   *Default configuration:* `2400 Baud, Odd Parity, 2 Stop Bits, Slave ID 2` (or custom).
    *   *Data format:* Uses word-swapped floats (`float32_le`) and unsigned longs (`uint32_le`).
2.  **Conzerv EM6400NG:**
    *   *Default configuration:* `19200 Baud, Even Parity, 1 Stop Bit, Slave ID 1`.
    *   *Data format:* Standard big-endian floats (`float32_be`).

---

## 🛠️ Getting Started

### Prerequisites
*   **Node.js** (v18 or higher)
*   A **Web Serial compatible browser** (Google Chrome, Microsoft Edge, Opera)
*   A **USB-to-RS485 converter** wired to your meter.

### How to Run

1.  Open your terminal in the project directory.
2.  Run the developer environment startup script:
    ```bash
    ./start.sh
    ```
3.  Open the allocated local URL in your web browser (typically **`http://localhost:5173`**).

---

## 📝 Diagnostic & Manual Operations

The **Manual Operations** panel allows you to run direct diagnostics:
*   Use **FC 03 (Read Holding Registers)** to poll any value.
*   *Note on addresses:* The manual input expects the **0-based Modbus protocol offset**, not the 5-digit PLC address.
    *   To poll **Watts Total** (`40101` in the manual): Input **`100`** with data type `float32_le`.
    *   To poll **Frequency** (`40157` in the manual): Input **`156`** with data type `float32_le`.

---

## ⚙️ RS-485 Troubleshooting Checklist

If you receive `Read chunk timeout` errors, verify the following:
1.  **A & B Wires Swapped:** This is the most common RS-485 mistake. Swap the `A` and `B` wires on your USB converter.
2.  **Slave ID Mismatch:** The Slave ID in the **Device & Scan Control** panel must match the address configured on your meter's physical screen.
3.  **Missing Ground:** Connect the `GND` wire between your USB converter and the meter's RS-485 ground.
