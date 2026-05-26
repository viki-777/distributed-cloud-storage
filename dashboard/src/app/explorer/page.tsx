"use client";

import { useEffect, useState } from "react";
import { FileUploadModal } from "@/components/file-upload-modal";
import { FileDecryptModal } from "@/components/file-decrypt-modal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileIcon, Download, Search, HardDrive, Lock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import Link from "next/link";

export default function ExplorerPage() {
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Decrypt modal state
  const [decryptTarget, setDecryptTarget] = useState<{ id: string; name: string } | null>(null);

  const fetchFiles = () => {
    setLoading(true);
    fetch("/api/v1/files/")
      .then((res) => res.json())
      .then((data) => setFiles(data || []))
      .catch((err) => {
        console.error(err);
        toast.error("Failed to load files from cluster");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  // For plain (non-encrypted) files: direct browser redirect download
  const handlePlainDownload = (fileId: string) => {
    toast.info("Initializing download from storage nodes...");
    window.location.href = `/api/download?fileId=${fileId}`;
  };

  // For encrypted files: open decrypt modal
  const handleEncryptedDownload = (file: any) => {
    setDecryptTarget({ id: file.id, name: file.name });
  };

  return (
    <div className="container mx-auto max-w-screen-2xl p-4 md:p-8 pt-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">File Explorer</h1>
          <p className="text-muted-foreground text-lg">Browse, upload, and download files directly to the cluster.</p>
        </div>
        <FileUploadModal onUploadSuccess={fetchFiles} />
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardHeader className="bg-muted/30 pb-4">
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Distributed File System
          </CardTitle>
          <CardDescription>All files stored across the peer-to-peer network.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : files.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center text-muted-foreground">
              <FileIcon className="h-12 w-12 mb-4 opacity-20" />
              <p>The cluster is empty.</p>
              <p className="text-sm">Upload a file to see it distributed across the nodes.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Name</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Chunks</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="text-right pr-6">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((file) => (
                  <TableRow key={file.id}>
                    {/* Name + optional lock badge */}
                    <TableCell className="pl-6 font-medium">
                      <div className="flex items-center gap-2">
                        <FileIcon className="h-4 w-4 text-blue-500 shrink-0" />
                        <span>{file.name}</span>
                        {file.is_encrypted && (
                          <Badge
                            variant="outline"
                            className="gap-1 text-xs border-amber-500/40 bg-amber-500/10 text-amber-400 px-1.5 py-0"
                          >
                            <Lock className="h-2.5 w-2.5" />
                            E2EE
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatBytes(file.size_bytes)}</TableCell>
                    <TableCell>{file.total_chunks}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                        {file.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(file.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <div className="flex justify-end gap-2">
                        <Link href={`/files?search=${file.id}`}>
                          <Button variant="outline" size="sm" className="gap-1">
                            <Search className="h-3.5 w-3.5" /> Inspect
                          </Button>
                        </Link>

                        {/* Encrypted → open decrypt modal | Plain → direct download */}
                        {file.is_encrypted ? (
                          <Button
                            variant="default"
                            size="sm"
                            className="gap-1 bg-amber-500/90 hover:bg-amber-500 text-black"
                            onClick={() => handleEncryptedDownload(file)}
                          >
                            <Lock className="h-3.5 w-3.5" /> Decrypt
                          </Button>
                        ) : (
                          <Button
                            variant="default"
                            size="sm"
                            className="gap-1"
                            onClick={() => handlePlainDownload(file.id)}
                          >
                            <Download className="h-3.5 w-3.5" /> Download
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Decrypt modal — mounts only when an encrypted file is clicked */}
      {decryptTarget && (
        <FileDecryptModal
          fileId={decryptTarget.id}
          fileName={decryptTarget.name}
          open={!!decryptTarget}
          onClose={() => setDecryptTarget(null)}
        />
      )}
    </div>
  );
}
