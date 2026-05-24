import * as React from "react";

interface StorageBarProps {
  usedBytes: number;
  availableBytes: number;
}

export function StorageBar({ usedBytes, availableBytes }: StorageBarProps) {
  const total = usedBytes + availableBytes;
  const percentage = total === 0 ? 0 : Math.round((usedBytes / total) * 100);
  
  // Format bytes to readable string (GB, MB, etc)
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getBarColor = (pct: number) => {
    if (pct > 90) return "bg-red-500";
    if (pct > 75) return "bg-amber-500";
    return "bg-blue-500";
  };

  return (
    <div className="w-full space-y-2">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{formatBytes(usedBytes)} Used</span>
        <span>{formatBytes(availableBytes)} Free</span>
      </div>
      <div className="h-3 w-full bg-muted/50 rounded-full overflow-hidden">
        <div 
          className={`h-full ${getBarColor(percentage)} transition-all duration-500 ease-in-out`} 
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="text-right text-xs font-medium">
        {percentage}% Full
      </div>
    </div>
  );
}
