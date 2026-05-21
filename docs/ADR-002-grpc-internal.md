# ADR-002: gRPC for Internal Node Communication

## Status: Accepted

## Context
Storage nodes need to communicate with the coordinator (heartbeat) and with each other (chunk replication).

## Decision
Use gRPC with Protocol Buffers for all internal communication between nodes.

## Reasons
- Typed contracts prevent mismatched APIs between services
- Efficient binary serialization (important for chunk data transfer)
- Bi-directional streaming support for future use
- Industry standard for infrastructure services
