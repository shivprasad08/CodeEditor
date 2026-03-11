# VIVA SCRIPT - 200 LINES (DETAILED)

## Opening (45 sec)
"Good morning sir. Our project is a **real-time collaborative code editor**—imagine Google Docs but for writing code. Multiple users join the same room, code together instantly, run code with Docker, and save permanently to AWS S3.

**The key innovation:** When Alice types, Bob sees it within milliseconds without page refresh. When Alice changes language to C++, Bob's editor auto-syncs. This is achieved through Socket.IO (permanent WebSocket connections), not traditional HTTP requests.

**Why it's complex:** Real-time sync + distributed state + containerized execution + cloud infrastructure = practical distributed systems engineering."

## Features (Detailed)
1. **Join Room:** User enters name + unique room ID. Backend creates/joins instantly via Socket.IO handshake.
2. **Real-time Code Sync:** Alice types `int x = 5;` → socket sends to backend → backend broadcasts to room → Bob's editor updates instantly. **Previously broken:** Language didn't sync (Bob stayed on JavaScript). **Fixed by:** Adding `language` field to socket events.
3. **Language Selection Sync:** Alice changes C++ dropdown → server broadcasts language change → Bob's editor shows C++ syntax highlighting auto-magically.
4. **Presence Avatars:** Top-right shows colored avatars (A=Alice, B=Bob) so users know who's editing.
5. **Cursor Tracking:** Bob sees Alice's cursor position and selection highlighted (remote cursor awareness).
6. **Run Code:** Click "Run" → Docker container spawns with language compiler (GCC for C++, Python runtime for Python) → code compiles/executes → output displayed to both users.
7. **Save/Load/Delete Snippets:** Save button → S3 upload → get snippet ID → code persists even if EC2 crashes. Load by ID. Delete removes from S3.  

## Tech Stack
- **Frontend:** React + Monaco Editor + Socket.IO
- **Backend:** Node.js + Express + Socket.IO
- **Execution:** Docker containers
- **Storage:** AWS S3 (permanent)
- **Compute:** AWS EC2 (24/7 virtual machine, IP: 13.234.116.173)

## Architecture & Data Flow
```
Alice's Browser (React + Monaco Editor)
    ↓ Socket.IO (WebSocket - persistent TCP connection)
EC2 Backend (Node.js + Express + Socket.IO server)
    ├→ Room Management (broadcast changes to room members)
    ├→ REST APIs (/snippets, /api/submit)
    └→ Docker CLI (spawn containers for code execution)
    ↓
├──→ Docker Engine (containers: gcc:latest, python:3.11, openjdk:17)
└──→ AWS S3 (storage via IAM-authenticated API calls)
    ↑
Bob's Browser (React + Monaco Editor)
```

**Data Flow Example (Real-time Sync):**
1. Alice types → `onChange` triggers → `socket.emit('document-change', {roomId, content, language})`
2. Backend receives → validates room exists → `socket.to(roomId).emit()` broadcasts to others
3. Bob's socket connection receives → sets editor state → Re-render with new code
4. **No database queries.** No polling. Direct event-driven sync.

## Docker - Why Containers? (Key Innovation)
**What Docker Does:**
Container = minimal Linux OS + language compiler + standard library. Unlike VMs (gigabytes), containers are megabytes. Runs in isolation from host.

**Real Example:**
```cpp
#include <iostream>
int main() { std::cout << "Hello"; return 0; }
```
User clicks "Run" → Backend spawns: `docker run --rm -u user gcc:latest g++ code.cpp -o a && ./a`
- `--rm`: Deletes container after execution (no leftover garbage)
- `gcc:latest`: Pre-built image with GCC compiler
- Container runs 2 seconds, completes, dies

**Why Not Direct Server Execution?**
```
❌ Direct: g++ mycode.cpp && ./a  
  ↓ Problem: What if code is `system("rm -rf /");`? Deletes EC2 filesystem!
  ↓ Problem: If code hangs in infinite loop, consumes 100% CPU (kills other users)
  ↓ Problem: C++ code with memory leak = memory keeps growing on EC2

✅ Docker: Container runs isolated  
  ↓ Benefit: `rm -rf /` only destroys container's Linux, not EC2
  ↓ Benefit: Memory limit (e.g., 256MB) enforced by container runtime
  ↓ Benefit: Process automatically killed after 10 seconds (timeout)
```

**Multi-Language Support (Easy):**
- C++ → use `gcc:latest` image
- Python → use `python:3.11` image
- Java → use `openjdk:17` image
- Backend just picks right image based on language dropdown

