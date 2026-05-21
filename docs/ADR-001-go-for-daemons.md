# ADR-001: Go for Coordinator and Storage Node Daemons

## Status: Accepted

## Context
We need a language for the core distributed system daemons (coordinator and storage nodes) that handles concurrent operations efficiently.

## Decision
Use Go for both the coordinator and storage node daemons.

## Reasons
- Goroutines provide lightweight concurrency for handling heartbeats, replication, and API requests simultaneously
- Excellent gRPC support via official libraries
- Single binary deployment simplifies Docker images
- Strong standard library for networking, crypto (SHA-256), and file I/O
