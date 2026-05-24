"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StorageBar } from "@/components/storage-bar";
import { Server, CheckCircle, XCircle } from "lucide-react";

export function NodeGrid() {
  const [nodes, setNodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("http://localhost:8080/api/v1/nodes/")
      .then((res) => res.json())
      .then((data) => {
        setNodes(data || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching nodes:", err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[250px] w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground border rounded-xl bg-muted/20">
        No storage nodes registered.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {nodes.map((node) => {
        const isHealthy = node.status === 'healthy';
        const lastSeen = new Date(node.last_heartbeat).toLocaleString();

        return (
          <div key={node.id} className="p-6 rounded-xl border bg-card hover:border-primary/50 transition-all flex flex-col gap-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-lg ${isHealthy ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                  <Server size={20} />
                </div>
                <div>
                  <h3 className="font-bold">{node.id}</h3>
                  <p className="text-xs text-muted-foreground font-mono">{node.address}</p>
                </div>
              </div>
              {isHealthy ? (
                <Badge variant="outline" className="text-emerald-500 bg-emerald-500/10 border-emerald-500/20">
                  <CheckCircle className="mr-1 h-3 w-3" /> Active
                </Badge>
              ) : (
                <Badge variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20">
                  <XCircle className="mr-1 h-3 w-3" /> Offline
                </Badge>
              )}
            </div>
            
            <div className="pt-2">
              <StorageBar usedBytes={node.used_bytes} availableBytes={node.available_bytes} />
            </div>

            <div className="mt-auto pt-4 border-t border-border/50 text-xs text-muted-foreground">
              Last Heartbeat: <span className="font-medium text-foreground">{lastSeen}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