## AWS Cloud Setup (Detailed)
**EC2 (Virtual Computer on AWS):**
- **Instance:** t2.micro (Free Tier: 1 vCPU, 1GB RAM, eligible for free for 12 months)
- **OS:** Amazon Linux 2023 (lightweight, 2GB, pre-installed with yum package manager)
- **Region:** ap-south-1 (Mumbai, closest to India = lowest latency)
- **Security Group:** Firewall rules:
  - Port 22: SSH (remote access)
  - Port 5173: React frontend dev server
  - Port 4000: Node.js backend + Socket.IO
- **Public IP:** 13.234.116.173 (permanent elastic IP)
- **Running Services:**
  - Node.js backend (listens on :4000)
  - Docker daemon (responds to container commands)
  - React dev server (Vite, listens on :5173)

**S3 (Cloud Storage):**
- **Bucket Name:** `codeeditorsnippets` (globally unique)
- **Region:** ap-south-1 (same as EC2, reduces latency)
- **Storage Model:** Object storage (not like file system; key-value pairs)
- **Durability:** 99.999999999% (11 nines) = data replicated across 3 geographically distant data centers
- **Example:** 
  - Alice saves Python code → backend uploads to S3 with key: `snippets/python_demo_xyz.py`
  - Later, server crashes → no problem, code still in S3
  - EC2 restarts → app reads from S3 → code available
- **Cost:** ~$0.023/GB/month = $0.12/month for ~5GB (Free Tier: 5GB free)

**IAM Role (Security):**
- **Problem:** If we hardcode `AWS_ACCESS_KEY` in `.env`, anyone reading code leaks credentials
- **Solution:** Attach IAM role `CodeEditorEC2S3Role` to EC2 instance
- **How it works:** When Node.js code calls `s3Client.putObject()`, AWS SDK silently uses instance's role (no hardcoded keys)
- **Permission:** Role has `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` on bucket `codeeditorsnippets`

## Complete Demo Flow (8-10 minutes)
1. **Website Load:** Open `http://13.234.116.173:5173` → React frontend loads from EC2 → see empty Monaco editor, language dropdown, Run button
2. **Alice Joins:** Name="Alice", Room="demo-123" → Socket.IO connects → backend creates room → Alice sees avatar "A"
3. **Bob Joins (2nd Tab):** Same URL → Name="Bob", Room="demo-123" → **Both tabs show 2 avatars** → WebSocket broadcasts room state
4. **Real-time Code Sync:** Alice types `#include <iostream>...` → **Bob sees code appear instantly** → socket events flowing constantly (no polling)
5. **Language Sync Proof:** Alice changes dropdown C++ → **Bob's dropdown also changes to C++** → both see C++ syntax highlighting (Previously: Bob stayed on JavaScript when Alice selected C++. We fixed this!)
6. **Compile C++:** Alice clicks "Run" → Backend spawns Docker container → `g++ code.cpp -o a && ./a` → Output: "Hello" → **Both Alice and Bob see output** → container deleted
7. **Change to Python:** Alice clicks language → Python → Both editors sync to Python template
8. **Run Python:** Alice types `print("Hello from Alice!")` → Click "Run" → Docker: `python code.py` → Output shown → container deleted
9. **Save to S3:** Click "Save to S3" → Input prompt "snippet name" → Backend: `s3Client.putObject()` → Gets snippet ID back (e.g., `snippet-abc123`)
10. **Verify in AWS:** Open new tab → AWS console → S3 → `codeeditorsnippets` bucket → **See Python file** (size ~100 bytes, uploaded now)
11. **Load from S3:** Clear editor → Click "Load" → Enter snippet ID → **Python code reappears exactly** → Backend: `s3Client.getObject()`
12. **Delete from S3:** Click "Delete" → Enter snippet ID → **Code removed from S3** → Try load again → "Snippet not found"

## System Design Decisions (Why We Chose This Architecture)

**Problem 1: How to sync code between 2+ users in real-time?**
- ❌ HTTP polling: Browser asks "Any updates?" every 100ms → wasteful, 10 requests/sec
- ✅ Socket.IO: Persistent TCP connection, server pushes updates instantly → 1 connection, instant delivery

**Problem 2: How to handle concurrent edits?**
- ❌ Last-write-wins: Alice deletes char 5, Bob inserts at 5, data corruption
- ✅ Event ordering: Socket.io guarantees message order in single room. All clients apply edits in same order

**Problem 3: Where to store code snippets?**
- ❌ Local EC2 filesystem: If instance fails/restarts, code lost. Hard to scale to 100 instances
- ✅ S3: Durable (99.99999%), auto-replicated across 3 data centers, scales infinitely, pay-per-GB

