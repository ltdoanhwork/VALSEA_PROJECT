# Documentation Map

Quick reference để tìm documentation nào ở đâu.

## 📂 Documentation Structure

```
VALSEA_PROJECT/
│
├── 📖 README.md                      # Main project overview, setup, deployment
├── 📖 CLAUDE.md                      # Guidance for Claude Code development
├── 📖 DOCUMENTATION_MAP.md           # ← This file (navigation guide)
│
├── 📁 docs/                          # Project-level documentation
│   ├── README.md                     # Docs index
│   ├── PROJECT_ARCHITECTURE.md       # Overall architecture (backend + frontend + mlops)
│   └── project-submission.md         # (existing)
│
├── 📁 backend/                       # FastAPI backend
│   └── README.md                     # Backend-specific docs (empty for now)
│
├── 📁 frontend/                      # React frontend
│   └── (no docs yet)
│
└── 📁 mlops/                         # ML projects
    ├── README.md                     # MLOps philosophy, project list, best practices
    │
    └── scorer/                       # Semantic Similarity Scorer
        ├── README.md                 # Quick start & overview
        └── docs/                     # Detailed documentation
            ├── IMPLEMENTATION_PLAN.md   # Step-by-step implementation with code
            └── PROJECT_STRUCTURE.md     # Directory structure explained
```

---

## 🗺️ What to Read When

### "Tôi muốn hiểu tổng quan toàn bộ project"
→ Read: **[README.md](./README.md)** (root)

### "Tôi muốn hiểu kiến trúc (backend, frontend, mlops interact thế nào?)"
→ Read: **[docs/PROJECT_ARCHITECTURE.md](./docs/PROJECT_ARCHITECTURE.md)**

### "Tôi muốn develop với Claude Code"
→ Read: **[CLAUDE.md](./CLAUDE.md)**

### "Tôi muốn làm MLOps project"
→ Read: **[mlops/README.md](./mlops/README.md)** first

### "Tôi muốn implement scorer service"
→ Read in order:
1. [mlops/scorer/README.md](./mlops/scorer/README.md) - Overview
2. [mlops/scorer/docs/IMPLEMENTATION_PLAN.md](./mlops/scorer/docs/IMPLEMENTATION_PLAN.md) - Step-by-step code
3. [mlops/scorer/docs/PROJECT_STRUCTURE.md](./mlops/scorer/docs/PROJECT_STRUCTURE.md) - Structure details

---

## 📚 Documentation Ownership

| Directory | Contains | Audience |
|-----------|----------|----------|
| **Root** | High-level overview, setup | All users |
| **docs/** | Architecture, design decisions | Developers |
| **backend/** | Backend-specific details | Backend devs |
| **frontend/** | Frontend-specific details | Frontend devs |
| **mlops/** | ML philosophy, project index | ML engineers |
| **mlops/{project}/** | Quick start for that ML project | ML engineers |
| **mlops/{project}/docs/** | Deep dive implementation | ML engineers |

---

## 🎯 Documentation Principles

### Root Level (`README.md`)
- ✅ Quick start (setup, run, deploy)
- ✅ High-level architecture diagram
- ✅ API overview
- ❌ No deep implementation details

### `docs/` Directory
- ✅ Architecture decisions
- ✅ System design
- ✅ Cross-component interactions
- ❌ No component-specific tutorials

### Component README (`mlops/scorer/README.md`)
- ✅ Component overview
- ✅ Quick start commands
- ✅ Links to detailed docs
- ❌ No full implementation guide

### Component `docs/` (`mlops/scorer/docs/`)
- ✅ Step-by-step implementation
- ✅ Architecture details
- ✅ Code examples
- ✅ Deep dives

---

## 🔄 Documentation Updates

When adding a new ML project:

1. Create `mlops/{project}/README.md` - Quick start
2. Create `mlops/{project}/docs/` - Implementation guides
3. Update `mlops/README.md` - Add to project list
4. Update `docs/PROJECT_ARCHITECTURE.md` - Add to architecture
5. Update this file (`DOCUMENTATION_MAP.md`)

---

## 📋 Current Documentation Status

| Document | Status | Last Updated |
|----------|--------|--------------|
| README.md (root) | ✅ Complete | 2026-05-08 |
| CLAUDE.md | ✅ Complete | 2026-05-08 |
| docs/PROJECT_ARCHITECTURE.md | ✅ Complete | 2026-05-08 |
| mlops/README.md | ✅ Complete | 2026-05-08 |
| mlops/scorer/README.md | ✅ Complete | 2026-05-08 |
| mlops/scorer/docs/IMPLEMENTATION_PLAN.md | ✅ Complete | 2026-05-08 |
| mlops/scorer/docs/PROJECT_STRUCTURE.md | ✅ Complete | 2026-05-08 |
| backend/README.md | 📝 Empty | - |
| frontend/README.md | ❌ Missing | - |

---

## 🚀 Quick Links

- [Main README](./README.md)
- [Architecture Overview](./docs/PROJECT_ARCHITECTURE.md)
- [MLOps Projects](./mlops/README.md)
- [Scorer Implementation Guide](./mlops/scorer/docs/IMPLEMENTATION_PLAN.md)
- [Claude Code Guidance](./CLAUDE.md)
