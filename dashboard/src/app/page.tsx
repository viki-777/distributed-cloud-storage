import { ClusterHealthBanner } from "@/components/cluster-health-banner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Database, Server, Files } from "lucide-react";

export default function Home() {
  return (
    <div className="container max-w-screen-2xl p-4 md:p-8 pt-6">
      <div className="flex flex-col gap-2 mb-8">
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">System Overview</h1>
        <p className="text-muted-foreground text-lg">Real-time telemetry and health for the Distributed Cloud Storage cluster.</p>
      </div>

      <ClusterHealthBanner />

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card className="bg-card hover:bg-accent/10 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Grafana Dashboards</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Available</div>
            <p className="text-xs text-muted-foreground mt-1">
              Port 3001
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card hover:bg-accent/10 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Storage Nodes</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Connected</div>
            <p className="text-xs text-muted-foreground mt-1">
              Ports 50051-50053
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card hover:bg-accent/10 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Metadata Store</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">PostgreSQL</div>
            <p className="text-xs text-muted-foreground mt-1">
              Port 5432
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card hover:bg-accent/10 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Coordinator API</CardTitle>
            <Files className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Online</div>
            <p className="text-xs text-muted-foreground mt-1">
              Port 8080
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="col-span-1 border-border/50 shadow-sm overflow-hidden flex flex-col h-[500px]">
          <CardHeader className="bg-muted/30">
            <CardTitle>Cluster Overview</CardTitle>
            <CardDescription>Live metrics powered by Prometheus & Grafana</CardDescription>
          </CardHeader>
          <CardContent className="p-0 flex-1">
            <iframe 
              src="http://localhost:3001/d-solo/cluster_overview/cluster-overview?orgId=1&theme=dark&panelId=2" 
              className="w-full h-full border-0"
            />
          </CardContent>
        </Card>
        
        <Card className="col-span-1 border-border/50 shadow-sm overflow-hidden flex flex-col h-[500px]">
          <CardHeader className="bg-muted/30">
            <CardTitle>Global Disk Usage</CardTitle>
            <CardDescription>Real-time capacity tracking across all nodes</CardDescription>
          </CardHeader>
          <CardContent className="p-0 flex-1">
            <iframe 
              src="http://localhost:3001/d-solo/cluster_overview/cluster-overview?orgId=1&theme=dark&panelId=6" 
              className="w-full h-full border-0"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
