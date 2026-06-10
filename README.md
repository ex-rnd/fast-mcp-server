# 🔐 Scalable Descope MCP Server — Next.js 16 + Secure Agentic Identity 
A full‑stack reference implementation showing how to build secure AI agents using Descope’s Agentic Identity Hub, Next.js 16, and a fully scoped MCP (Model Context Protocol) Server.
This project demonstrates real authentication, scoped authorization, dynamic client registration, and audit‑grade observability for AI tools. 

## ✳️ Visual Overview 

<div align="center">
  <video src="https://github.com/user-attachments/assets/03baa458-de5d-4d88-b590-786ef996d6c1" width="400" />
</div>


## 📹 Demo
1. Before running the app, ensure your Descope project is configured correctly. 
```
> 1. Set NEXT_PUBLIC_DESCOPE_PROJECT_ID from Descope Project Settings
> 2. Create a Management Key in Company Settings → Management Keys
> 3. Generate MCP_SERVICE_KEY using: openssl rand - hex 32
> 4. (Optional) Create an Outbound App for GitHub issues
```

2. Run the Next.js app
```
npm install
npm run dev
```

3. Then open:
```
http://localhost:3000
```

4. In the app
> 1. Sign up or sign in using Descope
> 2. Register an MCP client via Dynamic Client Registration
> 3. Exchange access key → scoped JWT
> 4. Call any of the 6 MCP tools
> 5. View audit logs in Descope dashboard


## 🔍 Project Overview

### Problem
- Modern AI agents need identity, permissions, and auditability — not just raw LLM calls.
- This project demonstrates how to build a secure, scoped, observable agent using Descope’s identity infrastructure.

### What the app demonstrates
A complete secure agent lifecycle:
1. Register — Agent registers via Dynamic Client Registration (DCR)
2. Exchange — Agent trades an access key for a scoped M2M JWT
3. Execute — Agent calls one of 6 MCP tools (scope‑gated)
4. Audit — Every tool call is logged to Descope’s audit trail


### The 3 API routes
| Route | Purpose |
| --- | --- |
| ``app/api/auth/route.ts`` | DCR registration, token exchange, introspection, audit events |
| ``app/api/auth/validate-session/route.ts`` | Validates browser session JWT |
| ``app/api/mcp/route.ts`` | MCP Tool Server — scope‑based authorization |

### The 6 MCP tools (scope‑gated)
| Tool | Required Scope |
| --- | --- |
| ``list_tables`` | ``mcp:read`` |
| ``read_database`` | ``mcp:read`` |
| ``insert_record`` | ``mcp:write`` |
| ``delete_record`` | ``mcp:admin`` |
| ``run_query`` | ``mcp:admin`` |
| ``fetch_github_issues`` | ``mcp:connections`` |


## 🛠️ Getting Started
1. Clone
```bash
git clone https://github.com/your-org/scalable-descope-mcp-server.git
cd scalable-descope-mcp-server
```

2. Install dependencies.
```bash
npm install
```

3. Create `.env.local`. 
- Navigate to the flutter folder.
```bash
NEXT_PUBLIC_DESCOPE_PROJECT_ID=your_project_id
DESCOPE_MANAGEMENT_KEY=your_management_key
MCP_SERVICE_KEY=$(openssl rand -hex 32)
DESCOPE_OUTBOUND_APP_ID=optional_github_outbound_app_id
```

4. Run the app.
```
npm run dev
```


## ▶️ Usage
### Quick Flow.
- Sign in with Descope
- Register an MCP client
- Exchange access key → JWT
- Call tools from the dashboard
- View audit logs in Descope

### Example: Dynamic Client Registration (DCR).

<div align="center">
  <video src="https://github.com/user-attachments/assets/f3565e5e-74cd-4a59-af2b-da0296ee18c8" width="400" />
</div>

```
POST /api/auth
{
  "action": "register",
  "clientName": "my-agent"
}
```

### Example: Access Key → JWT Exchange

<div align="center">
  <video src="https://github.com/user-attachments/assets/57943a70-fc4a-4a27-b5a6-5b1db7c7be9e" width="400" />
</div>

```
POST /api/auth
{
  "action": "exchange",
  "accessKey": "your_agent_access_key"
}
```

### Example: MCP Tool Call
```
POST /api/mcp
{
  "tool": "list_tables",
  "jwt": "scoped_m2m_token"
}
```


## 🚀 App Flow & Routes
— `/` Dashboard (auth required)
— `/auth` Descope sign‑in
— `/mcp` MCP tool execution UI
— `/api/auth` DCR + token exchange + audit
— `/api/mcp` MCP tool server
— `api/auth/validate-session` Session validation


## 📁 File overview (important files)

- `app/api/auth/route.ts`
- Dynamic Client Registration
- Access key → JWT exchange
- Token introspection
- Audit event creation


- `app/api/mcp/route.ts`
- MCP tool server
- Scope‑based authorization
- Executes 6 tools against JSON DB

- `lib/mcpDcrStore.ts`
- In‑memory DCR store
- Maps registered clients → granted scopes

- `data/db.json`
- Mock dataset for read/insert/delete/query tools

- `mcp_client.py` / `mcp_server.py`
- Optional Python FastMCP client/server
- Demonstrates real DCR + token exchange + tool execution


## 🔐 Environment & Secrets
- 	Never commit secrets. Use `.env` locally and environment injection for CI/CD.
- 	Required env keys (example):
- 	`NEXT_PUBLIC_DESCOPE_PROJECT_ID`,
- 	`DESCOPE_MANAGEMENT_KEY`,
- 	`MCP_SERVICE_KEY`,
- 	`DESCOPE_OUTBOUND_APP_ID` (optional).

## 🔜 Next steps / Roadmap
- ➕ Add persistent DCR store (Redis / Postgres)
- 🧪 Add integration tests for DCR + tool execution
- 🔐 Add signed outbound requests for GitHub
- 📊 Add dashboard for audit log visualization
- 🧵 Add streaming MCP responses (LLM‑style)
- 🌐 Add multi‑agent support with per‑agent scopes


## 🤝 Contributing
- Fork the repo
- Branch naming: feature/xyz or fix/xyz
- Run linters:
```bash
npm run lint
```
- Add tests:
```bash
npm run test
```
- Submit PRs with clear descriptions and link related issues


### 🙏 Thank you for exploring secure agent identity with Descope + MCP 🎉!

