# CrowdShield: AI-Powered Real-Time Crowd Management

![CrowdShield Banner](https://img.shields.io/badge/Status-Live%20Prototype-brightgreen)
![Tech Stack](https://img.shields.io/badge/Stack-React%20%7C%20Flask%20%7C%20YOLOv8-blue)

**CrowdShield** is a next-generation situational awareness platform designed for large-scale public events, religious gatherings, and stadiums. By fusing cutting-edge Computer Vision (YOLOv8, YuNet) with intelligent multi-channel alerting (SMS/Voice/Chat), CrowdShield provides security operators with a "unified eye" to detect congestion, recognize emotional distress, and coordinate emergency responses instantly.

---

## 🌟 Key Features

### 🎥 Live Perception & ML Analytics
- **Multi-Model Fusion**: Integrated YOLOv8 for standard detection and YOLO-Crowd for high-density environments.
*   **Emotion Intelligence**: Real-time micro-expression analysis using Mini-Xception to detect panic or distress in individuals.
- **Dynamic Heatmapping**: Intelligent hotspot detection identifying the most congested entry/exit points (e.g., *Gate 4*).

### 🚨 Intelligent Emergency Broadcast
- **Autonomous Instruction Generation**: Uses Google Gemini AI to draft context-aware emergency instructions in multiple languages (English/Marathi).
*   **Multi-Channel Delivery**: Simultaneous broadcast via SMS and automated Voice Calls.
- **Termux Bridge**: A unique mobile fallback system allowing the dashboard to trigger alerts directly through an Android device, ensuring reliability in local network environments.

### 💻 Command & Control Dashboard
- **State-Driven UI**: Visual navbar transitions (Success: Green, Warning: Yellow, Critical: Red).
*   **Cinematic Demo Flows**: Pre-configured Amber and Red alert sequences for high-impact operator training and drills.
- **Localization**: Full support for English and Marathi interfaces.

---

## 🛠️ Tech Stack

- **Frontend**: React, Vite, CSS3 (Glassmorphism), i18next.
- **Backend**: Python, Flask, OpenCV.
- **AI/ML**: YOLOv8, YOLOv5s-Crowd, YuNet (Face Detection), Mini-Xception (Emotion).
- **LLM**: Google Gemini API.
- **Infrastructure**: Termux API (Android Bridge), SMS Gateway.

---

## 🚀 Quick Start

### 1. Backend Setup
```bash
cd backend
pip install -r requirements.txt
python app.py
```

### 2. Live ML Pipeline (Webcam)
```bash
python unified_live_models.py --push --gate-id 1
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### 4. Communication Bridge
Launch the bridge inside Termux on your Android device:
```bash
python termux_bridge.py
```

---

## 🏗️ Documentation

- [Architecture Overview](architecture.md) — System design and workflow diagrams.
- [Prototype Deep-Dive](prototype.md) — Detailed functional analysis of project components.

---

> **Note**: This project is built for the **Advanced Agentic Coding** initiative. It represents a state-of-the-art implementation of real-time AI integration in public safety.

## Project Explanation
- [CLick of demo and project video](https://www.loom.com/share/347cf27bc8a74b64872ef381f297f971)
