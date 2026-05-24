"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Activity, HardDrive, FileText, Server, AlertTriangle } from "lucide-react";

export function ClusterHealthBanner() {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    // In production, we'd proxy this through Next.js API or hit coordinator directly
    // Assuming the coordinator is running at localhost:8080 or available via Docker
    fetch("/api/v1/dashboard/summary")
      .then((res) => res.json())
      .then((data) => setStats(data))
      .catch((err) => console.error("Error fetching summary:", err));
    
    const interval = setInterval(() => {
      fetch("/api/v1/dashboard/summary")
        .then((res) => res.json())
        .then((data) => setStats(data))
        .catch((err) => console.error("Error fetching summary:", err));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!stats) return null;

  const isHealthy = stats.active_nodes >= 3 && stats.under_replicated_chunks === 0;

  return (
    <div className={`p-4 md:p-6 mb-8 rounded-xl border ${isHealthy ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-amber-500/10 border-amber-500/20'} flex flex-col md:flex-row items-center justify-between gap-4 transition-all`}>
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-full ${isHealthy ? 'bg-emerald-500/20 text-emerald-500' : 'bg-amber-500/20 text-amber-500'}`}>
          {isHealthy ? <Activity size={28} /> : <AlertTriangle size={28} />}
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            {isHealthy ? "Cluster is Healthy" : "Cluster Needs Attention"}
          </h2>
          <p className="text-muted-foreground mt-1">
            {isHealthy 
              ? "All storage nodes are responding and data is fully replicated." 
              : "Some nodes are offline or chunks are under-replicated."}
          </p>
        </div>
      </div>
      
      <div className="flex flex-wrap gap-3">
        <Badge variant="outline" className="px-3 py-1.5 text-sm flex items-center gap-2 bg-background/50">
          <Server size={14} className="text-blue-500" />
          {stats.active_nodes} Active Nodes
        </Badge>
        <Badge variant="outline" className="px-3 py-1.5 text-sm flex items-center gap-2 bg-background/50">
          <FileText size={14} className="text-violet-500" />
          {stats.total_files} Files
        </Badge>
        <Badge variant="outline" className="px-3 py-1.5 text-sm flex items-center gap-2 bg-background/50">
          <HardDrive size={14} className="text-amber-500" />
          {stats.total_chunks} Chunks
        </Badge>
        {stats.under_replicated_chunks > 0 && (
          <Badge variant="destructive" className="px-3 py-1.5 text-sm flex items-center gap-2">
            <AlertTriangle size={14} />
            {stats.under_replicated_chunks} Under-replicated
          </Badge>
        )}
      </div>
    </div>
  );
}
