# VIVA REVISION - 250 LINES - MEMORIZE THIS

## Opening (30 sec)
"Real-time collaborative code editor. Like Google Docs for coding. Two users join a room, see each other's code instantly, run with Docker, save to AWS S3."

## What It Does
- **Join Room:** Name + room ID
- **Real-time Sync:** Type → peer sees instantly (Socket.IO = permanent connection)
- **Language Sync:** Change C++ → both editors change
- **Run Code:** Docker container compiles/executes
- **Save/Load/Delete:** S3 cloud storage (permanent)

## Tech: Frontend=React+Monaco | Backend=Node.js | Real-time=Socket.IO | Execution=Docker | Storage=AWS(EC2+S3)

## Architecture
```
Alice (Browser) ←Socket.IO→ EC2 Backend ←→ S3 (storage)
                                  ↓
Bob (Browser) ←Socket.IO→   Docker (run code)
```

## Demo Flow (8-10 minutes)
1. Open `http://13.234.116.173:5173` → see editor
2. Alice joins room "demo-123" (gets avatar)
3. Bob joins same room (both see 2 avatars)
4. **Alice types C++ code → Bob's editor updates live** (Socket.IO sync ✓)
5. Alice changes language to C++ → Bob's language auto-syncs ✓
6. Alice clicks "Run" → Docker compiles → output appears (both see) ✓
7. Alice clicks "Save to S3" → gets snippet ID
8. Open AWS console → show file in `codeeditorsnippets` bucket ✓
9. Clear editor → "Load from S3" with ID → code reappears ✓
10. "Delete from S3" → code gone ✓

## Docker (Why?)
**What:** Container = lightweight VM with compiler + OS + code  
**Why:** Safety (isolated), Consistency (same everywhere), Multi-lang support  
**How:** Click Run → Docker creates container → compiles code → runs → output → container deleted  
**Risk without it:** User code could delete server files, crash process, steal data

## AWS (Why?)
**EC2:** Virtual computer (IP: 13.234.116.173) runs 24/7, hosts backend (port 4000) + frontend (port 5173)  
**S3:** Cloud storage for snippets. If EC2 crashes, code survives in S3  
**IAM Role:** EC2 has S3 permission (no hardcoded passwords = safer)

## If Teacher Says "Topic is Too Easy"
"Sir, UI looks simple, but engineering is complex:
1. **Real-time Sync:** Concurrent edits (Alice+Bob edit position 10 simultaneously). Operational Transformation problem.
2. **Code Safety:** Running untrusted code = dangerous. We solve with Docker isolation.
3. **Distributed Consistency:** Data in 3 places (2 browsers + S3). Sync despite network delays = hard.
4. **Architecture Resilience:** EC2+S3 separation = if server crashes, code survives. Scales independently.
5. **DevOps:** Port conflicts, CORS, Socket routes, Docker perms, env vars across 3 deployments = real challenges."

## Q&A
**Q: Why Socket.IO?** A: Persistent connection (instant updates). HTTP = new request per update (slow).
**Q: Why Docker?** A: Safety + isolation + multi-language.
**Q: Why S3 not database?** A: Simpler, durable, scales auto.
**Q: Why split EC2+S3?** A: If server crashes, data survives. Scale independently.
**Q: Language sync how?** A: Backend broadcasts `{language, code}` via Socket.IO.
**Q: If EC2 down?** A: Data in S3 safe. Restart EC2 + load code.
**Q: Main challenge?** A: Socket routes, Docker perms, env vars, sync consistency.

## Closing (20 sec)
"Project shows: real-time collaboration (Socket.IO) + containerized execution (Docker) + cloud infrastructure (EC2+S3). Thank you, sir."

## Demo Checklist
- [ ] Open http://13.234.116.173:5173
- [ ] Alice joins "demo-123"
- [ ] Bob joins same room
- [ ] Type in Alice → Bob sees (sync ✓)
- [ ] Change language → Bob syncs ✓
- [ ] Run code → both see output ✓
- [ ] Save to S3 → snippet ID
- [ ] AWS console → show file in bucket ✓
- [ ] Clear + Load from S3 → code reappears ✓
- [ ] Delete from S3 ✓
**Time: 8-10 minutes**