**Problem 4: How to safely run untrusted user code?**
- ❌ exec() on server: One malicious loop → kills all users' processes
- ✅ Docker isolates: Untrusted code runs in sandboxed container, memory/CPU capped, auto-killed after 10 sec

**Problem 5: How to support C++, Python, Java simultaneously?**
- ❌ Install all compilers: Conflicts, dependency hell, hard to maintain
- ✅ Volume-mount languages: Use language-specific Docker images, pre-configured, guaranteed consistency

## Extended Q&A (Common Viva Questions)

**Q: Why Socket.IO instead of HTTP?**
A: HTTP = request-response (browser asks, server answers). For real-time, browser would need to ask every 100ms = 600 requests/min = wasteful. Socket.IO opens persistent WebSocket connection = server pushes updates instantly. For 2 users, 2 connections. For 100 users, 100 connections.

**Q: Why Docker instead of running code directly on server?**
A: Direct execution: If Alice's code has `while(1) x++;`, it consumes 100% CPU → Bob's code hangs. Docker isolates = container gets max 256MB RAM, max 10 seconds → timeout kills it, other users unaffected.

**Q: Why S3 instead of relational database (PostgreSQL)?**
A: Code is unstructured (one big string). S3 (object storage) is simpler = key-value model. Costs less ($0.02/GB vs $50+/month for DB instance). Scales infinitely without sharding.

**Q: Why separate EC2 and S3?**
A: If code stored on EC2's disk and instance crashes → code lost. S3 replicates = survives. Plus: EC2 handles compute (stateless), S3 handles storage (persistent) → can scale independently.

**Q: How does language sync work technically?**
A: When Alice changes language, `handleLanguageChange()` emits: `socket.emit('language-change', {roomId, language: 'C++'})` → Backend: `socket.to(roomId).emit(...)` → Bob's listener receives → updates Redux/state → re-render with new syntax highlighter

**Q: If EC2 instance is down for 1 hour, what happens?**
A: App is unreachable (users can't load page). But code in S3 is safe. When EC2 restarts, app loads from S3 again. Users reconnect via Socket.IO.

**Q: Main bug we fixed?**
A: Language selection didn't sync. Alice chose C++, Bob stayed on JavaScript. Root cause: language field not in socket `document-change` event. Fix: Added `language` to all socket broadcasts.

## If Teacher Questions Complexity (Strong Defense)

**Expected Challenge:** "Sir, this is just a simple code editor. Any developer can build this. What's so complex?"

**Counter (Speak Confidently):**

"Sir, respectfully, while the **user-facing feature looks simple**, the **engineering is non-trivial**:

1. **Concurrent Edit Handling:** If Alice inserts 'x' at position 5 while Bob deletes position 5 simultaneously, which wins without data corruption? This is the Operational Transformation problem (same as Google Docs). We solved it by enforcing strict event order through Socket.IO. 

2. **Distributed State Consistency:** Code exists in 3 places: Alice's browser state, Bob's browser state, EC2 backend, AND S3 storage. Keeping all 4 in sync despite network delays, packet loss, server crashes = non-trivial.

3. **Safe Code Execution:** Running untrusted user code (potentially malicious) on a production server = dangerous. We can't just `exec()` it. Docker isolation + resource limits (memory cap, CPU cap, timeout) = essential security engineering.

4. **Cloud Architecture Complexity:** Why EC2+S3 instead of single monolithic server?  
   - EC2 dies → code lost (bad)  
   - S3 replicates across 3 data centers → survives  
   - Allows horizontal scaling (10 EC2 instances, all talk to same S3)  
   - Industry standard (Netflix, Uber, Airbnb all use this pattern)

5. **Real DevOps Challenges:** Port conflicts (process using 4000/5173), CORS misconfiguration (React can't call backend), Socket endpoint routing (Socket.IO must know EC2's public IP), Docker permissions (user group setup), environment variables (localhost vs EC2 vs Vercel = different endpoints).

**Analogy:** Google Docs looks simple. But sync 100 million users, handle offline edits, merge concurrent changes, persist to BigTable, survive data center failures = requires distributed systems engineering. Our app is similar in complexity."

## Closing (20 sec)
"Project demonstrates: real-time collaboration (Socket.IO) + containerized execution (Docker) + cloud infrastructure (EC2+S3). Thank you, sir."

## Demo Checklist
- [ ] Open http://13.234.116.173:5173
- [ ] Alice creates room
- [ ] Bob joins same
- [ ] Code sync live ✓
- [ ] Language syncs ✓
- [ ] Run C++ ✓
- [ ] Run Python ✓
- [ ] Save to S3 ✓
- [ ] Verify in AWS bucket ✓
- [ ] Load from S3 ✓
- [ ] Delete from S3 ✓
**Time: 8-10 minutes**
