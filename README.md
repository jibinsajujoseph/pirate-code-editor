# ⚓ Akumen Code — Pirate Command Center

> A fully immersive, pirate-themed browser-based coding workspace built for live coding assessments. Write Python or JavaScript inside a cinematic IDE, execute code in isolated Docker containers, and race against the clock — all wrapped in a hand-crafted nautical experience.

---

## ✨ What Makes It Special

**Akumen Code** isn't just another online code editor. It's an experience. From the moment candidates land on the "Set Sail" screen — complete with a looping ocean video, atmospheric background music, and a glowing pirate logo — they know this isn't a boring exam.

- 🏴‍☠️ **Pirate-themed everything** — buttons say "Fire Cannons" instead of "Run", files live in the "Ship's Manifest", output appears in the "Captain's Log"
- 🎬 **Cinematic launch screen** — looping `bg.mp4` video background with animated logo, duration slider, and a "Set Sail" CTA
- 🔊 **Full audio engine** — synthesized cannon booms, success chimes, error tones, typing clicks, and looping background music (`bgm.mp3`) via the Web Audio API
- 🎨 **Custom Monaco theme** — `pirate-dark` with a dark navy background, lime-green keywords, gold strings, and a neon cursor
- ✨ **Particle effects** — subtle floating dots drift across the canvas; cannon smoke bursts on code execution
- 🖼️ **Hand-crafted assets** — parchment textures, lantern decorations, anchor icons, ship-wheel buttons, and a pirate avatar
- ⏱️ **Dramatic "Voyage Complete" endscreen** — when time runs out, a full-screen overlay with video, vignette, compass rose, and pirate flag emoji marks the end

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────────┐
│  Frontend (React + TypeScript + Vite)                  │
│                                                        │
│  SetSailScreen → App Layout → Voyage Complete          │
│  ┌──────────┬──────────────────┬────────────────┐      │
│  │ FileTree │   Monaco Editor  │  OutputPanel   │      │
│  │ (sidebar)│   (pirate-dark)  │  (Captain's    │      │
│  │          │                  │   Log)         │      │
│  └──────────┴──────────────────┴────────────────┘      │
│  Toolbar (Fire Cannons · Voyage Timer · Mute · Lantern)│
└──────────────────┬─────────────────────────────────────┘
                   │ REST + WebSocket
