# ADR-003: 3x Replication Strategy

## Status: Accepted

## Context
We need data durability — if a node dies, data must not be lost.

## Decision
Each chunk is replicated to 3 different storage nodes. No erasure coding in v1.

## Reasons
- Simple to implement and reason about
- Allows any 2 nodes to fail while data remains available
- Re-replication is straightforward (copy from healthy peer)

## Known Tradeoffs
- 3x storage overhead (200MB file uses 600MB total)
- Future improvement: Reed-Solomon erasure coding
