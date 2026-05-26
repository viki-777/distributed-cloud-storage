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

export function FileUploadModal({ onUploadSuccess }: { onUploadSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [encrypt, setEncrypt] = useState(false);

  // Key-reveal state (shown after a successful encrypted upload)
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);

    try {
      let uploadFile: File = file;
      let secretKey: string | null = null;

      // ── E2EE path ──────────────────────────────────────────────────────────
      if (encrypt) {
        secretKey = await generateKey();
        const plaintext = await file.arrayBuffer();
        const ciphertext = await encryptBuffer(plaintext, secretKey);
        // Wrap the ciphertext back into a File so the upload API gets a blob
        uploadFile = new File([ciphertext], file.name, { type: "application/octet-stream" });
      }

      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("is_encrypted", String(encrypt));

      const res = await fetch("/api/upload", { method: "POST", body: formData });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
      }

      if (encrypt && secretKey) {
        // Show key to user — do NOT close the modal yet
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
    // If the user tries to close while the key is showing, warn them
    if (generatedKey && next === false) {
      setGeneratedKey(null);
      setEncrypt(false);
    }
    setOpen(next);
  };

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

        {/* ── Key-reveal screen ────────────────────────────────────────────── */}
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
                  {keyCopied ? (
                    <Check className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
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
          /* ── Normal upload form ───────────────────────────────────────────── */
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
                  encrypt
                    ? "border-primary/60 bg-primary/10"
                    : "border-border bg-transparent hover:bg-muted/40"
                }`}
              >
                {/* Custom pill toggle */}
                <div
                  className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                    encrypt ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <div
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      encrypt ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
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
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={uploading}>
                Cancel
              </Button>
              <Button onClick={handleUpload} disabled={!file || uploading}>
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {encrypt ? "Encrypting & Uploading…" : "Uploading…"}
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
