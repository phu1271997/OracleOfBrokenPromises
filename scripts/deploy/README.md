# Deploy to GenLayer Studionet

1. Open https://studio.genlayer.com/run-debug
2. Settings → Reset Storage → Confirm
3. Hard refresh (Cmd+Shift+R / Ctrl+Shift+F5)
4. Create new contract file, paste `contracts/contract.py`
5. Click Deploy
6. Click the transaction in sidebar → verify `Result: SUCCESS` (not just `Status: FINALIZED`)
7. Copy the contract address
8. Fund your MetaMask address from Studio's Accounts panel (transfer GEN from a pre-funded account)
9. Update `frontend/.env` with `VITE_CONTRACT_ADDRESS=<address>`
