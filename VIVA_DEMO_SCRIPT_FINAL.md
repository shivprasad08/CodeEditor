# VIVA SCRIPT - 250 LINES

## Opening (30 sec)
"Real-time collaborative code editor like Google Docs for coding. Two users join a room, see each other's code instantly, run with Docker, save to AWS S3."

## Features (Quick)
✓ Join room (name + room ID)  
✓ Real-time code sync (type in A → B sees)  
✓ Language sync (change to C++ → both change)  
✓ Run code (Docker compiles & executes)  
✓ Save/Load/Delete snippets (S3 cloud)  

## Tech Stack
- **Frontend:** React + Monaco Editor + Socket.IO
- **Backend:** Node.js + Express + Socket.IO
- **Execution:** Docker containers
- **Storage:** AWS S3 (permanent)
- **Compute:** AWS EC2 (24/7 virtual machine, IP: 13.234.116.173)

## Architecture (Simple)
```
Alice (Browser) ←Socket.IO→ EC2 Backend (port 4000)
                                ↓              ↓
                           Docker      AWS S3 Storage
                                ↑              ↑
Bob (Browser) ←Socket.IO→ (Same Backend)
```

## Why Each Component?
- **Socket.IO:** Permanent connection = instant updates (not HTTP requests)
- **Docker:** Safety + isolation + multi-language support
- **EC2:** Always-on compute, Docker inside, 24/7 availability
- **S3:** Permanent storage, survives if EC2 crashes, scales auto

## Demo Flow (8-10 min)
1. Open `http://13.234.116.173:5173`
2. Alice joins room "demo-123" (gets avatar)
3. Bob joins same room (both see 2 avatars)
4. **Alice types C++ → Bob's editor updates instantly** (Socket.IO ✓)
5. Alice changes language to C++ → Bob auto-syncs ✓
6. Alice runs C++ → Docker compiles → output appears (both see) ✓
7. Alice changes to Python → same sync ✓
8. Alice runs Python → output ✓
9. Alice clicks "Save to S3" → gets snippet ID
10. Open AWS console → show file in bucket ✓
11. Clear editor → "Load from S3" → code reappears ✓
12. "Delete from S3" → gone ✓

## Docker Explained
**What:** Lightweight VM with compiler (GCC, Python, Java) + OS + code  
**Why:** Safety (isolated), Consistency (same everywhere), Multi-language  
**Flow:** Click Run → Docker creates container → compile → run → output → delete container  
**Why Not Direct:** User code could delete server files, crash process, steal data

## AWS Explained
**EC2 (Virtual Computer):**
- Instance: t2.micro (Free Tier), Amazon Linux 2023
- IP: 13.234.116.173 (access via browser)
- Runs: Node.js backend (4000) + React frontend (5173) + Docker
- Cost: ~$5/month

**S3 (Cloud Storage):**
- Bucket: `codeeditorsnippets`
- Stores: Code snippets permanently
- Benefit: If EC2 crashes, code survives
- Cost: ~$0.02/GB (Free Tier: 5GB)

**IAM Role:**
- EC2 has S3 permission (no hardcoded keys)
- Safer: secrets can't leak from `.env`

## If Teacher Says "Topic Too Easy"
"Sir, UI looks simple, but engineering is complex:

1. **Real-time Sync:** If Alice+Bob edit position 10 simultaneously, which wins? Operational Transformation problem.
2. **Code Safety:** Running untrusted code = dangerous. We solve with Docker isolation.
3. **Distributed Consistency:** Data in 3 places (2 browsers + S3). Sync despite network delays = hard.
4. **Architecture Resilience:** EC2+S3 separation = if server crashes, code survives. Scales independently.
5. **DevOps Challenges:** Port conflicts, CORS, Socket routes, Docker perms, env vars across 3 deployments = real problems."

## Quick Q&A
**Q: Why Socket.IO?** HTTP = new request per update (slow). Socket.IO = persistent connection (instant).  
**Q: Why Docker?** Safety + isolation + multi-language.  
**Q: Why S3?** Durable, scales auto, survives server crashes.  
**Q: Why split EC2+S3?** Server crashes → code survives. Scale independently.  
**Q: Language sync how?** Backend broadcasts `{language, code}` via Socket.IO to room.  
**Q: If EC2 down?** Data in S3 safe. Restart EC2 + load code.  
**Q: Main challenge?** Socket routes, Docker perms, env vars, sync consistency.

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
