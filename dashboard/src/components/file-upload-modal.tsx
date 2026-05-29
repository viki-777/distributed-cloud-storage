"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UploadCloud, Loader2, Lock, Copy, Check, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { generateKey, encryptBuffer } from "@/lib/crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

interface UploadProgressState {
  status: "idle" | "encrypting" | "registering" | "uploading" | "done" | "error";
  progress: number;      // 0–100
  chunk: number;         // chunks completed
  totalChunks: number;
  error?: string;
}

const INITIAL_PROGRESS: UploadProgressState = {
  status: "idle", progress: 0, chunk: 0, totalChunks: 0,
};

// ── Component ─────────────────────────────────────────────────────────────────

export function FileUploadModal({ onUploadSuccess }: { onUploadSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [encrypt, setEncrypt] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState>(INITIAL_PROGRESS);

  // Key-reveal state (shown after a successful encrypted upload)
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);

  // ── Upload handler ──────────────────────────────────────────────────────────

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setUploadProgress(INITIAL_PROGRESS);

    try {
      let uploadFile: File = file;
      let secretKey: string | null = null;

      // E2EE: encrypt in browser before upload
      if (encrypt) {
        setUploadProgress((p) => ({ ...p, status: "encrypting", progress: 0 }));
        secretKey = await generateKey();
        const plaintext = await file.arrayBuffer();
        const ciphertext = await encryptBuffer(plaintext, secretKey);
        uploadFile = new File([ciphertext], file.name, { type: "application/octet-stream" });
      }

      const formData = new FormData();
      // Text fields MUST come before the file blob so the streaming busboy
      // parser receives the metadata before the file stream begins.
      formData.append("file_name", file.name);
      formData.append("file_size", String(uploadFile.size));
      formData.append("is_encrypted", String(encrypt));
      formData.append("file", uploadFile);

      // POST and read the SSE response as a stream
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fileId = "";

      // ── SSE reading loop ──────────────────────────────────────────────────
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE lines end with \n\n — split on that to get complete events
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? ""; // last item may be incomplete

        for (const event of events) {
          const line = event.trim();
          if (!line.startsWith("data:")) continue;

          let payload: any;
          try { payload = JSON.parse(line.slice(5).trim()); } catch { continue; }

          if (payload.status === "registering") {
            setUploadProgress((p) => ({
              ...p, status: "registering",
              totalChunks: payload.totalChunks,
            }));
          } else if (payload.status === "uploading") {
            if (payload.fileId) fileId = payload.fileId;
            setUploadProgress({
              status: "uploading",
              progress: payload.progress ?? 0,
              chunk: payload.chunk ?? 0,
              totalChunks: payload.totalChunks,
            });
          } else if (payload.status === "done") {
            fileId = payload.fileId ?? fileId;
            setUploadProgress((p) => ({ ...p, status: "done", progress: 100 }));
          } else if (payload.status === "error") {
            throw new Error(payload.error ?? "Upload failed");
          }
        }
      }

      // ── Post-upload ───────────────────────────────────────────────────────
      if (encrypt && secretKey) {
        setGeneratedKey(secretKey);
        setFile(null);
        onUploadSuccess();
      } else {
        toast.success("File uploaded successfully to the cluster!");
        setFile(null);
        setOpen(false);
        onUploadSuccess();
      }
    } catch (error: any) {
      toast.error(`Upload failed: ${error.message}`);
      setUploadProgress((p) => ({ ...p, status: "error", error: error.message }));
    } finally {
      setUploading(false);
    }
  };

  const copyKey = async () => {
    if (!generatedKey) return;
    await navigator.clipboard.writeText(generatedKey);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2000);
  };

  const handleClose = (next: boolean) => {
    if (generatedKey && !next) {
      setGeneratedKey(null);
      setEncrypt(false);
    }
    if (!next) setUploadProgress(INITIAL_PROGRESS);
    setOpen(next);
  };

  // ── Progress Bar sub-component ─────────────────────────────────────────────

  const showProgress = uploading || uploadProgress.status === "done";
  const progressLabel = {
    idle: "",
    encrypting: "Encrypting in browser…",
    registering: "Registering with cluster…",
    uploading: uploadProgress.totalChunks > 1
      ? `Uploading chunk ${uploadProgress.chunk} / ${uploadProgress.totalChunks}`
      : "Uploading…",
    done: "Upload complete!",
    error: uploadProgress.error ?? "Error",
  }[uploadProgress.status];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger render={<Button className="gap-2" />}>
        <UploadCloud className="h-4 w-4" />
        Upload File
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload File</DialogTitle>
          <DialogDescription>
            Select a file to securely upload and shard across the Distributed Cloud Storage cluster.
          </DialogDescription>
        </DialogHeader>

        {/* ── Key-reveal screen ──────────────────────────────────────────────── */}
        {generatedKey ? (
          <div className="flex flex-col gap-4 py-2">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3">
              <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-400" />
              <p className="text-sm text-emerald-300 font-medium">
                File encrypted and uploaded! Save your secret key — it&apos;s the ONLY way to decrypt this file.
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                Your AES-256 Secret Key
              </Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md bg-muted px-3 py-2 text-xs font-mono break-all select-all border border-border">
                  {generatedKey}
                </code>
                <Button size="icon" variant="outline" onClick={copyKey} className="shrink-0">
                  {keyCopied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              ⚠️ This key is <strong>never stored</strong> on our servers. If you lose it, your file cannot be recovered.
            </p>
            <div className="flex justify-end">
              <Button onClick={() => handleClose(false)}>
                I&apos;ve saved my key — Close
              </Button>
            </div>
          </div>
        ) : (
          /* ── Upload form ──────────────────────────────────────────────────── */
          <>
            <div className="grid gap-4 py-4">
              {/* File picker */}
              <div className="grid gap-2">
                <Label htmlFor="file">File</Label>
                <Input
                  id="file"
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  disabled={uploading}
                />
              </div>

              {/* E2EE toggle */}
              <div
                onClick={() => !uploading && setEncrypt((v) => !v)}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all ${
                  encrypt ? "border-primary/60 bg-primary/10" : "border-border bg-transparent hover:bg-muted/40"
                }`}
              >
                <div className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${encrypt ? "bg-primary" : "bg-muted"}`}>
                  <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${encrypt ? "translate-x-4" : "translate-x-0.5"}`} />
                </div>
                <Lock className={`h-4 w-4 shrink-0 ${encrypt ? "text-primary" : "text-muted-foreground"}`} />
                <div className="flex flex-col">
                  <span className={`text-sm font-medium ${encrypt ? "text-primary" : "text-foreground"}`}>
                    Encrypt this file (E2EE)
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {encrypt
                      ? "File will be encrypted in your browser before upload. A secret key will be generated."
                      : "Enable to encrypt with AES-256-GCM. Only you will be able to decrypt it."}
                  </span>
                </div>
              </div>

              {/* ── Live progress bar ──────────────────────────────────────── */}
              {showProgress && (
                <div className="flex flex-col gap-2">
                  {/* Track */}
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        uploadProgress.status === "error"
                          ? "bg-red-500"
                          : uploadProgress.status === "done"
                          ? "bg-emerald-500"
                          : "bg-primary"
                      }`}
                      style={{ width: `${uploadProgress.progress}%` }}
                    />
                  </div>
                  {/* Label */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{progressLabel}</span>
                    <span className="font-mono font-medium">{uploadProgress.progress}%</span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={uploading}>
                Cancel
              </Button>
              <Button onClick={handleUpload} disabled={!file || uploading}>
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {uploadProgress.status === "encrypting" ? "Encrypting…" : "Uploading…"}
                  </>
                ) : (
                  <>
                    {encrypt && <Lock className="mr-2 h-4 w-4" />}
                    {encrypt ? "Encrypt & Upload" : "Upload to Cluster"}
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
