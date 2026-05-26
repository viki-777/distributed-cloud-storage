"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, KeyRound, ShieldAlert, Download } from "lucide-react";
import { toast } from "sonner";
import { decryptBuffer } from "@/lib/crypto";

interface FileDecryptModalProps {
  fileId: string;
  fileName: string;
  open: boolean;
  onClose: () => void;
}

export function FileDecryptModal({ fileId, fileName, open, onClose }: FileDecryptModalProps) {
  const [secretKey, setSecretKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDecryptAndSave = async () => {
    if (!secretKey.trim()) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch the encrypted blob from the storage nodes via our API
      toast.info("Fetching encrypted file from cluster…");
      const res = await fetch(`/api/download?fileId=${fileId}`);
      if (!res.ok) throw new Error("Failed to fetch file from cluster.");

      const encryptedBlob = await res.arrayBuffer();

      // 2. Decrypt entirely in the browser — key never sent to server
      toast.info("Decrypting file in browser…");
      let decrypted: ArrayBuffer;
      try {
        decrypted = await decryptBuffer(encryptedBlob, secretKey.trim());
      } catch {
        // AES-GCM throws on bad key / tampered data
        setError("Decryption failed — wrong key or corrupted file.");
        setLoading(false);
        return;
      }

      // 3. Trigger a browser "Save As" for the decrypted data
      const blob = new Blob([decrypted]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast.success(`${fileName} decrypted and saved!`);
      setSecretKey("");
      onClose();
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSecretKey("");
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            Decrypt &amp; Download
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{fileName}</span> is encrypted.
            Enter your AES-256 secret key to decrypt it locally in your browser.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Key input */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="secret-key">Your Secret Key</Label>
            <Input
              id="secret-key"
              type="text"
              placeholder="Paste your Base64 AES-256 key…"
              value={secretKey}
              onChange={(e) => { setSecretKey(e.target.value); setError(null); }}
              disabled={loading}
              className="font-mono text-sm"
              onKeyDown={(e) => e.key === "Enter" && !loading && secretKey.trim() && handleDecryptAndSave()}
            />
          </div>

          {/* Error banner */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
              <ShieldAlert className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Info note */}
          <p className="text-xs text-muted-foreground">
            🔒 Decryption happens entirely in your browser. Your key is never sent to any server.
          </p>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={handleClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              onClick={handleDecryptAndSave}
              disabled={!secretKey.trim() || loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Decrypting…
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Decrypt &amp; Save
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
