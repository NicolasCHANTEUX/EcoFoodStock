"use client";

import { useEffect, useState } from "react";

type ProductThumbnailProps = {
  name: string;
  imageUrl?: string;
  fallbackLabel?: string;
  className?: string;
};

export function ProductThumbnail({ name, imageUrl, fallbackLabel, className }: ProductThumbnailProps) {
  const [hasImageError, setHasImageError] = useState(false);
  const showImage = Boolean(imageUrl) && !hasImageError;
  const initials = (fallbackLabel ?? name)
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 2)
    .toUpperCase() || "PR";

  useEffect(() => {
    setHasImageError(false);
  }, [imageUrl]);

  return (
    <div className={className ?? "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-xs font-bold text-slate-600"}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={name}
          className="h-full w-full object-cover"
          decoding="async"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setHasImageError(true)}
        />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </div>
  );
}