┌──────────────────▼─────────────────────────────────────┐
│  Backend (FastAPI + Python)                            │
│                                                        │
│  Session Manager → Container Manager → Cleanup Loop    │
│  ┌────────────────────────────────────────────────┐    │
│  │  Docker Containers (isolated sandboxes)        │    │
│  │  ┌──────────────┐  ┌──────────────────┐        │    │
│  │  │ akumen-python│  │ akumen-node      │        │    │
│  │  │ (Python 3)   │  │ (Node.js)        │        │    │
│  │  └──────────────┘  └──────────────────┘        │    │
│  └────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────┘
```

### Frontend Stack

| Technology | Purpose |
|---|---|
| React 19 | Component framework |
| TypeScript | Type safety |
| Vite 8 | Build tool and dev server |
| Monaco Editor | Code editing (VS Code's editor) |
| Framer Motion | Animations and transitions |
| Web Audio API | Synthesized sound effects + BGM |

### Backend Stack

| Technology | Purpose |
|---|---|
| FastAPI | REST API + WebSocket server |
| Docker SDK for Python | Container lifecycle management |
| In-memory session store | Session state and file snapshots |

---

## 🗂️ Project Structure

```
pirate-code-editor/
├── index.html                  # Entry HTML with Google Fonts (Inter, JetBrains Mono, Pirata One)
├── src/
│   ├── main.tsx                # React mount point
│   ├── App.tsx                 # Root component — session lifecycle, WebSocket, layout
│   ├── index.css               # All styles (~1000 lines of themed CSS)
│   ├── pirate-theme.ts         # Custom Monaco "pirate-dark" theme definition
│   ├── audio-engine.ts         # Web Audio synthesizer + BGM manager
│   ├── types.ts                # Core types (WorkspaceFile, OutputEntry, etc.)
│   └── components/
│       ├── SetSailScreen.tsx   # Launch screen with video BG, logo, duration slider
│       ├── CodeEditor.tsx      # Monaco wrapper with anti-cheat hardening
│       ├── FileTree.tsx        # "Ship's Manifest" file explorer (create/rename/delete)
│       ├── OutputPanel.tsx     # "Captain's Log" execution output display
│       ├── Toolbar.tsx         # Command bar (Fire Cannons, timer, mute, lantern)
│       ├── CannonSmoke.tsx     # Particle burst effect on code run
│       └── ParticleBackground.tsx  # Ambient floating particles (canvas)
├── public/
│   ├── akumen-logo.png         # Toolbar logo
│   ├── favicon.svg             # Browser tab icon
│   └── assets/
│       ├── bg.mp4              # Looping ocean video background
│       ├── bg.png              # Static fallback background
│       ├── bgm.mp3             # Background music track
│       ├── logo.png            # Large pirate logo (Set Sail + Voyage Complete)
│       ├── parchment.png       # Texture for sidebar and panels
│       ├── ide-bg.png          # Toolbar center decoration
│       ├── ship-wheel.png      # "Fire Cannons" button icon
│       ├── lantern.png         # Toolbar lantern decoration
│       ├── anchor.png          # Anchor icon (Set Sail button, status bar)
│       └── pirate-avatar.png   # Captain avatar in sidebar profile
├── backend/
│   ├── requirements.txt        # Python deps (fastapi, uvicorn, docker)
│   ├── test_sandbox.sh         # End-to-end smoke test via curl
│   ├── app/
│   │   ├── main.py             # FastAPI app, routes, WebSocket handler
│   │   ├── config.py           # Environment-driven sandbox config
│   │   ├── models.py           # Pydantic request/response models
│   │   ├── sessions.py         # In-memory session store
│   │   └── containers.py       # Docker container management
│   └── docker/
│       ├── Dockerfile.python   # Python runtime sandbox image
│       └── Dockerfile.node     # Node.js runtime sandbox image
└── package.json                # Frontend dependencies and scripts
```

---

## ⚙️ How It Works

### Session Flow

1. **Set Sail** — The candidate lands on a cinematic launch screen, sets the voyage duration (1–60 minutes), and clicks "Set Sail"
2. **Session Created** — The frontend calls `POST /sessions` which spins up a Docker container and starts the countdown
3. **Code & Execute** — The candidate writes code in Monaco; clicking "Fire Cannons" syncs files to the container and streams output back over WebSocket
4. **Voyage Complete** — When time expires (or the session is idle too long), the workspace goes read-only and a full-screen endscreen appears

### Code Execution

The active editor tab is the entry file. Before each run:

1. Frontend sends a full workspace snapshot to `PUT /sessions/{id}/workspace`
2. Backend syncs only same-language files into the matching runtime container
3. Backend executes the entry file and streams `stdout`/`stderr` line-by-line over WebSocket
4. Exit code determines the UI feedback — success chime (code 0) or error tone

### Session Lifecycle

The backend is the source of truth for all session timing:

| Event | Behavior |
|---|---|
| **Hard expiry** | Session ends at the configured `expires_at` timestamp |
| **Idle timeout** | Session ends after 20 min of inactivity (configurable) |
| **Disconnect grace** | 20-second window after WebSocket drops before ending |
| **Heartbeat** | Frontend pings every 30s to keep the session alive |
| **Final warning** | Visual + audio alert in the last 5 minutes |

### Anti-Cheat Measures

To deter copying during assessments, the editor disables:

- Copy, cut, paste (both keyboard shortcuts and DOM events)
- Context menu and drag-and-drop
- Monaco autocomplete, suggestions, hover assistance, and parameter hints

> **Note:** These are deterrence measures, not foolproof security. Screenshots, OCR, browser extensions, or DevTools can bypass them.

If Monaco fails to load, the editor stays unavailable (no fallback `<textarea>`) to prevent silently re-enabling clipboard access.

---

## 🚀 Local Development

### Prerequisites

- **Node.js** ≥ 18
- **Python** ≥ 3.11
- **Docker** (daemon running)

### Frontend

```bash
npm install
npm run dev
# → http://localhost:5173
```

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
# → http://localhost:8000
```

### Docker Sandbox Images

```bash
docker build -t akumen-python -f backend/docker/Dockerfile.python backend/docker
docker build -t akumen-node   -f backend/docker/Dockerfile.node   backend/docker
```

### Smoke Test

```bash
bash backend/test_sandbox.sh
```

This runs an end-to-end test using `curl` — creating a session, writing a file, executing it, and tearing down the container.

---

## 🔧 Environment Variables

All backend settings can be overridden via environment variables:

| Variable | Default | Description |
|---|---|---|
| `AKUMEN_PYTHON_IMAGE` | `akumen-python` | Docker image for Python runtime |
| `AKUMEN_NODE_IMAGE` | `akumen-node` | Docker image for Node.js runtime |
| `AKUMEN_CPU_LIMIT` | `0.5` | CPU cores per container |
| `AKUMEN_MEMORY_LIMIT` | `256m` | Memory limit per container |
| `AKUMEN_PIDS_LIMIT` | `64` | Max processes per container |
| `AKUMEN_EXEC_TIMEOUT` | `10` | Per-run wall-clock timeout (seconds) |
| `AKUMEN_DEFAULT_SESSION_DURATION` | `60` | Default session length (minutes) |
| `AKUMEN_IDLE_TIMEOUT_MINUTES` | `20` | Idle session timeout (minutes) |
| `AKUMEN_DISCONNECT_GRACE_SECONDS` | `20` | Grace period after WebSocket drops |
| `AKUMEN_TIMER_WARNING_MINUTES` | `5` | When to trigger the final warning |

---

## 🗺️ API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Docker connectivity + image check |
| `POST` | `/sessions` | Create a new sandbox session |
| `GET` | `/sessions/{id}` | Get session metadata |
| `POST` | `/sessions/{id}/files` | Write a file to the runtime container |
| `PUT` | `/sessions/{id}/workspace` | Sync full workspace snapshot for execution |
| `POST` | `/sessions/{id}/execute` | Execute a file (non-streaming) |
| `DELETE` | `/sessions/{id}` | Tear down containers and end session |
| `WS` | `/sessions/{id}/ws` | WebSocket for streaming output + lifecycle events |

---

## 📜 License

Private — built for [Akumen](https://akumenbyq.com).
