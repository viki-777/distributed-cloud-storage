"use client";

import { useState } from "react";
import { ChunkMap } from "@/components/chunk-map";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Search } from "lucide-react";

export default function FilesPage() {
  const [fileId, setFileId] = useState("");
  const [searchedId, setSearchedId] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchedId(fileId);
  };

  return (
    <div className="container max-w-screen-2xl p-4 md:p-8 pt-6">
      <div className="flex flex-col gap-2 mb-8">
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">File Inspector</h1>
        <p className="text-muted-foreground text-lg">Inspect file chunks and their distribution across the cluster.</p>
      </div>

      <Card className="mb-8 border-border/50 shadow-sm">
        <CardHeader className="bg-muted/30 pb-4">
          <CardTitle>Lookup File</CardTitle>
          <CardDescription>Enter a File UUID to visualize its underlying shard placement.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={fileId}
                onChange={(e) => setFileId(e.target.value)}
                placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                className="w-full flex h-10 rounded-md border border-input bg-background pl-10 pr-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
            >
              Inspect
            </button>
          </form>
        </CardContent>
      </Card>

      {searchedId && (
        <div className="mt-8">
          <ChunkMap fileId={searchedId} />
        </div>
      )}
    </div>
  );
}
