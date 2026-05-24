"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Server, CheckCircle, AlertTriangle } from "lucide-react";

interface ChunkMapProps {
  fileId: string;
}

export function ChunkMap({ fileId }: ChunkMapProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`http://localhost:8080/api/v1/files/${fileId}/chunk_map`)
      .then((res) => {
        if (!res.ok) throw new Error("File map not found");
        return res.json();
      })
      .then((data) => {
        setData(data.chunk_map || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setData([]);
        setLoading(false);
      });
  }, [fileId]);

  if (loading) return <Skeleton className="h-[200px] w-full rounded-xl" />;

  if (!data || data.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground border rounded-xl bg-muted/20">
        No chunks found or file is not fully uploaded yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold tracking-tight">Data Distribution</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.map((chunk: any) => {
          const isHealthy = chunk.nodes && chunk.nodes.length >= 3;
          return (
            <div key={chunk.chunk_index} className="p-4 rounded-xl border bg-card hover:border-primary/50 transition-all flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm text-muted-foreground">
                  Chunk {chunk.chunk_index}
                </span>
                {isHealthy ? (
                  <Badge variant="outline" className="text-emerald-500 bg-emerald-500/10 border-emerald-500/20">
                    <CheckCircle className="mr-1 h-3 w-3" /> Healthy
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20">
                    <AlertTriangle className="mr-1 h-3 w-3" /> Under-replicated
                  </Badge>
                )}
              </div>
              <div className="space-y-2">
                {chunk.nodes && chunk.nodes.length > 0 ? (
                  chunk.nodes.map((node: string, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-sm bg-muted/50 p-2 rounded-md">
                      <Server className="h-4 w-4 text-blue-500" />
                      <span className="font-mono text-xs">{node}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-muted-foreground italic p-2">No replicas available</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
