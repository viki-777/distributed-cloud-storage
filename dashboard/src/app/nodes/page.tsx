import { NodeGrid } from "@/components/node-grid";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function NodesPage() {
  return (
    <div className="container max-w-screen-2xl p-4 md:p-8 pt-6">
      <div className="flex flex-col gap-2 mb-8">
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Storage Nodes</h1>
        <p className="text-muted-foreground text-lg">Manage and monitor physical storage instances across the cluster.</p>
      </div>

      <div className="mb-8">
        <NodeGrid />
      </div>

      <div className="mt-12">
        <Card className="border-border/50 shadow-sm overflow-hidden flex flex-col h-[500px]">
          <CardHeader className="bg-muted/30">
            <CardTitle>Per-Node Analytics</CardTitle>
            <CardDescription>Granular telemetry powered by Prometheus & Grafana</CardDescription>
          </CardHeader>
          <CardContent className="p-0 flex-1">
            <iframe 
              src="http://localhost:3000/d-solo/per_node_breakdown/storage-node-breakdown?orgId=1&theme=dark&panelId=3" 
              className="w-full h-full border-0"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
