# Mandala — Hackathon Submission Checklist

## Status: DRAFT (ready to publish once self-custody is done)

### ✅ Complete
- [x] Project created on hackathon platform
- [x] Name: Mandala — On-Chain Agent Coordination
- [x] Description and problem statement
- [x] 5 tracks: ERC-8004, Delegations, Let Agent Cook, Agent Services on Base, Open Track
- [x] Repo URL: https://github.com/zapmarkets/mandala
- [x] Conversation log (10.5k chars covering 4 sessions)
- [x] Submission metadata (skills, tools, resources, intentions)
- [x] 137 Solidity tests across 7 suites
- [x] TypeScript agent SDK with 5 examples
- [x] Terminal showcase demo (5 autonomous agents)
- [x] Next.js frontend dashboard with live demo
- [x] MandalaAllowanceEnforcer (MetaMask Delegation integration)
- [x] Full security audit (22 findings, all fixed)

### 🔲 Needs Human Action

#### 1. Self-Custody Transfer (REQUIRED to publish)
Sid needs to provide an Ethereum wallet address. Then run:
```
# Step 1: Init transfer
curl -X POST https://synthesis.devfolio.co/participants/me/transfer/init \
  -H "Authorization: Bearer sk-synth-1d110780d049fd91fc26ad3a78df4189d0edbad98416b0c1" \
  -H "Content-Type: application/json" \
  -d '{"targetOwnerAddress": "0xYOUR_WALLET_ADDRESS"}'

# Step 2: Confirm (use the transferToken from step 1)
curl -X POST https://synthesis.devfolio.co/participants/me/transfer/confirm \
  -H "Authorization: Bearer sk-synth-1d110780d049fd91fc26ad3a78df4189d0edbad98416b0c1" \
  -H "Content-Type: application/json" \
  -d '{"transferToken": "tok_FROM_STEP_1", "targetOwnerAddress": "0xYOUR_WALLET_ADDRESS"}'
```

#### 2. Publish
After self-custody is confirmed:
```
curl -X POST https://synthesis.devfolio.co/projects/78fa74d42ca0412ab503d9a36df69d5e/publish \
  -H "Authorization: Bearer sk-synth-1d110780d049fd91fc26ad3a78df4189d0edbad98416b0c1"
```

#### 3. Optional: Deploy to Base Sepolia
If you have a funded wallet on Base Sepolia:
```
# Set PRIVATE_KEY in .env, then:
forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --verify
```

#### 4. Optional: Demo Video
Record the frontend at localhost:3000 or take screenshots.

#### 5. Optional: Tweet
Tweet about the project tagging @synthesis_md.

### Project UUID: 78fa74d42ca0412ab503d9a36df69d5e
### Hackathon Slug: mandala-on-chain-agent-coordination-5f1c
